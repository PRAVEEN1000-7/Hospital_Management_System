"""
Schedule service – manages doctor weekly schedules, blocked periods,
and available time-slot generation.
"""
import logging
from datetime import date, time, timedelta, datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..models.appointment import DoctorSchedule, BlockedPeriod, Appointment
from ..models.user import User

logger = logging.getLogger(__name__)


# ── Doctor schedule CRUD ───────────────────────────────────────────────────

def create_schedule(db: Session, doctor_id: int, data: dict) -> DoctorSchedule:
    schedule = DoctorSchedule(doctor_id=doctor_id, **data)
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


def get_doctor_schedules(db: Session, doctor_id: int, active_only: bool = True):
    q = db.query(DoctorSchedule).filter(DoctorSchedule.doctor_id == doctor_id)
    if active_only:
        q = q.filter(DoctorSchedule.is_active == True)
    return q.order_by(DoctorSchedule.weekday, DoctorSchedule.start_time).all()


def update_schedule(db: Session, schedule_id: int, data: dict) -> DoctorSchedule | None:
    schedule = db.query(DoctorSchedule).filter(DoctorSchedule.id == schedule_id).first()
    if not schedule:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(schedule, k, v)
    db.commit()
    db.refresh(schedule)
    return schedule


def delete_schedule(db: Session, schedule_id: int) -> bool:
    schedule = db.query(DoctorSchedule).filter(DoctorSchedule.id == schedule_id).first()
    if not schedule:
        return False
    db.delete(schedule)
    db.commit()
    return True


# ── Blocked periods ────────────────────────────────────────────────────────

def create_blocked_period(db: Session, data: dict, created_by: int) -> BlockedPeriod:
    bp = BlockedPeriod(**data, created_by=created_by)
    db.add(bp)
    db.commit()
    db.refresh(bp)
    return bp


def get_blocked_periods(db: Session, doctor_id: int | None = None):
    q = db.query(BlockedPeriod)
    if doctor_id is not None:
        q = q.filter(
            (BlockedPeriod.doctor_id == doctor_id) | (BlockedPeriod.doctor_id == None)
        )
    return q.order_by(BlockedPeriod.start_date.desc()).all()


def delete_blocked_period(db: Session, period_id: int) -> bool:
    bp = db.query(BlockedPeriod).filter(BlockedPeriod.id == period_id).first()
    if not bp:
        return False
    db.delete(bp)
    db.commit()
    return True


def is_date_blocked(db: Session, doctor_id: int, target_date: date) -> bool:
    """Check if a date is blocked for a doctor or hospital-wide."""
    return db.query(BlockedPeriod).filter(
        and_(
            (BlockedPeriod.doctor_id == doctor_id) | (BlockedPeriod.doctor_id == None),
            BlockedPeriod.start_date <= target_date,
            BlockedPeriod.end_date >= target_date,
        )
    ).first() is not None


# ── Time-slot generation ──────────────────────────────────────────────────

def _time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _minutes_to_time(m: int) -> time:
    return time(hour=m // 60, minute=m % 60)


def get_available_slots(db: Session, doctor_id: int, target_date: date):
    """
    Return a list of TimeSlot dicts for a given doctor on a given date.
    Considers: weekly schedule, blocked periods, existing bookings.
    """
    # 1. Check blocked
    if is_date_blocked(db, doctor_id, target_date):
        return []

    # 2. Get schedule rows for the weekday
    weekday = target_date.weekday()  # 0=Monday
    schedules = db.query(DoctorSchedule).filter(
        DoctorSchedule.doctor_id == doctor_id,
        DoctorSchedule.weekday == weekday,
        DoctorSchedule.is_active == True,
    ).all()

    if not schedules:
        return []

    # 3. Count existing bookings per time slot
    existing = db.query(Appointment).filter(
        Appointment.doctor_id == doctor_id,
        Appointment.appointment_date == target_date,
        Appointment.status.notin_(["cancelled", "rescheduled"]),
    ).all()

    booked_map: dict[str, int] = {}
    for appt in existing:
        if appt.appointment_time:
            key = appt.appointment_time.strftime("%H:%M")
            booked_map[key] = booked_map.get(key, 0) + 1

    # 4. Build slot list
    slots = []
    for sched in schedules:
        start_m = _time_to_minutes(sched.start_time)
        end_m = _time_to_minutes(sched.end_time)
        duration = sched.slot_duration
        cursor = start_m
        while cursor + duration <= end_m:
            slot_time = _minutes_to_time(cursor)
            key = slot_time.strftime("%H:%M")
            current_bookings = booked_map.get(key, 0)
            slots.append({
                "time": slot_time,
                "available": current_bookings < sched.max_patients_per_slot,
                "current_bookings": current_bookings,
                "max_bookings": sched.max_patients_per_slot,
                "consultation_type": sched.consultation_type,
            })
            cursor += duration

    slots.sort(key=lambda s: s["time"])
    return slots


def get_doctors_list(db: Session):
    """Get all active doctors."""
    return (
        db.query(User)
        .filter(User.role == "doctor", User.is_active == True)
        .order_by(User.full_name)
        .all()
    )
