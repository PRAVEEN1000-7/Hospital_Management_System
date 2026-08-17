"""
Laboratory module models — test catalog, doctor-authored orders, per-test
result rows, and billing.

Mirrors the Optical module's shape (see models/optical.py): LabOrder is the
doctor-authored order created from the Prescription Builder (analogous to
OpticalPrescription, with an is_finalized flag), fulfilled/billed later by lab
staff. Unlike Optical, results live directly on lab_order_items (there's no
batch/inventory concept to split out the way pharmacy_dispensing_items needs
one), and the queue token lives on LabOrder — not LabSale — because
finalize_prescription hands out a token the moment the doctor finalizes,
before any bill exists (see billing_queue_service.get_or_assign_visit_token).
"""
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer, Text,
    ForeignKey, UniqueConstraint, Numeric,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class LabTest(Base):
    """Test catalog — one row per orderable test, per hospital."""
    __tablename__ = "lab_tests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(200), nullable=False)
    code = Column(String(30), nullable=False)
    category = Column(String(100))
    sample_type = Column(String(50))
    price = Column(Numeric(12, 2), nullable=False, default=0)
    unit = Column(String(30))
    reference_range = Column(String(200))
    turnaround_hours = Column(Integer)
    is_active = Column(Boolean, default=True)
    # Structured report layout — list of {name, unit, reference_range, sequence}.
    # Null/empty means result entry falls back to a single free-text row.
    report_template = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("hospital_id", "code", name="uq_lab_test_code"),
    )

    hospital = relationship("Hospital", foreign_keys=[hospital_id])


class LabTestPanel(Base):
    """Named bundle of catalog tests (e.g. "MHC — Master Health Checkup")
    that a doctor can select as one unit from the Prescription Builder,
    expanding into that many individual test_ids on the order — same
    "pick a bundle, order everything under it" idea as the on-screen
    per-category "Select all" checkbox, just spanning multiple categories.
    test_ids has no DB-level FK (arrays can't carry one) — same accepted
    tradeoff as SubscriptionPlan.modules_included."""
    __tablename__ = "lab_test_panels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(200), nullable=False)
    code = Column(String(30), nullable=False)
    test_ids = Column(ARRAY(UUID(as_uuid=True)), nullable=False, default=list)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("hospital_id", "code", name="uq_lab_test_panel_code"),
    )

    hospital = relationship("Hospital", foreign_keys=[hospital_id])


class LabOrder(Base):
    """Doctor's order — mirrors OpticalPrescription, and carries the queue
    fields (see module docstring on why the token lives here)."""
    __tablename__ = "lab_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    order_number = Column(String(30), unique=True, nullable=False, index=True)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"), nullable=True)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id"))
    prescription_id = Column(UUID(as_uuid=True), ForeignKey("prescriptions.id"))
    notes = Column(Text)
    is_finalized = Column(Boolean, default=False)
    status = Column(String(20), default="ordered")  # 'ordered','in_progress','completed','cancelled'

    # Report lifecycle — distinct from is_finalized (which is set when the
    # doctor finalizes the parent Prescription, before any lab work happens).
    # 'pending' -> 'completed' (every item resulted) -> 'finalized' (locked,
    # visible to the doctor). See finalize_lab_report in lab_service.py.
    report_status = Column(String(20), default="pending")
    finalized_at = Column(DateTime(timezone=True))
    finalized_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    # Lab queue — token assigned at finalize time, shared shape with the
    # pharmacy/optical daily-token sequence (see billing_queue_service.py).
    queue_token = Column(Integer)
    queue_status = Column(String(20), default="waiting")  # 'waiting','being_served','collected'
    queue_called_at = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    patient = relationship("Patient", foreign_keys=[patient_id])
    doctor = relationship("Doctor", foreign_keys=[doctor_id])
    items = relationship("LabOrderItem", back_populates="order", cascade="all, delete-orphan")


class LabOrderItem(Base):
    """One row per ordered test; also holds that test's eventual result.
    test_name is a snapshot at order time (same pattern as
    PrescriptionItem.medicine_name) — this is what every clinical/doctor-
    facing view shows, and it never changes after order creation except via
    an explicit catalog-test swap (see update_lab_order_item_test).

    price is NOT derived from the catalog — LabTest.price is always ₹0 (see
    LabTestCreate/LabTestUpdate), so every item starts at ₹0 and billing
    staff enters the real amount at collection time (see
    update_lab_order_item_billing). billed_name is an optional, independent
    override of test_name used only for billing-facing output (invoice,
    billing worklist) — when unset, those fall back to test_name too."""
    __tablename__ = "lab_order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lab_order_id = Column(UUID(as_uuid=True), ForeignKey("lab_orders.id"), nullable=False)
    lab_test_id = Column(UUID(as_uuid=True), ForeignKey("lab_tests.id"), nullable=False)
    test_name = Column(String(200), nullable=False)
    billed_name = Column(String(200))
    price = Column(Numeric(12, 2), nullable=False, default=0)
    status = Column(String(20), default="ordered")  # 'ordered','sample_collected','in_progress','completed','cancelled'
    result_value = Column(String(200))
    result_unit = Column(String(30))
    reference_range = Column(String(200))
    result_flag = Column(String(20))  # 'normal','high','low','abnormal'
    result_notes = Column(Text)
    # Structured result rows — list of {name, value, unit, reference_range,
    # flag, sequence}. The legacy single-value columns above are kept only as
    # a read fallback for rows entered before this column existed.
    parameters = Column(JSONB)
    resulted_at = Column(DateTime(timezone=True))
    resulted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    order = relationship("LabOrder", back_populates="items")
    test = relationship("LabTest", foreign_keys=[lab_test_id])


class LabSale(Base):
    """Billing header — created when lab staff starts checkout. Mirrors
    OpticalSale's payment columns, minus the queue fields (those live on
    LabOrder instead)."""
    __tablename__ = "lab_sales"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    sale_number = Column(String(30), unique=True, nullable=False, index=True)
    lab_order_id = Column(UUID(as_uuid=True), ForeignKey("lab_orders.id"), nullable=False)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"))
    subtotal = Column(Numeric(12, 2), default=0)
    discount_amount = Column(Numeric(12, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(12, 2), default=0)
    payment_method = Column(String(20), default="cash")
    payment_status = Column(String(20), default="pending")  # 'pending','partial','paid'
    amount_tendered = Column(Numeric(12, 2), default=0)
    advance_amount = Column(Numeric(12, 2), default=0)
    paid_amount = Column(Numeric(12, 2), default=0)
    balance_amount = Column(Numeric(12, 2), default=0)
    status = Column(String(20), default="pending")  # 'pending','completed','cancelled'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("lab_order_id", name="uq_lab_sale_order"),
    )

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    patient = relationship("Patient", foreign_keys=[patient_id])
    order = relationship("LabOrder", foreign_keys=[lab_order_id])


class LabReferral(Base):
    """External referral letter — e.g. to a consultant radiologist for an
    investigation this hospital doesn't perform in-house. Filled and printed
    by lab staff; independent of LabOrder/LabTest since it's a printed
    document, not a billable/orderable test."""
    __tablename__ = "lab_referrals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    referral_number = Column(String(30), unique=True, nullable=False, index=True)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    recipient_title = Column(String(200), nullable=False)       # e.g. "THE CONSULTANT RADIOLOGIST"
    recipient_location = Column(String(200))                    # e.g. "GOBI - 638 452"
    case_details = Column(Text)                                 # "A case of ..."
    investigation = Column(String(200), nullable=False)         # e.g. "CT NECK/THYROID"
    remarks = Column(Text)
    referring_doctor_name = Column(String(200), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    patient = relationship("Patient", foreign_keys=[patient_id])
