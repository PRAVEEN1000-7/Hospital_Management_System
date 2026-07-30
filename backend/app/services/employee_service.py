"""
Employee service — CRUD for the employee_profiles HR extension of User, plus
effective-dated salary history (employee_salary).
"""
import uuid
import logging
from typing import Optional
from decimal import Decimal
from sqlalchemy.orm import Session
from ..models.employee import EmployeeProfile, EmployeeSalary

logger = logging.getLogger(__name__)


def list_employee_profiles(db: Session, hospital_id: uuid.UUID) -> list[EmployeeProfile]:
    return (
        db.query(EmployeeProfile)
        .filter(EmployeeProfile.hospital_id == hospital_id)
        .order_by(EmployeeProfile.created_at.desc())
        .all()
    )


def get_employee_profile_by_id(db: Session, profile_id: str | uuid.UUID) -> Optional[EmployeeProfile]:
    if isinstance(profile_id, str):
        try:
            profile_id = uuid.UUID(profile_id)
        except ValueError:
            return None
    return db.query(EmployeeProfile).filter(EmployeeProfile.id == profile_id).first()


def get_employee_profile_by_user_id(db: Session, user_id: str | uuid.UUID) -> Optional[EmployeeProfile]:
    if isinstance(user_id, str):
        try:
            user_id = uuid.UUID(user_id)
        except ValueError:
            return None
    return db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()


def create_employee_profile(
    db: Session,
    hospital_id: uuid.UUID,
    data: dict,
) -> EmployeeProfile:
    user_id = uuid.UUID(data.pop("user_id"))
    department_id = data.pop("department_id", None)
    reporting_manager_id = data.pop("reporting_manager_id", None)
    profile = EmployeeProfile(
        hospital_id=hospital_id,
        user_id=user_id,
        department_id=uuid.UUID(department_id) if department_id else None,
        reporting_manager_id=uuid.UUID(reporting_manager_id) if reporting_manager_id else None,
        **data,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    logger.info(f"Employee profile created for user {user_id}")
    return profile


def update_employee_profile(
    db: Session,
    profile_id: str | uuid.UUID,
    data: dict,
) -> Optional[EmployeeProfile]:
    profile = get_employee_profile_by_id(db, profile_id)
    if not profile:
        return None

    for key, value in data.items():
        if value is None:
            continue
        if key in ("department_id", "reporting_manager_id") and value:
            value = uuid.UUID(value)
        if hasattr(profile, key):
            setattr(profile, key, value)

    db.commit()
    db.refresh(profile)
    return profile


# ── Salary history (effective-dated, insert-only) ──────────────────────────

def list_salary_history(db: Session, employee_id: str | uuid.UUID) -> list[EmployeeSalary]:
    if isinstance(employee_id, str):
        employee_id = uuid.UUID(employee_id)
    return (
        db.query(EmployeeSalary)
        .filter(EmployeeSalary.employee_id == employee_id)
        .order_by(EmployeeSalary.effective_from.desc())
        .all()
    )


def get_current_salary(db: Session, employee_id: str | uuid.UUID) -> Optional[EmployeeSalary]:
    rows = list_salary_history(db, employee_id)
    return rows[0] if rows else None


def add_salary_revision(
    db: Session,
    hospital_id: uuid.UUID,
    employee_id: str | uuid.UUID,
    data: dict,
) -> EmployeeSalary:
    """Insert a new salary row — never updates an existing one, so history
    is preserved. per_day_salary is always basic_salary / 30 (fixed 30-day
    divisor, not the actual days in the month), recalculated on every
    revision so payroll never has to guess which divisor was used."""
    if isinstance(employee_id, str):
        employee_id = uuid.UUID(employee_id)
    basic_salary = Decimal(str(data["basic_salary"]))
    salary = EmployeeSalary(
        hospital_id=hospital_id,
        employee_id=employee_id,
        basic_salary=basic_salary,
        per_day_salary=(basic_salary / Decimal("30")).quantize(Decimal("0.01")),
        flexi_allowance=Decimal(str(data.get("flexi_allowance", 0))),
        pf_contribution_employee=Decimal(str(data.get("pf_contribution_employee", 0))),
        effective_from=data["effective_from"],
    )
    db.add(salary)
    db.commit()
    db.refresh(salary)
    logger.info(f"Salary revision added for employee {employee_id}, effective {salary.effective_from}")
    return salary
