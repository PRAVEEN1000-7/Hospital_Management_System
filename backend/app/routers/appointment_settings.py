"""
Appointment settings router – admin configuration.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.appointment import AppointmentSettingResponse, AppointmentSettingUpdate
from ..services.settings_service import get_all_settings, update_setting

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/appointment-settings", tags=["Appointment Settings"])


@router.get("", response_model=list[AppointmentSettingResponse])
async def list_settings(
    doctor_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return get_all_settings(db, doctor_id)


@router.put("/{key}", response_model=AppointmentSettingResponse)
async def update(
    key: str,
    data: AppointmentSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    row = update_setting(db, key, data.setting_value, current_user.id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    return row
