"""
Optical Store module models — catalog, batch/lot stock, eye prescriptions, and sales.

OpticalProduct/OpticalPrescription/OpticalSale/OpticalSaleItem map onto tables
(optical_products, optical_prescriptions, optical_orders, optical_order_items)
that already existed in the schema before any application code used them.
OpticalBatch is the one new table, added so stock is tracked the same way
Pharmacy tracks Medicine stock (catalog row + separate batch/lot rows that are
the actual source of truth for quantity on hand).
"""
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Integer, Text,
    ForeignKey, UniqueConstraint, Numeric,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, synonym
from sqlalchemy.sql import func

from ..database import Base


class OpticalProduct(Base):
    __tablename__ = "optical_products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(200), nullable=False)
    category = Column(String(50), nullable=False)  # 'frame' | 'lens' | 'contact_lens' | 'solution' | 'accessory'
    brand = Column(String(100))
    model_number = Column(String(100))
    color = Column(String(50))
    material = Column(String(50))
    size = Column(String(20))
    gender = Column(String(10))
    sku = Column(String(50))
    barcode = Column(String(50))
    selling_price = Column(Numeric(12, 2), nullable=False)
    purchase_price = Column(Numeric(12, 2))
    tax_config_id = Column(UUID(as_uuid=True), ForeignKey("tax_configurations.id"))
    current_stock = Column(Integer, default=0)  # DEPRECATED — superseded by SUM(OpticalBatch.quantity)
    reorder_level = Column(Integer, default=5)
    lens_type = Column(String(30))
    lens_index = Column(String(10))
    lens_coating = Column(String(50))
    image_url = Column(String(500))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])


class OpticalBatch(Base):
    __tablename__ = "optical_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column("optical_product_id", UUID(as_uuid=True), ForeignKey("optical_products.id"), nullable=False)
    batch_number = Column(String(50), nullable=False)
    mfg_date = Column("manufactured_date", Date)
    expiry_date = Column(Date, nullable=True)  # nullable — frames/solutions/accessories don't expire
    initial_quantity = Column(Integer, nullable=False, default=0)
    quantity = Column("current_quantity", Integer, nullable=False, default=0)
    purchase_price = Column(Numeric(12, 2))
    selling_price = Column(Numeric(12, 2))
    is_expired = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("optical_product_id", "batch_number", name="uq_optical_batch"),
    )

    mrp = synonym("selling_price")
    product = relationship("OpticalProduct", foreign_keys=[product_id])


class OpticalPrescription(Base):
    __tablename__ = "optical_prescriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    prescription_number = Column(String(30), unique=True, nullable=False, index=True)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"), nullable=False)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id"))
    right_sph = Column(Numeric(5, 2))
    right_cyl = Column(Numeric(5, 2))
    right_axis = Column(Integer)
    right_add = Column(Numeric(4, 2))
    right_va = Column(String(20))
    left_sph = Column(Numeric(5, 2))
    left_cyl = Column(Numeric(5, 2))
    left_axis = Column(Integer)
    left_add = Column(Numeric(4, 2))
    left_va = Column(String(20))
    pd_distance = Column(Numeric(4, 1))
    pd_near = Column(Numeric(4, 1))
    pd_right = Column(Numeric(4, 1))
    pd_left = Column(Numeric(4, 1))
    notes = Column(Text)
    is_finalized = Column(Boolean, default=False)
    valid_until = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    patient = relationship("Patient", foreign_keys=[patient_id])
    doctor = relationship("Doctor", foreign_keys=[doctor_id])


class OpticalSale(Base):
    """Optical sale/dispensing header — maps onto the pre-existing optical_orders table."""
    __tablename__ = "optical_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    invoice_number = Column("order_number", String(30), nullable=False, index=True)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    prescription_id = Column("optical_prescription_id", UUID(as_uuid=True), ForeignKey("optical_prescriptions.id"))
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"))
    sale_type = Column("order_type", String(20), nullable=False, default="new")  # 'new' | 'replacement' | 'repair_order'
    status = Column(String(20), default="placed")
    frame_product_id = Column(UUID(as_uuid=True), ForeignKey("optical_products.id"))
    right_lens_product_id = Column(UUID(as_uuid=True), ForeignKey("optical_products.id"))
    left_lens_product_id = Column(UUID(as_uuid=True), ForeignKey("optical_products.id"))
    fitting_measurements = Column(JSONB)
    subtotal = Column("total_amount", Numeric(12, 2), default=0)
    discount_amount = Column(Numeric(12, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    total_amount = Column("net_amount", Numeric(12, 2), default=0)
    estimated_delivery_date = Column(Date)
    delivered_at = Column(DateTime(timezone=True))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Payment — shared shape with PharmacySale (see billing_queue_service.py).
    payment_method = Column(String(20), default="cash")
    payment_status = Column(String(20), default="pending")
    amount_tendered = Column(Numeric(12, 2), default=0)
    advance_amount = Column(Numeric(12, 2), default=0)
    paid_amount = Column(Numeric(12, 2), default=0)
    balance_amount = Column(Numeric(12, 2), default=0)

    # Dispensing queue — shared shape with PharmacySale.
    queue_token = Column(Integer)
    queue_status = Column(String(20), default="waiting")
    queue_called_at = Column(DateTime(timezone=True))

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    patient = relationship("Patient", foreign_keys=[patient_id])
    prescription = relationship("OpticalPrescription", foreign_keys=[prescription_id])


class OpticalSaleItem(Base):
    """Maps onto the pre-existing optical_order_items table."""
    __tablename__ = "optical_order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id = Column("order_id", UUID(as_uuid=True), ForeignKey("optical_orders.id"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("optical_products.id"), nullable=False)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("optical_batches.id"))
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False)
    discount_percent = Column(Numeric(5, 2), default=0)
    tax_percent = Column("tax_amount", Numeric(12, 2), default=0)
    total_price = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sale = relationship("OpticalSale", foreign_keys=[sale_id])
    product = relationship("OpticalProduct", foreign_keys=[product_id])
    batch = relationship("OpticalBatch", foreign_keys=[batch_id])
