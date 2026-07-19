"""
Shared billing + dispensing-queue helpers used identically by Pharmacy and
Optical sales, so both modules compute payment status and assign queue
tokens/states the same way instead of drifting into two divergent
implementations.
"""
import hashlib
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, text
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


def _next_hospital_wide_daily_token(
    db: Session, hospital_id: uuid.UUID, visit_date: Optional[date] = None
) -> int:
    """
    Max token issued anywhere for this hospital on `visit_date` (default:
    hospital's today) — doctor queue, pharmacy, or optical — plus one. Used
    by get_or_assign_visit_token() so a brand-new visit never collides with
    a token already handed out by a different department.

    `visit_date` matters for appointments pre-booked ahead of time: a walk-in
    is always created the same day it's for, so "today" and "the visit's
    date" are the same thing — but a pre-booked appointment is created days
    before the date it's actually for, and its token must reset against
    *that* future date's count (starting back at 1), not against however
    many visits have already been created today when the booking was made.

    Uses the UTC-range day-boundary check (hospital_today_utc_range_by_id),
    not func.date(): func.date() compares using the DB session's own
    timezone, not the hospital's, which silently breaks daily reset for any
    hospital not in that exact timezone (see the queue-reset fix this
    replaced).

    Two receptionists registering walk-ins for the same hospital at nearly
    the same moment can both run this MAX(...)+1 query before either has
    committed, computing the identical "next" token and colliding on
    AppointmentQueue's (doctor_id, queue_date, queue_number) unique
    constraint — surfaced to the user as a raw psycopg2 UniqueViolation.
    A Postgres transaction-scoped advisory lock, keyed per hospital+day,
    serializes token issuance: the second caller blocks here until the
    first commits, so by the time it reads MAX(...) the first token is
    already visible and it correctly gets the next one. The lock is
    released automatically at commit/rollback — no manual unlock needed.
    """
    from ..models.appointment import Appointment
    from ..models.pharmacy import PharmacyQueueEntry, PharmacySale
    from ..models.optical import OpticalSale
    from ..core.hospital_time import hospital_today_by_id

    target_date = visit_date or hospital_today_by_id(db, hospital_id)
    day_start, day_end = hospital_today_utc_range_by_id(db, hospital_id, target_date)

    lock_key = int(hashlib.md5(f"visit_token:{hospital_id}:{target_date}".encode()).hexdigest()[:15], 16)
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})

    def _max_today(model, token_col):
        return (
            db.query(func.max(token_col))
            .filter(
                model.hospital_id == hospital_id,
                model.created_at >= day_start,
                model.created_at < day_end,
            )
            .scalar()
        )

    # Appointment is matched on its own appointment_date, not created_at:
    # pharmacy/optical sales and walk-ins are always created the same day
    # they occur, so a created_at range is equivalent to their visit date.
    # A pre-booked appointment isn't — it's created days before target_date
    # — so counting by created_at would miss every other appointment
    # already booked for that same future date and hand out duplicate 1s.
    appointment_max = (
        db.query(func.max(Appointment.visit_token))
        .filter(
            Appointment.hospital_id == hospital_id,
            Appointment.appointment_date == target_date,
        )
        .scalar()
    )

    maxes = [
        appointment_max,
        _max_today(PharmacyQueueEntry, PharmacyQueueEntry.queue_token),
        _max_today(PharmacySale, PharmacySale.queue_token),
        _max_today(OpticalSale, OpticalSale.queue_token),
    ]
    return max((m for m in maxes if m is not None), default=0) + 1


def get_or_assign_visit_token(
    db: Session,
    hospital_id: uuid.UUID,
    appointment_id: Optional[uuid.UUID] = None,
    visit_date: Optional[date] = None,
) -> int:
    """
    The one token for a patient's whole visit — shared by every department
    they pass through that day (doctor queue, a referral to a second
    doctor, pharmacy, optical, billing) instead of each one minting its own
    daily counter.

    If `appointment_id` is given and that appointment already has a token
    (including one inherited from a referral's parent appointment — see
    walk_ins.py's referral flow, which copies the parent's visit_token onto
    the child before calling this), that same token is returned — a visit
    is only ever assigned one token, no matter how many times this is
    called for it. Otherwise a new hospital-wide token is minted and, if an
    appointment was given, persisted onto it so every later lookup for this
    visit reuses it.

    `visit_date` defaults to the hospital's today (every same-day caller —
    walk-ins, pharmacy, optical). Pass the appointment's own date for a
    pre-booked-ahead appointment so its token resets against that date's
    count instead of the (irrelevant) day it happened to be booked on.
    """
    from ..models.appointment import Appointment

    appt = None
    if appointment_id:
        appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if appt and appt.visit_token:
            return appt.visit_token

    token = _next_hospital_wide_daily_token(db, hospital_id, visit_date)
    if appt:
        appt.visit_token = token
        db.flush()
    return token


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
    appointment_id: Optional[uuid.UUID] = None,
):
    """Create a Waiting pharmacy-queue entry — auto (from a finalized
    prescription) or manual (walk-in, no prescription). `appointment_id`
    (the finalized prescription's own, when there is one) lets this entry
    inherit the patient's existing visit token instead of minting a new
    one — see get_or_assign_visit_token."""
    from ..models.pharmacy import PharmacyQueueEntry

    entry = PharmacyQueueEntry(
        hospital_id=hospital_id,
        queue_token=get_or_assign_visit_token(db, hospital_id, appointment_id),
        prescription_id=prescription.id if prescription else None,
        patient_id=patient_id,
        patient_name=patient_name,
        doctor_name=doctor_name,
        appointment_id=appointment_id,
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
