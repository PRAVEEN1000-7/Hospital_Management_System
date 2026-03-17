"""Optical product model used by inventory name resolution."""
import uuid
from sqlalchemy import Column, String, DateTime, Numeric, Integer, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class OpticalProduct(Base):
    __tablename__ = "optical_products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(200), nullable=False)
    category = Column(String(50))
    brand = Column(String(100))
    model_number = Column(String(100))
    sku = Column(String(50))
    barcode = Column(String(50))
    frame_type = Column(String(50))
    material = Column(String(50))
    color = Column(String(50))
    size = Column(String(20))
    power_type = Column(String(20))
    coating = Column(String(50))
    selling_price = Column(Numeric(12, 2), nullable=False)
    purchase_price = Column(Numeric(12, 2))
    current_stock = Column(Integer, default=0)
    reorder_level = Column(Integer, default=5)
    # Keep as plain UUID until tax_configurations model/table is introduced in this codebase.
    tax_config_id = Column(UUID(as_uuid=True))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])