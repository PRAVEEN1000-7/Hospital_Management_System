"""
Invoice and InvoiceItem models — maps to invoices / invoice_items tables.
"""
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Numeric, Integer, Text, ForeignKey
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    invoice_number = Column(String(30), nullable=False, unique=True, index=True)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id"))
    invoice_type = Column(String(20), nullable=False)   # opd | pharmacy | optical | combined
    invoice_date = Column(Date, nullable=False)
    due_date = Column(Date)
    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    discount_amount = Column(Numeric(12, 2), default=0)
    discount_reason = Column(String(255))
    tax_amount = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    paid_amount = Column(Numeric(12, 2), default=0)
    balance_amount = Column(Numeric(12, 2), default=0)
    currency = Column(String(3), default="INR")
    status = Column(String(20), default="draft", index=True)
    notes = Column(Text)
    insurance_claim_id = Column(UUID(as_uuid=True), ForeignKey("insurance_claims.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_deleted = Column(Boolean, default=False)

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    patient = relationship("Patient", foreign_keys=[patient_id])
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan",
                         order_by="InvoiceItem.display_order")
    payments = relationship("Payment", back_populates="invoice")
    refunds = relationship("Refund", back_populates="invoice")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False)
    item_type = Column(String(20), nullable=False)   # consultation | medicine | optical_product | service | procedure
    reference_id = Column(UUID(as_uuid=True))         # FK to source table (optional)
    description = Column(String(255), nullable=False)
    quantity = Column(Numeric(10, 2), nullable=False, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False)
    discount_percent = Column(Numeric(5, 2), default=0)
    discount_amount = Column(Numeric(12, 2), default=0)
    tax_config_id = Column(UUID(as_uuid=True), ForeignKey("tax_configurations.id"))
    tax_rate = Column(Numeric(5, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    total_price = Column(Numeric(12, 2), nullable=False)
    display_order = Column(Integer, default=0)
    batch_number = Column(String(50))     # for medicine/pharmacy items
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    invoice = relationship("Invoice", back_populates="items")
    tax_config = relationship("TaxConfiguration", foreign_keys=[tax_config_id])
