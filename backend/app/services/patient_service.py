from sqlalchemy.orm import Session
from sqlalchemy import or_
from math import ceil
from typing import Optional
from ..config import settings
from ..models.patient import Patient, prn_sequence
from ..models.hospital import HospitalDetails
from ..schemas.patient import PatientCreate, PatientUpdate, PaginatedPatientResponse, PatientListItem


def get_hospital_prefix(db: Session) -> str:
    """
    Get hospital prefix from hospital name by taking first letter of each word.
    Examples:
    - "HMS Core" -> "HC"
    - "Apollo Hospital" -> "AH"
    - "Max Super Speciality Hospital" -> "MSSH"
    """
    hospital = db.query(HospitalDetails).first()
    if hospital and hospital.hospital_name:
        # Extract first letter of each word and convert to uppercase
        words = hospital.hospital_name.strip().split()
        prefix = ''.join(word[0].upper() for word in words if word)
        return prefix if prefix else 'HC'  # Default to HC if empty
    return 'HC'  # Default for "HMS Core"


def generate_prn(db: Session) -> str:
    """
    Generate a unique Patient Reference Number in format: [HOSPITAL_PREFIX][YEAR][NUMBER]
    Examples: HC2026000001, AH2026000042, MSSH2026000123
    """
    hospital_prefix = get_hospital_prefix(db)
    year = 2026  # Current year
    next_val = db.execute(prn_sequence.next_value()).scalar()
    return f"{hospital_prefix}{year}{next_val:06d}"


def create_patient(db: Session, patient_data: PatientCreate, user_id: int) -> Patient:
    """Create a new patient record with auto-generated PRN"""
    prn = generate_prn(db)
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
