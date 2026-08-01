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
from ..models.user import User

logger = logging.getLogger(__name__)


def ensure_employee_profiles(db: Session, hospital_id: uuid.UUID) -> None:
    """Workforce Management manages every staff member in the hospital, not
    just the ones an admin happened to fill 'Employee Details' in for.
    Lazily backfills a minimal EmployeeProfile (module defaults — full_time,
    0 leave entitlement, included in payroll) for any hospital User missing
    one, so a hospital that's had staff for years and only just turned this
    module on gets every existing staff member on the Attendance/Shift/
    Leave/Payroll rosters immediately, not just staff created after today.
    Idempotent and cheap enough to call on every read of the roster — new
    staff created via StaffModals.tsx already get a profile at creation time
    (see routers/employees.py), so this only ever has to do real work once
    per hospital, or after inserting a new hospital user some other way."""
    existing_ids = {
        row[0] for row in
        db.query(EmployeeProfile.user_id).filter(EmployeeProfile.hospital_id == hospital_id).all()
    }
    users = (
        db.query(User)
        .filter(User.hospital_id == hospital_id, User.is_deleted == False)  # noqa: E712
        .all()
    )
    missing = [u for u in users if u.id not in existing_ids]
    if not missing:
        return
    for u in missing:
        db.add(EmployeeProfile(hospital_id=hospital_id, user_id=u.id))
    db.commit()
    logger.info(f"Backfilled {len(missing)} employee profile(s) for hospital {hospital_id}")


def list_employee_profiles(db: Session, hospital_id: uuid.UUID) -> list[EmployeeProfile]:
    ensure_employee_profiles(db, hospital_id)
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
