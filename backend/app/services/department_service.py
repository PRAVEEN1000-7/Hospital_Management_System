"""
Department service — CRUD for departments.
"""
import uuid
import logging
from typing import Optional
from sqlalchemy.orm import Session
from ..models.department import Department

logger = logging.getLogger(__name__)


def list_departments(
    db: Session,
    hospital_id: uuid.UUID,
    active_only: bool = True,
) -> list[Department]:
    query = db.query(Department).filter(Department.hospital_id == hospital_id)
    if active_only:
        query = query.filter(Department.is_active == True)
    return query.order_by(Department.display_order, Department.name).all()


def get_department_by_id(
    db: Session, department_id: str | uuid.UUID
) -> Optional[Department]:
    if isinstance(department_id, str):
        try:
            department_id = uuid.UUID(department_id)
        except ValueError:
            return None
    return db.query(Department).filter(Department.id == department_id).first()


def create_department(
    db: Session,
    hospital_id: uuid.UUID,
    data: dict,
) -> Department:
    head_doctor_id = data.pop("head_doctor_id", None)
    dept = Department(
        hospital_id=hospital_id,
        **data,
    )
    if head_doctor_id:
        dept.head_doctor_id = uuid.UUID(head_doctor_id)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    logger.info(f"Department created: {dept.name}")
    return dept


def update_department(
    db: Session,
    department_id: str | uuid.UUID,
    data: dict,
) -> Optional[Department]:
    dept = get_department_by_id(db, department_id)
    if not dept:
        return None

    for key, value in data.items():
        if hasattr(dept, key) and value is not None:
            if key == "head_doctor_id" and value:
                value = uuid.UUID(value)
            setattr(dept, key, value)

    db.commit()
    db.refresh(dept)
    return dept


def delete_department(
    db: Session, department_id: str | uuid.UUID
) -> bool:
    dept = get_department_by_id(db, department_id)
    if not dept:
        return False
    dept.is_active = False
    db.commit()
    return True
