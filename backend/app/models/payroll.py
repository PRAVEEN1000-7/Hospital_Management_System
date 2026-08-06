import uuid
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    generated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("hospital_id", "year", "month", name="uq_payroll_runs_hospital_year_month"),
    )

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    items = relationship("PayrollItem", back_populates="payroll_run", cascade="all, delete-orphan")


class PayrollItem(Base):
    __tablename__ = "payroll_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payroll_run_id = Column(UUID(as_uuid=True), ForeignKey("payroll_runs.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    present_count = Column(Numeric(5, 1), nullable=False, default=0)
    absent_count = Column(Numeric(5, 1), nullable=False, default=0)
    paid_leave_entitlement = Column(Integer, nullable=False, default=0)
    working_days = Column(Integer, nullable=False, default=0)
    base_salary = Column(Numeric(12, 2), nullable=False, default=0)
    per_day_salary = Column(Numeric(12, 2), nullable=False, default=0)
    deduction_days = Column(Numeric(5, 1), nullable=False, default=0)
    deduction_amount = Column(Numeric(12, 2), nullable=False, default=0)
    allowance_added = Column(Numeric(12, 2), nullable=False, default=0)
    incentive_added = Column(Numeric(12, 2), nullable=False, default=0)
    net_payable = Column(Numeric(12, 2), nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("payroll_run_id", "user_id", name="uq_payroll_items_run_user"),
    )

    payroll_run = relationship("PayrollRun", back_populates="items")
    user = relationship("User", foreign_keys=[user_id])
