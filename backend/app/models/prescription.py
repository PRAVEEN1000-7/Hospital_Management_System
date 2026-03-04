"""
Prescription & Medicine models — matches new hms_db UUID schema.
Includes: Medicine, Prescription, PrescriptionItem, PrescriptionTemplate, PrescriptionVersion
"""
import uuid
from sqlalchemy import (
    Column, String, Date, Boolean, DateTime, Integer,
    ForeignKey, Text, Numeric, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Medicine(Base):
    """Hospital medicine formulary."""
    __tablename__ = "medicines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(200), nullable=False)
    generic_name = Column(String(200), nullable=False)
    category = Column(String(50))  # 'tablet','capsule','syrup','injection','cream','drops'
    manufacturer = Column(String(200))
    composition = Column(Text)
    strength = Column(String(50))
    unit_of_measure = Column(String(20), nullable=False)  # 'strip','bottle','tube','vial','box'
    units_per_pack = Column(Integer, default=1)
    hsn_code = Column(String(20))
    sku = Column(String(50))
    barcode = Column(String(50))
    requires_prescription = Column(Boolean, default=True)
    is_controlled = Column(Boolean, default=False)
    selling_price = Column(Numeric(12, 2), nullable=False)
    purchase_price = Column(Numeric(12, 2))
    tax_config_id = Column(UUID(as_uuid=True), ForeignKey("tax_configurations.id"), nullable=True)
    reorder_level = Column(Integer, default=10)
    max_stock_level = Column(Integer)
    storage_instructions = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id])


class Prescription(Base):
    """Doctor prescriptions for patients."""
    __tablename__ = "prescriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    prescription_number = Column(String(30), unique=True, nullable=False, index=True)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id"), nullable=True)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"), nullable=False)
    diagnosis = Column(Text)
    clinical_notes = Column(Text)
    advice = Column(Text)
    version = Column(Integer, default=1)
    status = Column(String(20), default="draft")  # 'draft','finalized','dispensed','partially_dispensed'
    is_finalized = Column(Boolean, default=False)
    finalized_at = Column(DateTime(timezone=True))
    valid_until = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_deleted = Column(Boolean, default=False)

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    patient = relationship("Patient", backref="prescriptions")
    doctor = relationship("Doctor", foreign_keys=[doctor_id], backref="prescriptions")
    appointment = relationship("Appointment", foreign_keys=[appointment_id], backref="prescriptions")
    items = relationship("PrescriptionItem", back_populates="prescription", cascade="all, delete-orphan",
                          order_by="PrescriptionItem.display_order")
    versions = relationship("PrescriptionVersion", back_populates="prescription", cascade="all, delete-orphan")


class PrescriptionItem(Base):
    """Individual medicine items in a prescription."""
    __tablename__ = "prescription_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prescription_id = Column(UUID(as_uuid=True), ForeignKey("prescriptions.id", ondelete="CASCADE"), nullable=False)
    medicine_id = Column(UUID(as_uuid=True), ForeignKey("medicines.id"), nullable=True)
    medicine_name = Column(String(200), nullable=False)
    generic_name = Column(String(200))
    dosage = Column(String(50), nullable=False)
    frequency = Column(String(50), nullable=False)  # e.g., '1-0-1'
    duration_value = Column(Integer)
    duration_unit = Column(String(10))  # 'days','weeks','months'
    route = Column(String(30))  # 'oral','topical','injection','inhalation'
    instructions = Column(Text)
    quantity = Column(Integer)
    allow_substitution = Column(Boolean, default=True)
    is_dispensed = Column(Boolean, default=False)
    dispensed_quantity = Column(Integer, default=0)
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    prescription = relationship("Prescription", back_populates="items")
    medicine = relationship("Medicine", foreign_keys=[medicine_id])


class PrescriptionTemplate(Base):
    """Reusable prescription templates for doctors."""
    __tablename__ = "prescription_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"), nullable=False)
    name = Column(String(100), nullable=False)
    diagnosis = Column(String(255))
    items = Column(JSONB, nullable=False)  # Array of item definitions
    advice = Column(Text)
    is_active = Column(Boolean, default=True)
    usage_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    doctor = relationship("Doctor", foreign_keys=[doctor_id], backref="prescription_templates")


class PrescriptionVersion(Base):
    """Prescription version snapshot history."""
    __tablename__ = "prescription_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prescription_id = Column(UUID(as_uuid=True), ForeignKey("prescriptions.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    snapshot = Column(JSONB, nullable=False)
    changed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    change_reason = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    prescription = relationship("Prescription", back_populates="versions")
