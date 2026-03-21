"""
Pharmacy module models — medicines, inventory, sales, and purchase orders.
Note: Medicine model is defined in prescription.py to avoid duplication.
Supplier, PurchaseOrder, and PurchaseOrderItem are imported from inventory.py
"""
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Integer, Text,
    ForeignKey, UniqueConstraint, Numeric,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, synonym
from sqlalchemy.sql import func
from ..database import Base

# Import shared models from inventory
from .inventory import Supplier, PurchaseOrder, PurchaseOrderItem, StockAdjustment

__all__ = ["Supplier", "PurchaseOrder", "PurchaseOrderItem", "StockAdjustment", "MedicineBatch", "PharmacySale", "PharmacySaleItem"]


# ══════════════════════════════════════════════════
# MedicineBatch  (batch / lot tracking + expiry)
# ══════════════════════════════════════════════════
class MedicineBatch(Base):
    __tablename__ = "medicine_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    medicine_id = Column(UUID(as_uuid=True), ForeignKey("medicines.id"), nullable=False)
    batch_number = Column(String(50), nullable=False)
    # grn_id removed - goods_receipt_notes table not yet modeled
    mfg_date = Column("manufactured_date", Date)
    expiry_date = Column(Date, nullable=False)
    initial_quantity = Column(Integer, nullable=False, default=0)
    quantity = Column("current_quantity", Integer, nullable=False, default=0)
    purchase_price = Column(Numeric(12, 2))
    selling_price = Column(Numeric(12, 2))
    is_expired = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("medicine_id", "batch_number", name="uq_medicine_batch"),
    )

    # Compatibility aliases for response payloads.
    mrp = synonym("selling_price")

    medicine = relationship("Medicine", foreign_keys=[medicine_id])


# ──────────────────────────────────────────────────
# PharmacySale  (dispensing / billing)
# ──────────────────────────────────────────────────
class PharmacySale(Base):
    __tablename__ = "pharmacy_dispensing"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    invoice_number = Column("dispensing_number", String(30), nullable=False, index=True)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"))
    sale_type = Column(String(20), nullable=False, default="counter_sale")
    # invoice_id removed - invoices table not yet modeled
    status = Column(String(20), default="dispensed")
    subtotal = Column("total_amount", Numeric(12, 2), default=0)
    discount_amount = Column(Numeric(12, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    total_amount = Column("net_amount", Numeric(12, 2), default=0)
    created_by = Column("dispensed_by", UUID(as_uuid=True), ForeignKey("users.id"))
    sale_date = Column("dispensed_at", DateTime(timezone=True), server_default=func.now())
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # API compatibility defaults (not persisted in 01 schema tables).
    payment_method = "cash"
    payment_status = "paid"

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    patient = relationship("Patient", foreign_keys=[patient_id])


class PharmacySaleItem(Base):
    __tablename__ = "pharmacy_dispensing_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id = Column("dispensing_id", UUID(as_uuid=True), ForeignKey("pharmacy_dispensing.id"), nullable=False)
    prescription_item_id = Column(UUID(as_uuid=True), ForeignKey("prescription_items.id"))
    medicine_id = Column(UUID(as_uuid=True), ForeignKey("medicines.id"), nullable=False)
    batch_id = Column("medicine_batch_id", UUID(as_uuid=True), ForeignKey("medicine_batches.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    discount_percent = Column(Numeric(5, 2), default=0)
    tax_percent = Column("tax_amount", Numeric(12, 2), default=0)
    total_price = Column(Numeric(12, 2), nullable=False)
    substituted = Column(Boolean, default=False)
    medicine_name = Column("original_medicine_name", String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sale = relationship("PharmacySale", foreign_keys=[sale_id])
    medicine = relationship("Medicine", foreign_keys=[medicine_id])
    batch = relationship("MedicineBatch", foreign_keys=[batch_id])
