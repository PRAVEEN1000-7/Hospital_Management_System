from sqlalchemy.orm import Session
from sqlalchemy import or_
from math import ceil
from typing import Optional
from ..config import settings
from ..models.patient import Patient
from ..models.hospital import HospitalDetails
from ..schemas.patient import PatientCreate, PatientUpdate, PaginatedPatientResponse, PatientListItem
from ..services.patient_id_service import generate_patient_id, validate_checksum, parse_patient_id


def generate_prn(db: Session, gender: str = "Unknown") -> str:
    """
    Generate a 12-digit Patient ID.
    Format: [HOSPITAL 2][GENDER 1][YY 2][MONTH 1][CHECK 1][SEQUENCE 5]
    Example: HCM262K00147
    """
    return generate_patient_id(db, gender)


def create_patient(db: Session, patient_data: PatientCreate, user_id: int) -> Patient:
    """Create a new patient record with auto-generated 12-digit Patient ID"""
    prn = generate_prn(db, gender=patient_data.gender)
    db_patient = Patient(
        prn=prn,
        **patient_data.model_dump(),
        created_by=user_id,
        updated_by=user_id
    )
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient


def get_patient_by_id(db: Session, patient_id: int) -> Optional[Patient]:
    """Get a patient by ID"""
    return db.query(Patient).filter(Patient.id == patient_id).first()


def get_patient_by_mobile(db: Session, mobile_number: str) -> Optional[Patient]:
    """Get a patient by mobile number"""
    return db.query(Patient).filter(Patient.mobile_number == mobile_number).first()


def get_patient_by_email(db: Session, email: str) -> Optional[Patient]:
    """Get a patient by email"""
    return db.query(Patient).filter(Patient.email == email).first()


def get_patient_by_prn(db: Session, prn: str) -> Optional[Patient]:
    """Get a patient by PRN"""
    return db.query(Patient).filter(Patient.prn == prn).first()


def list_patients(
    db: Session,
    page: int = 1,
    limit: int = settings.DEFAULT_PAGE_SIZE,
    search: Optional[str] = None
) -> PaginatedPatientResponse:
    """List patients with pagination and search"""
    query = db.query(Patient).filter(Patient.is_active == True)

    if search:
        search_filter = or_(
            Patient.first_name.ilike(f"%{search}%"),
            Patient.last_name.ilike(f"%{search}%"),
            Patient.mobile_number.ilike(f"%{search}%"),
            Patient.email.ilike(f"%{search}%"),
            Patient.prn.ilike(f"%{search}%"),
        )
        query = query.filter(search_filter)

    total = query.count()
    offset = (page - 1) * limit
    patients = query.order_by(Patient.created_at.desc()).offset(offset).limit(limit).all()
    total_pages = ceil(total / limit) if limit > 0 else 0

    return PaginatedPatientResponse(
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        data=[PatientListItem.model_validate(p) for p in patients]
    )


def update_patient(db: Session, patient_id: int, patient_data: PatientUpdate, user_id: int) -> Optional[Patient]:
    """Update a patient record"""
    db_patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not db_patient:
        return None

    for field, value in patient_data.model_dump(exclude_unset=True).items():
        setattr(db_patient, field, value)

    db_patient.updated_by = user_id
    db.commit()
    db.refresh(db_patient)
    return db_patient


def soft_delete_patient(db: Session, patient_id: int, user_id: int) -> Optional[Patient]:
    """Soft delete a patient"""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        return None

    patient.is_active = False
    patient.updated_by = user_id
    db.commit()
    return patient
