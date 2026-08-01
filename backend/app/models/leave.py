"""
Leave models — HR data-entry, not a self-service request queue.

LeaveRecord.status defaults to "approved" (consistent with the existing
doctor_leaves precedent) since HR is entering it directly; the schema still
supports pending/rejected for a future self-service phase.
"""
import uuid
from sqlalchemy import Column, String, Date, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class LeaveRecord(Base):
    __tablename__ = "leave_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(String(255))
    status = Column(String(20), default="approved", nullable=False)  # approved / pending / rejected
    entered_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("User", foreign_keys=[employee_id])


class LeaveBalance(Base):
    __tablename__ = "leave_balances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    year = Column(Integer, nullable=False)
    allocated = Column(Integer, nullable=False)  # copied from employee_profiles.paid_leave_entitlement
    used = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("employee_id", "year", name="uq_leave_balance_employee_year"),
    )

    employee = relationship("User", foreign_keys=[employee_id])
