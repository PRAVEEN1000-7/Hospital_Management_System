"""
Workforce Reports router — read-only aggregations over the workforce
tables. Module access (workforce_management) is gated at registration in
main.py, same blanket-dependency pattern as every other module; only the
RBAC permission level differs per report below (view access on the
relevant key).

Response shapes are plain dicts (no per-report Pydantic schema) — these are
read-only reporting aggregations with five genuinely different shapes; a
schema class per report would be pure boilerplate for data that's never
written back.
"""
from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..core.module_roles import require_permission
from ..services.workforce_reports_service import (
    daily_attendance_count, absentee_report, verified_attendance_sheet,
    lop_report, paid_leave_balance_report, headcount_report,
)

router = APIRouter(prefix="/workforce-reports", tags=["Workforce Reports"])

_attendance_view = require_permission("employee.attendance", "view")
_leave_view = require_permission("employee.leave", "view")
_employee_view = require_permission("employee.records", "view")


@router.get("/daily-attendance-count")
async def get_daily_attendance_count(
    date_from: date,
    date_to: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(_attendance_view),
):
    return {"date_from": str(date_from), "date_to": str(date_to), "data": daily_attendance_count(db, current_user.hospital_id, date_from, date_to)}


@router.get("/absentee-report")
async def get_absentee_report(
    date_from: date,
    date_to: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(_attendance_view),
):
    return {"date_from": str(date_from), "date_to": str(date_to), "data": absentee_report(db, current_user.hospital_id, date_from, date_to)}


@router.get("/verified-attendance-sheet")
async def get_verified_attendance_sheet(
    date_from: date,
    date_to: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(_attendance_view),
):
    return {"date_from": str(date_from), "date_to": str(date_to), "data": verified_attendance_sheet(db, current_user.hospital_id, date_from, date_to)}


@router.get("/lop-report")
async def get_lop_report(
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_leave_view),
):
    return {"year": year, "data": lop_report(db, current_user.hospital_id, year)}


@router.get("/paid-leave-balance-report")
async def get_paid_leave_balance_report(
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_leave_view),
):
    return {"year": year, "data": paid_leave_balance_report(db, current_user.hospital_id, year)}


@router.get("/headcount")
async def get_headcount(
    db: Session = Depends(get_db),
    current_user: User = Depends(_employee_view),
):
    return headcount_report(db, current_user.hospital_id)
