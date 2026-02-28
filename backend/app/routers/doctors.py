"""
Doctors router — CRUD for doctor profiles.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.doctor import (
    DoctorCreate,
    DoctorUpdate,
    DoctorResponse,
    DoctorListResponse,
)
from ..services.doctor_service import (
    list_doctors,
    get_doctor_by_id,
    create_doctor,
    update_doctor,
    delete_doctor,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/doctors", tags=["Doctors"])


@router.get("", response_model=DoctorListResponse)
async def get_doctors(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all doctors for the current hospital."""
    result = list_doctors(db, current_user.hospital_id, page, limit, search, active_only)
    doctors = result["data"]
    enriched = []
    for d in doctors:
        resp = DoctorResponse.model_validate(d)
        if d.user:
            resp.doctor_name = f"{d.user.first_name} {d.user.last_name}"
        enriched.append(resp)
    return DoctorListResponse(
        total=result["total"],
        page=result["page"],
        limit=result["limit"],
        total_pages=result["total_pages"],
        data=enriched,
    )


@router.get("/{doctor_id}", response_model=DoctorResponse)
async def get_doctor(
    doctor_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doctor = get_doctor_by_id(db, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    resp = DoctorResponse.model_validate(doctor)
    if doctor.user:
        resp.doctor_name = f"{doctor.user.first_name} {doctor.user.last_name}"
    return resp


@router.post("", response_model=DoctorResponse, status_code=status.HTTP_201_CREATED)
async def create_new_doctor(
    data: DoctorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Create a doctor profile (admin only)."""
    try:
        doctor = create_doctor(
            db, current_user.hospital_id, data.model_dump(), current_user.id
        )
        resp = DoctorResponse.model_validate(doctor)
        return resp
    except Exception as e:
        logger.error(f"Error creating doctor: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create doctor profile")


@router.put("/{doctor_id}", response_model=DoctorResponse)
async def update_existing_doctor(
    doctor_id: str,
    data: DoctorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Update a doctor profile (admin only)."""
    try:
        doctor = update_doctor(db, doctor_id, data.model_dump(exclude_unset=True))
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        return DoctorResponse.model_validate(doctor)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating doctor: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update doctor")


@router.delete("/{doctor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_doctor(
    doctor_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Soft-delete a doctor profile (admin only)."""
    if not delete_doctor(db, doctor_id):
        raise HTTPException(status_code=404, detail="Doctor not found")
