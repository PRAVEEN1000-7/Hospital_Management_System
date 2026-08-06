import uuid
from sqlalchemy import Column, String, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Allowance(Base):
    """A one-off, event-tied payment to an employee (a business trip, a
    campaign fee, etc.) — not a recurring salary component. Logged whenever
    it happens, tagged to the (year, month) it should count toward, since
    the same employee can have several of these in one month, each with its
    own reason. 'added_to_salary' allowances are summed into that month's
    Payroll net_payable, computed live on every read (payroll_service.
    get_live_payroll) — no generation step, so this is reflected immediately.
    'in_hand' allowances are recorded and shown, but excluded from that sum."""
    
    __tablename__ = "allowances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)  # 1-12
    amount = Column(Numeric(12, 2), nullable=False)
    reason = Column(String(255), nullable=False)
    allowance_type = Column(String(20), nullable=False)  # 'in_hand' | 'added_to_salary'
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    user = relationship("User", foreign_keys=[user_id])
