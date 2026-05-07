"""
TaxConfiguration model — maps to tax_configurations table.
"""
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Date, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class TaxConfiguration(Base):
    __tablename__ = "tax_configurations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(100), nullable=False)
    code = Column(String(20), nullable=False)
    rate_percentage = Column(Numeric(5, 2), nullable=False)
    applies_to = Column(String(20), nullable=False)   # 'product', 'service', 'both'
    category = Column(String(50))
    is_compound = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("hospital_id", "code", name="uq_tax_config_hospital_code"),
    )
