"""
Doctor service — CRUD for doctor profiles.
"""
import uuid
import logging
from typing import Optional
from math import ceil
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from ..models.appointment import Doctor
from ..models.user import User

logger = logging.getLogger(__name__)


def list_doctors(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    active_only: bool = True,
) -> dict:
    query = db.query(Doctor).filter(
        Doctor.hospital_id == hospital_id,
        Doctor.is_deleted == False,
    )
    if active_only:
        query = query.filter(Doctor.is_active == True)
    if search:
        query = query.join(User, Doctor.user_id == User.id).filter(
            or_(
                User.first_name.ilike(f"%{search}%"),
                User.last_name.ilike(f"%{search}%"),
                Doctor.specialization.ilike(f"%{search}%"),
                Doctor.registration_number.ilike(f"%{search}%"),
            )
        )
    total = query.count()
    offset = (page - 1) * limit
    doctors = query.options(joinedload(Doctor.user)).order_by(Doctor.created_at.desc()).offset(offset).limit(limit).all()
    total_pages = ceil(total / limit) if limit > 0 else 0
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "data": doctors,
    }


def get_doctor_by_id(
    db: Session, doctor_id: str | uuid.UUID
) -> Optional[Doctor]:
    if isinstance(doctor_id, str):
        try:
            doctor_id = uuid.UUID(doctor_id)
        except ValueError:
            return None
    return db.query(Doctor).options(joinedload(Doctor.user)).filter(
        Doctor.id == doctor_id, Doctor.is_deleted == False
    ).first()


def get_doctor_by_user_id(
    db: Session, user_id: str | uuid.UUID
) -> Optional[Doctor]:
    if isinstance(user_id, str):
        try:
            user_id = uuid.UUID(user_id)
        except ValueError:
            return None
    return db.query(Doctor).filter(
        Doctor.user_id == user_id, Doctor.is_deleted == False
    ).first()


def create_doctor(
    db: Session,
    hospital_id: uuid.UUID,
    data: dict,
    created_by: uuid.UUID,
) -> Doctor:
    user_id = data.pop("user_id")
    department_id = data.pop("department_id", None)

    doctor = Doctor(
        hospital_id=hospital_id,
        user_id=uuid.UUID(user_id) if isinstance(user_id, str) else user_id,
        created_by=created_by,
        **data,
    )
    if department_id:
        doctor.department_id = uuid.UUID(department_id) if isinstance(department_id, str) else department_id

    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    logger.info(f"Doctor profile created for user_id={user_id}")
    return doctor


def update_doctor(
    db: Session,
    doctor_id: str | uuid.UUID,
    data: dict,
) -> Optional[Doctor]:
    doctor = get_doctor_by_id(db, doctor_id)
    if not doctor:
        return None

    for key, value in data.items():
        if hasattr(doctor, key) and value is not None:
            if key == "department_id" and isinstance(value, str):
                value = uuid.UUID(value)
            setattr(doctor, key, value)

    db.commit()
    db.refresh(doctor)
    return doctor


def delete_doctor(
    db: Session, doctor_id: str | uuid.UUID
) -> bool:
    doctor = get_doctor_by_id(db, doctor_id)
    if not doctor:
        return False
    doctor.is_deleted = True
    doctor.is_active = False
    db.commit()
    return True
