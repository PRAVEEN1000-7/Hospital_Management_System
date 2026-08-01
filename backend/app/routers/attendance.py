"""
Attendance router — the provisional-then-verified grid.
"""
import logging
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..models.attendance import AttendanceRecord
from ..core.module_roles import require_permission
from ..schemas.attendance import (
    AttendanceResponse, AttendanceGridResponse, AttendanceMarkRequest,
    AttendanceBulkMarkRequest, AttendanceVerifyRequest,
)
from ..services.attendance_service import (
    get_attendance_grid, mark_attendance, bulk_mark_attendance, verify_attendance,
    AttendanceLockedError,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/attendance", tags=["Attendance"])

attendance_view_guard = require_permission("employee.attendance", "view")
attendance_edit_guard = require_permission("employee.attendance", "edit")


def _enrich(row: AttendanceRecord) -> AttendanceResponse:
    resp = AttendanceResponse.model_validate(row)
    if row.employee:
        resp.employee_name = f"{row.employee.first_name} {row.employee.last_name}".strip()
    return resp


@router.get("/grid", response_model=AttendanceGridResponse)
async def get_grid(
    date_from: date,
    date_to: date,
    employee_ids: Optional[str] = None,  # comma-separated
    db: Session = Depends(get_db),
    current_user: User = Depends(attendance_view_guard),
):
    ids = employee_ids.split(",") if employee_ids else None
    rows = get_attendance_grid(db, current_user.hospital_id, date_from, date_to, ids)
    return AttendanceGridResponse(date_from=date_from, date_to=date_to, data=[_enrich(r) for r in rows])


@router.post("/mark", response_model=AttendanceResponse)
async def mark(
    data: AttendanceMarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(attendance_edit_guard),
):
    try:
        row = mark_attendance(db, current_user.hospital_id, current_user.id, data.employee_id, data.date, data.status)
        return _enrich(row)
    except AttendanceLockedError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.post("/mark/bulk")
async def bulk_mark(
    data: AttendanceBulkMarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(attendance_edit_guard),
):
    updated, skipped = bulk_mark_attendance(
        db, current_user.hospital_id, current_user.id,
        [m.model_dump() for m in data.marks],
    )
    return {
        "updated": [_enrich(r) for r in updated],
        "skipped": skipped,
    }


@router.post("/verify")
async def verify(
    data: AttendanceVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(attendance_edit_guard),
):
    count = verify_attendance(
        db, current_user.hospital_id, current_user.id,
        data.date_from, data.date_to, data.employee_ids,
    )
    return {"verified_count": count}
