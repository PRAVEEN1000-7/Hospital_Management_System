import uuid
from sqlalchemy import Column, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Incentive(Base):
    """A sales-linked incentive for an employee — the admin enters
    sales_amount and incentive_percent; incentive_amount is computed and
    stored server-side (sales_amount * incentive_percent / 100), never
    trusted from the client. Unlike Allowance there's no in-hand/added-to-
    salary choice: every incentive always counts toward that month's
    Payroll net_payable. One row per event, tagged to (year, month), same
    reasoning as Allowance — an employee can have more than one incentive
    entry in a month (e.g. two separate sales periods)."""
    __tablename__ = "incentives"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)  # 1-12
    sales_amount = Column(Numeric(12, 2), nullable=False)
    incentive_percent = Column(Numeric(5, 2), nullable=False)
    incentive_amount = Column(Numeric(12, 2), nullable=False)  # sales_amount * incentive_percent / 100
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    user = relationship("User", foreign_keys=[user_id])
