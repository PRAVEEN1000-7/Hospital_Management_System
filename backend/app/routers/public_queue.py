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
    """Today's active walk-in queue tokens for one doctor, explicitly scoped to hospital_id."""
    today = date.today()
    query = (
        db.query(AppointmentQueue)
        .join(Appointment, Appointment.id == AppointmentQueue.appointment_id)
        .filter(
            AppointmentQueue.queue_date == today,
            Appointment.appointment_date == today,
            Appointment.hospital_id == hospital_id,
            AppointmentQueue.status.in_(["waiting", "called", "being_served", "in_consultation"]),
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

    # Resolve active doctors in the queue dynamically (only doctors with active tokens today)
    today = date.today()
    active_doctor_ids = (
        db.query(AppointmentQueue.doctor_id)
        .join(Appointment, Appointment.id == AppointmentQueue.appointment_id)
        .filter(
            AppointmentQueue.queue_date == today,
            Appointment.appointment_date == today,
            Appointment.hospital_id == hospital.id,
            AppointmentQueue.doctor_id.isnot(None),
            AppointmentQueue.status.in_(["waiting", "called", "being_served", "in_consultation"]),
        )
        .distinct()
        .all()
    )
    active_doctor_ids = [d[0] for d in active_doctor_ids]

    columns: list[PublicQueueColumn] = []

    if active_doctor_ids:
        # Create a column for each active doctor
        for doc_id in active_doctor_ids:
            doc = db.query(Doctor).filter(Doctor.id == doc_id).first()
            doc_name = f"Dr. {doc.user.full_name}" if doc and doc.user else "Doctor"
            columns.append(
                PublicQueueColumn(
                    id=f"doctor_{doc_id}",
                    name=doc_name,
                    tokens=[PublicQueueToken(**t) for t in _doctor_walk_in_tokens(db, hospital.id, doc_id)],
                )
            )
    else:
        # Fallback to defaults when no active queue entries exist today
        columns.append(PublicQueueColumn(
            id="doctor1",
            name=_doctor_label(db, doctor1_id, "Doctor 1"),
            tokens=[PublicQueueToken(**t) for t in _doctor_walk_in_tokens(db, hospital.id, doctor1_id)] if doctor1_id else [],
        ))
        if show_doctor2:
            columns.append(PublicQueueColumn(
                id="doctor2",
                name=_doctor_label(db, doctor2_id, "Doctor 2"),
                tokens=[PublicQueueToken(**t) for t in _doctor_walk_in_tokens(db, hospital.id, doctor2_id)] if doctor2_id else [],
            ))

    if show_pharmacy:
        pharmacy_entries = billing_queue_service.list_pharmacy_queue_entries(db, hospital.id)
        # Filter for active tokens only (waiting, being_served, ready)
        active_pharmacy_tokens = [
            PublicQueueToken(token=e["queue_token"], status=e["status"]) 
            for e in pharmacy_entries 
            if e["status"] in ["waiting", "being_served", "ready"]
        ]
        columns.append(PublicQueueColumn(
            id="pharmacy",
            name="Pharmacy",
            tokens=active_pharmacy_tokens,
        ))

    if show_opthal:
        optical_entries = optical_service.list_optical_queue(db, hospital.id)
        # Filter for active tokens only (placed, fitting, ready)
        active_optical_tokens = [
            PublicQueueToken(token=e["queue_token"], status=e["queue_status"]) 
            for e in optical_entries 
            if e["queue_status"] in ["placed", "fitting", "ready"]
        ]
        columns.append(PublicQueueColumn(
            id="opthal",
            name="Opthal",
            tokens=active_optical_tokens,
        ))

    return PublicQueueDisplayResponse(
        hospital_name=hospital.name,
        logo_url=hospital.logo_url,
        refresh_seconds=refresh_seconds,
        columns=columns,
    )
