import logging
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.shift import (
    ShiftCreate, ShiftUpdate, ShiftResponse, ShiftAssignRequest, ShiftDatesAssignRequest,
)
from ..services import shift_management

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/shifts", tags=["Shifts"])


@router.get("", response_model=list[ShiftResponse])
async def get_shifts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    shifts = shift_management.list_shifts(db, current_user.hospital_id)
    return [ShiftResponse.model_validate(s) for s in shifts]


@router.post("", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(
    body: ShiftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    shift = shift_management.create_shift(db, current_user.hospital_id, body.name, body.start_time, body.end_time)
    return ShiftResponse.model_validate(shift)


@router.put("/{shift_id}", response_model=ShiftResponse)
async def update_shift(
    shift_id: str,
    body: ShiftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    shift = shift_management.update_shift(
        db, current_user.hospital_id, uuid.UUID(shift_id),
        name=body.name, start_time=body.start_time, end_time=body.end_time,
    )
    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
    return ShiftResponse.model_validate(shift)


@router.delete("/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shift(
    shift_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    ok = shift_management.delete_shift(db, current_user.hospital_id, uuid.UUID(shift_id))
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")


@router.post("/assign", response_model=dict)
async def assign_shift(
    body: ShiftAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    user_uuids = [uuid.UUID(u) for u in body.user_ids]
    count = shift_management.assign_shift(
        db, current_user.hospital_id, user_uuids, uuid.UUID(body.shift_id), changed_by=current_user.id,
    )
    return {"updated": count}


@router.post("/dates/assign", response_model=dict)
async def assign_dates_shift(
    body: ShiftDatesAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Assign one shift to a list of employees for an explicit set of dates
    picked off the Shift Calendar (click-to-select, same interaction as the
    Holiday Calendar) — any combination of dates, contiguous or not."""
    user_uuids = [uuid.UUID(u) for u in body.user_ids]
    dates = [date.fromisoformat(d) for d in body.dates]
    count = shift_management.assign_shift_for_dates(
        db, current_user.hospital_id, user_uuids, uuid.UUID(body.shift_id), dates, changed_by=current_user.id,
    )
    return {"updated": count}
