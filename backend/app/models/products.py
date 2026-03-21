"""
Products and Stock Management models.
Centralized product catalog and stock tracking.
"""
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Integer, Text,
    ForeignKey, Numeric, UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Product(Base):
    """
    Centralized product catalog for all hospital inventory items.
    Tracks medicines, optical products, surgical items, equipment, etc.
    """
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False)
    
    # Basic Information
    product_name = Column(String(200), nullable=False, index=True)
    generic_name = Column(String(200))
    brand_name = Column(String(200))
    
    # Categorization
    category = Column(String(50), nullable=False, index=True)  # medicine, optical, surgical, equipment, laboratory, disposable, other
    subcategory = Column(String(100))
    
    # Identification
    sku = Column(String(50), unique=True, index=True)
    barcode = Column(String(100), index=True)
    manufacturer = Column(String(200))
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id"))
    
    # Pricing
    purchase_price = Column(Numeric(12, 2), default=0)
    selling_price = Column(Numeric(12, 2), default=0)
    mrp = Column(Numeric(12, 2), default=0)
    tax_percentage = Column(Numeric(5, 2), default=0)
    
    # Stock Management
    unit_type = Column(String(50), default="unit")  # tablet, capsule, bottle, box, piece, etc.
    pack_size = Column(Integer, default=1)
    min_stock_level = Column(Integer, default=10)
    max_stock_level = Column(Integer, default=1000)
    reorder_level = Column(Integer, default=20)
    
    # Storage & Handling
    storage_conditions = Column(Text)
    shelf_life_days = Column(Integer)
    requires_refrigeration = Column(Boolean, default=False)
    is_hazardous = Column(Boolean, default=False)
    is_narcotic = Column(Boolean, default=False)
    requires_prescription = Column(Boolean, default=False)
    
    # Status
    is_active = Column(Boolean, default=True, index=True)
    is_deleted = Column(Boolean, default=False)
    
    # Audit
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    supplier = relationship("Supplier", foreign_keys=[supplier_id])
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])
    
    stock_summary = relationship("StockSummary", back_populates="product", uselist=False, cascade="all, delete-orphan")
    alerts = relationship("StockAlert", back_populates="product", cascade="all, delete-orphan")

    __table_args__ = (
        Index('idx_products_category_active', 'category', 'is_active'),
    )

    def __repr__(self):
        return f"<Product(id={self.id}, name='{self.product_name}', category='{self.category}')>"


class StockSummary(Base):
    """
    Real-time stock levels summary for each product.
    Aggregated from stock movements and batch data.
    """
    __tablename__ = "stock_summary"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    # Stock Levels
    total_stock = Column(Integer, default=0)
    available_stock = Column(Integer, default=0)
    reserved_stock = Column(Integer, default=0)
    damaged_stock = Column(Integer, default=0)
    expired_stock = Column(Integer, default=0)
    
    # Batch Information
    total_batches = Column(Integer, default=0)
    earliest_expiry = Column(Date)
    
    # Valuation
    avg_cost_price = Column(Numeric(12, 2), default=0)
    total_value = Column(Numeric(14, 2), default=0)
    
    # Alerts
    is_low_stock = Column(Boolean, default=False, index=True)
    is_expiring_soon = Column(Boolean, default=False)
    
    # Timestamps
    last_movement_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    product = relationship("Product", back_populates="stock_summary")

    def __repr__(self):
        return f"<StockSummary(product_id={self.product_id}, stock={self.available_stock})>"


class StockAlert(Base):
    """
    Stock alerts for low stock, expiring items, etc.
    """
    __tablename__ = "stock_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"))
    
    # Alert Details
    alert_type = Column(String(50), nullable=False, index=True)  # low_stock, expiring_soon, expired, overstocked
    severity = Column(String(20), default="medium")  # low, medium, high, critical
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    
    # Context Data
    current_stock = Column(Integer)
    threshold_stock = Column(Integer)
    expiry_date = Column(Date)
    days_until_expiry = Column(Integer)
    
    # Status
    is_resolved = Column(Boolean, default=False, index=True)
    resolved_at = Column(DateTime(timezone=True))
    resolved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # Acknowledgment
    acknowledged_at = Column(DateTime(timezone=True))
    acknowledged_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    product = relationship("Product", back_populates="alerts")
    resolver = relationship("User", foreign_keys=[resolved_by])
    acknowledger = relationship("User", foreign_keys=[acknowledged_by])

    def __repr__(self):
        return f"<StockAlert(type='{self.alert_type}', severity='{self.severity}')>"
