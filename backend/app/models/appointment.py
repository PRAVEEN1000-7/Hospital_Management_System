"""
Appointment models — matches new hms_db UUID schema.
Includes: Doctor, DoctorSchedule, DoctorLeave, Appointment, AppointmentStatusLog, AppointmentQueue
"""
import uuid
from sqlalchemy import (
    Column, String, Date, Time, Boolean, DateTime, Integer,
    ForeignKey, Text, Numeric, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Doctor(Base):
    """Doctors table — links to users with doctor role."""
    __tablename__ = "doctors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    department_id = Column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=True)
    employee_id = Column(String(30))
    specialization = Column(String(100), nullable=False)
    qualification = Column(String(255), nullable=False)
    registration_number = Column(String(50), nullable=False)
    registration_authority = Column(String(100))
    experience_years = Column(Integer)
    bio = Column(Text)
    doctor_sequence = Column(Integer)  # 1, 2, or 3 for workflow
    consultation_fee = Column(Numeric(12, 2), default=0)
    follow_up_fee = Column(Numeric(12, 2), default=0)
    is_available = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_deleted = Column(Boolean, default=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="doctor_profile")
    hospital = relationship("Hospital", foreign_keys=[hospital_id])


class DoctorSchedule(Base):
    """Doctor weekly schedules."""
    __tablename__ = "doctor_schedules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Sunday, 6=Saturday
    shift_name = Column(String(50), default="default")
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    break_start_time = Column(Time)
    break_end_time = Column(Time)
    slot_duration_minutes = Column(Integer, nullable=False, default=15)
    max_patients = Column(Integer, default=20)
    is_active = Column(Boolean, default=True)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("doctor_id", "day_of_week", "shift_name", "effective_from", name="uq_doctor_schedule"),
    )

    # Relationships
    doctor = relationship("Doctor", backref="schedules")


class DoctorLeave(Base):
    """Doctor leaves."""
    __tablename__ = "doctor_leaves"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False)
    leave_date = Column(Date, nullable=False)
    leave_type = Column(String(30), default="full_day")  # 'full_day','morning','afternoon'
    reason = Column(String(255))
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    status = Column(String(20), default="approved")  # 'pending','approved','rejected'
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("doctor_id", "leave_date", "leave_type", name="uq_doctor_leave"),
    )

    # Relationships
    doctor = relationship("Doctor", backref="leaves")


class DoctorFee(Base):
    """Doctor fee structures."""
    __tablename__ = "doctor_fees"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False)
    fee_type = Column(String(30), nullable=False)  # 'consultation','follow_up','procedure'
    service_name = Column(String(100), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), default="USD")
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Appointment(Base):
    """Patient appointments."""
    __tablename__ = "appointments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    appointment_number = Column(String(30), unique=True, nullable=False, index=True)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"), nullable=True)
    department_id = Column(UUID(as_uuid=True), ForeignKey("departments.id"))
    appointment_date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time)
    appointment_type = Column(String(20), nullable=False)  # 'scheduled','walk_in','emergency','follow_up'
    visit_type = Column(String(20), default="new")  # 'new','follow_up'
    priority = Column(String(10), default="normal")  # 'normal','urgent','emergency'
    status = Column(String(20), nullable=False, default="scheduled")
    current_doctor_sequence = Column(Integer, default=1)
    parent_appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id"))
    chief_complaint = Column(Text)
    cancel_reason = Column(String(255))
    reschedule_reason = Column(String(255))
    reschedule_count = Column(Integer, default=0)
    check_in_at = Column(DateTime(timezone=True))
    consultation_start_at = Column(DateTime(timezone=True))
    consultation_end_at = Column(DateTime(timezone=True))
    notes = Column(Text)
    consultation_fee = Column(Numeric(12, 2))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_deleted = Column(Boolean, default=False)

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    patient = relationship("Patient", backref="appointments")
    doctor = relationship("Doctor", foreign_keys=[doctor_id], backref="appointments")


class AppointmentStatusLog(Base):
    """Appointment status change history."""
    __tablename__ = "appointment_status_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False)
    from_status = Column(String(20))
    to_status = Column(String(20), nullable=False)
    changed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    appointment = relationship("Appointment", backref="status_logs")


class AppointmentQueue(Base):
    """Real-time queue management for appointments."""
    __tablename__ = "appointment_queue"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"), nullable=False)
    queue_date = Column(Date, nullable=False)
    queue_number = Column(Integer, nullable=False)
    position = Column(Integer, nullable=False)
    status = Column(String(20), default="waiting")  # 'waiting','called','in_consultation','completed','skipped'
    called_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("doctor_id", "queue_date", "queue_number", name="uq_doctor_queue"),
    )

    # Relationships
    appointment = relationship("Appointment", backref="queue_entries")
    doctor = relationship("Doctor")

