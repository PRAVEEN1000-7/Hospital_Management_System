"""
Schedules router – doctor schedule and blocked-period management.
"""
import logging
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
    BlockedPeriodCreate,
    BlockedPeriodResponse,
    AvailableSlotsResponse,
)
from ..services.schedule_service import (
    create_schedule,
    get_doctor_schedules,
    update_schedule,
    delete_schedule,
    create_blocked_period,
    get_blocked_periods,
    delete_blocked_period,
    get_available_slots,
    get_doctors_list,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/schedules", tags=["Doctor Schedules"])


# ── Doctors list ───────────────────────────────────────────────────────────

@router.get("/doctors")
async def list_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all active doctors (for dropdown selection)."""
    doctors = get_doctors_list(db)
    return [
        {"id": d.id, "full_name": d.full_name, "department": d.department, "employee_id": d.employee_id}
        for d in doctors
    ]


# ── Doctor Schedule CRUD ──────────────────────────────────────────────────

@router.post("/doctors/{doctor_id}", response_model=DoctorScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_doctor_schedule(
    doctor_id: int,
    data: DoctorScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a schedule row for a doctor."""
    # Only the doctor themselves or admin can manage schedules
    if current_user.id != doctor_id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")
    try:
        sched = create_schedule(db, doctor_id, data.model_dump())
        return sched
    except Exception as e:
        logger.error(f"Error creating schedule: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create schedule")


@router.get("/doctors/{doctor_id}", response_model=list[DoctorScheduleResponse])
async def get_schedules(
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return get_doctor_schedules(db, doctor_id)


@router.post("/doctors/{doctor_id}/bulk", response_model=list[DoctorScheduleResponse], status_code=status.HTTP_201_CREATED)
async def bulk_create_schedules(
    doctor_id: int,
    data: DoctorScheduleBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create multiple schedule entries at once."""
    if current_user.id != doctor_id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")
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
    schedule_id: int,
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
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not delete_schedule(db, schedule_id):
        raise HTTPException(status_code=404, detail="Schedule not found")


# ── Available Slots ────────────────────────────────────────────────────────

@router.get("/available-slots", response_model=AvailableSlotsResponse)
async def available_slots(
    doctor_id: int = Query(...),
    date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    slots = get_available_slots(db, doctor_id, date)
    return AvailableSlotsResponse(doctor_id=doctor_id, date=date, slots=slots)


# ── Blocked Periods ───────────────────────────────────────────────────────

@router.post("/block-period", response_model=BlockedPeriodResponse, status_code=status.HTTP_201_CREATED)
async def create_block(
    data: BlockedPeriodCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    bp = create_blocked_period(db, data.model_dump(), current_user.id)
    return bp


@router.get("/blocked-periods", response_model=list[BlockedPeriodResponse])
async def list_blocks(
    doctor_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return get_blocked_periods(db, doctor_id)


@router.delete("/blocked-periods/{period_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_block(
    period_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not delete_blocked_period(db, period_id):
        raise HTTPException(status_code=404, detail="Blocked period not found")
