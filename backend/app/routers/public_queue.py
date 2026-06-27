"""
Public Queue Display — unauthenticated, scoped to one hospital by its public
`code`. Backs a kiosk screen (BRD v1.1 §3) that can run in its own browser/TV
without anyone being logged in.

Security notes:
- No auth dependency, so this is reachable by anyone with the URL — the
  response is deliberately limited to token numbers + status. Patient names,
  doctor names (beyond the configured column label), and any other PII are
  never included.
- Every query below is explicitly scoped by the resolved hospital_id. Do not
  reuse the authenticated /walk-ins/queue route's underlying query pattern
  here without that scoping — see the tenant-isolation fix in walk_ins.py.
- A hospital that isn't classified eye_hospital/multi_specialty 404s, same as
  a hospital code that doesn't exist — never reveal which.
"""
import logging
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import Hospital
from ..models.appointment import Doctor, Appointment, AppointmentQueue
from ..core.tenant_security import is_eye_hospital_feature_enabled
from ..services.settings_service import get_hospital_settings
from ..services import billing_queue_service, optical_service
from ..schemas.public_queue import PublicQueueDisplayResponse, PublicQueueColumn, PublicQueueToken

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/public", tags=["Public Queue Display"])


def _doctor_walk_in_tokens(db: Session, hospital_id: uuid.UUID, doctor_id: Optional[uuid.UUID]) -> list[dict]:
    """Today's walk-in queue tokens for one doctor, explicitly scoped to hospital_id."""
    today = date.today()
    query = (
        db.query(AppointmentQueue)
        .join(Appointment, Appointment.id == AppointmentQueue.appointment_id)
        .filter(
            AppointmentQueue.queue_date == today,
            Appointment.appointment_date == today,
            Appointment.hospital_id == hospital_id,
        )
    )
    if doctor_id:
        query = query.filter(AppointmentQueue.doctor_id == doctor_id)
    entries = query.order_by(AppointmentQueue.queue_number.asc()).all()
    return [{"token": e.queue_number, "status": e.status} for e in entries]


def _doctor_label(db: Session, doctor_id: Optional[uuid.UUID], fallback: str) -> str:
    if not doctor_id:
        return fallback
    doc = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    return f"Dr. {doc.user.full_name}" if doc and doc.user else fallback


@router.get("/queue-display/{hospital_code}", response_model=PublicQueueDisplayResponse)
async def get_public_queue_display(
    hospital_code: str,
    db: Session = Depends(get_db),
):
    hospital = (
        db.query(Hospital)
        .filter(Hospital.code == hospital_code.upper(), Hospital.is_active == True)
        .first()
    )
    if not hospital or not is_eye_hospital_feature_enabled(hospital):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue display not found")

    settings = get_hospital_settings(db, hospital.id)
    refresh_seconds = getattr(settings, "queue_display_refresh_seconds", None) or 10
    show_doctor2 = getattr(settings, "queue_display_show_doctor2", True) if settings else True
    show_pharmacy = getattr(settings, "queue_display_show_pharmacy", True) if settings else True
    show_opthal = getattr(settings, "queue_display_show_opthal", True) if settings else True
    doctor1_id = getattr(settings, "queue_display_doctor1_id", None) if settings else None
    doctor2_id = getattr(settings, "queue_display_doctor2_id", None) if settings else None

    columns: list[PublicQueueColumn] = [
        PublicQueueColumn(
            id="doctor1",
            name=_doctor_label(db, doctor1_id, "Doctor 1"),
            tokens=[PublicQueueToken(**t) for t in _doctor_walk_in_tokens(db, hospital.id, doctor1_id)],
        )
    ]

    if show_doctor2:
        columns.append(PublicQueueColumn(
            id="doctor2",
            name=_doctor_label(db, doctor2_id, "Doctor 2"),
            tokens=[PublicQueueToken(**t) for t in _doctor_walk_in_tokens(db, hospital.id, doctor2_id)] if doctor2_id else [],
        ))

    if show_pharmacy:
        pharmacy_entries = billing_queue_service.list_pharmacy_queue_entries(db, hospital.id)
        columns.append(PublicQueueColumn(
            id="pharmacy",
            name="Pharmacy",
            tokens=[PublicQueueToken(token=e["queue_token"], status=e["status"]) for e in pharmacy_entries],
        ))

    if show_opthal:
        optical_entries = optical_service.list_optical_queue(db, hospital.id)
        columns.append(PublicQueueColumn(
            id="opthal",
            name="Opthal",
            tokens=[PublicQueueToken(token=e["queue_token"], status=e["queue_status"]) for e in optical_entries],
        ))

    return PublicQueueDisplayResponse(
        hospital_name=hospital.name,
        refresh_seconds=refresh_seconds,
        columns=columns,
    )
