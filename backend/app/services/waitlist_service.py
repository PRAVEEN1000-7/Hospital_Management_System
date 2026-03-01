"""
Waitlist service — manages waitlist entries for patients waiting for doctor slots.
When a doctor's slots are full, patients are added to the waitlist.
"""
import uuid
import logging
from datetime import date, datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from ..models.appointment import Waitlist, Doctor, Appointment
from ..models.patient import Patient
from ..models.user import User

logger = logging.getLogger(__name__)


def _next_position(db: Session, doctor_id: uuid.UUID, preferred_date: date) -> int:
    """Get the next position in the waitlist for a doctor on a given date."""
    max_pos = (
        db.query(func.max(Waitlist.position))
        .filter(
            Waitlist.doctor_id == doctor_id,
            Waitlist.preferred_date == preferred_date,
            Waitlist.status == "waiting",
            Waitlist.is_deleted == False,
        )
        .scalar()
    )
    return (max_pos or 0) + 1


def add_to_waitlist(
    db: Session,
    data: dict,
    hospital_id: uuid.UUID,
    created_by: Optional[uuid.UUID] = None,
) -> Waitlist:
    """Add a patient to the waitlist."""
    doctor_id = data.get("doctor_id")
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)

    patient_id = data.get("patient_id")
    if isinstance(patient_id, str):
        patient_id = uuid.UUID(patient_id)

    preferred_date = data.get("preferred_date")
    if isinstance(preferred_date, str):
        preferred_date = date.fromisoformat(preferred_date)

    department_id = data.get("department_id")
    if department_id and isinstance(department_id, str):
        department_id = uuid.UUID(department_id)

    position = _next_position(db, doctor_id, preferred_date)

    entry = Waitlist(
        hospital_id=hospital_id,
        patient_id=patient_id,
        doctor_id=doctor_id,
        department_id=department_id,
        preferred_date=preferred_date,
        preferred_time=data.get("preferred_time"),
        appointment_type=data.get("appointment_type", "walk-in"),
        priority=data.get("priority", "normal"),
        chief_complaint=data.get("chief_complaint"),
        reason=data.get("reason"),
        status="waiting",
        position=position,
        created_by=created_by,
    )
    db.add(entry)
    db.flush()
    return entry


def get_waitlist(
    db: Session,
    hospital_id: uuid.UUID,
    doctor_id: Optional[str] = None,
    target_date: Optional[date] = None,
    status_filter: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[list[Waitlist], int]:
    """Get waitlist entries with optional filters. Returns (items, total_count)."""
    q = db.query(Waitlist).filter(
        Waitlist.hospital_id == hospital_id,
        Waitlist.is_deleted == False,
    )

    if doctor_id:
        did = uuid.UUID(doctor_id) if isinstance(doctor_id, str) else doctor_id
        q = q.filter(Waitlist.doctor_id == did)

    if target_date:
        q = q.filter(Waitlist.preferred_date == target_date)

    if status_filter:
        q = q.filter(Waitlist.status == status_filter)

    total = q.count()

    items = (
        q.order_by(
            # Priority order: emergency > urgent > normal
            func.case(
                (Waitlist.priority == "emergency", 0),
                (Waitlist.priority == "urgent", 1),
                else_=2,
            ),
            Waitlist.position.asc(),
            Waitlist.created_at.asc(),
        )
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return items, total


def get_waitlist_entry(db: Session, entry_id: str | uuid.UUID) -> Optional[Waitlist]:
    """Get a single waitlist entry by ID."""
    if isinstance(entry_id, str):
        entry_id = uuid.UUID(entry_id)
    return db.query(Waitlist).filter(
        Waitlist.id == entry_id,
        Waitlist.is_deleted == False,
    ).first()


def update_waitlist_entry(
    db: Session,
    entry_id: str | uuid.UUID,
    data: dict,
) -> Optional[Waitlist]:
    """Update a waitlist entry."""
    if isinstance(entry_id, str):
        entry_id = uuid.UUID(entry_id)

    entry = db.query(Waitlist).filter(
        Waitlist.id == entry_id,
        Waitlist.is_deleted == False,
    ).first()
    if not entry:
        return None

    for k, v in data.items():
        if v is not None and hasattr(entry, k):
            setattr(entry, k, v)

    db.flush()
    return entry


def cancel_waitlist_entry(db: Session, entry_id: str | uuid.UUID) -> Optional[Waitlist]:
    """Cancel a waitlist entry (soft)."""
    if isinstance(entry_id, str):
        entry_id = uuid.UUID(entry_id)

    entry = db.query(Waitlist).filter(
        Waitlist.id == entry_id,
        Waitlist.is_deleted == False,
    ).first()
    if not entry:
        return None

    entry.status = "cancelled"
    db.flush()
    return entry


def promote_waitlist_to_appointment(
    db: Session,
    entry_id: str | uuid.UUID,
    appointment_id: uuid.UUID,
) -> Optional[Waitlist]:
    """Mark a waitlist entry as booked and link the created appointment."""
    if isinstance(entry_id, str):
        entry_id = uuid.UUID(entry_id)

    entry = db.query(Waitlist).filter(Waitlist.id == entry_id).first()
    if not entry:
        return None

    entry.status = "booked"
    entry.booked_appointment_id = appointment_id
    db.flush()
    return entry


def enrich_waitlist_entry(db: Session, entry: Waitlist) -> dict:
    """Enrich a waitlist entry with patient and doctor names."""
    data = {}
    for col in entry.__table__.columns:
        val = getattr(entry, col.name)
        if hasattr(val, "hex"):
            val = str(val)
        data[col.name] = val

    # Patient info
    patient = db.query(Patient).filter(Patient.id == entry.patient_id).first()
    if patient:
        data["patient_name"] = getattr(patient, "full_name", None) or f"{patient.first_name} {patient.last_name}".strip()
        data["patient_reference_number"] = getattr(patient, "reference_number", None)
        data["patient_phone"] = getattr(patient, "phone", None)
    else:
        data["patient_name"] = None
        data["patient_reference_number"] = None
        data["patient_phone"] = None

    # Doctor info
    doctor = db.query(Doctor).filter(Doctor.id == entry.doctor_id).first()
    if doctor and doctor.user:
        data["doctor_name"] = f"Dr. {doctor.user.first_name} {doctor.user.last_name}".strip()
        data["doctor_specialization"] = doctor.specialization
    elif doctor:
        user = db.query(User).filter(User.id == doctor.user_id).first()
        data["doctor_name"] = f"Dr. {user.first_name} {user.last_name}".strip() if user else None
        data["doctor_specialization"] = doctor.specialization
    else:
        data["doctor_name"] = None
        data["doctor_specialization"] = None

    return data


def get_waitlist_count_for_doctor(
    db: Session,
    doctor_id: str | uuid.UUID,
    target_date: date,
) -> int:
    """Get the number of waiting patients in the waitlist for a doctor on a date."""
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)
    return (
        db.query(func.count(Waitlist.id))
        .filter(
            Waitlist.doctor_id == doctor_id,
            Waitlist.preferred_date == target_date,
            Waitlist.status == "waiting",
            Waitlist.is_deleted == False,
        )
        .scalar() or 0
    )


def check_already_on_waitlist(
    db: Session,
    patient_id: str | uuid.UUID,
    doctor_id: str | uuid.UUID,
    target_date: date,
) -> bool:
    """Check if a patient is already on the waitlist for a doctor on a given date."""
    if isinstance(patient_id, str):
        patient_id = uuid.UUID(patient_id)
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)

    exists = db.query(Waitlist).filter(
        Waitlist.patient_id == patient_id,
        Waitlist.doctor_id == doctor_id,
        Waitlist.preferred_date == target_date,
        Waitlist.status == "waiting",
        Waitlist.is_deleted == False,
    ).first()
    return exists is not None
