"""
Holidays router — CRUD for the hospital holiday calendar.
"""
import logging
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..core.module_roles import require_permission
from ..schemas.holiday import (
    HolidayCreate,
    HolidayUpdate,
    HolidayResponse,
    HolidayListResponse,
    BulkWeeklyOffCreate,
)
from ..services.holiday_service import (
    list_holidays,
    get_holiday_by_id,
    create_holiday,
    update_holiday,
    delete_holiday,
    bulk_create_weekly_off,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/holidays", tags=["Holidays"])

holiday_view_guard = require_permission("employee.holidays", "view")
holiday_edit_guard = require_permission("employee.holidays", "edit")


@router.get("", response_model=HolidayListResponse)
async def get_holidays(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(holiday_view_guard),
):
    rows = list_holidays(db, current_user.hospital_id, date_from, date_to)
    return HolidayListResponse(total=len(rows), data=[HolidayResponse.model_validate(r) for r in rows])


@router.post("", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED)
async def create_new_holiday(
    data: HolidayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(holiday_edit_guard),
):
    try:
        holiday = create_holiday(db, current_user.hospital_id, data.model_dump())
        return HolidayResponse.model_validate(holiday)
    except Exception as e:
        logger.error(f"Error creating holiday: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to create holiday — a holiday may already exist on this date")


@router.put("/{holiday_id}", response_model=HolidayResponse)
async def update_existing_holiday(
    holiday_id: str,
    data: HolidayUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(holiday_edit_guard),
):
    existing = get_holiday_by_id(db, holiday_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Holiday not found")
    holiday = update_holiday(db, holiday_id, data.model_dump(exclude_unset=True))
    return HolidayResponse.model_validate(holiday)


@router.delete("/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_existing_holiday(
    holiday_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(holiday_edit_guard),
):
    existing = get_holiday_by_id(db, holiday_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Holiday not found")
    delete_holiday(db, holiday_id)


@router.post("/bulk-weekly-off", response_model=list[HolidayResponse], status_code=status.HTTP_201_CREATED)
async def create_bulk_weekly_off(
    data: BulkWeeklyOffCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(holiday_edit_guard),
):
    """Mark every occurrence of one weekday as a holiday for a year in one action."""
    rows = bulk_create_weekly_off(db, current_user.hospital_id, data.year, data.weekday, data.name)
    return [HolidayResponse.model_validate(r) for r in rows]
