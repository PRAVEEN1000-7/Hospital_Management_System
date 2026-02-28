"""
Settings service - works with new hms_db UUID schema.
Uses hospital_settings table with specific columns instead of key-value pairs.
"""
import uuid
import logging
from typing import Optional
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from ..models.hospital_settings import HospitalSettings

logger = logging.getLogger(__name__)


# -- Appointment setting key-to-column mapping --
APPOINTMENT_SETTING_KEYS = {
    "appointment_slot_duration_minutes": {
        "column": "appointment_slot_duration_minutes",
        "description": "Default appointment slot duration in minutes",
        "type": "int",
    },
    "appointment_buffer_minutes": {
        "column": "appointment_buffer_minutes",
        "description": "Buffer time between appointments in minutes",
        "type": "int",
    },
    "max_daily_appointments_per_doctor": {
        "column": "max_daily_appointments_per_doctor",
        "description": "Maximum daily appointments per doctor",
        "type": "int",
    },
    "allow_walk_in": {
        "column": "allow_walk_in",
        "description": "Whether walk-in appointments are allowed",
        "type": "bool",
    },
    "allow_emergency_bypass": {
        "column": "allow_emergency_bypass",
        "description": "Whether emergency appointments can bypass queue",
        "type": "bool",
    },
    "consultation_fee_default": {
        "column": "consultation_fee_default",
        "description": "Default consultation fee",
        "type": "str",
    },
    "follow_up_validity_days": {
        "column": "follow_up_validity_days",
        "description": "Days within which follow-up is free",
        "type": "int",
    },
}


def get_hospital_settings(db: Session, hospital_id: str | uuid.UUID) -> Optional[HospitalSettings]:
    """Get settings for a hospital."""
    if isinstance(hospital_id, str):
        hospital_id = uuid.UUID(hospital_id)

    return db.query(HospitalSettings).filter(
        HospitalSettings.hospital_id == hospital_id
    ).first()


def get_setting_value(
    db: Session,
    hospital_id: str | uuid.UUID,
    setting_key: str,
    default: str = ""
) -> str:
    """Get a specific setting value by key name."""
    settings = get_hospital_settings(db, hospital_id)
    if not settings:
        return default

    value = getattr(settings, setting_key, None)
    if value is None:
        return default
    return str(value)


def get_appointment_slot_duration(db: Session, hospital_id: uuid.UUID) -> int:
    """Get appointment slot duration in minutes."""
    settings = get_hospital_settings(db, hospital_id)
    return settings.appointment_slot_duration_minutes if settings else 15


def get_appointment_buffer_minutes(db: Session, hospital_id: uuid.UUID) -> int:
    """Get buffer time between appointments in minutes."""
    settings = get_hospital_settings(db, hospital_id)
    return settings.appointment_buffer_minutes if settings else 5


def is_walk_in_allowed(db: Session, hospital_id: uuid.UUID) -> bool:
    """Check if walk-in appointments are allowed."""
    settings = get_hospital_settings(db, hospital_id)
    return settings.allow_walk_in if settings else True


def update_hospital_settings(
    db: Session,
    hospital_id: str | uuid.UUID,
    data: dict,
) -> Optional[HospitalSettings]:
    """Update hospital settings."""
    if isinstance(hospital_id, str):
        hospital_id = uuid.UUID(hospital_id)

    settings = get_hospital_settings(db, hospital_id)
    if not settings:
        return None

    for key, value in data.items():
        if hasattr(settings, key) and value is not None:
            setattr(settings, key, value)

    db.commit()
    db.refresh(settings)
    return settings


def create_hospital_settings(
    db: Session,
    hospital_id: uuid.UUID,
    hospital_code: str,
    **kwargs,
) -> HospitalSettings:
    """Create settings for a new hospital."""
    settings = HospitalSettings(
        hospital_id=hospital_id,
        hospital_code=hospital_code,
        **kwargs,
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


# --- Functions used by appointment_settings router ---

def get_all_settings(db: Session, doctor_id=None) -> list[dict]:
    """Get all appointment-related settings as a list of key-value dicts."""
    # Get the first hospital's settings
    settings = db.query(HospitalSettings).first()
    if not settings:
        return []

    result = []
    for key, meta in APPOINTMENT_SETTING_KEYS.items():
        value = getattr(settings, meta["column"], None)
        result.append({
            "key": key,
            "value": str(value) if value is not None else "",
            "description": meta["description"],
            "updated_at": settings.updated_at,
        })
    return result


def update_setting(db: Session, key: str, value: str, user_id=None) -> Optional[dict]:
    """Update a single appointment setting by key."""
    if key not in APPOINTMENT_SETTING_KEYS:
        return None

    settings = db.query(HospitalSettings).first()
    if not settings:
        return None

    meta = APPOINTMENT_SETTING_KEYS[key]
    column = meta["column"]

    # Type conversion
    if meta["type"] == "int":
        try:
            typed_value = int(value)
        except ValueError:
            typed_value = value
    elif meta["type"] == "bool":
        typed_value = value.lower() in ("true", "1", "yes")
    else:
        typed_value = value

    setattr(settings, column, typed_value)
    db.commit()
    db.refresh(settings)

    return {
        "key": key,
        "value": str(getattr(settings, column)),
        "description": meta["description"],
        "updated_at": settings.updated_at,
    }