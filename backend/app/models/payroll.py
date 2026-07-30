"""
Payroll models — feed only (LOP/payable-days figures), not full salary
disbursement or statutory filings (explicitly out of scope per the BRD).
"""
import uuid
from sqlalchemy import Column, String, Integer, Numeric, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    period_month = Column(Integer, nullable=False)
    period_year = Column(Integer, nullable=False)
    status = Column(String(20), default="draft", nullable=False)  # draft / processed
    generated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("hospital_id", "period_month", "period_year", name="uq_payroll_run_period"),
    )

    payslips = relationship("Payslip", back_populates="payroll_run")


class Payslip(Base):
    __tablename__ = "payslips"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payroll_run_id = Column(UUID(as_uuid=True), ForeignKey("payroll_runs.id"), nullable=False)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    present_days = Column(Integer, default=0)
    absent_days = Column(Integer, default=0)
    leave_days_taken = Column(Integer, default=0)
    holiday_days = Column(Integer, default=0)
    lop_days = Column(Integer, default=0)
    per_day_rate = Column(Numeric(12, 2), default=0)
    deduction_amount = Column(Numeric(12, 2), default=0)
    gross_salary = Column(Numeric(12, 2), default=0)
    net_salary = Column(Numeric(12, 2), default=0)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("payroll_run_id", "employee_id", name="uq_payslip_run_employee"),
    )

    payroll_run = relationship("PayrollRun", back_populates="payslips")
    employee = relationship("User", foreign_keys=[employee_id])
