"""
Attendance model — one row per employee per date, manual/provisional-then-
verified marking only. Deliberately no "marked time" column — there's no
reliable way to know an employee's actual arrival time without hardware
(biometric integration is a future phase per the BRD), so capturing one
would risk being misread as a real timestamp.
"""
import uuid
from sqlalchemy import Column, String, Date, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    # not_marked / present / absent / holiday / on_leave
    status = Column(String(20), default="not_marked", nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    marked_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    verified_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("hospital_id", "employee_id", "date", name="uq_attendance_hospital_employee_date"),
    )

    employee = relationship("User", foreign_keys=[employee_id])
