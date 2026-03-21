"""
Patients router — works with new hms_db UUID schema.
"""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from math import ceil
from ..database import get_db
from ..schemas.patient import (
    PatientCreate,
    PatientUpdate,
    PatientResponse,
    PatientListItem,
    PaginatedPatientResponse,
)
from ..models.patient import Patient
from ..models.user import User
from ..dependencies import get_current_active_user, require_any_role
from ..services.patient_service import (
    create_patient,
    get_patient_by_id,
    get_patient_by_mobile,
    update_patient,
    soft_delete_patient,
    list_patients as list_patients_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/patients", tags=["Patients"])

# Role guards aligned with project access policy.
patient_create_role_guard = require_any_role("super_admin", "admin", "receptionist")
patient_read_role_guard = require_any_role("super_admin", "admin", "receptionist", "doctor", "nurse", "pharmacist")
patient_update_role_guard = require_any_role("super_admin", "admin", "receptionist")
patient_delete_role_guard = require_any_role("super_admin", "admin")


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_new_patient(
    patient: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_create_role_guard),
):
    """Create a new patient with auto-generated PRN"""
    try:
        # Check if phone number already exists
        existing_patient = get_patient_by_mobile(db, patient.phone_number)
        if existing_patient:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A patient with this phone number already exists",
            )

        db_patient = create_patient(
            db,
            patient,
            user_id=current_user.id,
            hospital_id=current_user.hospital_id,
        )
        logger.info("Patient registered: %s (PRN=%s) by user %s",
                    f"{patient.first_name} {patient.last_name}",
                    db_patient.patient_reference_number, current_user.username)
        return PatientResponse.model_validate(db_patient)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating patient: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create patient. Please try again.",
        )


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_read_role_guard),
):
    """Get patient by ID"""
    patient = get_patient_by_id(db, patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    return PatientResponse.model_validate(patient)


@router.get("", response_model=PaginatedPatientResponse)
async def list_patients(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    gender: Optional[str] = None,
    blood_group: Optional[str] = None,
    city: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    sort_by: Optional[str] = None,
    sort_order: str = Query('desc', pattern='^(asc|desc)$'),
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_read_role_guard),
):
    """List all patients with pagination, search, filters and sorting"""
    try:
        result = list_patients_service(
            db, page, limit, search,
            hospital_id=current_user.hospital_id,
            gender=gender,
            blood_group=blood_group,
            city=city,
            status=status_filter,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        return result
    except Exception as e:
        logger.error(f"Error listing patients: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve patients.",
        )


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_existing_patient(
    patient_id: str,
    patient_data: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_update_role_guard),
):
    """Update patient information"""
    try:
        db_patient = get_patient_by_id(db, patient_id)
        if not db_patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        # Check phone number uniqueness (if changed)
        if patient_data.phone_number != db_patient.phone_number:
            existing = get_patient_by_mobile(db, patient_data.phone_number)
            if existing and str(existing.id) != patient_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Phone number already exists",
                )

        updated = update_patient(db, patient_id, patient_data, current_user.id)
        return PatientResponse.model_validate(updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating patient {patient_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update patient.",
        )


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_delete_role_guard),
):
    """Soft delete a patient"""
    try:
        patient = get_patient_by_id(db, patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        soft_delete_patient(db, patient_id, current_user.id)
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting patient {patient_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete patient.",
        )

