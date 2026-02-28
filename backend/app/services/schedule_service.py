"""
Schedule service — works with new hms_db UUID schema.
Manages doctor weekly schedules, doctor leaves, and available time-slot generation.
"""
import uuid
import logging
from datetime import date, time, timedelta
from typing import Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_

from ..models.appointment import DoctorSchedule, DoctorLeave, Appointment, Doctor
from ..models.user import User

logger = logging.getLogger(__name__)


# ── Doctor schedule CRUD ───────────────────────────────────────────────────

def create_schedule(db: Session, doctor_id: str | uuid.UUID, data: dict) -> DoctorSchedule:
    """Create a doctor schedule."""
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)
    
    schedule = DoctorSchedule(doctor_id=doctor_id, **data)
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


def get_doctor_schedules(
    db: Session,
    doctor_id: str | uuid.UUID,
    active_only: bool = True
) -> list[DoctorSchedule]:
    """Get all schedules for a doctor."""
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)
    
    q = db.query(DoctorSchedule).filter(DoctorSchedule.doctor_id == doctor_id)
    if active_only:
        q = q.filter(DoctorSchedule.is_active == True)
    return q.order_by(DoctorSchedule.day_of_week, DoctorSchedule.start_time).all()


def update_schedule(
    db: Session,
    schedule_id: str | uuid.UUID,
    data: dict
) -> Optional[DoctorSchedule]:
    """Update a doctor schedule."""
    if isinstance(schedule_id, str):
        schedule_id = uuid.UUID(schedule_id)
    
    schedule = db.query(DoctorSchedule).filter(DoctorSchedule.id == schedule_id).first()
    if not schedule:
        return None
    
    for k, v in data.items():
        if v is not None and hasattr(schedule, k):
            setattr(schedule, k, v)
    
    db.commit()
    db.refresh(schedule)
    return schedule


def delete_schedule(db: Session, schedule_id: str | uuid.UUID) -> bool:
    """Delete a doctor schedule."""
    if isinstance(schedule_id, str):
        schedule_id = uuid.UUID(schedule_id)
    
    schedule = db.query(DoctorSchedule).filter(DoctorSchedule.id == schedule_id).first()
    if not schedule:
        return False
    
    db.delete(schedule)
    db.commit()
    return True


# ── Doctor Leaves ──────────────────────────────────────────────────────────

def create_doctor_leave(
    db: Session,
    data: dict,
    approved_by: Optional[uuid.UUID] = None
) -> DoctorLeave:
    """Create a doctor leave record."""
    doctor_id = data.get("doctor_id")
    if isinstance(doctor_id, str):
        data["doctor_id"] = uuid.UUID(doctor_id)
    
    leave = DoctorLeave(**data, approved_by=approved_by)
    db.add(leave)
    db.commit()
    db.refresh(leave)
    return leave


def get_doctor_leaves(
    db: Session,
    doctor_id: Optional[str | uuid.UUID] = None
) -> list[DoctorLeave]:
    """Get doctor leaves, optionally filtered by doctor."""
    q = db.query(DoctorLeave)
    if doctor_id is not None:
        if isinstance(doctor_id, str):
            doctor_id = uuid.UUID(doctor_id)
        q = q.filter(DoctorLeave.doctor_id == doctor_id)
    return q.order_by(DoctorLeave.leave_date.desc()).all()


def delete_doctor_leave(db: Session, leave_id: str | uuid.UUID) -> bool:
    """Delete a doctor leave record."""
    if isinstance(leave_id, str):
        leave_id = uuid.UUID(leave_id)
    
    leave = db.query(DoctorLeave).filter(DoctorLeave.id == leave_id).first()
    if not leave:
        return False
    
    db.delete(leave)
    db.commit()
    return True


def is_doctor_on_leave(db: Session, doctor_id: str | uuid.UUID, target_date: date) -> bool:
    """Check if doctor is on leave on a specific date."""
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)
    
    leave = db.query(DoctorLeave).filter(
        DoctorLeave.doctor_id == doctor_id,
        DoctorLeave.leave_date == target_date,
        DoctorLeave.status == "approved",
    ).first()
    return leave is not None


# ── Time-slot generation ──────────────────────────────────────────────────

def _time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _minutes_to_time(m: int) -> time:
    return time(hour=m // 60, minute=m % 60)


def get_available_slots(db: Session, doctor_id: str | uuid.UUID, target_date: date) -> list[dict]:
    """Get available time slots for a doctor on a specific date."""
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)
    
    # Check if doctor is on leave
    if is_doctor_on_leave(db, doctor_id, target_date):
        return []
    
    # Get doctor's schedules for this weekday
    weekday = target_date.isoweekday() % 7  # 0=Sunday
    schedules = db.query(DoctorSchedule).filter(
        DoctorSchedule.doctor_id == doctor_id,
        DoctorSchedule.day_of_week == weekday,
        DoctorSchedule.is_active == True,
    ).all()
    
    if not schedules:
        return []
    
    # Build schedule sources
    schedule_sources = []
    for sched in schedules:
        # Check effective dates
        if sched.effective_from and target_date < sched.effective_from:
            continue
        if sched.effective_to and target_date > sched.effective_to:
            continue
        
        schedule_sources.append({
            "start_time": sched.start_time,
            "end_time": sched.end_time,
            "slot_duration_minutes": sched.slot_duration_minutes,
            "max_patients": sched.max_patients or 1,
            "break_start_time": sched.break_start_time,
            "break_end_time": sched.break_end_time,
        })
    
    if not schedule_sources:
        return []
    
    # Get existing appointments
    existing = db.query(Appointment).filter(
        Appointment.doctor_id == doctor_id,
        Appointment.appointment_date == target_date,
        Appointment.status.notin_(["cancelled", "rescheduled"]),
        Appointment.is_deleted == False,
    ).all()
    
    # Count bookings per time slot
    booked_map: dict[str, int] = {}
    for appt in existing:
        if appt.start_time:
            key = appt.start_time.strftime("%H:%M")
            booked_map[key] = booked_map.get(key, 0) + 1
    
    # Generate slots
    slots = []
    for src in schedule_sources:
        start_m = _time_to_minutes(src["start_time"])
        end_m = _time_to_minutes(src["end_time"])
        duration = src["slot_duration_minutes"]
        
        break_start_m = _time_to_minutes(src["break_start_time"]) if src["break_start_time"] else None
        break_end_m = _time_to_minutes(src["break_end_time"]) if src["break_end_time"] else None
        
        cursor = start_m
        while cursor + duration <= end_m:
            # Skip break time
            if break_start_m is not None and break_end_m is not None:
                if break_start_m <= cursor < break_end_m:
                    cursor = break_end_m
                    continue
            
            slot_time = _minutes_to_time(cursor)
            key = slot_time.strftime("%H:%M")
            current_bookings = booked_map.get(key, 0)
            
            slots.append({
                "time": slot_time.strftime("%H:%M"),
                "available": current_bookings < src["max_patients"],
                "current_bookings": current_bookings,
                "max_bookings": src["max_patients"],
            })
            cursor += duration
    
    # Remove duplicates and sort
    seen = set()
    unique_slots = []
    for slot in sorted(slots, key=lambda s: s["time"]):
        if slot["time"] not in seen:
            seen.add(slot["time"])
            unique_slots.append(slot)
    
    return unique_slots


def get_doctors_list(db: Session, hospital_id: Optional[uuid.UUID] = None) -> list[Doctor]:
    """Get list of all active doctors."""
    q = db.query(Doctor).options(joinedload(Doctor.user)).filter(
        Doctor.is_active == True,
        Doctor.is_deleted == False,
    )
    
    if hospital_id:
        q = q.filter(Doctor.hospital_id == hospital_id)
    
    return q.all()


def get_doctor_by_id(db: Session, doctor_id: str | uuid.UUID) -> Optional[Doctor]:
    """Get a doctor by ID."""
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)
    
    return db.query(Doctor).options(joinedload(Doctor.user)).filter(
        Doctor.id == doctor_id,
        Doctor.is_deleted == False,
    ).first()


def get_doctor_by_user_id(db: Session, user_id: str | uuid.UUID) -> Optional[Doctor]:
    """Get a doctor by their user ID."""
    if isinstance(user_id, str):
        user_id = uuid.UUID(user_id)
    
    return db.query(Doctor).options(joinedload(Doctor.user)).filter(
        Doctor.user_id == user_id,
        Doctor.is_deleted == False,
    ).first()
