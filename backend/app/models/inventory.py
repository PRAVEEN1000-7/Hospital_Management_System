"""
Inventory models — matches hms_db schema (Phase 4: Inventory & Support).
Includes: Supplier, PurchaseOrder, PurchaseOrderItem, GoodsReceiptNote,
          GRNItem, StockMovement, StockAdjustment, CycleCount, CycleCountItem
"""
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Integer, Text,
    ForeignKey, Numeric, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Supplier(Base):
    """Hospital suppliers / vendors."""
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

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")

    __table_args__ = (
        UniqueConstraint("hospital_id", "code", name="uq_supplier_code_hospital"),
    )


class PurchaseOrder(Base):
    """Purchase orders placed with suppliers."""
    __tablename__ = "purchase_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    po_number = Column(String(30), unique=True, nullable=False, index=True)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False)
    order_date = Column(Date, nullable=False)
    expected_delivery_date = Column(Date)
    status = Column(String(20), default="draft")  # draft, submitted, approved, partially_received, received, cancelled
    total_amount = Column(Numeric(12, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    notes = Column(Text)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    supplier = relationship("Supplier", back_populates="purchase_orders")
    items = relationship("PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan")
    approver = relationship("User", foreign_keys=[approved_by])
    creator = relationship("User", foreign_keys=[created_by])


class PurchaseOrderItem(Base):
    """Line items within a purchase order."""
    __tablename__ = "purchase_order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_order_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id"), nullable=False)
    item_type = Column(String(20), nullable=False)  # medicine, optical_product
    item_id = Column(UUID(as_uuid=True), nullable=False)
    quantity_ordered = Column(Integer, nullable=False)
    quantity_received = Column(Integer, default=0)
    unit_price = Column(Numeric(12, 2), nullable=False)
    total_price = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    purchase_order = relationship("PurchaseOrder", back_populates="items")


class GoodsReceiptNote(Base):
    """Goods receipt notes — records incoming stock deliveries."""
    __tablename__ = "goods_receipt_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    grn_number = Column(String(30), unique=True, nullable=False, index=True)
    purchase_order_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id"))
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False)
    receipt_date = Column(Date, nullable=False)
    invoice_number = Column(String(50))
    invoice_date = Column(Date)
    total_amount = Column(Numeric(12, 2), default=0)
    status = Column(String(20), default="pending")  # pending, verified, accepted, rejected
    verified_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    notes = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    purchase_order = relationship("PurchaseOrder")
    supplier = relationship("Supplier")
    items = relationship("GRNItem", back_populates="grn", cascade="all, delete-orphan")
    verifier = relationship("User", foreign_keys=[verified_by])
    creator = relationship("User", foreign_keys=[created_by])


class GRNItem(Base):
    """Individual items within a GRN delivery."""
    __tablename__ = "grn_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grn_id = Column(UUID(as_uuid=True), ForeignKey("goods_receipt_notes.id"), nullable=False)
    item_type = Column(String(20), nullable=False)
    item_id = Column(UUID(as_uuid=True), nullable=False)
    batch_number = Column(String(50))
    manufactured_date = Column(Date)
    expiry_date = Column(Date)
    quantity_received = Column(Integer, nullable=False)
    quantity_accepted = Column(Integer)
    quantity_rejected = Column(Integer, default=0)
    unit_price = Column(Numeric(12, 2), nullable=False)
    total_price = Column(Numeric(12, 2), nullable=False)
    rejection_reason = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    grn = relationship("GoodsReceiptNote", back_populates="items")


class StockMovement(Base):
    """Audit trail of every stock change (in or out)."""
    __tablename__ = "stock_movements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    item_type = Column(String(20), nullable=False)
    item_id = Column(UUID(as_uuid=True), nullable=False)
    batch_id = Column(UUID(as_uuid=True))
    movement_type = Column(String(20), nullable=False)  # stock_in, sale, dispensing, return, adjustment, transfer, expired, damaged
    reference_type = Column(String(30))  # grn, dispensing, return, adjustment, transfer
    reference_id = Column(UUID(as_uuid=True))
    quantity = Column(Integer, nullable=False)  # positive = in, negative = out
    balance_after = Column(Integer, nullable=False)
    unit_cost = Column(Numeric(12, 2))
    notes = Column(String(255))
    performed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    performer = relationship("User", foreign_keys=[performed_by])


class StockAdjustment(Base):
    """Manual stock adjustments with approval workflow."""
    __tablename__ = "stock_adjustments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    adjustment_number = Column(String(30), unique=True, nullable=False, index=True)
    item_type = Column(String(20), nullable=False)
    item_id = Column(UUID(as_uuid=True), nullable=False)
    batch_id = Column(UUID(as_uuid=True))
    adjustment_type = Column(String(20), nullable=False)  # increase, decrease, write_off
    quantity = Column(Integer, nullable=False)
    reason = Column(String(255), nullable=False)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    status = Column(String(20), default="pending")  # pending, approved, rejected
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    approver = relationship("User", foreign_keys=[approved_by])
    creator = relationship("User", foreign_keys=[created_by])


class CycleCount(Base):
    """Physical inventory cycle counts."""
    __tablename__ = "cycle_counts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    count_number = Column(String(30), unique=True, nullable=False, index=True)
    count_date = Column(Date, nullable=False)
    status = Column(String(20), default="in_progress")  # in_progress, completed, verified
    notes = Column(Text)
    counted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    verified_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    items = relationship("CycleCountItem", back_populates="cycle_count", cascade="all, delete-orphan")
    counter = relationship("User", foreign_keys=[counted_by])
    verifier = relationship("User", foreign_keys=[verified_by])


class CycleCountItem(Base):
    """Line items in a cycle count — system vs. physical counts."""
    __tablename__ = "cycle_count_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_count_id = Column(UUID(as_uuid=True), ForeignKey("cycle_counts.id"), nullable=False)
    item_type = Column(String(20), nullable=False)
    item_id = Column(UUID(as_uuid=True), nullable=False)
    batch_id = Column(UUID(as_uuid=True))
    system_quantity = Column(Integer, nullable=False)
    counted_quantity = Column(Integer, nullable=False)
    variance = Column(Integer, nullable=False)  # counted - system
    variance_reason = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    cycle_count = relationship("CycleCount", back_populates="items")
