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
    # OPD session timings (HH:MM, 24h) — the clinic's standard morning/evening
    # sessions. Used to pre-fill the Doctor Schedule form (start = morning start,
    # break = morning end → evening start, end = evening end) instead of the old
    # hardcoded 09:00–17:00. Stored as strings to match the <input type="time">
    # values the frontend sends and the string times the schedule form uses.
    opd_morning_start_time = Column(String(5), default="10:00")
    opd_morning_end_time = Column(String(5), default="14:00")
    opd_evening_start_time = Column(String(5), default="17:00")
    opd_evening_end_time = Column(String(5), default="20:30")
    allow_walk_in = Column(Boolean, default=True)
    allow_emergency_bypass = Column(Boolean, default=True)
    allow_opd_credit = Column(Boolean, default=True)
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
    # Queue Display customization (BRD v1.1 §3.4, QD-04/05/06) — eye-hospital feature pack only
    queue_display_show_doctor2 = Column(Boolean, default=True)
    queue_display_show_pharmacy = Column(Boolean, default=True)
    queue_display_show_opthal = Column(Boolean, default=True)
    queue_display_refresh_seconds = Column(Integer, default=10)
    queue_display_doctor1_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"))
    queue_display_doctor2_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    from sqlalchemy.orm import relationship
    hospital = relationship("Hospital", foreign_keys=[hospital_id])


class QueueDisplayScreen(Base):
    """BRD-005 — one named public queue-display screen per row. Purely
    additive alongside HospitalSettings' single legacy queue_display_*
    columns above; a hospital can have any number of these."""
    __tablename__ = "queue_display_screens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    slug = Column(String(50), nullable=False)
    display_name = Column(String(150), nullable=False)
    department_id = Column(UUID(as_uuid=True), ForeignKey("departments.id"))
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"))
    show_doctor2 = Column(Boolean, nullable=False, default=False)
    doctor2_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"))
    show_pharmacy = Column(Boolean, nullable=False, default=False)
    show_opthal = Column(Boolean, nullable=False, default=False)
    token_format = Column(String(50), nullable=False, default="#{n}")
    refresh_seconds = Column(Integer, nullable=False, default=10)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    from sqlalchemy.orm import relationship as _relationship
    department = _relationship("Department", foreign_keys=[department_id])
    doctor = _relationship("Doctor", foreign_keys=[doctor_id])
    doctor2 = _relationship("Doctor", foreign_keys=[doctor2_id])

    @property
    def is_configured(self) -> bool:
        """BRD-005 'validate mandatory settings' — all 5 mandatory fields
        (Display Name, Department, Doctor, Screen/slug, Token Format) must be
        set for this screen to be considered ready for public display."""
        return bool(
            self.display_name and self.display_name.strip()
            and self.department_id
            and self.doctor_id
            and self.slug and self.slug.strip()
            and self.token_format and self.token_format.strip()
        )
