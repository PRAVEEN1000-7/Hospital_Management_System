"""
Shared billing + dispensing-queue helpers used identically by Pharmacy and
Optical sales, so both modules compute payment status and assign queue
tokens/states the same way instead of drifting into two divergent
implementations.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.hospital_time import hospital_today_utc_range_by_id

QUEUE_STATUSES = ("waiting", "being_served", "ready", "collected")


def compute_payment_breakdown(
    total_amount,
    advance_amount=Decimal("0"),
    amount_tendered=Decimal("0"),
) -> dict:
    """
    Shared payment-status calculation for any sale (Pharmacy or Optical).

    balance_amount > 0  => still owed by the patient
    balance_amount < 0  => change owed back to the patient (tendered more than due)
    balance_amount == 0 => settled exactly
    """
    total_amount = Decimal(str(total_amount or 0))
    advance_amount = Decimal(str(advance_amount or 0))
    amount_tendered = Decimal(str(amount_tendered or 0))

    paid_amount = advance_amount + amount_tendered
    balance_amount = total_amount - paid_amount

    if paid_amount <= 0:
        payment_status = "pending"
    elif balance_amount > 0:
        payment_status = "partially_paid"
    else:
        payment_status = "paid"

    return {
        "paid_amount": paid_amount,
        "balance_amount": balance_amount,
        "payment_status": payment_status,
    }


def generate_daily_queue_token(db: Session, hospital_id: uuid.UUID, model) -> int:
    """
    Next sequential dispensing-queue token for `model` (PharmacySale or
    OpticalSale), scoped to this hospital and reset each day — same idea as
    the existing AppointmentQueue token generator, applied to sales.
    """
    day_start, day_end = hospital_today_utc_range_by_id(db, hospital_id)
    last_token = (
        db.query(func.max(model.queue_token))
        .filter(
            model.hospital_id == hospital_id,
            model.created_at >= day_start,
            model.created_at < day_end,
        )
        .scalar()
    )
    return (last_token or 0) + 1


def advance_queue_status(sale, new_status: str, performed_at: Optional[datetime] = None) -> None:
    """Move a sale through the shared Waiting -> Being Served -> Ready -> Collected states."""
    if new_status not in QUEUE_STATUSES:
        raise ValueError(f"Invalid queue status '{new_status}'. Must be one of: {', '.join(QUEUE_STATUSES)}")
    sale.queue_status = new_status
    if new_status == "being_served" and not sale.queue_called_at:
        sale.queue_called_at = performed_at or datetime.now(timezone.utc)


# ══════════════════════════════════════════════════
# Pharmacy Queue Entries — BRD v1.1 Pharmacy Queue (PQ-01..06)
#
# Deliberately decoupled from PharmacySale: a token is assigned the moment a
# doctor finalizes a prescription with medicines (see
# prescription_service.finalize_prescription), or when staff manually add a
# walk-in — well before any bill exists. Linked to the PharmacySale once
# dispensing/billing actually happens for that patient.
# ══════════════════════════════════════════════════
PHARMACY_QUEUE_ENTRY_STATUSES = ("waiting", "being_served", "collected")


def enqueue_pharmacy_queue_entry(
    db: Session,
    hospital_id: uuid.UUID,
    prescription=None,
    patient_id: Optional[uuid.UUID] = None,
    patient_name: Optional[str] = None,
    doctor_name: Optional[str] = None,
):
    """Create a Waiting pharmacy-queue entry — auto (from a finalized
    prescription) or manual (walk-in, no prescription)."""
    from ..models.pharmacy import PharmacyQueueEntry

    entry = PharmacyQueueEntry(
        hospital_id=hospital_id,
        queue_token=generate_daily_queue_token(db, hospital_id, PharmacyQueueEntry),
        prescription_id=prescription.id if prescription else None,
        patient_id=patient_id,
        patient_name=patient_name,
        doctor_name=doctor_name,
        status="waiting",
    )
    db.add(entry)
    db.flush()
    return entry


def serialize_pharmacy_queue_entry(entry) -> dict:
    patient_name = entry.patient_name or (entry.patient.full_name if entry.patient else None)
    return {
        "id": str(entry.id),
        "queue_token": entry.queue_token,
        "patient_name": patient_name,
        "doctor_name": entry.doctor_name,
        "prescription_id": str(entry.prescription_id) if entry.prescription_id else None,
        "prescription_number": entry.prescription.prescription_number if entry.prescription else None,
        "sale_id": str(entry.sale_id) if entry.sale_id else None,
        "status": entry.status,
        "created_at": entry.created_at,
        "queue_called_at": entry.queue_called_at,
    }


def list_pharmacy_queue_entries(db: Session, hospital_id: uuid.UUID) -> list[dict]:
    """Today's pharmacy queue entries ordered by token."""
    from ..models.pharmacy import PharmacyQueueEntry

    day_start, day_end = hospital_today_utc_range_by_id(db, hospital_id)
    rows = (
        db.query(PharmacyQueueEntry)
        .filter(
            PharmacyQueueEntry.hospital_id == hospital_id,
            PharmacyQueueEntry.created_at >= day_start,
            PharmacyQueueEntry.created_at < day_end,
        )
        .order_by(PharmacyQueueEntry.queue_token.asc())
        .all()
    )
    return [serialize_pharmacy_queue_entry(e) for e in rows]


def advance_pharmacy_queue_entry_status(db: Session, entry_id: str | uuid.UUID, new_status: str) -> Optional[dict]:
    from ..models.pharmacy import PharmacyQueueEntry

    if new_status not in PHARMACY_QUEUE_ENTRY_STATUSES:
        raise ValueError(
            f"Invalid queue status '{new_status}'. Must be one of: {', '.join(PHARMACY_QUEUE_ENTRY_STATUSES)}"
        )
    entry = db.query(PharmacyQueueEntry).filter(PharmacyQueueEntry.id == entry_id).first()
    if not entry:
        return None
    entry.status = new_status
    if new_status == "being_served" and not entry.queue_called_at:
        entry.queue_called_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(entry)
    return serialize_pharmacy_queue_entry(entry)


def find_open_pharmacy_queue_entry_for_patient(db: Session, hospital_id: uuid.UUID, patient_id: uuid.UUID):
    """Oldest not-yet-collected queue entry for this patient today — used by the
    counter-sale flow (NewSale.tsx) to link a manually-added walk-in to its bill."""
    from ..models.pharmacy import PharmacyQueueEntry

    day_start, day_end = hospital_today_utc_range_by_id(db, hospital_id)
    return (
        db.query(PharmacyQueueEntry)
        .filter(
            PharmacyQueueEntry.hospital_id == hospital_id,
            PharmacyQueueEntry.patient_id == patient_id,
            PharmacyQueueEntry.status != "collected",
            PharmacyQueueEntry.created_at >= day_start,
            PharmacyQueueEntry.created_at < day_end,
        )
        .order_by(PharmacyQueueEntry.created_at.asc())
        .first()
    )


def link_pharmacy_queue_entry_to_sale(db: Session, prescription_id, sale) -> None:
    """Called once dispense_prescription() creates the bill — auto-marks the
    matching queue entry (if any) Collected and links it to the sale."""
    from ..models.pharmacy import PharmacyQueueEntry

    if not prescription_id:
        return
    entry = (
        db.query(PharmacyQueueEntry)
        .filter(
            PharmacyQueueEntry.prescription_id == prescription_id,
            PharmacyQueueEntry.status != "collected",
        )
        .order_by(PharmacyQueueEntry.created_at.desc())
        .first()
    )
    if entry:
        entry.sale_id = sale.id
        entry.status = "collected"
        if not entry.queue_called_at:
            entry.queue_called_at = datetime.now(timezone.utc)
