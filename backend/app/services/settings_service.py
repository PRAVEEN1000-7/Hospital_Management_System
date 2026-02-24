"""
Settings service – read / write appointment_settings rows.
"""
import logging
from sqlalchemy.orm import Session

from ..models.appointment import AppointmentSetting

logger = logging.getLogger(__name__)


def get_all_settings(db: Session, doctor_id: int | None = None):
    q = db.query(AppointmentSetting)
    if doctor_id:
        q = q.filter(
            (AppointmentSetting.is_global == True)
            | (AppointmentSetting.doctor_id == doctor_id)
        )
    else:
        q = q.filter(AppointmentSetting.is_global == True)
    return q.order_by(AppointmentSetting.setting_key).all()


def get_setting_value(db: Session, key: str, default: str = "") -> str:
    row = (
        db.query(AppointmentSetting)
        .filter(AppointmentSetting.setting_key == key)
        .first()
    )
    return row.setting_value if row else default


def update_setting(
    db: Session, key: str, value: str, updated_by: int,
) -> AppointmentSetting | None:
    row = (
        db.query(AppointmentSetting)
        .filter(AppointmentSetting.setting_key == key)
        .first()
    )
    if not row:
        return None
    row.setting_value = value
    row.updated_by = updated_by
    db.commit()
    db.refresh(row)
    return row
