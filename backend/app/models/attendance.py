import uuid
from sqlalchemy import (
	Column, String, Date, Time, Boolean, DateTime, Integer,
	ForeignKey, Text, Numeric, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Holidays(Base):
	__tablename__ = "holidays"

	id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
	hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
	year = Column(Integer, nullable=False)
	month = Column(Integer, nullable=False)  # 1-12
	# Day-of-month numbers marked as regular/weekly-off holiday (e.g. Sundays).
	# Subtracted from working_days for payroll (per-day-salary denominator).
	holiday_days = Column(ARRAY(Integer), nullable=False, server_default="{}")
	# Festival/local holidays (e.g. Diwali) — also non-attendance days, but
	# NOT subtracted from working_days: they're paid regardless of
	# attendance, unlike regular weekly-off days.
	festival_days = Column(ARRAY(Integer), nullable=False, server_default="{}")
	created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
	created_at = Column(DateTime(timezone=True), server_default=func.now())
	updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

	__table_args__ = (
		UniqueConstraint("hospital_id", "year", "month", name="uq_holidays_hospital_year_month"),
	)

	hospital = relationship("Hospital", foreign_keys=[hospital_id])

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(String(10), nullable=False)  # 'absent' | 'half_day' — Present is "no row"
    reason = Column(String(255))  # captured via the Attendance Marking popup, feeds Leave Management
    marked_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_attendance_records_user_date"),
    )

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    user = relationship("User", foreign_keys=[user_id])


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(50), nullable=False)  # e.g. "Day Shift", "Night Shift"
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("hospital_id", "name", name="uq_shifts_hospital_name"),
    )

    hospital = relationship("Hospital", foreign_keys=[hospital_id])


class ShiftAssignment(Base):
    """Effective-dated shift history — see 21_add_shift_assignment_history.sql.
    users.shift_id is only ever the CURRENT shift; this table is what lets a
    report resolve "which shift was this employee on during month X" without
    a later reassignment silently rewriting that answer. One open-ended row
    per employee at a time (effective_to IS NULL = current)."""
    __tablename__ = "shift_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    shift_id = Column(UUID(as_uuid=True), ForeignKey("shifts.id"), nullable=False)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date)  # NULL = still current
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    user = relationship("User", foreign_keys=[user_id])
    shift = relationship("Shift", foreign_keys=[shift_id])
