import uuid
from sqlalchemy import Column, String, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class AdvancePayment(Base):
    """A salary advance/loan given to an employee, recovered as a fixed EMI
    deducted from Payroll each month starting at (start_year, start_month)
    until the full amount is repaid. Unlike Allowance/Incentive, this is NOT
    tagged to one month — it's a standing loan that spans many months.

    Deliberately no monthly repayment ledger: how much of this has been
    repaid, and what any given month's installment is, is always computed
    live from (amount, emi_amount, start_year, start_month) versus the
    report month being asked about — see
    advance_payment_service.get_month_deduction. This mirrors how Payroll
    itself is now fully live (no generated snapshot) — nothing here needs
    a separate "was this month's EMI recorded" table to go stale.

    emi_amount = amount / installments, computed and stored once at
    creation time (not re-derived from installments on every read) so a
    later edit to the row can't silently change what was already
    communicated to the employee as their fixed monthly deduction."""
    __tablename__ = "advance_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    installments = Column(Integer, nullable=False)
    emi_amount = Column(Numeric(12, 2), nullable=False)
    start_year = Column(Integer, nullable=False)
    start_month = Column(Integer, nullable=False)  # 1-12
    reason = Column(String(255), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    user = relationship("User", foreign_keys=[user_id])
