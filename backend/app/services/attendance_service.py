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
from . import holiday_service, shift_management, settings_service


def mark_day(
    db: Session, hospital_id: uuid.UUID, user_id: uuid.UUID, day: date_cls,
    status: str, marked_by: uuid.UUID, reason: str | None = None,
) -> None:
    """Always upserts a row — 'present' is now a real stored status (not a
    delete), so the report can tell "explicitly confirmed present" apart
    from "never touched" (unmarked/blank). Any date is editable, any time —
    no past-date lock."""
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

    # Leave Policy (System Settings) — a hospital-wide number overrides every
    # employee's own paid_leave_entitlement when enabled. See
    # models/hospital_settings.py.
    hosp_settings = settings_service.get_hospital_settings(db, hospital_id)
    uniform_leave_days = (
        (hosp_settings.paid_leave_default_days or 0)
        if hosp_settings and hosp_settings.paid_leave_uniform
        else None
    )

    # Only regular/weekly-off (red) days reduce working_days — festival days
    # are paid regardless of attendance, so they stay inside the count.
    working_days = total_days - len([d for d in red_holidays if 1 <= d <= total_days])

    shifts = shift_management.list_shifts(db, hospital_id)

    # Which shift each employee was on for EVERY individual day of this
    # month — shifts rotate week to week (Shift Calendar), so a single
    # "current shift" isn't enough; the report needs a day-by-day answer to
    # count "N days Day Shift, M days Night Shift" per employee. See
    # shift_management.get_daily_shift_map (schema: 01_full_schema.sql §8.5).
    daily_shifts = shift_management.get_daily_shift_map(db, hospital_id, year, month)

    # is_active == False is a manual HR "hide everywhere" override — distinct
    # from date_of_leaving (which still lets a relieved employee show up in
    # historical reports/payroll for the days they actually worked). See
    # User.employment_status.
    employees_query = db.query(User).filter(
        User.hospital_id == hospital_id, User.is_deleted == False, User.is_active == True,
    )
    employees = employees_query.order_by(User.first_name).all()
    if shift_id is not None:
        shift_id_str = str(shift_id)
        # "Filter to this shift" now means "worked at least one day on it
        # this month" — with rotation, an employee isn't cleanly "on" one
        # shift for the whole month anymore.
        shifts_by_name = {s.name: str(s.id) for s in shifts}
        employees = [
            e for e in employees
            if any(shifts_by_name.get(name) == shift_id_str for name in daily_shifts.get(e.id, {}).values())
        ]

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

    employee_rows = []
    summary = {"present": 0.0, "absent": 0.0, "half_day": 0, "holiday": 0, "festival": 0, "na": 0, "unmarked": 0}
    # Total person-days per shift name across the whole roster this month —
    # e.g. {"Day Shift": 145, "Night Shift": 62}. With rotation, "how many
    # employees worked Day Shift" isn't a single headcount anymore (the same
    # employee can appear under both), so this counts shift-days delivered.
    shift_summary: dict[str, int] = {}

    for emp in employees:
        emp_daily_shifts = daily_shifts.get(emp.id, {})
        shift_days: dict[str, int] = {}
        for shift_name in emp_daily_shifts.values():
            if shift_name:
                shift_days[shift_name] = shift_days.get(shift_name, 0) + 1
                shift_summary[shift_name] = shift_summary.get(shift_name, 0) + 1
        days: list[str] = []
        counts = {"present": 0, "absent": 0, "half_day": 0, "holiday": 0, "festival": 0, "na": 0, "unmarked": 0}

        for day_num in range(1, total_days + 1):
            day_obj = date_cls(year, month, day_num)
            if day_num in red_holidays:
                status = "holiday"
            elif day_num in festival_days:
                status = "festival"
            elif not emp.is_employed_on(day_obj):
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

        paid_leave_entitlement = uniform_leave_days if uniform_leave_days is not None else (emp.paid_leave_entitlement or 0)
        deduction_days = max(0.0, absent_count - paid_leave_entitlement)
        per_day_salary = float(emp.base_salary) / working_days if emp.base_salary and working_days > 0 else 0.0
        deduction_amount = round(deduction_days * per_day_salary, 2)

        employee_rows.append({
            "user_id": str(emp.id),
            "reference_number": emp.reference_number,
            "first_name": emp.first_name,
            "last_name": emp.last_name,
            "designation": emp.designation,
            "emp_status": emp.employment_status(),
            "date_of_joining": emp.date_of_joining.isoformat() if emp.date_of_joining else None,
            "date_of_leaving": emp.date_of_leaving.isoformat() if emp.date_of_leaving else None,
            "shift_days": shift_days,
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
            "base_salary": float(emp.base_salary) if emp.base_salary else 0.0,
            "per_day_salary": round(per_day_salary, 2),
            "deduction_days": deduction_days,
            "deduction_amount": deduction_amount,
        })

    return {
        "year": year,
        "month": month,
        "total_days": total_days,
        "shifts": [{"id": str(s.id), "name": s.name} for s in shifts],
        "employees": employee_rows,
        "summary": summary,
        "shift_summary": shift_summary,
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

    # Same day-level resolution as get_month_report — each record shows the
    # shift effective on ITS OWN date, not month-end or today, so a leave
    # logged during a Night Shift week still reads correctly after the
    # employee rotates back to Day.
    daily_shifts = shift_management.get_daily_shift_map(db, hospital_id, year, month)
    shifts_by_name = {s.name: str(s.id) for s in shift_management.list_shifts(db, hospital_id)}

    query = (
        db.query(AttendanceRecord)
        .join(User, User.id == AttendanceRecord.user_id)
        .options(joinedload(AttendanceRecord.user))
        .filter(
            AttendanceRecord.hospital_id == hospital_id,
            AttendanceRecord.date >= month_start,
            AttendanceRecord.date <= month_end,
            # 'present' is now a real stored status (see mark_day) but isn't
            # a leave — exclude it so this stays an absence/half-day-only log.
            AttendanceRecord.status.in_(["absent", "half_day"]),
            # Manually deactivated employees are hidden from every module —
            # see User.employment_status.
            User.is_active == True,
        )
    )
    records = query.order_by(AttendanceRecord.date).all()

    result = []
    for r in records:
        day_shift_name = daily_shifts.get(r.user_id, {}).get(r.date.day)
        if shift_id is not None and shifts_by_name.get(day_shift_name) != str(shift_id):
            continue
        result.append({
            "user_id": str(r.user_id),
            "reference_number": r.user.reference_number,
            "first_name": r.user.first_name,
            "last_name": r.user.last_name,
            "designation": r.user.designation,
            "shift_name": day_shift_name,
            "date": r.date.isoformat(),
            "status": r.status,
            "reason": r.reason,
        })
    return result
