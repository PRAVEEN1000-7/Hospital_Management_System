"""
Prescription service — handles CRUD for prescriptions, items, templates, medicines.
Follows the same patterns as appointment_service.py.
"""
import uuid
import json
import logging
from datetime import date, datetime, timezone
from math import ceil
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_

from ..models.prescription import (
    Prescription, PrescriptionItem, PrescriptionTemplate,
    PrescriptionVersion, Medicine,
)
from ..models.appointment import Doctor, Appointment
from ..models.patient import Patient
from ..models.user import User

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════
# Prescription Number Generation
# ══════════════════════════════════════════════════════════════════════════

def generate_prescription_number() -> str:
    """Generate unique prescription number: RX-YYYYMMDD-XXXXXX."""
    today = date.today().strftime("%Y%m%d")
    unique_part = uuid.uuid4().hex[:6].upper()
    return f"RX-{today}-{unique_part}"


# ══════════════════════════════════════════════════════════════════════════
# Prescription CRUD
# ══════════════════════════════════════════════════════════════════════════

def create_prescription(
    db: Session,
    data: dict,
    created_by: uuid.UUID,
    hospital_id: uuid.UUID,
) -> Prescription:
    """Create a new prescription with optional items."""
    rx_number = generate_prescription_number()

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
        valid_until=data.get("valid_until"),
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
            quantity=item_data.get("quantity"),
            allow_substitution=item_data.get("allow_substitution", True),
            display_order=item_data.get("display_order", idx),
        )
        db.add(item)

    db.commit()
    db.refresh(rx)

    # Create initial version snapshot
    _save_version_snapshot(db, rx, created_by, "Initial creation")

    return rx


def get_prescription(db: Session, prescription_id: str | uuid.UUID) -> Optional[Prescription]:
    """Get prescription by ID."""
    if isinstance(prescription_id, str):
        try:
            prescription_id = uuid.UUID(prescription_id)
        except ValueError:
            return None
    return db.query(Prescription).filter(
        Prescription.id == prescription_id,
        Prescription.is_deleted == False,
    ).first()


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

    # Update top-level fields
    for k in ["diagnosis", "clinical_notes", "advice", "valid_until"]:
        if k in data and data[k] is not None:
            setattr(rx, k, data[k])

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
                quantity=item_data.get("quantity"),
                allow_substitution=item_data.get("allow_substitution", True),
                display_order=item_data.get("display_order", idx),
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
    """Finalize a prescription (lock it)."""
    rx = get_prescription(db, prescription_id)
    if not rx:
        return None

    if rx.is_finalized:
        raise ValueError("Prescription is already finalized")

    # Must have at least one item
    item_count = db.query(PrescriptionItem).filter(
        PrescriptionItem.prescription_id == rx.id
    ).count()
    if item_count == 0:
        raise ValueError("Cannot finalize a prescription with no items")

    rx.status = "finalized"
    rx.is_finalized = True
    rx.finalized_at = datetime.now(timezone.utc)
    rx.version = (rx.version or 1) + 1

    db.commit()
    db.refresh(rx)

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


# ══════════════════════════════════════════════════════════════════════════
# Prescription Enrichment (add patient/doctor names)
# ══════════════════════════════════════════════════════════════════════════

def enrich_prescription(db: Session, rx: Prescription) -> dict:
    """Add patient and doctor names, plus items."""
    d = {c.name: getattr(rx, c.name) for c in rx.__table__.columns}

    # Stringify UUIDs
    for uuid_col in ["id", "hospital_id", "patient_id", "doctor_id",
                      "appointment_id", "created_by"]:
        if d.get(uuid_col):
            d[uuid_col] = str(d[uuid_col])

    # Patient name + PRN
    patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()
    d["patient_name"] = patient.full_name if patient else None
    d["patient_reference_number"] = patient.patient_reference_number if patient else None

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


# ══════════════════════════════════════════════════════════════════════════
# Prescription Version Snapshots
# ══════════════════════════════════════════════════════════════════════════

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
                    "quantity": item.quantity,
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


# ══════════════════════════════════════════════════════════════════════════
# Medicine CRUD
# ══════════════════════════════════════════════════════════════════════════

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
        q = q.filter(Medicine.hospital_id == hospital_id)

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


# ══════════════════════════════════════════════════════════════════════════
# Prescription Template CRUD
# ══════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════
# Patient Prescription History
# ══════════════════════════════════════════════════════════════════════════

def get_patient_prescriptions(
    db: Session,
    patient_id: str | uuid.UUID,
    page: int = 1,
    limit: int = 10,
):
    """Get all prescriptions for a specific patient."""
    return list_prescriptions(db, page, limit, patient_id=patient_id)
