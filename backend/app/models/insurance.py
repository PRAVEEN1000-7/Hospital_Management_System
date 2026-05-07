"""
Insurance models (stub) — maps to insurance_providers, insurance_policies,
insurance_claims, pre_authorizations tables.

These are future-scope models. The tables are already defined in 01_schema.sql.
The models are registered here so SQLAlchemy is aware of them (required for FK resolution)
and so the insurance API stubs can be built upon in a future sprint.
"""
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Date, Numeric, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class InsuranceProvider(Base):
    __tablename__ = "insurance_providers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(200), nullable=False)
    code = Column(String(20), nullable=False)
    contact_person = Column(String(100))
    phone = Column(String(20))
    email = Column(String(255))
    address = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class InsurancePolicy(Base):
    __tablename__ = "insurance_policies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    provider_id = Column(UUID(as_uuid=True), ForeignKey("insurance_providers.id"), nullable=False)
    policy_number = Column(String(50), nullable=False)
    group_number = Column(String(50))
    member_id = Column(String(50))
    plan_name = Column(String(100))
    coverage_type = Column(String(30))
    coverage_amount = Column(Numeric(12, 2))
    deductible = Column(Numeric(12, 2))
    copay_percent = Column(Numeric(5, 2))
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date)
    is_primary = Column(Boolean, default=True)
    status = Column(String(20), default="active")   # active | expired | suspended
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    provider = relationship("InsuranceProvider", foreign_keys=[provider_id])


class InsuranceClaim(Base):
    __tablename__ = "insurance_claims"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    claim_number = Column(String(30), nullable=False, unique=True)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    policy_id = Column(UUID(as_uuid=True), ForeignKey("insurance_policies.id"), nullable=False)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"))
    claim_amount = Column(Numeric(12, 2), nullable=False)
    approved_amount = Column(Numeric(12, 2))
    status = Column(String(20), default="submitted")
    submission_date = Column(Date)
    response_date = Column(Date)
    rejection_reason = Column(Text)
    notes = Column(Text)
    documents = Column(JSONB)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PreAuthorization(Base):
    __tablename__ = "pre_authorizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    policy_id = Column(UUID(as_uuid=True), ForeignKey("insurance_policies.id"), nullable=False)
    service_description = Column(Text, nullable=False)
    estimated_cost = Column(Numeric(12, 2), nullable=False)
    status = Column(String(20), default="requested")  # requested | approved | denied | expired
    auth_number = Column(String(50))
    approved_amount = Column(Numeric(12, 2))
    valid_from = Column(Date)
    valid_to = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CreditNote(Base):
    __tablename__ = "credit_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    credit_note_number = Column(String(30), nullable=False, unique=True)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(20), default="issued")   # issued | applied | expired
    applied_to_invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"))
    valid_until = Column(Date)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
