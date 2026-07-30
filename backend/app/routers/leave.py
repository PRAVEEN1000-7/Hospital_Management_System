"""
Leave router — HR data-entry for employee leave, plus balance lookup.
"""
import logging
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..models.leave import LeaveRecord, LeaveBalance
from ..core.module_roles import require_permission
from ..schemas.leave import LeaveRecordCreate, LeaveRecordResponse, LeaveRecordListResponse, LeaveBalanceResponse
from ..services.leave_service import list_leave_records, create_leave_record, get_or_create_balance

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/leave", tags=["Leave"])

leave_view_guard = require_permission("employee.leave", "view")
leave_edit_guard = require_permission("employee.leave", "edit")


def _enrich_record(r: LeaveRecord) -> LeaveRecordResponse:
    resp = LeaveRecordResponse.model_validate(r)
    if r.employee:
        resp.employee_name = f"{r.employee.first_name} {r.employee.last_name}".strip()
    resp.days_taken = (r.end_date - r.start_date).days + 1
    return resp


def _enrich_balance(b: LeaveBalance) -> LeaveBalanceResponse:
    resp = LeaveBalanceResponse.model_validate(b)
    resp.remaining = max(0, b.allocated - b.used)
    if b.employee:
        resp.employee_name = f"{b.employee.first_name} {b.employee.last_name}".strip()
    return resp


@router.get("", response_model=LeaveRecordListResponse)
async def get_leave_records(
    employee_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(leave_view_guard),
):
    rows = list_leave_records(db, current_user.hospital_id, employee_id)
    return LeaveRecordListResponse(total=len(rows), data=[_enrich_record(r) for r in rows])


@router.post("", response_model=LeaveRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_new_leave_record(
    data: LeaveRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(leave_edit_guard),
):
    try:
        record = create_leave_record(db, current_user.hospital_id, current_user.id, data.model_dump())
        return _enrich_record(record)
    except Exception as e:
        logger.error(f"Error creating leave record: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create leave record")


@router.get("/balance/{employee_id}", response_model=LeaveBalanceResponse)
async def get_balance(
    employee_id: str,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(leave_view_guard),
):
    balance = get_or_create_balance(db, employee_id, year or date.today().year)
    return _enrich_balance(balance)
