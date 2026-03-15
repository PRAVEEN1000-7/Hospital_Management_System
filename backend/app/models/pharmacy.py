"""
Pharmacy module models — medicines, inventory, sales, and purchase orders.
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


# ──────────────────────────────────────────────────
# Medicine  (master catalogue)
# ──────────────────────────────────────────────────
class Medicine(Base):
    __tablename__ = "medicines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(200), nullable=False)
    generic_name = Column(String(200), nullable=False)
    category = Column(String(50))
    manufacturer = Column(String(200))
    composition = Column(Text)
    strength = Column(String(50))
    unit = Column("unit_of_measure", String(20), nullable=False, default="Nos")
    units_per_pack = Column(Integer, default=1)
    hsn_code = Column(String(20))
    sku = Column(String(50))
    barcode = Column(String(50))
    requires_prescription = Column(Boolean, default=True)
    is_controlled = Column(Boolean, default=False)
    selling_price = Column(Numeric(12, 2), nullable=False, default=0)
    purchase_price = Column(Numeric(12, 2))
    tax_config_id = Column(UUID(as_uuid=True), nullable=True)
    reorder_level = Column(Integer, default=10)
    max_stock_level = Column(Integer)
    storage_instructions = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # API compatibility aliases for legacy DTOs.
    brand = synonym("composition")
    dosage_form = synonym("unit")
    description = synonym("composition")
    storage_conditions = synonym("storage_instructions")

    hospital = relationship("Hospital", foreign_keys=[hospital_id])


# ──────────────────────────────────────────────────
# MedicineBatch  (batch / lot tracking + expiry)
# ──────────────────────────────────────────────────
class MedicineBatch(Base):
    __tablename__ = "medicine_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    medicine_id = Column(UUID(as_uuid=True), ForeignKey("medicines.id"), nullable=False)
    batch_number = Column(String(50), nullable=False)
    grn_id = Column(UUID(as_uuid=True), ForeignKey("goods_receipt_notes.id"))
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
# Supplier
# ──────────────────────────────────────────────────
class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(200), nullable=False)
    code = Column(String(20), nullable=False)
    contact_person = Column(String(100))
    phone = Column(String(20))
    email = Column(String(255))
    address = Column(Text)
    tax_id = Column(String(50))
    payment_terms = Column(String(50))
    lead_time_days = Column(Integer)
    rating = Column(Numeric(3, 1))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Compatibility aliases for API fields.
    gst_number = synonym("tax_id")
    drug_license_number = synonym("tax_id")

    hospital = relationship("Hospital", foreign_keys=[hospital_id])


# ──────────────────────────────────────────────────
# PurchaseOrder  (stock-in from suppliers)
# ──────────────────────────────────────────────────
class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False)
    order_number = Column("po_number", String(30), nullable=False, index=True)
    order_date = Column(Date, nullable=False, server_default=func.current_date())
    expected_delivery = Column("expected_delivery_date", Date)
    status = Column(String(20), default="draft")
    total_amount = Column(Numeric(12, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    notes = Column(Text)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    supplier = relationship("Supplier", foreign_keys=[supplier_id])


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_order_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id"), nullable=False)
    item_type = Column(String(20), nullable=False, default="medicine")
    medicine_id = Column("item_id", UUID(as_uuid=True), ForeignKey("medicines.id"), nullable=False)
    quantity_ordered = Column(Integer, nullable=False)
    quantity_received = Column(Integer, default=0)
    unit_price = Column(Numeric(12, 2), nullable=False)
    total_price = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    purchase_order = relationship("PurchaseOrder", foreign_keys=[purchase_order_id])
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
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"))
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


# ──────────────────────────────────────────────────
# StockAdjustment  (manual adjustments, damage, expiry)
# ──────────────────────────────────────────────────
class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    adjustment_number = Column(String(30), nullable=False, index=True)
    item_type = Column(String(20), nullable=False, default="medicine")
    medicine_id = Column("item_id", UUID(as_uuid=True), ForeignKey("medicines.id"), nullable=False)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("medicine_batches.id"))
    adjustment_type = Column(String(20), nullable=False)
    quantity = Column(Integer, nullable=False)
    reason = Column(Text)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    status = Column(String(20), default="approved")
    adjusted_by = Column("created_by", UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    medicine = relationship("Medicine", foreign_keys=[medicine_id])
    batch = relationship("MedicineBatch", foreign_keys=[batch_id])
