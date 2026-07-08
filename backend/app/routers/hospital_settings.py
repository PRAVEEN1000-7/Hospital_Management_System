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
    """Get hospital settings for the current user's hospital. Auto-creates defaults if missing."""
    settings = get_hospital_settings(db, current_user.hospital_id)
    if not settings:
        # Auto-create default settings — derive 2-char code from the hospital record
        from ..models.user import Hospital
        import uuid as _uuid
        hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
        raw_code = (hospital.code or hospital.name or "HC")[:2].upper() if hospital else "HC"
        hospital_code = ''.join(c for c in raw_code if c.isalpha()).ljust(2, 'X')[:2]
        settings = create_hospital_settings(
            db,
            hospital_id=current_user.hospital_id if isinstance(current_user.hospital_id, _uuid.UUID)
                        else _uuid.UUID(str(current_user.hospital_id)),
            hospital_code=hospital_code,
        )
        logger.info("Auto-created hospital_settings for hospital %s", current_user.hospital_id)
    # Return all setting columns as a dict. Rows created outside this ORM
    # path (e.g. seeded directly in SQL, or columns added by a later ALTER
    # TABLE with no backfill) can have a real NULL where the model declares a
    # Python-side default — backfill those here so the settings form always
    # shows a sensible value instead of a blank field.
    result = {}
    for col in settings.__table__.columns:
        val = getattr(settings, col.name)
        if val is None and col.default is not None and not callable(col.default.arg):
            val = col.default.arg
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
