"""
Patient service — works with new hms_db UUID schema.
"""
import logging
import os
import shutil
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from math import ceil
from typing import Optional
from fastapi import UploadFile, HTTPException, status
from ..config import settings
from ..models.patient import Patient
from ..models.user import Hospital
from ..schemas.patient import PatientCreate, PatientUpdate, PaginatedPatientResponse, PatientListItem
from ..services.patient_id_service import generate_patient_id
from .user_service import (
    UPLOAD_DIR,
    ALLOWED_PHOTO_EXTENSIONS,
    MAX_PHOTO_SIZE_MB,
    ensure_upload_directory,
    _has_valid_photo_signature,
)

logger = logging.getLogger(__name__)


def generate_prn(db: Session, hospital_id: uuid.UUID, gender: str = "Unknown") -> str:
    return generate_patient_id(db, hospital_id, gender)


def create_patient(
    db: Session, patient_data: PatientCreate, user_id: uuid.UUID, hospital_id: uuid.UUID
) -> Patient:
    prn = generate_prn(db, hospital_id, gender=patient_data.gender)
    db_patient = Patient(
        hospital_id=hospital_id,
        patient_reference_number=prn,
        title=getattr(patient_data, 'title', None),
        first_name=patient_data.first_name,
        last_name=patient_data.last_name,
        date_of_birth=patient_data.date_of_birth,
        gender=patient_data.gender,
        blood_group=patient_data.blood_group,
        phone_country_code=patient_data.phone_country_code,
        phone_number=patient_data.phone_number,
        email=patient_data.email,
        address_line_1=patient_data.address_line_1,
        address_line_2=patient_data.address_line_2,
        city=patient_data.city,
        state_province=getattr(patient_data, 'state', None) or getattr(patient_data, 'state_province', None),
        postal_code=getattr(patient_data, 'pin_code', None) or getattr(patient_data, 'postal_code', None),
        country=patient_data.country,
        age_years=patient_data.age_years,
        age_months=patient_data.age_months,
        marital_status=patient_data.marital_status,
        emergency_contact_name=patient_data.emergency_contact_name,
        emergency_contact_phone=patient_data.emergency_contact_phone,
        emergency_contact_country_code=getattr(patient_data, 'emergency_contact_country_code', None) or '+91',
        emergency_contact_relation=patient_data.emergency_contact_relation,
        reason_for_visit=getattr(patient_data, 'reason_for_visit', None),
        symptoms=getattr(patient_data, 'symptoms', None),
        blood_sugar_value=getattr(patient_data, 'blood_sugar_value', None),
        blood_sugar_unit=getattr(patient_data, 'blood_sugar_unit', None),
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient


def get_patient_by_id(
    db: Session,
    patient_id: str | uuid.UUID,
    hospital_id: Optional[uuid.UUID] = None,
) -> Optional[Patient]:
    if isinstance(patient_id, str):
        try:
            patient_id = uuid.UUID(patient_id)
        except ValueError:
            return None
    q = db.query(Patient).filter(Patient.id == patient_id, Patient.is_deleted == False)
    if hospital_id is not None:
        q = q.filter(Patient.hospital_id == hospital_id)
    return q.first()


def get_patient_by_mobile(db: Session, phone_number: str, hospital_id=None) -> Optional[Patient]:
    """Find a patient by phone within a specific hospital (multi-tenant safe).

    hospital_id must always be provided in multi-tenant mode so the uniqueness
    check is scoped per-hospital. Omitting it would falsely block registrations
    across different hospitals that share the same phone number.
    """
    q = db.query(Patient).filter(
        Patient.phone_number == phone_number,
        Patient.is_deleted == False,
    )
    if hospital_id is not None:
        q = q.filter(Patient.hospital_id == hospital_id)
    return q.first()


def get_patient_by_email(db: Session, email: str, hospital_id=None) -> Optional[Patient]:
    """Find a patient by email within a specific hospital (multi-tenant safe).

    Case-insensitive, same rationale as get_patient_by_mobile — email is
    optional on a patient record, so callers must skip this check when blank.
    """
    q = db.query(Patient).filter(
        func.lower(Patient.email) == email.lower(),
        Patient.is_deleted == False,
    )
    if hospital_id is not None:
        q = q.filter(Patient.hospital_id == hospital_id)
    return q.first()


def get_patient_by_prn(db: Session, prn: str) -> Optional[Patient]:
    return db.query(Patient).filter(Patient.patient_reference_number == prn, Patient.is_deleted == False).first()


def list_patients(
    db: Session, page: int = 1, limit: int = 10,
    search: Optional[str] = None,
    hospital_id: Optional[uuid.UUID] = None,
    gender: Optional[str] = None,
    blood_group: Optional[str] = None,
    city: Optional[str] = None,
    status: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = 'desc',
) -> PaginatedPatientResponse:
    query = db.query(Patient).filter(Patient.is_active == True, Patient.is_deleted == False)
    if hospital_id:
        query = query.filter(Patient.hospital_id == hospital_id)
    if search:
        search = search.strip()
        # Full-name concat match (e.g. "Alex Johnson")
        full_name = func.concat(Patient.first_name, ' ', Patient.last_name)
        # Only include email in search when the term looks like an email (contains @)
        # This prevents domain-only searches like 'gmail' from matching unintended patients
        include_email = '@' in search
        base_conditions = [
            Patient.first_name.ilike(f"%{search}%"),
            Patient.last_name.ilike(f"%{search}%"),
            Patient.phone_number.ilike(f"%{search}%"),
            Patient.patient_reference_number.ilike(f"%{search}%"),
            full_name.ilike(f"%{search}%"),
        ]
        if include_email:
            base_conditions.append(Patient.email.ilike(f"%{search}%"))
        search_filter = or_(*base_conditions)
        # Multi-word: each word must match at least one field
        words = search.split()
        if len(words) > 1:
            per_word_filters = []
            for word in words:
                w = word.strip()
                if not w:
                    continue
                word_conditions = [
                    Patient.first_name.ilike(f"%{w}%"),
                    Patient.last_name.ilike(f"%{w}%"),
                    Patient.phone_number.ilike(f"%{w}%"),
                    Patient.patient_reference_number.ilike(f"%{w}%"),
                ]
                if '@' in w:
                    word_conditions.append(Patient.email.ilike(f"%{w}%"))
                per_word_filters.append(or_(*word_conditions))
            if per_word_filters:
                search_filter = or_(search_filter, and_(*per_word_filters))
        query = query.filter(search_filter)
    # Server-side filters (applied before pagination — fixes empty page bug)
    if gender:
        query = query.filter(Patient.gender.ilike(gender))
    if blood_group:
        query = query.filter(Patient.blood_group == blood_group)
    if city:
        query = query.filter(Patient.city.ilike(f"%{city}%"))
    if status:
        is_deleted = status == 'inactive'
        query = query.filter(Patient.is_deleted == is_deleted)
    total = query.count()
    offset = (page - 1) * limit
    # Build ORDER BY — only allow known safe column names to prevent injection
    _sortable = {
        'created_at': Patient.created_at,
        'updated_at': Patient.updated_at,
        'first_name': Patient.first_name,
        'patient_reference_number': Patient.patient_reference_number,
    }
    sort_col = _sortable.get(sort_by, Patient.created_at)
    order_clause = sort_col.asc() if sort_order == 'asc' else sort_col.desc()
    patients = query.order_by(order_clause).offset(offset).limit(limit).all()
    total_pages = ceil(total / limit) if limit > 0 else 0
    return PaginatedPatientResponse(
        total=total, page=page, limit=limit, total_pages=total_pages,
        data=[PatientListItem.model_validate(p) for p in patients],
    )


def update_patient(
    db: Session, patient_id: str | uuid.UUID, patient_data: PatientUpdate, user_id: uuid.UUID
) -> Optional[Patient]:
    db_patient = get_patient_by_id(db, patient_id)
    if not db_patient:
        return None
    for field, value in patient_data.model_dump(exclude_unset=True).items():
        if hasattr(db_patient, field):
            setattr(db_patient, field, value)
    db_patient.updated_by = user_id
    db.commit()
    db.refresh(db_patient)
    return db_patient


def soft_delete_patient(db: Session, patient_id: str | uuid.UUID, user_id: uuid.UUID) -> Optional[Patient]:
    patient = get_patient_by_id(db, patient_id)
    if not patient:
        return None
    patient.is_deleted = True
    patient.updated_by = user_id
    db.commit()
    return patient


def save_patient_photo(
    db: Session, patient_id: str | uuid.UUID, file: UploadFile, hospital_id: Optional[uuid.UUID] = None
) -> Patient:
    """Save a patient's profile photo — mirrors user_service.save_user_photo's
    validation (extension + magic-byte signature + size) and shares the same
    upload directory, distinguished by a "patient_" filename prefix.
    """
    ensure_upload_directory()

    file_ext = os.path.splitext(file.filename or "")[1].lower()
    if file_ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(sorted(ALLOWED_PHOTO_EXTENSIONS))}",
        )

    if file_ext == '.jpeg':
        file_ext = '.jpg'

    if not _has_valid_photo_signature(file, file_ext):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match its extension.",
        )

    file.file.seek(0, 2)
    file_size_bytes = file.file.tell()
    file.file.seek(0)

    file_size_mb = file_size_bytes / (1024 * 1024)
    if file_size_mb > MAX_PHOTO_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_PHOTO_SIZE_MB}MB",
        )

    patient = get_patient_by_id(db, patient_id, hospital_id=hospital_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    if patient.photo_url:
        old_photo_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), patient.photo_url.lstrip('/')
        )
        if os.path.exists(old_photo_path):
            try:
                os.remove(old_photo_path)
            except Exception:
                pass

    filename = f"patient_{patient.id}_{int(datetime.now().timestamp())}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error("Failed to write photo file for patient %s: %s", patient_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save photo. Please try again.",
        )

    patient.photo_url = f"/uploads/photos/{filename}"
    db.commit()
    db.refresh(patient)
    return patient
