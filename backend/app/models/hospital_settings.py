"""
HospitalSettings model — matches hms_db schema.
"""
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer, Text, ForeignKey
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import Base


class HospitalSettings(Base):
    """Hospital-specific settings."""
    __tablename__ = "hospital_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False, unique=True)
    hospital_code = Column(String(2), nullable=False)
    patient_id_start_number = Column(Integer, default=1)
    patient_id_sequence = Column(Integer, default=0)
    staff_id_start_number = Column(Integer, default=1)
    staff_id_sequence = Column(Integer, default=0)
    invoice_prefix = Column(String(10), default="INV")
    invoice_sequence = Column(Integer, default=0)
    prescription_prefix = Column(String(10), default="RX")
    prescription_sequence = Column(Integer, default=0)
    appointment_slot_duration_minutes = Column(Integer, default=15)
    appointment_buffer_minutes = Column(Integer, default=5)
    max_daily_appointments_per_doctor = Column(Integer, default=40)
    allow_walk_in = Column(Boolean, default=True)
    allow_emergency_bypass = Column(Boolean, default=True)
    enable_sms_notifications = Column(Boolean, default=False)
    enable_email_notifications = Column(Boolean, default=True)
    enable_whatsapp_notifications = Column(Boolean, default=False)
    consultation_fee_default = Column(String(20), default="0")
    follow_up_validity_days = Column(Integer, default=7)
    data_retention_years = Column(Integer, default=7)
    branding_primary_color = Column(String(7), default="#1E40AF")
    branding_secondary_color = Column(String(7), default="#3B82F6")
    print_header_text = Column(Text)
    print_footer_text = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    from sqlalchemy.orm import relationship
    hospital = relationship("Hospital", foreign_keys=[hospital_id])
