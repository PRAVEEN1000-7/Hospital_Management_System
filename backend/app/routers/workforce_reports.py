"""
Workforce Reports router — read-only aggregations over Phases 1-3's tables.
Unlike every other module in this feature, each endpoint here is gated on a
*different* underlying module (attendance vs leave_management vs
employee_management), so this router is registered in main.py with no
blanket `dependencies=` list — each endpoint declares its own module check
inline instead.

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
from ..core.tenant_security import SubscriptionValidator
from ..services.workforce_reports_service import (
    daily_attendance_count, absentee_report, verified_attendance_sheet,
    lop_report, paid_leave_balance_report, headcount_report,
)

router = APIRouter(prefix="/workforce-reports", tags=["Workforce Reports"])

_attendance_view = require_permission("employee.attendance", "view")
_leave_view = require_permission("employee.leave", "view")
_employee_view = require_permission("employee.records", "view")

_require_attendance_module = Depends(SubscriptionValidator.require_module_access("attendance"))
_require_leave_module = Depends(SubscriptionValidator.require_module_access("leave_management"))
_require_employee_module = Depends(SubscriptionValidator.require_module_access("employee_management"))


@router.get("/daily-attendance-count")
async def get_daily_attendance_count(
    date_from: date,
    date_to: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(_attendance_view),
    _module_check=_require_attendance_module,
):
    return {"date_from": str(date_from), "date_to": str(date_to), "data": daily_attendance_count(db, current_user.hospital_id, date_from, date_to)}


@router.get("/absentee-report")
async def get_absentee_report(
    date_from: date,
    date_to: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(_attendance_view),
    _module_check=_require_attendance_module,
):
    return {"date_from": str(date_from), "date_to": str(date_to), "data": absentee_report(db, current_user.hospital_id, date_from, date_to)}


@router.get("/verified-attendance-sheet")
async def get_verified_attendance_sheet(
    date_from: date,
    date_to: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(_attendance_view),
    _module_check=_require_attendance_module,
):
    return {"date_from": str(date_from), "date_to": str(date_to), "data": verified_attendance_sheet(db, current_user.hospital_id, date_from, date_to)}


@router.get("/lop-report")
async def get_lop_report(
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_leave_view),
    _module_check=_require_leave_module,
):
    return {"year": year, "data": lop_report(db, current_user.hospital_id, year)}


@router.get("/paid-leave-balance-report")
async def get_paid_leave_balance_report(
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_leave_view),
    _module_check=_require_leave_module,
):
    return {"year": year, "data": paid_leave_balance_report(db, current_user.hospital_id, year)}


@router.get("/headcount")
async def get_headcount(
    db: Session = Depends(get_db),
    current_user: User = Depends(_employee_view),
    _module_check=_require_employee_module,
):
    return headcount_report(db, current_user.hospital_id)
