"""
Schedules router - doctor schedule and leave management.
"""
import logging
import uuid as uuid_mod
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.appointment import (
    DoctorScheduleCreate,
    DoctorScheduleUpdate,
    DoctorScheduleResponse,
    DoctorScheduleBulkCreate,
    DoctorLeaveCreate,
    DoctorLeaveResponse,
    AvailableSlotsResponse,
)
from ..services.schedule_service import (
    create_schedule,
    get_doctor_schedules,
    update_schedule,
    delete_schedule,
    create_doctor_leave,
    get_doctor_leaves,
    delete_doctor_leave,
    get_available_slots,
    get_doctors_list,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/schedules", tags=["Doctor Schedules"])


def _has_admin_role(user: User) -> bool:
    """Check if user has admin or super_admin role."""
    return any(r in ("admin", "super_admin") for r in user.roles)


# -- Doctors list ---------------------------------------------------------------

@router.get("/doctors")
async def list_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all active doctors (for dropdown selection)."""
    doctors = get_doctors_list(db)
    result = []
    for d in doctors:
        doctor_name = None
        if d.user:
            doctor_name = f"{d.user.first_name} {d.user.last_name}".strip()
        result.append({
            "doctor_id": str(d.id),
            "user_id": str(d.user_id),
            "name": doctor_name or "Unknown",
            "specialization": d.specialization,
            "department_id": str(d.department_id) if d.department_id else None,
            "consultation_fee": float(d.consultation_fee) if d.consultation_fee else None,
            "employee_id": d.employee_id,
        })
    return result


# -- Doctor Schedule CRUD -------------------------------------------------------

@router.post("/doctors/{doctor_id}", response_model=DoctorScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_doctor_schedule(
    doctor_id: str,
    data: DoctorScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a schedule row for a doctor."""
    if not _has_admin_role(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        sched = create_schedule(db, doctor_id, data.model_dump())
        return sched
    except Exception as e:
        logger.error(f"Error creating schedule: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create schedule")


@router.get("/doctors/{doctor_id}", response_model=list[DoctorScheduleResponse])
async def get_schedules(
    doctor_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return get_doctor_schedules(db, doctor_id)


@router.post("/doctors/{doctor_id}/bulk", response_model=list[DoctorScheduleResponse], status_code=status.HTTP_201_CREATED)
async def bulk_create_schedules(
    doctor_id: str,
    data: DoctorScheduleBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create multiple schedule entries at once."""
    if not _has_admin_role(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        results = []
        for s in data.schedules:
            sched = create_schedule(db, doctor_id, s.model_dump())
            results.append(sched)
        return results
    except Exception as e:
        logger.error(f"Error bulk creating schedules: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create schedules")


@router.put("/{schedule_id}", response_model=DoctorScheduleResponse)
async def update_doctor_schedule(
    schedule_id: str,
    data: DoctorScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    sched = update_schedule(db, schedule_id, data.model_dump(exclude_unset=True))
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return sched


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_doctor_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not delete_schedule(db, schedule_id):
        raise HTTPException(status_code=404, detail="Schedule not found")


# -- Available Slots -----------------------------------------------------------

@router.get("/available-slots", response_model=AvailableSlotsResponse)
async def available_slots(
    doctor_id: str = Query(...),
    date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    slots = get_available_slots(db, doctor_id, date)
    return AvailableSlotsResponse(doctor_id=doctor_id, date=date, slots=slots)


# -- Doctor Leaves (replaces Blocked Periods) ----------------------------------

@router.post("/doctor-leaves", response_model=DoctorLeaveResponse, status_code=status.HTTP_201_CREATED)
async def create_leave(
    data: DoctorLeaveCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    leave = create_doctor_leave(db, data.model_dump(), current_user.id)
    return leave


@router.get("/doctor-leaves", response_model=list[DoctorLeaveResponse])
async def list_leaves(
    doctor_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return get_doctor_leaves(db, doctor_id)


@router.delete("/doctor-leaves/{leave_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_leave(
    leave_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not delete_doctor_leave(db, leave_id):
        raise HTTPException(status_code=404, detail="Doctor leave not found")