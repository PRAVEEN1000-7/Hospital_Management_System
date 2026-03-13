"""
Pharmacy module models — medicines, inventory, sales, and purchase orders.
"""
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Integer, Text,
    ForeignKey, UniqueConstraint, Numeric, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
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
    generic_name = Column(String(200))
    brand = Column(String(200))
    category = Column(String(100))          # e.g. Tablet, Syrup, Injection, Cream
    dosage_form = Column(String(100))       # e.g. 500mg, 10ml
    strength = Column(String(100))          # e.g. 500mg, 250mg/5ml
    manufacturer = Column(String(200))
    hsn_code = Column(String(20))           # HSN/SAC code for tax
    sku = Column(String(50))                # Stock-keeping unit
    barcode = Column(String(50))
    unit = Column(String(30), default="Nos") # Nos, Strip, Bottle, Box, Tube
    description = Column(Text)
    requires_prescription = Column(Boolean, default=False)
    schedule_type = Column(String(10))           # H, H1, X, OTC (Indian drug schedule)
    rack_location = Column(String(100))          # physical location in pharmacy
    reorder_level = Column(Integer, default=10)  # min stock to trigger reorder alert
    max_stock_level = Column(Integer)            # max stock to maintain
    storage_conditions = Column(String(200))     # e.g. "Store below 25°C", "Refrigerate"
    drug_interaction_notes = Column(Text)        # known interaction warnings
    side_effects = Column(Text)                  # common side effects
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    __table_args__ = (
        UniqueConstraint("hospital_id", "name", "strength", name="uq_medicine_name_strength"),
    )

    hospital = relationship("Hospital", foreign_keys=[hospital_id])


# ──────────────────────────────────────────────────
# MedicineBatch  (batch / lot tracking + expiry)
# ──────────────────────────────────────────────────
class MedicineBatch(Base):
    __tablename__ = "medicine_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    medicine_id = Column(UUID(as_uuid=True), ForeignKey("medicines.id"), nullable=False)
    batch_number = Column(String(50), nullable=False)
    mfg_date = Column(Date)                                     # manufacturing date
    expiry_date = Column(Date, nullable=False)
    quantity = Column(Integer, nullable=False, default=0)       # current stock in this batch
    purchase_price = Column(Numeric(12, 2), nullable=False)     # cost per unit
    selling_price = Column(Numeric(12, 2), nullable=False)      # MRP / sale price per unit
    mrp = Column(Numeric(12, 2))                                # maximum retail price
    tax_percent = Column(Numeric(5, 2), default=0)
    discount_percent = Column(Numeric(5, 2), default=0)         # batch-level discount
    location = Column(String(100))                              # specific shelf/rack for this batch
    received_date = Column(Date, server_default=func.current_date())
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id"))
    purchase_order_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("medicine_id", "batch_number", name="uq_medicine_batch"),
        CheckConstraint("quantity >= 0", name="ck_batch_qty_non_negative"),
    )

    medicine = relationship("Medicine", foreign_keys=[medicine_id])
    supplier = relationship("Supplier", foreign_keys=[supplier_id])


# ──────────────────────────────────────────────────
# Supplier
# ──────────────────────────────────────────────────
class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(200), nullable=False)
    contact_person = Column(String(200))
    phone = Column(String(20))
    email = Column(String(255))
    address = Column(Text)
    gst_number = Column(String(20))
    drug_license_number = Column(String(50))
    payment_terms = Column(String(100))         # e.g. "Net 30", "COD", "Net 60"
    credit_limit = Column(Numeric(14, 2))       # max credit allowed for this supplier
    lead_time_days = Column(Integer)            # average delivery time in days
    website = Column(String(255))
    pan_number = Column(String(20))             # PAN for Indian tax compliance
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("hospital_id", "name", name="uq_supplier_name"),
    )

    hospital = relationship("Hospital", foreign_keys=[hospital_id])


# ──────────────────────────────────────────────────
# PurchaseOrder  (stock-in from suppliers)
# ──────────────────────────────────────────────────
class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False)
    order_number = Column(String(30), nullable=False, index=True)
    order_date = Column(Date, server_default=func.current_date())
    expected_delivery = Column(Date)
    status = Column(String(20), default="draft")  # draft, ordered, received, cancelled
    total_amount = Column(Numeric(14, 2), default=0)
    notes = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    received_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    received_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("hospital_id", "order_number", name="uq_po_number"),
    )

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    supplier = relationship("Supplier", foreign_keys=[supplier_id])


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_order_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id"), nullable=False)
    medicine_id = Column(UUID(as_uuid=True), ForeignKey("medicines.id"), nullable=False)
    quantity_ordered = Column(Integer, nullable=False)
    quantity_received = Column(Integer, default=0)
    unit_price = Column(Numeric(12, 2), nullable=False)
    total_price = Column(Numeric(14, 2), nullable=False)
    batch_number = Column(String(50))
    expiry_date = Column(Date)

    purchase_order = relationship("PurchaseOrder", foreign_keys=[purchase_order_id])
    medicine = relationship("Medicine", foreign_keys=[medicine_id])


# ──────────────────────────────────────────────────
# PharmacySale  (dispensing / billing)
# ──────────────────────────────────────────────────
class PharmacySale(Base):
    __tablename__ = "pharmacy_sales"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    invoice_number = Column(String(30), nullable=False, index=True)
    sale_date = Column(DateTime(timezone=True), server_default=func.now())
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"))
    patient_name = Column(String(200))       # fallback for walk-in without patient record
    doctor_name = Column(String(200))
    prescription_number = Column(String(50))   # reference to doctor's prescription
    prescription_date = Column(Date)           # date prescription was written
    subtotal = Column(Numeric(14, 2), default=0)
    discount_amount = Column(Numeric(12, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(14, 2), default=0)
    payment_method = Column(String(30), default="cash")  # cash, card, upi, insurance
    payment_status = Column(String(20), default="paid")  # paid, pending, refunded
    status = Column(String(20), default="completed")     # completed, returned, partial_return
    notes = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("hospital_id", "invoice_number", name="uq_sale_invoice"),
    )

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    patient = relationship("Patient", foreign_keys=[patient_id])


class PharmacySaleItem(Base):
    __tablename__ = "pharmacy_sale_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id = Column(UUID(as_uuid=True), ForeignKey("pharmacy_sales.id"), nullable=False)
    medicine_id = Column(UUID(as_uuid=True), ForeignKey("medicines.id"), nullable=False)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("medicine_batches.id"))
    medicine_name = Column(String(200), nullable=False)   # Snapshot at time of sale
    batch_number = Column(String(50))                         # Snapshot from batch
    mfg_date = Column(Date)                                   # Snapshot from batch
    expiry_date = Column(Date)                                # Snapshot from batch
    mrp = Column(Numeric(12, 2))                              # Snapshot from batch
    supplier_name = Column(String(200))                       # Snapshot from batch→supplier
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    dosage_instructions = Column(String(300))                 # e.g. "1 tablet twice daily after meals"
    duration_days = Column(Integer)                           # prescribed duration
    discount_percent = Column(Numeric(5, 2), default=0)
    tax_percent = Column(Numeric(5, 2), default=0)
    total_price = Column(Numeric(14, 2), nullable=False)

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
    medicine_id = Column(UUID(as_uuid=True), ForeignKey("medicines.id"), nullable=False)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("medicine_batches.id"))
    adjustment_type = Column(String(30), nullable=False)   # damage, expired, correction, return
    quantity = Column(Integer, nullable=False)              # +ve = stock-in, -ve = stock-out
    reason = Column(Text)
    adjusted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    medicine = relationship("Medicine", foreign_keys=[medicine_id])
    batch = relationship("MedicineBatch", foreign_keys=[batch_id])
