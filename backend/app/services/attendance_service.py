"""
Attendance report service — combines several independent sources into one
day-by-day grid per employee, per month:
  - attendance_records        → explicit Absent/Half Day overrides (exceptions only)
  - holidays.holiday_days     → Week-Off days (red — Sundays etc.), SUBTRACTED
                                 from working_days for payroll
  - holidays.festival_days    → Festival/local holidays (green), NOT subtracted
                                 from working_days — paid regardless of attendance
  - users.date_of_joining / date_of_leaving → Not Applicable days
Any day not covered by the above defaults to Present.

Payroll deduction: deduction_days = max(0, effective_absent - paid_leave_entitlement),
where effective_absent counts a Half Day as 0.5. deduction_amount is that many
days at (base_salary / working_days) — working_days coming from the Holiday
Calendar's red-holiday-only count, per the user's worked example (Sundays
reduce the paid-day base; festival days don't).
"""
import calendar
import uuid
from datetime import date as date_cls
from sqlalchemy.orm import Session, joinedload

from ..models.user import User
from ..models.attendance import AttendanceRecord
from . import holiday_service, shift_management


class DayLockedError(Exception):
    """Raised when trying to mark a date that's already in the past."""


def mark_day(
    db: Session, hospital_id: uuid.UUID, user_id: uuid.UUID, day: date_cls,
    status: str, marked_by: uuid.UUID, reason: str | None = None,
) -> None:
    """Always upserts a row — 'present' is now a real stored status (not a
    delete), so the report can tell "explicitly confirmed present" apart
    from "never touched" (unmarked/blank). Past dates are frozen."""
    if day < date_cls.today():
        raise DayLockedError(f"{day.isoformat()} has already passed and can no longer be edited")

    row = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.user_id == user_id, AttendanceRecord.date == day)
        .first()
    )
    if row:
        row.status = status
        row.reason = reason
        row.marked_by = marked_by
    else:
        row = AttendanceRecord(
            hospital_id=hospital_id, user_id=user_id, date=day,
            status=status, reason=reason, marked_by=marked_by,
        )
        db.add(row)
    db.commit()


def get_month_report(
    db: Session, hospital_id: uuid.UUID, year: int, month: int,
    shift_id: uuid.UUID | None = None,
) -> dict:
    total_days = calendar.monthrange(year, month)[1]

    holiday_row = holiday_service.get_month(db, hospital_id, year, month)
    red_holidays = set(holiday_row.holiday_days) if holiday_row else set()
    festival_days = set(holiday_row.festival_days) if holiday_row else set()

    # Only regular/weekly-off (red) days reduce working_days — festival days
    # are paid regardless of attendance, so they stay inside the count.
    working_days = total_days - len([d for d in red_holidays if 1 <= d <= total_days])

    shifts = shift_management.list_shifts(db, hospital_id)

    employees_query = (
        db.query(User)
        .options(joinedload(User.shift))
        .filter(User.hospital_id == hospital_id, User.is_deleted == False)
    )
    if shift_id is not None:
        employees_query = employees_query.filter(User.shift_id == shift_id)
    employees = employees_query.order_by(User.first_name).all()

    month_start = date_cls(year, month, 1)
    month_end = date_cls(year, month, total_days)
    records = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.hospital_id == hospital_id,
            AttendanceRecord.date >= month_start,
            AttendanceRecord.date <= month_end,
        )
        .all()
    )
    overrides: dict[tuple[uuid.UUID, int], str] = {
        (r.user_id, r.date.day): r.status for r in records
    }

    today = date_cls.today()
    employee_rows = []
    summary = {"present": 0.0, "absent": 0.0, "half_day": 0, "holiday": 0, "festival": 0, "na": 0, "unmarked": 0}

    for emp in employees:
        days: list[str] = []
        counts = {"present": 0, "absent": 0, "half_day": 0, "holiday": 0, "festival": 0, "na": 0, "unmarked": 0}

        for day_num in range(1, total_days + 1):
            day_obj = date_cls(year, month, day_num)
            if day_num in red_holidays:
                status = "holiday"
            elif day_num in festival_days:
                status = "festival"
            elif emp.date_of_joining and day_obj < emp.date_of_joining:
                status = "na"
            elif emp.date_of_leaving and day_obj > emp.date_of_leaving:
                status = "na"
            elif (emp.id, day_num) in overrides:
                status = overrides[(emp.id, day_num)]
            else:
                # No explicit mark — blank on the grid, but still paid/counted
                # as Present for payroll (see present_count below).
                status = "unmarked"
            days.append(status)
            counts[status] += 1

        # Festival + unmarked days are paid regardless of attendance —
        # counted as Present, never as Absent (see module docstring).
        present_count = counts["present"] + counts["unmarked"] + counts["festival"] + 0.5 * counts["half_day"]
        absent_count = counts["absent"] + 0.5 * counts["half_day"]

        summary["present"] += present_count
        summary["absent"] += absent_count
        summary["half_day"] += counts["half_day"]
        summary["holiday"] += counts["holiday"]
        summary["festival"] += counts["festival"]
        summary["na"] += counts["na"]
        summary["unmarked"] += counts["unmarked"]

        paid_leave_entitlement = emp.paid_leave_entitlement or 0
        deduction_days = max(0.0, absent_count - paid_leave_entitlement)
        per_day_salary = float(emp.base_salary) / working_days if emp.base_salary and working_days > 0 else 0.0
        deduction_amount = round(deduction_days * per_day_salary, 2)

        employee_rows.append({
            "user_id": str(emp.id),
            "reference_number": emp.reference_number,
            "first_name": emp.first_name,
            "last_name": emp.last_name,
            "designation": emp.designation,
            "emp_status": "ex_employee" if not emp.is_active or emp.date_of_leaving else "active",
            "shift_id": str(emp.shift_id) if emp.shift_id else None,
            "shift_name": emp.shift.name if emp.shift else None,
            "days": days,
            "present_count": present_count,
            "absent_count": absent_count,
            "half_day_count": counts["half_day"],
            "holiday_count": counts["holiday"],
            "festival_count": counts["festival"],
            "na_count": counts["na"],
            "unmarked_count": counts["unmarked"],
            "paid_leave_entitlement": paid_leave_entitlement,
            "working_days": working_days,
            "per_day_salary": round(per_day_salary, 2),
            "deduction_days": deduction_days,
            "deduction_amount": deduction_amount,
        })

    # Days strictly before today are frozen — mark_day rejects edits to them
    # server-side; this tells the grid which columns to disable + show a
    # download button for, without every client needing its own clock.
    locked_days = [d for d in range(1, total_days + 1) if date_cls(year, month, d) < today]

    return {
        "year": year,
        "month": month,
        "total_days": total_days,
        "shifts": [{"id": str(s.id), "name": s.name} for s in shifts],
        "employees": employee_rows,
        "summary": summary,
        "locked_days": locked_days,
    }


def get_month_leaves(
    db: Session, hospital_id: uuid.UUID, year: int, month: int,
    shift_id: uuid.UUID | None = None,
) -> list[dict]:
    """Leave Management log — every Absent/Half Day mark with its reason,
    one row per (employee, date), for the Leave Management page."""
    total_days = calendar.monthrange(year, month)[1]
    month_start = date_cls(year, month, 1)
    month_end = date_cls(year, month, total_days)

    query = (
        db.query(AttendanceRecord)
        .join(User, User.id == AttendanceRecord.user_id)
        .options(joinedload(AttendanceRecord.user).joinedload(User.shift))
        .filter(
            AttendanceRecord.hospital_id == hospital_id,
            AttendanceRecord.date >= month_start,
            AttendanceRecord.date <= month_end,
            # 'present' is now a real stored status (see mark_day) but isn't
            # a leave — exclude it so this stays an absence/half-day-only log.
            AttendanceRecord.status.in_(["absent", "half_day"]),
        )
    )
    if shift_id is not None:
        query = query.filter(User.shift_id == shift_id)

    records = query.order_by(AttendanceRecord.date).all()

    return [
        {
            "user_id": str(r.user_id),
            "reference_number": r.user.reference_number,
            "first_name": r.user.first_name,
            "last_name": r.user.last_name,
            "designation": r.user.designation,
            "shift_name": r.user.shift.name if r.user.shift else None,
            "date": r.date.isoformat(),
            "status": r.status,
            "reason": r.reason,
        }
        for r in records
    ]
