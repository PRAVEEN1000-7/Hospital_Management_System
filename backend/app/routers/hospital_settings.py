"""
Hospital settings router — manage hospital-level configuration.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..services.settings_service import (
    get_hospital_settings,
    update_hospital_settings,
    create_hospital_settings,
)
from ..schemas.appointment import HospitalSettingsResponse, HospitalSettingsUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/hospital-settings", tags=["Hospital Settings"])


@router.get("")
async def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get hospital settings for the current user's hospital."""
    settings = get_hospital_settings(db, current_user.hospital_id)
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital settings not found. Run initial setup first.",
        )
    # Return all setting columns as a dict
    result = {}
    for col in settings.__table__.columns:
        val = getattr(settings, col.name)
        if hasattr(val, "hex"):
            val = str(val)
        result[col.name] = val
    return result


@router.put("")
async def update_settings(
    data: HospitalSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Update hospital settings (admin only)."""
    try:
        update_data = data.model_dump(exclude_unset=True)
        # Map schema field names to model column names
        column_map = {
            "appointment_slot_duration": "appointment_slot_duration_minutes",
            "allow_walk_ins": "allow_walk_in",
        }
        mapped = {}
        for k, v in update_data.items():
            mapped_key = column_map.get(k, k)
            mapped[mapped_key] = v

        settings = update_hospital_settings(db, current_user.hospital_id, mapped)
        if not settings:
            raise HTTPException(status_code=404, detail="Hospital settings not found")

        result = {}
        for col in settings.__table__.columns:
            val = getattr(settings, col.name)
            if hasattr(val, "hex"):
                val = str(val)
            result[col.name] = val
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating settings: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update settings")
