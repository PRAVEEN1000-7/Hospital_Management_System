"""
Walk-in registration router - handles walk-in patient flow.
"""
import logging
import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, func
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..models.patient import Patient
from ..models.appointment import Appointment, AppointmentQueue, Doctor
from ..dependencies import get_current_active_user
from ..schemas.appointment import WalkInRegister, WalkInAssignDoctor
from ..services.appointment_service import (
    generate_appointment_number,
    enrich_appointment,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/walk-ins", tags=["Walk-in Registration"])


def _next_queue_number(db: Session, doctor_id: uuid.UUID, queue_date: date) -> int:
    """Get next queue number for a doctor on a given date."""
    max_num = (
        db.query(func.max(AppointmentQueue.queue_number))
        .filter(
            AppointmentQueue.doctor_id == doctor_id,
            AppointmentQueue.queue_date == queue_date,
        )
        .scalar()
    )
    return (max_num or 0) + 1


def _next_position(db: Session, doctor_id: uuid.UUID, queue_date: date) -> int:
    """Get next position in queue."""
    waiting = (
        db.query(func.count(AppointmentQueue.id))
        .filter(
            AppointmentQueue.doctor_id == doctor_id,
            AppointmentQueue.queue_date == queue_date,
            AppointmentQueue.status.in_(["waiting", "called"]),
        )
        .scalar()
    )
    return (waiting or 0) + 1


@router.post("", status_code=status.HTTP_201_CREATED)
async def register_walk_in(
    data: WalkInRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Register a walk-in patient: create appointment + add to queue."""
    logger.info(
        f"WALK-IN REGISTER: patient_id={data.patient_id!r}, "
        f"doctor_id={data.doctor_id!r}, priority={data.priority!r}"
    )

    try:
        today = date.today()
        now = datetime.now(timezone.utc)

        # Validate patient exists
        try:
            patient_id = uuid.UUID(data.patient_id)
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid patient_id format: {data.patient_id!r}",
            )
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        # Resolve doctor – treat empty string / "undefined" as None
        doctor_id = None
        raw_doctor = data.doctor_id
        if raw_doctor and raw_doctor.strip() and raw_doctor.strip().lower() != "undefined":
            try:
                doctor_id = uuid.UUID(raw_doctor.strip())
            except (ValueError, AttributeError):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid doctor_id format: {raw_doctor!r}",
                )
            doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
            if not doctor:
                raise HTTPException(status_code=404, detail="Doctor not found")

        # Create walk-in appointment
        appt_number = generate_appointment_number("walk_in")
        appt = Appointment(
            hospital_id=current_user.hospital_id,
            appointment_number=appt_number,
            patient_id=patient_id,
            doctor_id=doctor_id,
            appointment_date=today,
            start_time=None,
            end_time=None,
            appointment_type="walk-in",
            visit_type="new",
            priority=data.priority or "normal",
            status="scheduled",
            chief_complaint=data.chief_complaint,
            consultation_fee=data.consultation_fee,
            check_in_at=now,
            created_by=current_user.id,
        )
        db.add(appt)
        db.flush()

        # Add to queue if doctor assigned
        queue_entry = None
        if doctor_id:
            q_num = _next_queue_number(db, doctor_id, today)
            q_pos = _next_position(db, doctor_id, today)
            queue_entry = AppointmentQueue(
                appointment_id=appt.id,
                doctor_id=doctor_id,
                queue_date=today,
                queue_number=q_num,
                position=q_pos,
                status="waiting",
            )
            db.add(queue_entry)
            db.flush()

        db.commit()
        db.refresh(appt)

        enriched = enrich_appointment(db, appt)
        enriched["queue_number"] = queue_entry.queue_number if queue_entry else None
        enriched["queue_position"] = queue_entry.position if queue_entry else None
        return enriched

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Walk-in registration failed: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Walk-in registration failed: {str(e)}",
        )


@router.get("/queue")
async def get_queue_status(
    doctor_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get the current walk-in queue status."""
    today = date.today()

    query = db.query(AppointmentQueue).filter(
        AppointmentQueue.queue_date == today,
    )
    if doctor_id:
        doc_uuid = uuid.UUID(doctor_id)
        query = query.filter(AppointmentQueue.doctor_id == doc_uuid)

    queue_entries = query.order_by(AppointmentQueue.position.asc()).all()

    # Build items with patient names
    items = []
    for qe in queue_entries:
        appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
        patient_name = None
        if appt:
            patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
            if patient:
                patient_name = patient.full_name
        items.append({
            "queue_id": str(qe.id),
            "appointment_id": str(qe.appointment_id),
            "queue_number": qe.queue_number,
            "position": qe.position,
            "status": qe.status,
            "patient_name": patient_name,
            "called_at": qe.called_at.isoformat() if qe.called_at else None,
        })

    total_waiting = sum(1 for i in items if i["status"] == "waiting")
    current_pos = next(
        (i["position"] for i in items if i["status"] in ("waiting", "called")),
        0,
    )

    return {
        "doctor_id": doctor_id,
        "queue_date": today.isoformat(),
        "total_in_queue": total_waiting,
        "current_position": current_pos,
        "items": items,
    }


@router.post("/{appointment_id}/assign-doctor")
async def assign_doctor_to_walkin(
    appointment_id: str,
    data: WalkInAssignDoctor,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Assign or re-assign a doctor to a walk-in appointment."""
    appt_uuid = uuid.UUID(appointment_id)
    appt = db.query(Appointment).filter(Appointment.id == appt_uuid).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    doctor_uuid = uuid.UUID(data.doctor_id)
    doctor = db.query(Doctor).filter(Doctor.id == doctor_uuid).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    appt.doctor_id = doctor_uuid
    db.flush()

    today = date.today()
    # Remove old queue entry if reassigning
    db.query(AppointmentQueue).filter(
        AppointmentQueue.appointment_id == appt_uuid,
    ).delete()

    q_num = _next_queue_number(db, doctor_uuid, today)
    q_pos = _next_position(db, doctor_uuid, today)
    queue_entry = AppointmentQueue(
        appointment_id=appt.id,
        doctor_id=doctor_uuid,
        queue_date=today,
        queue_number=q_num,
        position=q_pos,
        status="waiting",
    )
    db.add(queue_entry)
    db.commit()
    db.refresh(appt)

    enriched = enrich_appointment(db, appt)
    enriched["queue_number"] = queue_entry.queue_number
    enriched["queue_position"] = queue_entry.position
    return enriched


@router.get("/today")
async def get_today_walkins(
    doctor_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List today's walk-in appointments."""
    today = date.today()
    query = db.query(Appointment).filter(
        Appointment.appointment_date == today,
        Appointment.appointment_type.in_(["walk-in", "walk_in"]),
        Appointment.is_deleted == False,
    )
    if doctor_id:
        doc_uuid = uuid.UUID(doctor_id)
        query = query.filter(Appointment.doctor_id == doc_uuid)

    appointments = query.order_by(Appointment.created_at.asc()).all()

    result = []
    for appt in appointments:
        enriched = enrich_appointment(db, appt)
        result.append(enriched)

    return result
