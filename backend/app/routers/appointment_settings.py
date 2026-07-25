"""
Appointment settings router – admin configuration.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin, require_any_role
from ..core.module_roles import view_roles, edit_roles
from ..schemas.appointment import AppointmentSettingResponse, AppointmentSettingUpdate
from ..services.settings_service import get_all_settings, update_setting

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/appointment-settings", tags=["Appointment Settings"])

settings_view_guard = require_any_role(*view_roles("appt.settings"))
settings_edit_guard = require_any_role(*edit_roles("appt.settings"))


@router.get("", response_model=list[AppointmentSettingResponse])
async def list_settings(
    doctor_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(settings_view_guard),
):
    return get_all_settings(db, doctor_id)


@router.put("/{key}", response_model=AppointmentSettingResponse)
async def update(
    key: str,
    data: AppointmentSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(settings_edit_guard),
):
    row = update_setting(db, key, data.setting_value, current_user.id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    return row
