from sqlalchemy import (
    Column, Integer, String, Date, Time, Boolean, DateTime,
    ForeignKey, Text, Numeric, Sequence
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from ..database import Base
import enum


# ── Enums ──────────────────────────────────────────────────────────────────

class AppointmentType(str, enum.Enum):
    SCHEDULED = "scheduled"
    WALK_IN = "walk-in"


class ConsultationType(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    BOTH = "both"


class AppointmentStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in-progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no-show"
    RESCHEDULED = "rescheduled"


class UrgencyLevel(str, enum.Enum):
    ROUTINE = "routine"
    URGENT = "urgent"
    EMERGENCY = "emergency"


class WaitlistStatus(str, enum.Enum):
    WAITING = "waiting"
    NOTIFIED = "notified"
    CONFIRMED = "confirmed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    WAIVED = "waived"


class BlockType(str, enum.Enum):
    LEAVE = "leave"
    HOLIDAY = "holiday"
    EMERGENCY = "emergency"
    OTHER = "other"


# ── Sequences ──────────────────────────────────────────────────────────────

appointment_seq = Sequence("appointment_seq")
walk_in_seq = Sequence("walk_in_seq")


# ── Models ─────────────────────────────────────────────────────────────────

class DoctorSchedule(Base):
    __tablename__ = "doctor_schedules"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    weekday = Column(Integer, nullable=False)  # 0=Monday … 6=Sunday
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    slot_duration = Column(Integer, nullable=False, default=30)
    consultation_type = Column(String(20), nullable=False, default="both")
    max_patients_per_slot = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class BlockedPeriod(Base):
    __tablename__ = "blocked_periods"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(String(255))
    block_type = Column(String(20), default="leave")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    appointment_number = Column(String(50), unique=True, nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    appointment_type = Column(String(20), nullable=False)
    consultation_type = Column(String(20), nullable=False)
    appointment_date = Column(Date, nullable=False)
    appointment_time = Column(Time, nullable=True)
    slot_duration = Column(Integer, default=30)
    status = Column(String(20), default="pending")

    # Walk-in specific
    queue_number = Column(String(20))
    queue_position = Column(Integer)
    estimated_wait_time = Column(Integer)
    walk_in_registered_at = Column(DateTime(timezone=True))
    urgency_level = Column(String(20))

    # Online consultation
    zoom_meeting_id = Column(String(255))
    zoom_meeting_link = Column(Text)
    zoom_password = Column(String(50))

    # General info
    reason_for_visit = Column(Text)
    doctor_notes = Column(Text)
    diagnosis = Column(Text)
    prescription = Column(Text)
    fees = Column(Numeric(10, 2))
    payment_status = Column(String(20), default="pending")

    # Notifications
    confirmation_sent = Column(Boolean, default=False)
    reminder_sent = Column(Boolean, default=False)

    # Metadata
    booked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancelled_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancellation_reason = Column(Text)
    cancelled_at = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Waitlist(Base):
    __tablename__ = "waitlist"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    preferred_date = Column(Date, nullable=False)
    preferred_time = Column(Time, nullable=True)
    consultation_type = Column(String(20), nullable=False)
    reason_for_visit = Column(Text)
    status = Column(String(20), default="waiting")
    priority = Column(Integer, default=0)
    notified_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AppointmentSetting(Base):
    __tablename__ = "appointment_settings"

    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String(100), unique=True, nullable=False)
    setting_value = Column(Text, nullable=False)
    value_type = Column(String(20), default="string")
    description = Column(Text)
    is_global = Column(Boolean, default=True)
    doctor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AppointmentAuditLog(Base):
    __tablename__ = "appointment_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(50), nullable=False)
    performed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    old_values = Column(JSONB)
    new_values = Column(JSONB)
    ip_address = Column(String(45))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
