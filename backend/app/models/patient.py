"""
Patient model — matches new hms_db UUID schema.
"""
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Integer, Text, ForeignKey, UniqueConstraint, Numeric
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    patient_reference_number = Column(String(12), nullable=False, index=True)
    title = Column(String(10))
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    date_of_birth = Column(Date)
    age_years = Column(Integer)
    age_months = Column(Integer)
    gender = Column(String(20), nullable=False)
    blood_group = Column(String(5))
    marital_status = Column(String(20))
    phone_country_code = Column(String(5), nullable=False, default="+1")
    phone_number = Column(String(15), nullable=False)
    secondary_phone = Column(String(20))
    email = Column(String(255))
    national_id_type = Column(String(30))
    national_id_number = Column(String(50))
    address_line_1 = Column(String(255))
    address_line_2 = Column(String(255))
    city = Column(String(100))
    state_province = Column(String(100))
    postal_code = Column(String(20))
    country = Column(String(100), default="India")
    photo_url = Column(String(500))
    emergency_contact_name = Column(String(200))
    emergency_contact_phone = Column(String(20))
    emergency_contact_country_code = Column(String(5), default="+91")
    emergency_contact_relation = Column(String(50))
    known_allergies = Column(Text)
    chronic_conditions = Column(Text)
    notes = Column(Text)
    # Patient History Block fields (BRD v1.1)
    reason_for_visit = Column(Text)
    symptoms = Column(JSONB)  # Array of symptom strings (multi-select + custom entries)
    blood_sugar_value = Column(Numeric(10, 2))
    blood_sugar_unit = Column(String(10))  # 'mg/dL' or 'mmol/L'
    preferred_language = Column(String(10), default="en")
    # Verification (BRD_OP_1 §3.2) — checkmark requires BOTH true, see
    # schemas.patient.PatientListItem.is_verified. Phone/OTP is scaffolded
    # (columns only) but never set True until a future SMS-integration pass.
    is_email_verified = Column(Boolean, default=False)
    email_verified_at = Column(DateTime(timezone=True))
    is_phone_verified = Column(Boolean, default=False)
    phone_verified_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime(timezone=True))

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id])

    __table_args__ = (
        UniqueConstraint("hospital_id", "patient_reference_number", name="uq_patient_prn_hospital"),
    )

    @property
    def full_name(self) -> str:
        parts = []
        if self.title:
            parts.append(self.title)
        parts.append(self.first_name)
        parts.append(self.last_name)
        return " ".join(parts)


# Single-use hashed email verification token, mirroring
# backend/app/models/user.py::PasswordResetToken. Phone/OTP has no
# equivalent table yet — that flow is out of scope until an SMS provider
# is integrated (see BRD_OP_1_Development_Plan.md Phase 3d).
class PatientEmailVerificationToken(Base):
    __tablename__ = "patient_email_verification_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False)
    code_hash = Column(String(64))
    attempts_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=5)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient")

