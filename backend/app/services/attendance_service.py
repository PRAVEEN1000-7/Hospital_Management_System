"""
Attendance service — the provisional-then-verified grid.

Every admin click writes to the database immediately with is_verified=false;
nothing defaults to absent — an unmarked employee/date combo simply has no
row at all and the frontend renders it as "not marked". The one auto-write
that DOES happen eagerly is `holiday`: whenever the grid is read for a range,
any employee/date combo that falls on a real holidays row and has no
attendance row yet gets one created with status='holiday', so the grid never
disagrees with the holiday calendar. A `leave_records` entry (Phase 3) writes
`on_leave` the same way for its covered dates.

Verify locks a range's existing rows (is_verified=true) — Payroll (Phase 5)
only ever reads verified rows.
"""
import uuid
import logging
from datetime import date, datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from ..models.attendance import AttendanceRecord
from ..models.employee import EmployeeProfile
from .holiday_service import holidays_in_range

logger = logging.getLogger(__name__)


class AttendanceLockedError(Exception):
    """Raised when trying to mark a date that's already been verified."""


def _tracked_employee_ids(db: Session, hospital_id: uuid.UUID) -> list[uuid.UUID]:
    rows = (
        db.query(EmployeeProfile.user_id)
        .filter(EmployeeProfile.hospital_id == hospital_id)
        .all()
    )
    return [r[0] for r in rows]


def get_attendance_grid(
    db: Session,
    hospital_id: uuid.UUID,
    date_from: date,
    date_to: date,
    employee_ids: Optional[list[str]] = None,
) -> list[AttendanceRecord]:
    target_ids = (
        [uuid.UUID(e) for e in employee_ids] if employee_ids else _tracked_employee_ids(db, hospital_id)
    )
    if not target_ids:
        return []

    existing = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.hospital_id == hospital_id,
            AttendanceRecord.employee_id.in_(target_ids),
            AttendanceRecord.date >= date_from,
            AttendanceRecord.date <= date_to,
        )
        .all()
    )
    covered = {(r.employee_id, r.date) for r in existing}

    holidays = holidays_in_range(db, hospital_id, date_from, date_to)
    created: list[AttendanceRecord] = []
    if holidays:
        day = date_from
        while day <= date_to:
            if day in holidays:
                for emp_id in target_ids:
                    if (emp_id, day) not in covered:
                        row = AttendanceRecord(
                            hospital_id=hospital_id, employee_id=emp_id, date=day,
                            status="holiday", is_verified=False,
                        )
                        db.add(row)
                        created.append(row)
                        covered.add((emp_id, day))
            day = date.fromordinal(day.toordinal() + 1)
    if created:
        db.commit()
        for row in created:
            db.refresh(row)

    return existing + created


def mark_attendance(
    db: Session,
    hospital_id: uuid.UUID,
    marked_by: uuid.UUID,
    employee_id: str | uuid.UUID,
    mark_date: date,
    status: str,
) -> AttendanceRecord:
    if isinstance(employee_id, str):
        employee_id = uuid.UUID(employee_id)

    row = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.hospital_id == hospital_id,
            AttendanceRecord.employee_id == employee_id,
            AttendanceRecord.date == mark_date,
        )
        .first()
    )
    if row and row.is_verified:
        raise AttendanceLockedError(f"Attendance for {mark_date} is already verified and locked")

    if row:
        row.status = status
        row.marked_by = marked_by
    else:
        row = AttendanceRecord(
            hospital_id=hospital_id, employee_id=employee_id, date=mark_date,
            status=status, is_verified=False, marked_by=marked_by,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def bulk_mark_attendance(
    db: Session,
    hospital_id: uuid.UUID,
    marked_by: uuid.UUID,
    marks: list[dict],
) -> tuple[list[AttendanceRecord], list[dict]]:
    """Returns (updated_rows, skipped) — skipped entries name the
    already-verified (locked) dates that were left untouched rather than
    failing the whole batch."""
    updated: list[AttendanceRecord] = []
    skipped: list[dict] = []
    for mark in marks:
        try:
            row = mark_attendance(db, hospital_id, marked_by, mark["employee_id"], mark["date"], mark["status"])
            updated.append(row)
        except AttendanceLockedError as e:
            skipped.append({"employee_id": mark["employee_id"], "date": str(mark["date"]), "reason": str(e)})
    return updated, skipped


def verify_attendance(
    db: Session,
    hospital_id: uuid.UUID,
    verified_by: uuid.UUID,
    date_from: date,
    date_to: date,
    employee_ids: Optional[list[str]] = None,
) -> int:
    query = db.query(AttendanceRecord).filter(
        AttendanceRecord.hospital_id == hospital_id,
        AttendanceRecord.date >= date_from,
        AttendanceRecord.date <= date_to,
        AttendanceRecord.is_verified == False,  # noqa: E712
    )
    if employee_ids:
        query = query.filter(AttendanceRecord.employee_id.in_([uuid.UUID(e) for e in employee_ids]))
    rows = query.all()
    now = datetime.now(timezone.utc)
    for row in rows:
        row.is_verified = True
        row.verified_by = verified_by
        row.verified_at = now
    db.commit()
    logger.info(f"Verified {len(rows)} attendance rows for hospital {hospital_id}, {date_from}..{date_to}")
    return len(rows)


def mark_on_leave(
    db: Session,
    hospital_id: uuid.UUID,
    employee_id: str | uuid.UUID,
    entered_by: str | uuid.UUID,
    date_from: date,
    date_to: date,
) -> None:
    """Called by leave_service (Phase 3) when a leave record is entered —
    writes `on_leave` for every covered date so attendance and leave never
    disagree. Silently skips any date already verified/locked rather than
    raising, since this runs as a side effect of an HR action on a different
    screen."""
    if isinstance(employee_id, str):
        employee_id = uuid.UUID(employee_id)
    if isinstance(entered_by, str):
        entered_by = uuid.UUID(entered_by)
    day = date_from
    while day <= date_to:
        try:
            mark_attendance(db, hospital_id, entered_by, employee_id, day, "on_leave")
        except AttendanceLockedError:
            pass
        day = date.fromordinal(day.toordinal() + 1)
