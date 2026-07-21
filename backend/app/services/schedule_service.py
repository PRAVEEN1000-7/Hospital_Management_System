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
    
    # Ensure effective_from is never null (DB NOT NULL constraint)
    if not data.get("effective_from"):
        from datetime import date as _date
        data["effective_from"] = _date.today()
    
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


_LEAVE_NOON = time(12, 0)


def get_doctor_leave(db: Session, doctor_id: str | uuid.UUID, target_date: date) -> Optional[DoctorLeave]:
    """Fetch the approved leave record for a doctor on a specific date, if any."""
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)

    return db.query(DoctorLeave).filter(
        DoctorLeave.doctor_id == doctor_id,
        DoctorLeave.leave_date == target_date,
        DoctorLeave.status == "approved",
    ).first()


def is_doctor_on_leave(db: Session, doctor_id: str | uuid.UUID, target_date: date) -> bool:
    """Check if doctor is on leave on a specific date (any leave type blocks the whole day)."""
    return get_doctor_leave(db, doctor_id, target_date) is not None


def is_doctor_on_leave_at(db: Session, doctor_id: str | uuid.UUID, target_date: date, at_time: Optional[time]) -> bool:
    """Time-aware leave check: a 'morning'/'afternoon' leave only blocks the
    half of the day it covers. 'full_day' leave, or no at_time to check
    against, blocks the whole day."""
    leave = get_doctor_leave(db, doctor_id, target_date)
    if leave is None:
        return False
    if leave.leave_type == "morning" and at_time is not None:
        return at_time < _LEAVE_NOON
    if leave.leave_type == "afternoon" and at_time is not None:
        return at_time >= _LEAVE_NOON
    return True


# ── Time-slot generation ──────────────────────────────────────────────────

def _time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _minutes_to_time(m: int) -> time:
    return time(hour=m // 60, minute=m % 60)


def _parse_hhmm(value, fallback: time) -> time:
    """Parse a 'HH:MM' settings string into a time; fall back on bad/empty input."""
    try:
        parts = str(value).split(":")
        return time(hour=int(parts[0]), minute=int(parts[1]))
    except Exception:
        return fallback


def _opd_settings_schedule_source(db: Session, doctor_id: uuid.UUID) -> Optional[dict]:
    """Build a single schedule source from the hospital's configured OPD
    session timings (Settings → OPD Session Timings) so pre-booking still
    offers the standard morning/evening slots when a doctor has no explicit
    schedule for the date. Returns None if the hospital/settings can't be
    resolved (caller then yields no slots, as before).

    Represented as one source spanning morning start → evening end, with the
    midday gap (morning end → evening start) as the break — so the slot
    generator emits the morning slots and the evening slots with nothing in
    between, matching how a two-session schedule row works.
    """
    from ..models.hospital_settings import HospitalSettings

    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor or not getattr(doctor, "hospital_id", None):
        return None
    settings = db.query(HospitalSettings).filter(
        HospitalSettings.hospital_id == doctor.hospital_id
    ).first()
    if not settings:
        return None

    morning_start = _parse_hhmm(getattr(settings, "opd_morning_start_time", None), time(10, 0))
    morning_end = _parse_hhmm(getattr(settings, "opd_morning_end_time", None), time(14, 0))
    evening_start = _parse_hhmm(getattr(settings, "opd_evening_start_time", None), time(17, 0))
    evening_end = _parse_hhmm(getattr(settings, "opd_evening_end_time", None), time(20, 30))

    return {
        "start_time": morning_start,
        "end_time": evening_end,
        "slot_duration_minutes": settings.appointment_slot_duration_minutes or 15,
        # Daily capacity for a settings-driven day (also the per-slot ceiling,
        # matching how DoctorSchedule.max_patients is used below).
        "max_patients": settings.max_daily_appointments_per_doctor or 40,
        "break_start_time": morning_end,
        "break_end_time": evening_start,
    }


def get_available_slots(
    db: Session,
    doctor_id: str | uuid.UUID,
    target_date: date,
    prefer_opd_sessions: bool = False,
) -> list[dict]:
    """Get available time slots for a doctor on a specific date.

    When `prefer_opd_sessions` is True (pre-booking), the hospital's configured
    OPD session timings (Settings → OPD Session Timings) are used as the slot
    source — so booking offers the standard morning/evening times regardless of
    a doctor's generic weekly schedule. It falls through to the doctor's own
    schedule when settings can't be resolved. Existing bookings and leaves are
    always honoured either way.
    """
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)

    # Check if doctor is on leave — a full-day leave blocks everything up
    # front; morning/afternoon leaves are applied per-slot further down so
    # only the covered half of the day is excluded.
    leave = get_doctor_leave(db, doctor_id, target_date)
    if leave is not None and leave.leave_type == "full_day":
        return []

    schedule_sources = []

    # Pre-booking: the configured OPD session windows drive the slot times.
    if prefer_opd_sessions:
        settings_source = _opd_settings_schedule_source(db, doctor_id)
        if settings_source is not None:
            schedule_sources = [settings_source]

    if not schedule_sources:
        # Doctor's own recurring schedules for this weekday.
        weekday = target_date.isoweekday() % 7  # 0=Sunday
        schedules = db.query(DoctorSchedule).filter(
            DoctorSchedule.doctor_id == doctor_id,
            DoctorSchedule.day_of_week == weekday,
            DoctorSchedule.is_active == True,
        ).all()

        for sched in schedules:
            # Respect each row's effective-date range.
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

        # No schedule covering this date → fall back to the configured OPD
        # session timings so slots still appear based on the settings.
        if not schedule_sources:
            settings_source = _opd_settings_schedule_source(db, doctor_id)
            if settings_source is None:
                return []
            schedule_sources.append(settings_source)

    # Get existing appointments
    existing = db.query(Appointment).filter(
        Appointment.doctor_id == doctor_id,
        Appointment.appointment_date == target_date,
        Appointment.status.notin_(["cancelled", "rescheduled"]),
        Appointment.is_deleted == False,
    ).all()
    
    # Count bookings per time slot
    booked_map: dict[str, int] = {}
    # Walk-ins (start_time=None) count as unslotted bookings
    unslotted_count = 0
    for appt in existing:
        if appt.start_time:
            key = appt.start_time.strftime("%H:%M")
            booked_map[key] = booked_map.get(key, 0) + 1
        else:
            unslotted_count += 1
    
    # Total max capacity across all schedule sources
    total_max_capacity = sum(src["max_patients"] for src in schedule_sources)
    
    # Generate slots
    total_slotted = sum(booked_map.values())
    total_appointments = total_slotted + unslotted_count
    # If total appointments (including walk-ins without start_time) >= capacity, all full
    all_full = total_appointments >= total_max_capacity

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
            # A morning/afternoon leave only blocks slots that start within its half of the day
            on_leave = leave is not None and (
                leave.leave_type != "morning" or slot_time < _LEAVE_NOON
            ) and (
                leave.leave_type != "afternoon" or slot_time >= _LEAVE_NOON
            )

            slots.append({
                "time": slot_time.strftime("%H:%M"),
                "available": (not on_leave) and (not all_full) and current_bookings < src["max_patients"],
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
