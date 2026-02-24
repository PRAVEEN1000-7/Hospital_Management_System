"""
Walk-ins router – registration, queue management.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user
from ..schemas.appointment import (
    WalkInRegister,
    WalkInAssignDoctor,
    AppointmentResponse,
    QueueStatus,
)
from ..services.walk_in_service import (
    register_walk_in,
    get_queue_status,
    assign_doctor,
    get_today_walk_ins,
)
from ..services.appointment_service import enrich_appointment, enrich_appointments

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/walk-ins", tags=["Walk-ins"])


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: WalkInRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Register a walk-in patient."""
    try:
        appt = register_walk_in(
            db,
            patient_id=data.patient_id,
            doctor_id=data.doctor_id,
            reason=data.reason_for_visit,
            urgency=data.urgency_level,
            fees=float(data.fees) if data.fees else None,
            registered_by=current_user.id,
        )
        return enrich_appointment(db, appt)
    except Exception as e:
        logger.error(f"Error registering walk-in: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to register walk-in")


@router.get("/queue", response_model=QueueStatus)
async def queue(
    doctor_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return get_queue_status(db, doctor_id)


@router.post("/{appointment_id}/assign-doctor", response_model=AppointmentResponse)
async def assign(
    appointment_id: int,
    data: WalkInAssignDoctor,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    appt = assign_doctor(db, appointment_id, data.doctor_id, current_user.id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return enrich_appointment(db, appt)


@router.get("/today")
async def today_walk_ins(
    doctor_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    rows = get_today_walk_ins(db, doctor_id)
    return enrich_appointments(db, rows)
