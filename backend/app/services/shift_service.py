"""
Shift service — shift definitions and effective-dated employee assignment.
"""
import uuid
import logging
from datetime import date, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from ..models.shift import Shift, EmployeeShiftAssignment

logger = logging.getLogger(__name__)


def list_shifts(db: Session, hospital_id: uuid.UUID) -> list[Shift]:
    return db.query(Shift).filter(Shift.hospital_id == hospital_id).order_by(Shift.name).all()


def get_shift_by_id(db: Session, shift_id: str | uuid.UUID) -> Optional[Shift]:
    if isinstance(shift_id, str):
        try:
            shift_id = uuid.UUID(shift_id)
        except ValueError:
            return None
    return db.query(Shift).filter(Shift.id == shift_id).first()


def create_shift(db: Session, hospital_id: uuid.UUID, data: dict) -> Shift:
    shift = Shift(hospital_id=hospital_id, **data)
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


def update_shift(db: Session, shift_id: str | uuid.UUID, data: dict) -> Optional[Shift]:
    shift = get_shift_by_id(db, shift_id)
    if not shift:
        return None
    for key, value in data.items():
        if value is not None and hasattr(shift, key):
            setattr(shift, key, value)
    db.commit()
    db.refresh(shift)
    return shift


def delete_shift(db: Session, shift_id: str | uuid.UUID) -> tuple[bool, Optional[str]]:
    """Returns (success, error_message). Blocked if any assignment references it."""
    shift = get_shift_by_id(db, shift_id)
    if not shift:
        return False, "Shift not found"
    try:
        db.delete(shift)
        db.commit()
        return True, None
    except IntegrityError:
        db.rollback()
        return False, "Cannot delete a shift that has employee assignments"


# ── Assignments (effective-dated) ───────────────────────────────────────────

def list_assignments(
    db: Session, hospital_id: uuid.UUID, employee_id: Optional[str] = None
) -> list[EmployeeShiftAssignment]:
    query = (
        db.query(EmployeeShiftAssignment)
        .join(Shift, Shift.id == EmployeeShiftAssignment.shift_id)
        .filter(Shift.hospital_id == hospital_id)
    )
    if employee_id:
        query = query.filter(EmployeeShiftAssignment.employee_id == uuid.UUID(employee_id))
    return query.order_by(EmployeeShiftAssignment.effective_from.desc()).all()


def get_current_assignment(
    db: Session, employee_id: str | uuid.UUID, on_date: Optional[date] = None
) -> Optional[EmployeeShiftAssignment]:
    if isinstance(employee_id, str):
        employee_id = uuid.UUID(employee_id)
    on_date = on_date or date.today()
    return (
        db.query(EmployeeShiftAssignment)
        .filter(
            EmployeeShiftAssignment.employee_id == employee_id,
            EmployeeShiftAssignment.effective_from <= on_date,
        )
        .filter(
            (EmployeeShiftAssignment.effective_to.is_(None))
            | (EmployeeShiftAssignment.effective_to >= on_date)
        )
        .order_by(EmployeeShiftAssignment.effective_from.desc())
        .first()
    )


def create_assignment(
    db: Session,
    assigned_by: uuid.UUID,
    data: dict,
) -> EmployeeShiftAssignment:
    """Closes any currently-open assignment for this employee (effective_to
    IS NULL) the day before the new one starts, then inserts the new row —
    same effective-dated pattern as EmployeeSalary, and required by BRD
    REQ-SHF-02's mandatory `reason` for every shift change."""
    employee_id = uuid.UUID(data["employee_id"])
    effective_from = data["effective_from"]

    open_assignment = (
        db.query(EmployeeShiftAssignment)
        .filter(
            EmployeeShiftAssignment.employee_id == employee_id,
            EmployeeShiftAssignment.effective_to.is_(None),
        )
        .first()
    )
    if open_assignment:
        open_assignment.effective_to = effective_from - timedelta(days=1)

    assignment = EmployeeShiftAssignment(
        employee_id=employee_id,
        shift_id=uuid.UUID(data["shift_id"]),
        effective_from=effective_from,
        assigned_by=assigned_by,
        reason=data["reason"],
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    logger.info(f"Shift assignment created for employee {employee_id}, effective {effective_from}")
    return assignment
