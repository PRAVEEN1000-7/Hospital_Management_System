"""
Patient service — works with new hms_db UUID schema.
"""
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import or_
from math import ceil
from typing import Optional
from ..config import settings
from ..models.patient import Patient
from ..models.user import Hospital
from ..schemas.patient import PatientCreate, PatientUpdate, PaginatedPatientResponse, PatientListItem
from ..services.patient_id_service import generate_patient_id


def generate_prn(db: Session, hospital_id: uuid.UUID, gender: str = "Unknown") -> str:
    return generate_patient_id(db, hospital_id, gender)


def create_patient(
    db: Session, patient_data: PatientCreate, user_id: uuid.UUID, hospital_id: uuid.UUID
) -> Patient:
    prn = generate_prn(db, hospital_id, gender=patient_data.gender)
    db_patient = Patient(
        hospital_id=hospital_id,
        patient_reference_number=prn,
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
        emergency_contact_relation=patient_data.emergency_contact_relation,
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient


def get_patient_by_id(db: Session, patient_id: str | uuid.UUID) -> Optional[Patient]:
    if isinstance(patient_id, str):
        try:
            patient_id = uuid.UUID(patient_id)
        except ValueError:
            return None
    return db.query(Patient).filter(Patient.id == patient_id, Patient.is_deleted == False).first()


def get_patient_by_mobile(db: Session, phone_number: str) -> Optional[Patient]:
    return db.query(Patient).filter(Patient.phone_number == phone_number, Patient.is_deleted == False).first()


def get_patient_by_email(db: Session, email: str) -> Optional[Patient]:
    return db.query(Patient).filter(Patient.email == email, Patient.is_deleted == False).first()


def get_patient_by_prn(db: Session, prn: str) -> Optional[Patient]:
    return db.query(Patient).filter(Patient.patient_reference_number == prn, Patient.is_deleted == False).first()


def list_patients(
    db: Session, page: int = 1, limit: int = 10,
    search: Optional[str] = None,
    hospital_id: Optional[uuid.UUID] = None,
) -> PaginatedPatientResponse:
    query = db.query(Patient).filter(Patient.is_active == True, Patient.is_deleted == False)
    if hospital_id:
        query = query.filter(Patient.hospital_id == hospital_id)
    if search:
        search_filter = or_(
            Patient.first_name.ilike(f"%{search}%"),
            Patient.last_name.ilike(f"%{search}%"),
            Patient.phone_number.ilike(f"%{search}%"),
            Patient.email.ilike(f"%{search}%"),
            Patient.patient_reference_number.ilike(f"%{search}%"),
        )
        query = query.filter(search_filter)
    total = query.count()
    offset = (page - 1) * limit
    patients = query.order_by(Patient.created_at.desc()).offset(offset).limit(limit).all()
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
