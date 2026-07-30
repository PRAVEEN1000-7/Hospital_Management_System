"""
Workforce Reports service — the five reports named in the BRD: Daily
Attendance Count, Absentee Report, Verified Attendance Sheet, LOP Report,
Paid Leave Balance Report. No new tables — these are read-only aggregations
over Phases 1-3's tables, following the existing Analytics page's pattern of
building reports on top of already-real operational data rather than a
separate reporting subsystem.
"""
import uuid
from datetime import date
from sqlalchemy.orm import Session
from ..models.attendance import AttendanceRecord
from ..models.employee import EmployeeProfile
from ..models.leave import LeaveBalance
from ..models.department import Department
from .leave_service import leave_days_taken_in_period
from .employee_service import ensure_employee_profiles


def daily_attendance_count(db: Session, hospital_id: uuid.UUID, date_from: date, date_to: date) -> list[dict]:
    """One row per date with a count for each status."""
    rows = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.hospital_id == hospital_id,
            AttendanceRecord.date >= date_from,
            AttendanceRecord.date <= date_to,
        )
        .all()
    )
    by_date: dict[date, dict[str, int]] = {}
    for r in rows:
        bucket = by_date.setdefault(r.date, {"present": 0, "absent": 0, "on_leave": 0, "holiday": 0, "not_marked": 0})
        bucket[r.status] = bucket.get(r.status, 0) + 1
    return [
        {"date": str(d), **counts}
        for d, counts in sorted(by_date.items())
    ]


def absentee_report(db: Session, hospital_id: uuid.UUID, date_from: date, date_to: date) -> list[dict]:
    """Per-employee list of absent dates in the range."""
    rows = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.hospital_id == hospital_id,
            AttendanceRecord.date >= date_from,
            AttendanceRecord.date <= date_to,
            AttendanceRecord.status == "absent",
        )
        .all()
    )
    by_employee: dict[uuid.UUID, list[str]] = {}
    for r in rows:
        by_employee.setdefault(r.employee_id, []).append(str(r.date))
    result = []
    for employee_id, dates in by_employee.items():
        employee = next((r.employee for r in rows if r.employee_id == employee_id), None)
        result.append({
            "employee_id": str(employee_id),
            "employee_name": f"{employee.first_name} {employee.last_name}".strip() if employee else None,
            "absent_days": len(dates),
            "dates": sorted(dates),
        })
    return sorted(result, key=lambda r: -r["absent_days"])


def verified_attendance_sheet(db: Session, hospital_id: uuid.UUID, date_from: date, date_to: date) -> list[dict]:
    rows = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.hospital_id == hospital_id,
            AttendanceRecord.date >= date_from,
            AttendanceRecord.date <= date_to,
            AttendanceRecord.is_verified == True,  # noqa: E712
        )
        .order_by(AttendanceRecord.date)
        .all()
    )
    return [
        {
            "employee_id": str(r.employee_id),
            "employee_name": f"{r.employee.first_name} {r.employee.last_name}".strip() if r.employee else None,
            "date": str(r.date),
            "status": r.status,
            "verified_at": r.verified_at.isoformat() if r.verified_at else None,
        }
        for r in rows
    ]


def lop_report(db: Session, hospital_id: uuid.UUID, year: int) -> list[dict]:
    """Per employee: leave taken in `year` vs. allocated → LOP days (same
    formula as the payroll worked example: max(0, taken - allocated))."""
    ensure_employee_profiles(db, hospital_id)
    profiles = db.query(EmployeeProfile).filter(EmployeeProfile.hospital_id == hospital_id).all()
    date_from, date_to = date(year, 1, 1), date(year, 12, 31)
    result = []
    for profile in profiles:
        taken = leave_days_taken_in_period(db, profile.user_id, date_from, date_to)
        if taken == 0:
            continue
        allocated = profile.paid_leave_entitlement or 0
        lop_days = max(0, taken - allocated)
        result.append({
            "employee_id": str(profile.user_id),
            "employee_name": f"{profile.user.first_name} {profile.user.last_name}".strip() if profile.user else None,
            "year": year,
            "allocated": allocated,
            "leave_taken": taken,
            "lop_days": lop_days,
        })
    return sorted(result, key=lambda r: -r["lop_days"])


def paid_leave_balance_report(db: Session, hospital_id: uuid.UUID, year: int) -> list[dict]:
    ensure_employee_profiles(db, hospital_id)
    profiles = db.query(EmployeeProfile).filter(EmployeeProfile.hospital_id == hospital_id).all()
    result = []
    for profile in profiles:
        balance = (
            db.query(LeaveBalance)
            .filter(LeaveBalance.employee_id == profile.user_id, LeaveBalance.year == year)
            .first()
        )
        allocated = balance.allocated if balance else (profile.paid_leave_entitlement or 0)
        used = balance.used if balance else 0
        result.append({
            "employee_id": str(profile.user_id),
            "employee_name": f"{profile.user.first_name} {profile.user.last_name}".strip() if profile.user else None,
            "year": year,
            "allocated": allocated,
            "used": used,
            "remaining": max(0, allocated - used),
        })
    return sorted(result, key=lambda r: r["employee_name"] or "")


def headcount_report(db: Session, hospital_id: uuid.UUID) -> dict:
    ensure_employee_profiles(db, hospital_id)
    profiles = db.query(EmployeeProfile).filter(EmployeeProfile.hospital_id == hospital_id).all()
    by_department: dict[str, int] = {}
    by_employment_type: dict[str, int] = {}
    for p in profiles:
        dept_name = "Unassigned"
        if p.department_id:
            dept = db.query(Department).filter(Department.id == p.department_id).first()
            dept_name = dept.name if dept else "Unassigned"
        by_department[dept_name] = by_department.get(dept_name, 0) + 1
        by_employment_type[p.employment_type] = by_employment_type.get(p.employment_type, 0) + 1
    return {
        "total": len(profiles),
        "by_department": [{"department": k, "count": v} for k, v in by_department.items()],
        "by_employment_type": [{"employment_type": k, "count": v} for k, v in by_employment_type.items()],
    }
