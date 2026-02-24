"""
Appointments router – CRUD, reschedule, cancel, status updates.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user
from ..schemas.appointment import (
    AppointmentCreate,
    AppointmentUpdate,
    AppointmentResponse,
    AppointmentListItem,
    PaginatedAppointmentResponse,
    AppointmentStatusUpdate,
    AppointmentReschedule,
)
from ..services.appointment_service import (
    create_appointment,
    get_appointment,
    list_appointments,
    update_appointment,
    update_status,
    cancel_appointment,
    reschedule_appointment,
    check_double_booking,
    enrich_appointment,
    enrich_appointments,
)
from ..services.schedule_service import is_date_blocked, get_available_slots

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/appointments", tags=["Appointments"])


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def book_appointment(
    data: AppointmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Book a new scheduled appointment."""
    try:
        # Validate: date not blocked
        if data.doctor_id and is_date_blocked(db, data.doctor_id, data.appointment_date):
            raise HTTPException(status_code=400, detail="Doctor is not available on this date")

        # Validate: slot available (for scheduled appointments)
        if data.appointment_type == "scheduled" and data.doctor_id and data.appointment_time:
            if check_double_booking(db, data.doctor_id, data.appointment_date, data.appointment_time):
                # Check max_patients_per_slot via available slots
                slots = get_available_slots(db, data.doctor_id, data.appointment_date)
                time_key = data.appointment_time.strftime("%H:%M")
                slot = next((s for s in slots if s["time"].strftime("%H:%M") == time_key), None)
                if not slot or not slot["available"]:
                    raise HTTPException(status_code=400, detail="Selected time slot is fully booked")

        appt = create_appointment(db, data.model_dump(), current_user.id)
        enriched = enrich_appointment(db, appt)
        return enriched
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error booking appointment: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to book appointment")


@router.get("", response_model=PaginatedAppointmentResponse)
async def list_all_appointments(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    doctor_id: Optional[int] = None,
    patient_id: Optional[int] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    appointment_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    total, pg, lim, tp, rows = list_appointments(
        db, page, limit, doctor_id, patient_id,
        status_filter, appointment_type, date_from, date_to, search,
    )
    enriched = enrich_appointments(db, rows)
    return PaginatedAppointmentResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[AppointmentListItem(**a) for a in enriched],
    )


@router.get("/my-appointments", response_model=PaginatedAppointmentResponse)
async def my_appointments(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Doctor: appointments assigned to me."""
    total, pg, lim, tp, rows = list_appointments(
        db, page, limit, doctor_id=current_user.id, status=status_filter,
    )
    enriched = enrich_appointments(db, rows)
    return PaginatedAppointmentResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[AppointmentListItem(**a) for a in enriched],
    )


@router.get("/doctor/{doctor_id}/today")
async def doctor_today(
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from datetime import date as d
    today = d.today()
    _, _, _, _, rows = list_appointments(
        db, 1, 100, doctor_id=doctor_id, date_from=today, date_to=today,
    )
    return enrich_appointments(db, rows)


@router.get("/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment_detail(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    appt = get_appointment(db, appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return enrich_appointment(db, appt)


@router.put("/{appointment_id}", response_model=AppointmentResponse)
async def update_appt(
    appointment_id: int,
    data: AppointmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    appt = update_appointment(db, appointment_id, data.model_dump(exclude_unset=True), current_user.id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return enrich_appointment(db, appt)


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_appt(
    appointment_id: int,
    reason: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    appt = cancel_appointment(db, appointment_id, current_user.id, reason)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")


@router.post("/{appointment_id}/reschedule", response_model=AppointmentResponse)
async def reschedule_appt(
    appointment_id: int,
    data: AppointmentReschedule,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    appt = reschedule_appointment(
        db, appointment_id, data.new_date, data.new_time, current_user.id, data.reason,
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return enrich_appointment(db, appt)


@router.patch("/{appointment_id}/status", response_model=AppointmentResponse)
async def change_status(
    appointment_id: int,
    data: AppointmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    appt = update_status(db, appointment_id, data.status, current_user.id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return enrich_appointment(db, appt)
