"""
Attendance report router — daily present/absent/leave marking + the
monthly report grid, gated by the `attendance` module.
"""
import logging
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.attendance_record import AttendanceMarkRequest, AttendanceReportResponse, LeaveRecord
from ..services import attendance_service
from ..services.attendance_service import DayLockedError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/attendance-records", tags=["Attendance"])


@router.get("/report", response_model=AttendanceReportResponse)
async def get_report(
    year: int,
    month: int = Query(..., ge=1, le=12),
    shift_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    report = attendance_service.get_month_report(
        db, current_user.hospital_id, year, month,
        shift_id=uuid.UUID(shift_id) if shift_id else None,
    )
    return AttendanceReportResponse(**report)


@router.put("/{user_id}/{day}")
async def mark_attendance(
    user_id: str,
    day: date,
    body: AttendanceMarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    try:
        attendance_service.mark_day(
            db, current_user.hospital_id, uuid.UUID(user_id), day,
            body.status, current_user.id, reason=body.reason,
        )
    except DayLockedError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"status": "ok"}


@router.get("/leaves", response_model=list[LeaveRecord])
async def get_leaves(
    year: int,
    month: int = Query(..., ge=1, le=12),
    shift_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return attendance_service.get_month_leaves(
        db, current_user.hospital_id, year, month,
        shift_id=uuid.UUID(shift_id) if shift_id else None,
    )
