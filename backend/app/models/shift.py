"""
Shift models — shift definitions and employee shift assignment.
"""
import uuid
from sqlalchemy import Column, String, Date, Time, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(50), nullable=False)  # e.g. Day / Night
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])


class EmployeeShiftAssignment(Base):
    """Effective-dated — a new row per reassignment, `effective_to` closes the
    previous one (BRD REQ-SHF-02 requires a `reason` for every change)."""
    __tablename__ = "employee_shift_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    shift_id = Column(UUID(as_uuid=True), ForeignKey("shifts.id"), nullable=False)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)
    assigned_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    reason = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("User", foreign_keys=[employee_id])
    shift = relationship("Shift", foreign_keys=[shift_id])
