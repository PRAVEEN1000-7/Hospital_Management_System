"""
Leave service — HR data-entry (not a self-service request queue). Creating a
leave record increments the employee's leave_balances.used, writes on_leave
into attendance_records for every covered date (via attendance_service, so
the two never disagree), and notifies the employee's reporting manager.

Leave-year handling: a leave balance is keyed by (employee_id, year) and
resolved by the leave's *start_date* year — a leave spanning New Year's Eve
is attributed entirely to the year it started in. This is a deliberate
simplification (most staff leave doesn't span years); a future phase could
split cross-year leave across two balance rows if that turns out to matter.

`allocated` auto-seeds from employee_profiles.paid_leave_entitlement the
first time a balance is needed for a given employee/year (resolves the
plan's open question in favor of "automatic," not an annual manual HR step).
"""
import uuid
import logging
from datetime import date
from typing import Optional
from sqlalchemy.orm import Session
from ..models.leave import LeaveRecord, LeaveBalance
from ..models.employee import EmployeeProfile
from .attendance_service import mark_on_leave
from ..services.notification_service import notify_hospital_users

logger = logging.getLogger(__name__)


def get_or_create_balance(db: Session, employee_id: str | uuid.UUID, year: int) -> LeaveBalance:
    if isinstance(employee_id, str):
        employee_id = uuid.UUID(employee_id)
    balance = (
        db.query(LeaveBalance)
        .filter(LeaveBalance.employee_id == employee_id, LeaveBalance.year == year)
        .first()
    )
    if balance:
        return balance

    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == employee_id).first()
    allocated = profile.paid_leave_entitlement if profile else 0
    balance = LeaveBalance(employee_id=employee_id, year=year, allocated=allocated, used=0)
    db.add(balance)
    db.commit()
    db.refresh(balance)
    return balance


def list_leave_records(
    db: Session, hospital_id: uuid.UUID, employee_id: Optional[str] = None
) -> list[LeaveRecord]:
    query = db.query(LeaveRecord).filter(LeaveRecord.hospital_id == hospital_id)
    if employee_id:
        query = query.filter(LeaveRecord.employee_id == uuid.UUID(employee_id))
    return query.order_by(LeaveRecord.start_date.desc()).all()


def leave_days_taken_in_period(
    db: Session, employee_id: str | uuid.UUID, date_from: date, date_to: date
) -> int:
    """Used by payroll_service (Phase 5) — counts leave days that overlap the
    given period, clipped to the period boundaries."""
    if isinstance(employee_id, str):
        employee_id = uuid.UUID(employee_id)
    records = (
        db.query(LeaveRecord)
        .filter(
            LeaveRecord.employee_id == employee_id,
            LeaveRecord.status == "approved",
            LeaveRecord.start_date <= date_to,
            LeaveRecord.end_date >= date_from,
        )
        .all()
    )
    total = 0
    for r in records:
        start = max(r.start_date, date_from)
        end = min(r.end_date, date_to)
        total += (end - start).days + 1
    return total


def create_leave_record(
    db: Session,
    hospital_id: uuid.UUID,
    entered_by: uuid.UUID,
    data: dict,
) -> LeaveRecord:
    employee_id = uuid.UUID(data["employee_id"])
    start_date = data["start_date"]
    end_date = data["end_date"]
    days = (end_date - start_date).days + 1

    record = LeaveRecord(
        hospital_id=hospital_id,
        employee_id=employee_id,
        start_date=start_date,
        end_date=end_date,
        reason=data.get("reason"),
        status=data.get("status", "approved"),
        entered_by=entered_by,
    )
    db.add(record)

    if record.status == "approved":
        balance = get_or_create_balance(db, employee_id, start_date.year)
        balance.used += days
        mark_on_leave(db, hospital_id, employee_id, entered_by, start_date, end_date)

    db.commit()
    db.refresh(record)

    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == employee_id).first()
    if profile and profile.reporting_manager_id:
        notify_hospital_users(
            db, hospital_id,
            title="Leave recorded",
            message=f"Leave recorded for {start_date} to {end_date} ({days} day(s)).",
            notification_type="leave",
            reference_type="leave_record",
            reference_id=record.id,
            extra_user_ids=[profile.reporting_manager_id],
        )

    logger.info(f"Leave record created for employee {employee_id}: {start_date} to {end_date} ({days}d)")
    return record
