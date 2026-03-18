"""
Payment model — maps to payments table.
"""
import uuid
from sqlalchemy import Column, String, DateTime, Date, Time, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    payment_number = Column(String(30), nullable=False, unique=True, index=True)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), default="INR")
    payment_mode = Column(String(20), nullable=False)   # cash | card | upi | wallet | bank_transfer | online | cheque | insurance
    payment_reference = Column(String(100))
    payment_date = Column(Date, nullable=False)
    payment_time = Column(Time)
    status = Column(String(20), default="completed")   # pending | completed | failed | reversed
    received_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    invoice = relationship("Invoice", back_populates="payments")
    patient = relationship("Patient", foreign_keys=[patient_id])
    refunds = relationship("Refund", back_populates="payment")
