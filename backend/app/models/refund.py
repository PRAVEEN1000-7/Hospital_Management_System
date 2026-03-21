"""
Refund model — maps to refunds table.
"""
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Refund(Base):
    __tablename__ = "refunds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    refund_number = Column(String(30), nullable=False, unique=True, index=True)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False)
    payment_id = Column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=False)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    reason_code = Column(String(50), nullable=False)   # service_not_provided | billing_error | patient_request | duplicate | other
    reason_detail = Column(Text)
    status = Column(String(20), default="pending")     # pending | approved | processed | rejected
    refund_mode = Column(String(20))
    refund_reference = Column(String(100))
    requested_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    processed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    invoice = relationship("Invoice", back_populates="refunds")
    payment = relationship("Payment", back_populates="refunds")
    patient = relationship("Patient", foreign_keys=[patient_id])
