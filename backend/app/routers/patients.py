import logging
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
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
from ..models.patient import Patient, prn_sequence
from ..models.user import User
from ..dependencies import get_current_active_user
from ..config import settings
from ..services.patient_service import generate_prn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/patients", tags=["Patients"])


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_patient(
    patient: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new patient with auto-generated PRN"""
    try:
        # Check if mobile number already exists (including soft-deleted)
        existing_patient = db.query(Patient).filter(
            Patient.mobile_number == patient.mobile_number
        ).first()

        if existing_patient:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A patient with this mobile number already exists",
            )

        # Check if email already exists (if provided)
        if patient.email:
            existing_email = db.query(Patient).filter(
                Patient.email == patient.email
            ).first()

            if existing_email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A patient with this email already exists",
                )

        # Generate PRN
        prn = generate_prn(db)

        # Create patient
        db_patient = Patient(
            prn=prn,
            **patient.model_dump(),
            created_by=current_user.id,
            updated_by=current_user.id,
        )

        db.add(db_patient)
        db.commit()
        db.refresh(db_patient)

        return db_patient
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
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get patient by ID"""
    patient = db.query(Patient).filter(
        Patient.id == patient_id,
        Patient.is_active == True,
    ).first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )

    return patient


@router.get("", response_model=PaginatedPatientResponse)
async def list_patients(
    page: int = Query(1, ge=1),
    limit: int = Query(default=settings.DEFAULT_PAGE_SIZE, ge=1, le=settings.MAX_PAGE_SIZE),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all patients with pagination and search"""
    try:
        query = db.query(Patient).filter(Patient.is_active == True)

        # Apply search filter
        if search:
            search_term = search.strip()
            if search_term:
                search_filter = or_(
                    Patient.first_name.ilike(f"%{search_term}%"),
                    Patient.last_name.ilike(f"%{search_term}%"),
                    Patient.mobile_number.ilike(f"%{search_term}%"),
                    Patient.email.ilike(f"%{search_term}%"),
                    Patient.prn.ilike(f"%{search_term}%"),
                )
                query = query.filter(search_filter)

        # Get total count
        total = query.count()

        # Apply pagination
        offset = (page - 1) * limit
        patients = query.order_by(Patient.created_at.desc()).offset(offset).limit(limit).all()

        # Calculate total pages
        total_pages = ceil(total / limit) if total > 0 else 0

        return PaginatedPatientResponse(
            total=total,
            page=page,
            limit=limit,
            total_pages=total_pages,
            data=[PatientListItem.model_validate(p) for p in patients],
        )
    except Exception as e:
        logger.error(f"Error listing patients: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve patients.",
        )


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: int,
    patient_update: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update patient information"""
    try:
        db_patient = db.query(Patient).filter(
            Patient.id == patient_id,
            Patient.is_active == True,
        ).first()

        if not db_patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        # Check mobile number uniqueness (if changed)
        if patient_update.mobile_number != db_patient.mobile_number:
            existing = db.query(Patient).filter(
                Patient.mobile_number == patient_update.mobile_number,
                Patient.id != patient_id,
            ).first()

            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Mobile number already exists",
                )

        # Check email uniqueness (if changed and provided)
        if patient_update.email and patient_update.email != db_patient.email:
            existing_email = db.query(Patient).filter(
                Patient.email == patient_update.email,
                Patient.id != patient_id,
            ).first()

            if existing_email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already exists",
                )

        # Update fields
        for field, value in patient_update.model_dump(exclude_unset=True).items():
            setattr(db_patient, field, value)

        db_patient.updated_by = current_user.id

        db.commit()
        db.refresh(db_patient)

        return db_patient
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
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Soft delete a patient"""
    try:
        patient = db.query(Patient).filter(
            Patient.id == patient_id,
            Patient.is_active == True,
        ).first()

        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        # Soft delete
        patient.is_active = False
        patient.updated_by = current_user.id

        db.commit()

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


@router.post("/{patient_id}/email-id-card")
async def email_patient_id_card(
    patient_id: int,
    pdf_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Email the patient's ID card to their email address.
    Optionally accepts a pre-rendered PDF file from the frontend."""
    try:
        patient = db.query(Patient).filter(
            Patient.id == patient_id,
            Patient.is_active == True,
        ).first()

        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        if not patient.email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Patient does not have an email address",
            )

        from ..services.email_service import send_patient_id_card_email

        full_name = f"{patient.title} {patient.first_name} {patient.last_name}"

        # Use the frontend-generated PDF if provided, otherwise fall back to server generation
        pdf_bytes = None
        if pdf_file:
            pdf_bytes = await pdf_file.read()

        try:
            send_patient_id_card_email(
                to_email=patient.email,
                patient_name=full_name,
                patient=patient,
                pdf_bytes=pdf_bytes,
            )
        except RuntimeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

        return {"message": f"ID card sent to {patient.email}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error emailing ID card for patient {patient_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send ID card email.",
        )


@router.post("/{patient_id}/photo", response_model=PatientResponse)
async def upload_patient_photo(
    patient_id: int,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Upload a photo for a patient"""
    try:
        patient = db.query(Patient).filter(
            Patient.id == patient_id,
            Patient.is_active == True,
        ).first()

        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        # Validate file type
        allowed_types = ["image/jpeg", "image/png", "image/jpg", "image/webp"]
        if photo.content_type not in allowed_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type. Allowed: JPEG, PNG, WebP",
            )

        # Validate file size
        contents = await photo.read()
        max_size = settings.MAX_PHOTO_SIZE_MB * 1024 * 1024
        if len(contents) > max_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large. Maximum size: {settings.MAX_PHOTO_SIZE_MB}MB",
            )

        # Delete old photo if exists
        if patient.photo_url:
            old_path = os.path.join(settings.UPLOAD_DIR, patient.photo_url.lstrip("/uploads/"))
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except OSError:
                    pass

        # Save file
        ext = os.path.splitext(photo.filename or "photo.jpg")[1] or ".jpg"
        filename = f"{patient.prn}_{uuid.uuid4().hex[:8]}{ext}"
        photo_dir = os.path.join(settings.UPLOAD_DIR, "photos")
        os.makedirs(photo_dir, exist_ok=True)
        file_path = os.path.join(photo_dir, filename)

        with open(file_path, "wb") as f:
            f.write(contents)

        # Update patient record
        patient.photo_url = f"/uploads/photos/{filename}"
        db.commit()
        db.refresh(patient)

        return PatientResponse.model_validate(patient)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading photo for patient {patient_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload photo.",
        )
