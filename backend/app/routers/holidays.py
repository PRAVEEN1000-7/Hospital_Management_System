"""
Holidays router — monthly holiday allocation, gated by the `attendance` module.
"""
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.holiday import HolidayMonthUpdate, HolidayMonthResponse
from ..services import holiday_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/holidays", tags=["Holidays"])


@router.get("/{year}/{month}", response_model=HolidayMonthResponse)
async def get_holiday_month(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get the holiday allocation for one month. Empty list if never saved."""
    row = holiday_service.get_month(db, current_user.hospital_id, year, month)
    return HolidayMonthResponse.build(
        hospital_id=str(current_user.hospital_id), year=year, month=month,
        holiday_days=row.holiday_days if row else [],
        festival_days=row.festival_days if row else [],
        created_at=row.created_at if row else None,
        updated_at=row.updated_at if row else None,
    )


@router.get("/{year}", response_model=list[HolidayMonthResponse])
async def get_holiday_year(
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get the holiday allocation for every month of a year that has been saved."""
    rows = holiday_service.get_year(db, current_user.hospital_id, year)
    by_month = {r.month: r for r in rows}
    return [
        HolidayMonthResponse.build(
            hospital_id=str(current_user.hospital_id), year=year, month=m,
            holiday_days=by_month[m].holiday_days if m in by_month else [],
            festival_days=by_month[m].festival_days if m in by_month else [],
            created_at=by_month[m].created_at if m in by_month else None,
            updated_at=by_month[m].updated_at if m in by_month else None,
        )
        for m in range(1, 13)
    ]


@router.put("/{year}/{month}", response_model=HolidayMonthResponse)
async def save_holiday_month(
    year: int,
    month: int,
    body: HolidayMonthUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Save (upsert) the holiday allocation for one month."""
    row = holiday_service.upsert_month(
        db, current_user.hospital_id, year, month, body.holiday_days, body.festival_days, current_user.id,
    )
    return HolidayMonthResponse.build(
        hospital_id=str(current_user.hospital_id), year=year, month=month,
        holiday_days=row.holiday_days, festival_days=row.festival_days,
        created_at=row.created_at, updated_at=row.updated_at,
    )
