"""
DailySettlement model — maps to daily_settlements table.
"""
import uuid
from sqlalchemy import Column, String, DateTime, Date, Numeric, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class DailySettlement(Base):
    __tablename__ = "daily_settlements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    settlement_date = Column(Date, nullable=False)
    cashier_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    total_cash = Column(Numeric(12, 2), default=0)
    total_card = Column(Numeric(12, 2), default=0)
    total_online = Column(Numeric(12, 2), default=0)
    total_other = Column(Numeric(12, 2), default=0)
    total_collected = Column(Numeric(12, 2), default=0)
    total_refunds = Column(Numeric(12, 2), default=0)
    net_amount = Column(Numeric(12, 2), default=0)
    status = Column(String(20), default="open")   # open | closed | verified
    verified_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id])

    __table_args__ = (
        UniqueConstraint("hospital_id", "settlement_date", "cashier_user_id",
                         name="uq_settlement_hospital_date_cashier"),
    )
