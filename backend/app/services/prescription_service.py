"""
Prescription service — handles CRUD for prescriptions, items, templates, medicines.
Follows the same patterns as appointment_service.py.
"""
import uuid
import json
import logging
import re
from datetime import date, datetime, timezone
from math import ceil
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_, case

from ..models.prescription import (
    Prescription, PrescriptionItem, PrescriptionTemplate,
    PrescriptionVersion, Medicine,
)
from ..models.appointment import Doctor, Appointment
from ..models.patient import Patient
from ..models.user import User
from ..models.hospital_settings import HospitalSettings
from .notification_service import notify_hospital_users
from ..models.pharmacy import PharmacySale, PharmacySaleItem, PharmacyQueueEntry
from ..models.user import Hospital
from ..core.tenant_security import is_eye_hospital_feature_enabled
from ..core.hospital_time import hospital_today_by_id

logger = logging.getLogger(__name__)


_LIQUID_CATEGORIES = frozenset({
    "syrup", "suspension", "liquid", "solution", "linctus", "elixir", "tincture",
})
_SINGLE_UNIT_CATEGORIES = frozenset({
    "drops", "eye drops", "ear drops", "nasal drops", "nasal spray",
    "cream", "ointment", "gel", "lotion", "paste",
    "inhaler", "spray", "patch", "suppository",
})


def calculate_prescribed_quantity(
    frequency: Optional[str],
    duration_value: Optional[int],
    duration_unit: Optional[str],
    quantity: Optional[int] = None,
    category: Optional[str] = None,
    unit_of_measure: Optional[str] = None,
    units_per_pack: Optional[int] = None,
) -> Optional[int]:
    """
    Derive total dispensing units from frequency/duration, accounting for medicine category.

    Stock is tracked in pack units (strips, bottles, tubes, vials):
    - Tablets/Capsules: doses ÷ units_per_pack → strips
    - Syrup/Suspension: 1 bottle per 5 days
    - Cream/Drops/Inhaler: 1 pack per treatment course
    - Injection: doses (1 vial per dose)

    When category/uom/uop are not passed (legacy callers) the old dose-count
    formula is used unchanged for backward compatibility.
    """
    if quantity is not None and quantity > 0:
        return quantity

    cat = (category or "").lower().strip()
    uom = (unit_of_measure or "").lower().strip()
    uop = max(1, units_per_pack or 1)

    # No frequency at all means there's no dose-frequency data to compute from
    # — this is the Eye Hospital Drug Prescription format (medicine + eye_side
    # + free-text dosage instructions only, BRD v1.1 — never collects
    # frequency/duration), or any other free-text-only entry. Single-unit
    # categories (drops/ointment/cream/inhaler, including "eye drops"/
    # "eye ointment") still mean one whole pack; anything else defaults to 1
    # rather than None — returning nothing here previously broke dispensing
    # (no quantity to dispense) and invoice calculation (nothing to total)
    # for the whole item.
    if not frequency:
        if cat in _SINGLE_UNIT_CATEGORIES or uom == "tube":
            return 1
        return quantity or 1

    if not duration_value or duration_value <= 0:
        return quantity

    frequency_parts = re.findall(r"\d+(?:\.\d+)?", frequency)
    if not frequency_parts:
        return quantity

    daily_units = sum(float(part) for part in frequency_parts)
    if daily_units <= 0:
        return quantity

    norm_unit = (duration_unit or "days").lower()
    duration_days = duration_value
    if norm_unit == "weeks":
        duration_days = duration_value * 7
    elif norm_unit == "months":
        duration_days = duration_value * 30

    # ── Liquid medicines (syrup, suspension …) ──────────────────────────────
    # Dispensed per bottle; clinical standard ≈ 1 bottle per 5 days (100 ml).
    if cat in _LIQUID_CATEGORIES or (uom == "bottle" and cat not in ("drops",)):
        return max(1, ceil(duration_days / 5))

    # ── Single-unit topicals / devices ──────────────────────────────────────
    # Creams, drops, inhalers: one pack covers the whole course.
    if cat in _SINGLE_UNIT_CATEGORIES or uom == "tube":
        return 1

    # ── Dose-counted medicines (tablets, capsules, injections) ──────────────
    total_doses = ceil(daily_units * duration_days)
    if uop > 1:
        # Stock tracked in packs (strips/blisters). Convert doses → packs.
        return max(1, ceil(total_doses / uop))

    return total_doses if total_doses > 0 else quantity


# ═══════════════════════════════════════════════════════════════════════════
# Prescription Number Generation
# ═══════════════════════════════════════════════════════════════════════════

def generate_prescription_number(db: Session, hospital_id: uuid.UUID) -> str:
    """
    Generate a globally-unique prescription number: {PREFIX}-{HOSPITAL_CODE}-{YY}-{NNNNN}

    Format e.g. RX-PF-26-00001.

    The `prescriptions_prescription_number_key` constraint is global, so the
    number MUST embed the per-hospital code — otherwise two tenants both using
    the default "RX" prefix collide. Uses hospital_settings.prescription_sequence
    with a row-level lock (serialises per hospital) plus an existence check that
    self-heals when the counter has drifted behind real data.
    """
    # Lock the hospital's settings row to serialise concurrent prescription creates.
    settings = db.query(HospitalSettings).filter(
        HospitalSettings.hospital_id == hospital_id
    ).with_for_update().first()

    if not settings:
        # No settings row yet — create a default one so we have a lockable counter.
        from ..models.user import Hospital
        logger.warning(f"No hospital settings found for hospital_id={hospital_id}; creating defaults")
        hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
        raw_code = (getattr(hospital, "code", None) or getattr(hospital, "name", None) or "HC")
        hcode = "".join(c for c in str(raw_code) if c.isalnum()).upper().ljust(2, "X")[:2]
        settings = HospitalSettings(hospital_id=hospital_id, hospital_code=hcode)
        db.add(settings)
        db.flush()

    prefix = (settings.prescription_prefix or "RX").strip() or "RX"
    hcode = (settings.hospital_code or "HC").strip() or "HC"
    year_code = date.today().strftime("%y")  # 2-digit year
    sequence = settings.prescription_sequence or 0

    # Advance until we land on a number that is not already taken. This recovers
    # gracefully if the counter is behind the real maximum for any reason.
    while True:
        sequence += 1
        candidate = f"{prefix}-{hcode}-{year_code}-{sequence:05d}"
        exists = db.query(Prescription.id).filter(
            Prescription.prescription_number == candidate
        ).first()
        if not exists:
            break

    settings.prescription_sequence = sequence
    db.flush()  # Persist the counter within this transaction

    return candidate


# ═══════════════════════════════════════════════════════════════════════════
# Prescription CRUD
# ═══════════════════════════════════════════════════════════════════════════

def _eye_hospital_features_enabled(db: Session, hospital_id: uuid.UUID) -> bool:
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    return is_eye_hospital_feature_enabled(hospital) if hospital else False


def create_prescription(
    db: Session,
    data: dict,
    created_by: uuid.UUID,
    hospital_id: uuid.UUID,
) -> Prescription:
    """Create a new prescription with optional items."""
    rx_number = generate_prescription_number(db, hospital_id)
    eye_features = _eye_hospital_features_enabled(db, hospital_id)

    # Convert string UUIDs
    patient_id = data.get("patient_id")
    if isinstance(patient_id, str):
        patient_id = uuid.UUID(patient_id)

    doctor_id = data.get("doctor_id")
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)

    appointment_id = data.get("appointment_id")
    if isinstance(appointment_id, str) and appointment_id:
        appointment_id = uuid.UUID(appointment_id)
    else:
        appointment_id = None

    # Validate appointment belongs to the same hospital (multi-tenant guard)
    if appointment_id:
        appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appt or str(appt.hospital_id) != str(hospital_id):
            raise ValueError("Appointment not found or belongs to a different hospital")

    # If no doctor_id provided, look up doctor by current user
    if not doctor_id:
        doctor = db.query(Doctor).filter(Doctor.user_id == created_by).first()
        if doctor:
            doctor_id = doctor.id
        else:
            raise ValueError("No doctor_id provided and current user is not a doctor")

    rx = Prescription(
        hospital_id=hospital_id,
        prescription_number=rx_number,
        patient_id=patient_id,
        doctor_id=doctor_id,
        appointment_id=appointment_id,
        diagnosis=data.get("diagnosis"),
        clinical_notes=data.get("clinical_notes"),
        advice=data.get("advice"),
        vitals_bp=data.get("vitals_bp"),
        vitals_pulse=data.get("vitals_pulse"),
        vitals_temp=data.get("vitals_temp"),
        vitals_weight=data.get("vitals_weight"),
        vitals_spo2=data.get("vitals_spo2"),
        vitals_blood_sugar=data.get("vitals_blood_sugar") if eye_features else None,
        follow_up_date=data.get("follow_up_date"),
        queue_id=uuid.UUID(data["queue_id"]) if data.get("queue_id") else None,
        valid_until=data.get("valid_until"),
        institution_id=(uuid.UUID(data["institution_id"]) if data.get("institution_id") else None) if eye_features else None,
        is_opthal=data.get("is_opthal") if eye_features else False,
        opthal_notes=data.get("opthal_notes") if eye_features else None,
        status="draft",
        created_by=created_by,
    )
    db.add(rx)
    db.flush()  # Get the ID before adding items

    # Add prescription items
    items_data = data.get("items", [])
    for idx, item_data in enumerate(items_data):
        medicine_id = item_data.get("medicine_id")
        if isinstance(medicine_id, str) and medicine_id:
            medicine_id = uuid.UUID(medicine_id)
        else:
            medicine_id = None

        # Look up medicine for category-aware quantity calculation
        med = db.query(Medicine).filter(Medicine.id == medicine_id).first() if medicine_id else None

        item = PrescriptionItem(
            prescription_id=rx.id,
            medicine_id=medicine_id,
            medicine_name=item_data["medicine_name"],
            generic_name=item_data.get("generic_name"),
            dosage=item_data["dosage"],
            frequency=item_data["frequency"],
            duration_value=item_data.get("duration_value"),
            duration_unit=item_data.get("duration_unit"),
            route=item_data.get("route"),
            instructions=item_data.get("instructions"),
            quantity=calculate_prescribed_quantity(
                item_data.get("frequency"),
                item_data.get("duration_value"),
                item_data.get("duration_unit"),
                item_data.get("quantity"),
                category=med.category if med else None,
                unit_of_measure=med.unit_of_measure if med else None,
                units_per_pack=med.units_per_pack if med else None,
            ),
            allow_substitution=item_data.get("allow_substitution", True),
            display_order=item_data.get("display_order", idx),
            eye_side=item_data.get("eye_side"),
        )
        db.add(item)

    db.commit()
    db.refresh(rx)

    # Create initial version snapshot
    _save_version_snapshot(db, rx, created_by, "Initial creation")

    return rx


def get_prescription(
    db: Session,
    prescription_id: str | uuid.UUID,
    hospital_id=None,
) -> Optional[Prescription]:
    """Get prescription by ID."""
    if isinstance(prescription_id, str):
        try:
            prescription_id = uuid.UUID(prescription_id)
        except ValueError:
            return None
    q = db.query(Prescription).filter(
        Prescription.id == prescription_id,
        Prescription.is_deleted == False,
    )
    if hospital_id is not None:
        q = q.filter(Prescription.hospital_id == hospital_id)
    return q.first()


def get_prescription_by_number(db: Session, rx_number: str) -> Optional[Prescription]:
    """Get prescription by prescription number."""
    return db.query(Prescription).filter(
        Prescription.prescription_number == rx_number,
        Prescription.is_deleted == False,
    ).first()


def list_prescriptions(
    db: Session,
    page: int = 1,
    limit: int = 10,
    hospital_id: Optional[uuid.UUID] = None,
    doctor_id: Optional[str | uuid.UUID] = None,
    patient_id: Optional[str | uuid.UUID] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
):
    """List prescriptions with filters and pagination."""
    q = db.query(Prescription).filter(Prescription.is_deleted == False)

    if hospital_id:
        q = q.filter(Prescription.hospital_id == hospital_id)

    if doctor_id:
        if isinstance(doctor_id, str):
            doctor_id = uuid.UUID(doctor_id)
        q = q.filter(Prescription.doctor_id == doctor_id)

    if patient_id:
        if isinstance(patient_id, str):
            patient_id = uuid.UUID(patient_id)
        q = q.filter(Prescription.patient_id == patient_id)

    if status:
        q = q.filter(Prescription.status == status)

    if date_from:
        q = q.filter(func.date(Prescription.created_at) >= date_from)

    if date_to:
        q = q.filter(func.date(Prescription.created_at) <= date_to)

    if search:
        term = f"%{search}%"
        q = q.outerjoin(Patient, Prescription.patient_id == Patient.id).filter(
            or_(
                Prescription.prescription_number.ilike(term),
                Prescription.diagnosis.ilike(term),
                Patient.first_name.ilike(term),
                Patient.last_name.ilike(term),
                func.concat(Patient.first_name, ' ', Patient.last_name).ilike(term),
            )
        )

    total = q.count()
    offset = (page - 1) * limit
    rows = (
        q.order_by(Prescription.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    total_pages = ceil(total / limit) if total > 0 else 0
    return total, page, limit, total_pages, rows


def update_prescription(
    db: Session,
    prescription_id: str | uuid.UUID,
    data: dict,
    performed_by: uuid.UUID,
) -> Optional[Prescription]:
    """Update prescription fields and optionally replace items."""
    rx = get_prescription(db, prescription_id)
    if not rx:
        return None

    if rx.is_finalized:
        raise ValueError("Cannot update a finalized prescription")

    eye_features = _eye_hospital_features_enabled(db, rx.hospital_id)

    # Update top-level fields
    for k in ["diagnosis", "clinical_notes", "advice", "valid_until",
              "vitals_bp", "vitals_pulse", "vitals_temp", "vitals_weight", "vitals_spo2",
              "follow_up_date"]:
        if k in data:
            setattr(rx, k, data[k])

    # Eye-hospital feature pack only — silently ignored for general hospitals.
    if eye_features:
        for k in ["vitals_blood_sugar", "is_opthal", "opthal_notes"]:
            if k in data:
                setattr(rx, k, data[k])
        if "institution_id" in data:
            rx.institution_id = uuid.UUID(data["institution_id"]) if data["institution_id"] else None

    # Replace items if provided
    if "items" in data and data["items"] is not None:
        # Remove existing items
        db.query(PrescriptionItem).filter(
            PrescriptionItem.prescription_id == rx.id
        ).delete()

        # Add new items
        for idx, item_data in enumerate(data["items"]):
            medicine_id = item_data.get("medicine_id")
            if isinstance(medicine_id, str) and medicine_id:
                medicine_id = uuid.UUID(medicine_id)
            else:
                medicine_id = None

            med = db.query(Medicine).filter(Medicine.id == medicine_id).first() if medicine_id else None

            item = PrescriptionItem(
                prescription_id=rx.id,
                medicine_id=medicine_id,
                medicine_name=item_data["medicine_name"],
                generic_name=item_data.get("generic_name"),
                dosage=item_data["dosage"],
                frequency=item_data["frequency"],
                duration_value=item_data.get("duration_value"),
                duration_unit=item_data.get("duration_unit"),
                route=item_data.get("route"),
                instructions=item_data.get("instructions"),
                quantity=calculate_prescribed_quantity(
                    item_data.get("frequency"),
                    item_data.get("duration_value"),
                    item_data.get("duration_unit"),
                    item_data.get("quantity"),
                    category=med.category if med else None,
                    unit_of_measure=med.unit_of_measure if med else None,
                    units_per_pack=med.units_per_pack if med else None,
                ),
                allow_substitution=item_data.get("allow_substitution", True),
                display_order=item_data.get("display_order", idx),
                eye_side=item_data.get("eye_side"),
            )
            db.add(item)

    rx.version = (rx.version or 1) + 1
    db.commit()
    db.refresh(rx)

    _save_version_snapshot(db, rx, performed_by, "Updated prescription")
    return rx


def finalize_prescription(
    db: Session,
    prescription_id: str | uuid.UUID,
    performed_by: uuid.UUID,
) -> Optional[Prescription]:
    """Finalize a prescription (lock it).

    Note: Stock validation is handled during dispensing, not at doctor finalization
    time. This allows doctors to finalize and complete consultation even when one
    or more medicines are out of stock.
    """
    rx = get_prescription(db, prescription_id)
    if not rx:
        return None

    if rx.is_finalized:
        raise ValueError("Prescription is already finalized")

    # Must have at least one item, unless it is an eye hospital and there is an optical prescription
    item_count = db.query(PrescriptionItem).filter(
        PrescriptionItem.prescription_id == rx.id
    ).count()
    if item_count == 0:
        is_eye = _eye_hospital_features_enabled(db, rx.hospital_id)
        has_optical = False
        if is_eye:
            from ..models.optical import OpticalPrescription
            from datetime import date
            if rx.appointment_id:
                has_optical = db.query(OpticalPrescription).filter(
                    OpticalPrescription.appointment_id == rx.appointment_id
                ).count() > 0
            else:
                has_optical = db.query(OpticalPrescription).filter(
                    OpticalPrescription.patient_id == rx.patient_id,
                    OpticalPrescription.doctor_id == rx.doctor_id,
                    func.date(OpticalPrescription.created_at) == hospital_today_by_id(db, rx.hospital_id),
                ).count() > 0

        if not has_optical:
            raise ValueError("Cannot finalize a prescription with no items")

    # ✅ FIX BUG #1: Check stock availability before finalizing
    from ..models.pharmacy import MedicineBatch
    from datetime import date

    items = db.query(PrescriptionItem).filter(
        PrescriptionItem.prescription_id == rx.id
    ).all()

    stock_warnings = []
    for item in items:
        required_quantity = calculate_prescribed_quantity(
            item.frequency,
            item.duration_value,
            item.duration_unit,
            item.quantity,
        )

        if item.quantity != required_quantity:
            item.quantity = required_quantity

        if item.medicine_id and required_quantity:
            # Check available stock from batches (FEFO - First Expiry First Out)
            batches = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == item.medicine_id,
                MedicineBatch.is_active == True,
                MedicineBatch.expiry_date > date.today(),  # Only consider non-expired batches
                MedicineBatch.quantity > 0,
            ).order_by(MedicineBatch.expiry_date.asc()).all()

            total_available = sum(batch.quantity for batch in batches)

            if total_available == 0:
                stock_warnings.append(
                    f"'{item.medicine_name}' is out of stock. Required: {required_quantity}, Available: 0"
                )
            elif total_available < required_quantity:
                stock_warnings.append(
                    f"'{item.medicine_name}' has insufficient stock. Required: {required_quantity}, Available: {total_available}"
                )

    # Do not block doctor finalization on stock; pharmacy handles stock at dispensing.
    if stock_warnings:
        logger.warning(
            "Prescription %s finalized with stock warnings: %s",
            rx.prescription_number,
            " | ".join(stock_warnings),
        )

    rx.status = "finalized"
    rx.is_finalized = True
    rx.finalized_at = datetime.now(timezone.utc)
    rx.version = (rx.version or 1) + 1

    # Also finalize the corresponding optical prescription if one exists
    if _eye_hospital_features_enabled(db, rx.hospital_id):
        from ..models.optical import OpticalPrescription
        opt_rx = None
        if rx.appointment_id:
            opt_rx = db.query(OpticalPrescription).filter(
                OpticalPrescription.appointment_id == rx.appointment_id
            ).first()
        else:
            opt_rx = db.query(OpticalPrescription).filter(
                OpticalPrescription.patient_id == rx.patient_id,
                OpticalPrescription.doctor_id == rx.doctor_id,
                func.date(OpticalPrescription.created_at) == hospital_today_by_id(db, rx.hospital_id),
            ).first()
        if opt_rx:
            opt_rx.is_finalized = True

    # Pharmacy Queue (BRD v1.1 PQ-02) — eye-hospital feature pack only.
    # A token is assigned right here, at submission, well before any bill
    # exists — see billing_queue_service.enqueue_pharmacy_queue_entry.
    if _eye_hospital_features_enabled(db, rx.hospital_id) and any(item.medicine_id for item in items):
        from .billing_queue_service import enqueue_pharmacy_queue_entry
        doctor = db.query(Doctor).filter(Doctor.id == rx.doctor_id).first()
        enqueue_pharmacy_queue_entry(
            db,
            hospital_id=rx.hospital_id,
            prescription=rx,
            patient_id=rx.patient_id,
            doctor_name=f"Dr. {doctor.user.full_name}" if doctor and doctor.user else None,
        )

    db.commit()
    db.refresh(rx)

    # Notify pharmacists that a prescription is ready for dispensing.
    try:
        patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()
        patient_name = f"{patient.first_name} {patient.last_name}".strip() if patient else "a patient"
        notify_hospital_users(
            db=db,
            hospital_id=rx.hospital_id,
            title="Prescription Ready for Dispensing",
            message=f"Prescription {rx.prescription_number} for {patient_name} is ready to dispense.",
            notification_type="prescription",
            priority="normal",
            reference_type="prescription",
            reference_id=rx.id,
            role_names=["pharmacist"],
        )
    except Exception:
        logger.warning("Failed to send prescription finalize notification", exc_info=True)

    _save_version_snapshot(db, rx, performed_by, "Finalized prescription")
    return rx


def delete_prescription(
    db: Session,
    prescription_id: str | uuid.UUID,
    deleted_by: uuid.UUID,
) -> Optional[Prescription]:
    """Soft-delete a prescription."""
    rx = get_prescription(db, prescription_id)
    if not rx:
        return None

    if rx.is_finalized:
        raise ValueError("Cannot delete a finalized prescription")

    rx.is_deleted = True
    db.commit()
    db.refresh(rx)
    return rx


# ═══════════════════════════════════════════════════════════════════════════
# Prescription Enrichment (add patient/doctor names)
# ═══════════════════════════════════════════════════════════════════════════

def enrich_prescription(db: Session, rx: Prescription) -> dict:
    """Add patient and doctor names, plus items."""
    d = {c.name: getattr(rx, c.name) for c in rx.__table__.columns}

    # Stringify UUIDs
    for uuid_col in ["id", "hospital_id", "patient_id", "doctor_id",
                      "appointment_id", "queue_id", "created_by", "institution_id"]:
        if d.get(uuid_col):
            d[uuid_col] = str(d[uuid_col])

    if rx.institution_id:
        from ..models.user import Hospital
        institution = db.query(Hospital).filter(Hospital.id == rx.institution_id).first()
        d["institution_name"] = institution.name if institution else None
    else:
        d["institution_name"] = None

    # Patient name + PRN + full details
    patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()
    d["patient_name"] = patient.full_name if patient else None
    d["patient_reference_number"] = patient.patient_reference_number if patient else None
    d["patient_gender"] = patient.gender if patient else None
    d["patient_date_of_birth"] = str(patient.date_of_birth) if patient and patient.date_of_birth else None
    d["patient_age"] = patient.age_years if patient and hasattr(patient, "age_years") else None
    d["patient_blood_group"] = patient.blood_group if patient else None
    d["patient_phone"] = patient.phone_number if patient else None
    d["patient_email"] = patient.email if patient else None
    d["patient_known_allergies"] = patient.known_allergies if patient else None
    d["patient_chronic_conditions"] = patient.chronic_conditions if patient else None

    # Appointment number
    if rx.appointment_id:
        appt = db.query(Appointment).filter(Appointment.id == rx.appointment_id).first()
        d["appointment_number"] = appt.appointment_number if appt else None
    else:
        d["appointment_number"] = None

    # Doctor name
    if rx.doctor_id:
        doctor = db.query(Doctor).filter(Doctor.id == rx.doctor_id).first()
        if doctor and doctor.user:
            d["doctor_name"] = doctor.user.full_name
        else:
            d["doctor_name"] = None
    else:
        d["doctor_name"] = None

    # Items
    items = db.query(PrescriptionItem).filter(
        PrescriptionItem.prescription_id == rx.id
    ).order_by(PrescriptionItem.display_order).all()

    d["items"] = []
    for item in items:
        item_dict = {c.name: getattr(item, c.name) for c in item.__table__.columns}
        for uid_col in ["id", "prescription_id", "medicine_id"]:
            if item_dict.get(uid_col):
                item_dict[uid_col] = str(item_dict[uid_col])
        d["items"].append(item_dict)

    # Dispensing totals for this prescription (if already dispensed/partially dispensed)
    linked_sales = (
        db.query(PharmacySale.id, PharmacySale.total_amount, PharmacySale.sale_date)
        .join(PharmacySaleItem, PharmacySaleItem.sale_id == PharmacySale.id)
        .join(PrescriptionItem, PrescriptionItem.id == PharmacySaleItem.prescription_item_id)
        .filter(PrescriptionItem.prescription_id == rx.id)
        .distinct()
        .all()
    )

    if linked_sales:
        d["final_amount"] = float(sum((s.total_amount or 0) for s in linked_sales))
        latest_sale_date = max((s.sale_date for s in linked_sales if s.sale_date), default=None)
        d["dispensed_at"] = str(latest_sale_date) if latest_sale_date else None
    else:
        d["final_amount"] = None
        d["dispensed_at"] = None

    return d


def enrich_prescriptions(db: Session, prescriptions: list[Prescription]) -> list[dict]:
    """Batch enrich multiple prescriptions (for list views)."""
    if not prescriptions:
        return []

    # Batch load patients
    patient_ids = {rx.patient_id for rx in prescriptions}
    patients = {p.id: p for p in db.query(Patient).filter(Patient.id.in_(patient_ids)).all()}

    # Batch load doctors
    doctor_ids = {rx.doctor_id for rx in prescriptions if rx.doctor_id}
    doctors = {}
    if doctor_ids:
        doctor_records = db.query(Doctor).filter(Doctor.id.in_(doctor_ids)).all()
        for doc in doctor_records:
            if doc.user:
                doctors[doc.id] = doc.user.full_name

    # Batch load appointment numbers
    appointment_ids = {rx.appointment_id for rx in prescriptions if rx.appointment_id}
    appointment_numbers = {}
    if appointment_ids:
        appt_records = db.query(Appointment).filter(Appointment.id.in_(appointment_ids)).all()
        appointment_numbers = {a.id: a.appointment_number for a in appt_records}

    # Batch load item counts
    item_counts = {}
    rx_ids = [rx.id for rx in prescriptions]
    if rx_ids:
        counts = (
            db.query(PrescriptionItem.prescription_id, func.count(PrescriptionItem.id))
            .filter(PrescriptionItem.prescription_id.in_(rx_ids))
            .group_by(PrescriptionItem.prescription_id)
            .all()
        )
        item_counts = {pid: cnt for pid, cnt in counts}

    result = []
    for rx in prescriptions:
        d = {c.name: getattr(rx, c.name) for c in rx.__table__.columns}
        for uuid_col in ["id", "hospital_id", "patient_id", "doctor_id",
                          "appointment_id", "created_by"]:
            if d.get(uuid_col):
                d[uuid_col] = str(d[uuid_col])

        p = patients.get(rx.patient_id)
        d["patient_name"] = p.full_name if p else None
        d["patient_reference_number"] = p.patient_reference_number if p else None
        d["appointment_number"] = appointment_numbers.get(rx.appointment_id) if rx.appointment_id else None
        d["doctor_name"] = doctors.get(rx.doctor_id)
        d["item_count"] = item_counts.get(rx.id, 0)
        result.append(d)

    return result


# ═══════════════════════════════════════════════════════════════════════════
# Prescription Version Snapshots
# ═══════════════════════════════════════════════════════════════════════════

def _save_version_snapshot(
    db: Session,
    rx: Prescription,
    changed_by: uuid.UUID,
    reason: str,
):
    """Save a version snapshot of the prescription."""
    try:
        items = db.query(PrescriptionItem).filter(
            PrescriptionItem.prescription_id == rx.id
        ).order_by(PrescriptionItem.display_order).all()

        snapshot = {
            "prescription_number": rx.prescription_number,
            "diagnosis": rx.diagnosis,
            "clinical_notes": rx.clinical_notes,
            "advice": rx.advice,
            "status": rx.status,
            "items": [
                {
                    "medicine_name": item.medicine_name,
                    "generic_name": item.generic_name,
                    "dosage": item.dosage,
                    "frequency": item.frequency,
                    "duration_value": item.duration_value,
                    "duration_unit": item.duration_unit,
                    "route": item.route,
                    "instructions": item.instructions,
                    "quantity": calculate_prescribed_quantity(
                        item.frequency,
                        item.duration_value,
                        item.duration_unit,
                        item.quantity,
                    ),
                }
                for item in items
            ],
        }

        version = PrescriptionVersion(
            prescription_id=rx.id,
            version=rx.version or 1,
            snapshot=snapshot,
            changed_by=changed_by,
            change_reason=reason,
        )
        db.add(version)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save version snapshot: {e}")


def get_prescription_versions(
    db: Session,
    prescription_id: str | uuid.UUID,
) -> list[PrescriptionVersion]:
    """Get all version snapshots for a prescription."""
    if isinstance(prescription_id, str):
        prescription_id = uuid.UUID(prescription_id)
    return (
        db.query(PrescriptionVersion)
        .filter(PrescriptionVersion.prescription_id == prescription_id)
        .order_by(PrescriptionVersion.version.desc())
        .all()
    )


# ═══════════════════════════════════════════════════════════════════════════
# Medicine CRUD
# ═══════════════════════════════════════════════════════════════════════════

def create_medicine(
    db: Session,
    data: dict,
    hospital_id: uuid.UUID,
) -> Medicine:
    """Create a new medicine in the formulary."""
    med = Medicine(
        hospital_id=hospital_id,
        name=data["name"],
        generic_name=data["generic_name"],
        category=data.get("category"),
        manufacturer=data.get("manufacturer"),
        composition=data.get("composition"),
        strength=data.get("strength"),
        unit_of_measure=data.get("unit_of_measure", "strip"),
        units_per_pack=data.get("units_per_pack", 1),
        requires_prescription=data.get("requires_prescription", True),
        is_controlled=data.get("is_controlled", False),
        selling_price=data["selling_price"],
        purchase_price=data.get("purchase_price"),
        reorder_level=data.get("reorder_level", 10),
        storage_instructions=data.get("storage_instructions"),
    )
    db.add(med)
    db.commit()
    db.refresh(med)
    return med


def list_medicines(
    db: Session,
    page: int = 1,
    limit: int = 10,
    hospital_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True,
):
    """List medicines with filters and pagination."""
    q = db.query(Medicine)

    if active_only:
        q = q.filter(Medicine.is_active == True)

    if hospital_id:
        from ..models.user import Hospital
        from ..models.tenant import TenantModule, Module

        # BUG FIX: this used to compare TenantModule.tenant_id (a saas_core
        # Tenant id) against hospital_id (a Hospital id) directly — two
        # different ID spaces that essentially never match. That made the
        # "pharmacy enabled" check always fail, so every hospital silently
        # fell back to global-only medicines in search, regardless of
        # whether they actually had pharmacy/inventory enabled.
        hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
        tenant_id = hospital.tenant_id if hospital else None

        if tenant_id:
            enabled_modules = (
                db.query(Module.code)
                .join(TenantModule, TenantModule.module_id == Module.id)
                .filter(
                    TenantModule.tenant_id == tenant_id,
                    TenantModule.is_enabled == True,
                    Module.code.in_(['pharmacy', 'inventory'])
                )
                .all()
            )
            enabled_codes = {m[0] for m in enabled_modules}
            show_own_medicines = 'pharmacy' in enabled_codes or 'inventory' in enabled_codes
        else:
            # No SaaS tenant linked — standalone hospital, treated as fully
            # enabled elsewhere in the app (see TenantValidator.get_tenant_for_user).
            show_own_medicines = True

        if show_own_medicines:
            # Hospital has pharmacy (or inventory) — show their own medicines.
            q = q.filter(Medicine.hospital_id == hospital_id)
        else:
            # Otherwise, show ONLY common/global medicines
            q = q.filter(Medicine.is_global == True)

    if category:
        q = q.filter(Medicine.category == category)

    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                Medicine.name.ilike(term),
                Medicine.generic_name.ilike(term),
                Medicine.manufacturer.ilike(term),
            )
        )

    total = q.count()
    offset = (page - 1) * limit
    
    # Smart sorting: prioritize tablets and exact matches when searching
    if search:
        search_lower = search.lower()
        # Order by:
        # 1. Tablets first (category = 'tablet' gets priority)
        # 2. Exact name match first
        # 3. Name starts with search term
        # 4. Alphabetically by name
        rows = q.order_by(
            case(
                (Medicine.category == 'tablet', 0),
                else_=1
            ),
            case(
                (func.lower(Medicine.name) == search_lower, 0),
                (func.lower(Medicine.name).startswith(search_lower), 1),
                else_=2
            ),
            Medicine.name
        ).offset(offset).limit(limit).all()
    else:
        # Default sort: tablets first, then alphabetically
        rows = q.order_by(
            case(
                (Medicine.category == 'tablet', 0),
                else_=1
            ),
            Medicine.name
        ).offset(offset).limit(limit).all()
    
    # Attach live stock summary for prescribing UI warnings.
    from ..models.pharmacy import MedicineBatch

    med_ids = [m.id for m in rows]
    stock_map: dict[uuid.UUID, int] = {}
    if med_ids:
        today = date.today()
        stock_rows = (
            db.query(MedicineBatch.medicine_id, func.coalesce(func.sum(MedicineBatch.quantity), 0))
            .filter(
                MedicineBatch.medicine_id.in_(med_ids),
                MedicineBatch.is_active == True,
                MedicineBatch.expiry_date >= today,
            )
            .group_by(MedicineBatch.medicine_id)
            .all()
        )
        stock_map = {row[0]: int(row[1]) for row in stock_rows}

    total_pages = ceil(total / limit) if total > 0 else 0
    return total, page, limit, total_pages, rows, stock_map


def update_medicine(
    db: Session,
    medicine_id: str | uuid.UUID,
    data: dict,
) -> Optional[Medicine]:
    """Update medicine fields."""
    if isinstance(medicine_id, str):
        medicine_id = uuid.UUID(medicine_id)
    med = db.query(Medicine).filter(Medicine.id == medicine_id).first()
    if not med:
        return None
    for k, v in data.items():
        if v is not None and hasattr(med, k):
            setattr(med, k, v)
    db.commit()
    db.refresh(med)
    return med


# ═══════════════════════════════════════════════════════════════════════════
# Common (global) medicines — managed by the super admin, usable by every hospital
# ═══════════════════════════════════════════════════════════════════════════

def create_global_medicine(db: Session, data: dict) -> Medicine:
    """Create a platform-wide common medicine (hospital_id NULL, is_global True)."""
    med = Medicine(
        hospital_id=None,
        is_global=True,
        name=data["name"],
        generic_name=data["generic_name"],
        category=data.get("category"),
        manufacturer=data.get("manufacturer"),
        composition=data.get("composition"),
        strength=data.get("strength"),
        unit_of_measure=data.get("unit_of_measure", "strip"),
        units_per_pack=data.get("units_per_pack", 1),
        requires_prescription=data.get("requires_prescription", True),
        is_controlled=data.get("is_controlled", False),
        # Common medicines are for prescribing, not selling — price is optional.
        selling_price=data.get("selling_price") or 0,
        purchase_price=data.get("purchase_price"),
        tax_config_id=data.get("tax_config_id"),
        reorder_level=data.get("reorder_level", 0),
        storage_instructions=data.get("storage_instructions"),
        is_active=True,
    )
    db.add(med)
    db.commit()
    db.refresh(med)
    return med


def list_global_medicines(
    db: Session,
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = False,
):
    """List the shared common (global) medicine formulary."""
    q = db.query(Medicine).filter(Medicine.is_global == True)

    if active_only:
        q = q.filter(Medicine.is_active == True)
    if category:
        q = q.filter(Medicine.category == category)
    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                Medicine.name.ilike(term),
                Medicine.generic_name.ilike(term),
                Medicine.manufacturer.ilike(term),
            )
        )

    total = q.count()
    offset = (page - 1) * limit
    rows = q.order_by(Medicine.name).offset(offset).limit(limit).all()
    total_pages = ceil(total / limit) if total > 0 else 0
    return total, page, limit, total_pages, rows


def get_global_medicine(db: Session, medicine_id: str | uuid.UUID) -> Optional[Medicine]:
    """Fetch a single global medicine by id (guards against touching hospital ones)."""
    if isinstance(medicine_id, str):
        medicine_id = uuid.UUID(medicine_id)
    return db.query(Medicine).filter(
        Medicine.id == medicine_id,
        Medicine.is_global == True,
    ).first()


# ═══════════════════════════════════════════════════════════════════════════
# Prescription Template CRUD
# ═══════════════════════════════════════════════════════════════════════════

def create_template(
    db: Session,
    data: dict,
    doctor_id: uuid.UUID,
) -> PrescriptionTemplate:
    """Create a prescription template."""
    # Convert items to list of dicts for JSONB
    items = data.get("items", [])
    if items and hasattr(items[0], "model_dump"):
        items = [item.model_dump() for item in items]

    template = PrescriptionTemplate(
        doctor_id=doctor_id,
        name=data["name"],
        diagnosis=data.get("diagnosis"),
        items=items,
        advice=data.get("advice"),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def list_templates(
    db: Session,
    doctor_id: str | uuid.UUID,
    active_only: bool = True,
) -> list[PrescriptionTemplate]:
    """List templates for a doctor."""
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)
    q = db.query(PrescriptionTemplate).filter(PrescriptionTemplate.doctor_id == doctor_id)
    if active_only:
        q = q.filter(PrescriptionTemplate.is_active == True)
    return q.order_by(PrescriptionTemplate.usage_count.desc()).all()


def update_template(
    db: Session,
    template_id: str | uuid.UUID,
    data: dict,
) -> Optional[PrescriptionTemplate]:
    """Update a template."""
    if isinstance(template_id, str):
        template_id = uuid.UUID(template_id)
    tmpl = db.query(PrescriptionTemplate).filter(PrescriptionTemplate.id == template_id).first()
    if not tmpl:
        return None
    for k, v in data.items():
        if v is not None and hasattr(tmpl, k):
            if k == "items" and isinstance(v, list) and v and hasattr(v[0], "model_dump"):
                v = [item.model_dump() for item in v]
            setattr(tmpl, k, v)
    db.commit()
    db.refresh(tmpl)
    return tmpl


def delete_template(
    db: Session,
    template_id: str | uuid.UUID,
) -> bool:
    """Delete a template (hard delete)."""
    if isinstance(template_id, str):
        template_id = uuid.UUID(template_id)
    tmpl = db.query(PrescriptionTemplate).filter(PrescriptionTemplate.id == template_id).first()
    if not tmpl:
        return False
    db.delete(tmpl)
    db.commit()
    return True


def increment_template_usage(
    db: Session,
    template_id: str | uuid.UUID,
):
    """Increment usage counter on a template."""
    if isinstance(template_id, str):
        template_id = uuid.UUID(template_id)
    tmpl = db.query(PrescriptionTemplate).filter(PrescriptionTemplate.id == template_id).first()
    if tmpl:
        tmpl.usage_count = (tmpl.usage_count or 0) + 1
        db.commit()


# ═══════════════════════════════════════════════════════════════════════════
# Patient Prescription History
# ═══════════════════════════════════════════════════════════════════════════

def get_patient_prescriptions(
    db: Session,
    patient_id: str | uuid.UUID,
    page: int = 1,
    limit: int = 10,
):
    """Get all prescriptions for a specific patient."""
    return list_prescriptions(db, page, limit, patient_id=patient_id)
