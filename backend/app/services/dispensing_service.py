"""
Dispensing Service — Handles prescription dispensing workflow.

This service manages the flow from finalized prescription to pharmacy dispensing:
1. Get pending prescriptions queue (finalized but not dispensed)
2. Dispense medicines from prescription
3. Update prescription status
"""
import uuid
import logging
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_

from ..models.prescription import Prescription, PrescriptionItem, Medicine
from ..models.pharmacy import (
    PharmacySale, PharmacySaleItem, MedicineBatch,
)
from ..models.patient import Patient
from ..models.appointment import Doctor
from ..models.inventory import StockMovement
from .prescription_service import calculate_prescribed_quantity
from .notification_service import notify_hospital_users
from ..core.hospital_time import hospital_today_by_id

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Preview Dispensing Calculation
# ═══════════════════════════════════════════════════════════════════════════

def preview_dispensing_totals(
    db: Session,
    prescription_id: str | uuid.UUID,
    items_to_dispense: list[dict],
) -> dict:
    """
    Calculate expected totals for a dispensing request without actually dispensing.
    
    This allows the frontend to show accurate totals before submission.
    
    Args:
        db: Database session
        prescription_id: Prescription UUID
        items_to_dispense: List of items with prescription_item_id, medicine_id, batch_id, quantity, unit_price
    
    Returns:
        Dictionary with:
        - items: List of items with calculated totals
        - subtotal: Total amount for all items
        - items_dispensed: Count of items to be dispensed
        - items_skipped: Count of items being skipped
        - warnings: List of any warnings
    """
    if isinstance(prescription_id, str):
        prescription_id = uuid.UUID(prescription_id)
    
    # Get prescription
    rx = db.query(Prescription).filter(
        Prescription.id == prescription_id,
        Prescription.is_deleted == False,
    ).first()
    
    if not rx:
        raise ValueError("Prescription not found")
    
    result_items = []
    subtotal = Decimal("0")
    warnings = []
    
    # Build a map of requested items. Extra items (no prescription_item_id —
    # added by the pharmacist at dispense time, not tied to any prescription
    # line) are previewed separately below instead of going into this map,
    # since multiple extras would otherwise collide on the same None key.
    requested_map = {}
    extra_items_data: list[dict] = []
    for item_data in items_to_dispense:
        rx_item_id = item_data.get("prescription_item_id")
        if not rx_item_id:
            extra_items_data.append(item_data)
            continue
        if isinstance(rx_item_id, str):
            rx_item_id = uuid.UUID(rx_item_id)
        requested_map[rx_item_id] = item_data
    
    # Get all prescription items
    all_rx_items = db.query(PrescriptionItem).filter(
        PrescriptionItem.prescription_id == prescription_id
    ).order_by(PrescriptionItem.display_order).all()
    
    for rx_item in all_rx_items:
        prescribed_qty = calculate_prescribed_quantity(
            rx_item.frequency,
            rx_item.duration_value,
            rx_item.duration_unit,
            rx_item.quantity,
        ) or 0
        
        already_dispensed = rx_item.dispensed_quantity or 0
        remaining_qty = prescribed_qty - already_dispensed
        is_open_line = remaining_qty > 0 and not rx_item.is_dispensed
        
        # Check if this item is in the request
        if rx_item.id in requested_map:
            item_data = requested_map[rx_item.id]
            quantity = item_data.get("quantity", 0)
            unit_price = Decimal(str(item_data.get("unit_price", 0)))
            
            if quantity > 0 and remaining_qty > 0:
                line_total = unit_price * quantity
                subtotal += line_total
                
                result_items.append({
                    "prescription_item_id": str(rx_item.id),
                    "medicine_id": str(rx_item.medicine_id) if rx_item.medicine_id else None,
                    "medicine_name": rx_item.medicine_name,
                    "quantity": quantity,
                    "unit_price": float(unit_price),
                    "total_price": float(line_total),
                    "status": "to_dispense",
                })
            else:
                result_items.append({
                    "prescription_item_id": str(rx_item.id),
                    "medicine_id": str(rx_item.medicine_id) if rx_item.medicine_id else None,
                    "medicine_name": rx_item.medicine_name,
                    "quantity": 0,
                    "unit_price": 0,
                    "total_price": 0,
                    "remaining_quantity": max(0, remaining_qty),
                    "status": "skipped" if is_open_line else "already_dispensed",
                })
        else:
            # Item not in request - being skipped
            result_items.append({
                "prescription_item_id": str(rx_item.id),
                "medicine_id": str(rx_item.medicine_id) if rx_item.medicine_id else None,
                "medicine_name": rx_item.medicine_name,
                "prescribed_quantity": prescribed_qty,
                "already_dispensed": already_dispensed,
                "remaining_quantity": max(0, remaining_qty),
                "quantity": 0,
                "unit_price": 0,
                "total_price": 0,
                "status": "skipped" if is_open_line else "already_dispensed",
            })
    
    # Extra items — not tied to any prescription line — priced the same way
    # as prescribed items, just without a remaining-quantity cap.
    for item_data in extra_items_data:
        quantity = item_data.get("quantity", 0)
        unit_price = Decimal(str(item_data.get("unit_price", 0)))
        medicine_id = item_data.get("medicine_id")
        if quantity <= 0 or not medicine_id:
            continue

        medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
        line_total = unit_price * quantity
        subtotal += line_total
        result_items.append({
            "prescription_item_id": None,
            "medicine_id": str(medicine_id),
            "medicine_name": medicine.name if medicine else "Extra item",
            "quantity": quantity,
            "unit_price": float(unit_price),
            "total_price": float(line_total),
            "status": "to_dispense",
        })

    items_to_dispense_count = sum(1 for item in result_items if item["status"] == "to_dispense")
    items_skipped_count = sum(1 for item in result_items if item["status"] == "skipped")
    
    return {
        "prescription_id": str(prescription_id),
        "prescription_number": rx.prescription_number,
        "items": result_items,
        "subtotal": float(subtotal),
        "tax_amount": 0.0,
        "discount_amount": 0.0,
        "total_amount": float(subtotal),
        "items_dispensed": items_to_dispense_count,
        "items_skipped": items_skipped_count,
        "warnings": warnings,
    }


def _resolve_patient_age_years(patient: Optional[Patient]) -> Optional[int]:
    """Resolve patient age with DOB fallback when stored age is missing."""
    if not patient:
        return None

    if patient.age_years is not None:
        return int(patient.age_years)

    if patient.date_of_birth:
        today = date.today()
        years = today.year - patient.date_of_birth.year
        before_birthday = (today.month, today.day) < (patient.date_of_birth.month, patient.date_of_birth.day)
        return max(0, years - (1 if before_birthday else 0))

    return None


# ═══════════════════════════════════════════════════════════════════════════
# Pending Prescriptions Queue
# ═══════════════════════════════════════════════════════════════════════════

def get_pending_prescriptions(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    status_filter: Optional[str] = None,
    doctor_id: Optional[str] = None,
    search: Optional[str] = None,
) -> dict:
    """
    Get prescriptions that are finalized but not fully dispensed.
    
    Status logic:
    - 'finalized' → Pending work queue
    - 'dispensed' → Closed/completed
    """
    from math import ceil
    
    # Base query: finalized prescriptions for this hospital
    query = db.query(Prescription).filter(
        Prescription.hospital_id == hospital_id,
        Prescription.is_finalized == True,
        Prescription.is_deleted == False,
    )
    
    # Filter by status. No filter (the "All Status" choice) intentionally
    # shows BOTH pending and dispensed — it previously fell through to the
    # same 'finalized'-only filter as 'pending', so a prescription you just
    # finished dispensing would silently vanish from the default view
    # instead of showing up here with its "Dispensed" status.
    if status_filter == 'pending':
        query = query.filter(Prescription.status == 'finalized')
    elif status_filter == 'dispensed':
        query = query.filter(Prescription.status == 'dispensed')
    
    # Filter by doctor
    if doctor_id:
        if isinstance(doctor_id, str):
            doctor_id = uuid.UUID(doctor_id)
        query = query.filter(Prescription.doctor_id == doctor_id)
    
    # Search by prescription number or patient name
    if search:
        term = f"%{search}%"
        query = query.outerjoin(Patient, Prescription.patient_id == Patient.id).filter(
            or_(
                Prescription.prescription_number.ilike(term),
                func.concat(Patient.first_name, ' ', Patient.last_name).ilike(term),
                Patient.first_name.ilike(term),
                Patient.last_name.ilike(term),
            )
        )
    
    # Count and paginate
    total = query.count()
    offset = (page - 1) * limit
    
    # Newest-finalized-first, per explicit request — note this means a
    # long-waiting patient can sit below one that just arrived; the "wait
    # time" column on this screen still shows how long each has been
    # waiting, so staff can still spot a starved patient even though the
    # list itself no longer surfaces them automatically. Falls back to
    # created_at only for the rare legacy row where finalized_at is unset.
    rows = (
        query
        .order_by(
            func.coalesce(Prescription.finalized_at, Prescription.created_at).desc()
        )
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    # Enrich with patient name, doctor name, item counts
    enriched = []
    for rx in rows:
        item = _enrich_prescription_for_dispensing(db, rx)
        enriched.append(item)
    
    total_pages = ceil(total / limit) if total > 0 else 0
    
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "data": enriched,
    }


def _enrich_prescription_for_dispensing(db: Session, rx: Prescription) -> dict:
    """Add patient name, doctor name, and item details for dispensing view."""
    queue_status = "dispensed" if rx.status == "dispensed" else "finalized"

    d = {
        "id": str(rx.id),
        "prescription_number": rx.prescription_number,
        "status": queue_status,
        "is_finalized": rx.is_finalized,
        "finalized_at": str(rx.finalized_at) if rx.finalized_at else None,
        "created_at": str(rx.created_at),
        "hospital_id": str(rx.hospital_id),
        "patient_id": str(rx.patient_id),
        "doctor_id": str(rx.doctor_id) if rx.doctor_id else None,
        "appointment_id": str(rx.appointment_id) if rx.appointment_id else None,
        "diagnosis": rx.diagnosis,
        "clinical_notes": rx.clinical_notes,
        "advice": rx.advice,
        "vitals_bp": rx.vitals_bp,
        "vitals_pulse": rx.vitals_pulse,
        "vitals_temp": rx.vitals_temp,
        "vitals_weight": rx.vitals_weight,
        "vitals_spo2": rx.vitals_spo2,
    }
    
    # Patient info
    patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()
    if patient:
        d["patient_name"] = patient.full_name
        d["patient_reference_number"] = patient.patient_reference_number
        d["patient_age"] = _resolve_patient_age_years(patient)
        d["patient_gender"] = patient.gender
        d["patient_phone"] = patient.phone_number
        d["patient_blood_group"] = patient.blood_group
    else:
        d["patient_name"] = None
        d["patient_reference_number"] = None
        d["patient_age"] = None
        d["patient_gender"] = None
        d["patient_phone"] = None
        d["patient_blood_group"] = None
    
    # Doctor info
    doctor = db.query(Doctor).filter(Doctor.id == rx.doctor_id).first()
    if doctor and doctor.user:
        d["doctor_name"] = f"Dr. {doctor.user.full_name}"
        d["doctor_specialization"] = doctor.specialization
    else:
        d["doctor_name"] = None
        d["doctor_specialization"] = None
    
    # Items with dispensing status
    items = db.query(PrescriptionItem).filter(
        PrescriptionItem.prescription_id == rx.id
    ).order_by(PrescriptionItem.display_order).all()
    
    d["items"] = []
    total_items = len(items)
    dispensed_items = 0
    
    for item in items:
        prescribed_quantity = calculate_prescribed_quantity(
            item.frequency,
            item.duration_value,
            item.duration_unit,
            item.quantity,
        ) or 0

        # Resolve dispense unit label from the linked medicine
        dispense_unit = "units"
        units_per_pack = 1
        if item.medicine_id:
            med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first()
            if med:
                if med.unit_of_measure:
                    dispense_unit = med.unit_of_measure
                if med.units_per_pack:
                    units_per_pack = med.units_per_pack

        item_dict = {
            "id": str(item.id),
            "prescription_item_id": str(item.id),
            "medicine_id": str(item.medicine_id) if item.medicine_id else None,
            "medicine_name": item.medicine_name,
            "generic_name": item.generic_name,
            "dosage": item.dosage,
            "frequency": item.frequency,
            "duration_value": item.duration_value,
            "duration_unit": item.duration_unit,
            "route": item.route,
            "instructions": item.instructions,
            "quantity": prescribed_quantity,
            "dispensed_quantity": item.dispensed_quantity,
            "allow_substitution": item.allow_substitution,
            "is_dispensed": item.is_dispensed,
            "dispense_unit": dispense_unit,
            "units_per_pack": units_per_pack,
            # Eye Hospital Drug Prescription format — which eye this item is
            # for. Never sent to the dispensing screen before, so a pharmacist
            # had no way to tell RE from LE while dispensing eye drops.
            "eye_side": item.eye_side,
        }
        
        # Get available stock for this medicine across all active batches (FEFO ordered).
        # Expiry compared against the hospital's own local date, not the
        # server's — date.today() reads the server process's own timezone,
        # wrong the moment the server isn't physically in the hospital's
        # timezone (the normal case). This directly fed the Out of Stock
        # calculation on the Dispensing screen.
        if item.medicine_id:
            today = hospital_today_by_id(db, rx.hospital_id)
            batches = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == item.medicine_id,
                MedicineBatch.is_active == True,
                MedicineBatch.quantity > 0,
                MedicineBatch.expiry_date >= today,
            ).order_by(MedicineBatch.expiry_date.asc()).all()

            if batches:
                item_dict["available_batches"] = [
                    {
                        "id": str(batch.id),
                        "batch_number": batch.batch_number,
                        "expiry_date": str(batch.expiry_date),
                        "quantity": batch.quantity,
                        "selling_price": float(batch.selling_price) if batch.selling_price else 0,
                    }
                    for batch in batches
                ]
                item_dict["available_quantity"] = sum(batch.quantity or 0 for batch in batches)
            else:
                item_dict["available_batches"] = []
                item_dict["available_quantity"] = 0
        else:
            item_dict["available_batches"] = []
            item_dict["available_quantity"] = 0
        
        d["items"].append(item_dict)
        
        if item.is_dispensed:
            dispensed_items += 1
    
    d["total_items"] = total_items
    d["dispensed_items"] = dispensed_items
    d["pending_items"] = total_items - dispensed_items
    
    return d


# ═══════════════════════════════════════════════════════════════════════════
# Dispensing Logic
# ═══════════════════════════════════════════════════════════════════════════

def _allocate_batches_and_create_sale_items(
    db: Session,
    hospital_id: uuid.UUID,
    dispensing: "PharmacySale",
    medicine_id: uuid.UUID,
    medicine_name: str,
    batch_id: uuid.UUID,
    quantity: int,
    requested_unit_price: Decimal,
    prescription_item_id: Optional[uuid.UUID],
    user_id: uuid.UUID,
) -> Decimal:
    """
    FEFO batch allocation + PharmacySaleItem + StockMovement creation for one
    dispensed line. Shared by prescribed-item dispensing and ad-hoc extra
    items added by the pharmacist at dispense time (prescription_item_id=None
    for the latter — see dispense_prescription).
    """
    batch = db.query(MedicineBatch).filter(
        MedicineBatch.id == batch_id,
        MedicineBatch.medicine_id == medicine_id,
        MedicineBatch.is_active == True,
    ).with_for_update().first()

    if not batch:
        raise ValueError(f"Batch not found for medicine {medicine_name}")

    today = hospital_today_by_id(db, hospital_id)
    if batch.expiry_date and batch.expiry_date < today:
        raise ValueError(
            f"Selected batch {batch.batch_number} for {medicine_name} is expired"
        )

    # Allocate requested quantity from selected batch first, then other FEFO batches.
    remaining_to_allocate = quantity
    batch_allocations: list[tuple[MedicineBatch, int]] = []

    selected_alloc = min(batch.quantity or 0, remaining_to_allocate)
    if selected_alloc > 0:
        batch_allocations.append((batch, selected_alloc))
        remaining_to_allocate -= selected_alloc

    if remaining_to_allocate > 0:
        additional_batches = db.query(MedicineBatch).filter(
            MedicineBatch.medicine_id == medicine_id,
            MedicineBatch.is_active == True,
            MedicineBatch.id != batch.id,
            MedicineBatch.quantity > 0,
            MedicineBatch.expiry_date >= today,
        ).with_for_update().order_by(MedicineBatch.expiry_date.asc()).all()

        for extra_batch in additional_batches:
            if remaining_to_allocate <= 0:
                break
            alloc_qty = min(extra_batch.quantity or 0, remaining_to_allocate)
            if alloc_qty <= 0:
                continue
            batch_allocations.append((extra_batch, alloc_qty))
            remaining_to_allocate -= alloc_qty

    if remaining_to_allocate > 0:
        total_available = sum(alloc_qty for _, alloc_qty in batch_allocations)
        raise ValueError(
            f"Insufficient stock for {medicine_name}. "
            f"Required: {quantity}, Available across active batches: {total_available}"
        )

    line_total_sum = Decimal("0")
    for alloc_batch, alloc_qty in batch_allocations:
        # Reduce batch stock
        alloc_batch.quantity -= alloc_qty

        # The pharmacist can adjust the rate at dispense time (DispensingScreen.tsx's
        # editable Unit Price field) — honor that requested price when given;
        # only fall back to the batch's stored selling_price if the caller sent
        # nothing usable (0/negative), which also covers callers that never
        # populate unit_price at all.
        effective_unit_price = (
            requested_unit_price if requested_unit_price and requested_unit_price > 0
            else (Decimal(str(alloc_batch.selling_price)) if alloc_batch.selling_price is not None else Decimal("0"))
        )
        line_total = effective_unit_price * alloc_qty
        line_total_sum += line_total

        # Create one dispensing line per allocated batch.
        dispensing_item = PharmacySaleItem(
            sale_id=dispensing.id,
            prescription_item_id=prescription_item_id,
            medicine_id=medicine_id,
            batch_id=alloc_batch.id,
            quantity=alloc_qty,
            unit_price=effective_unit_price,
            total_price=line_total,
            medicine_name=medicine_name,
        )
        db.add(dispensing_item)

        # Record the stock-out in the movement ledger so inventory reports and
        # the stock audit trail stay consistent with the reduced batch quantity.
        db.flush()  # ensure the batch deduction is visible to the balance query
        balance_after = db.query(
            func.coalesce(func.sum(MedicineBatch.quantity), 0)
        ).filter(
            MedicineBatch.medicine_id == medicine_id,
            MedicineBatch.is_active == True,
        ).scalar() or 0
        db.add(StockMovement(
            hospital_id=hospital_id,
            item_type="medicine",
            item_id=medicine_id,
            batch_id=alloc_batch.id,
            movement_type="dispensing",
            reference_type="dispensing",
            reference_id=dispensing.id,
            quantity=-int(alloc_qty),
            balance_after=int(balance_after),
            unit_cost=effective_unit_price,
            notes=f"Pharmacy dispense {dispensing.invoice_number}",
            performed_by=user_id,
        ))

    return line_total_sum


def dispense_prescription(
    db: Session,
    prescription_id: str | uuid.UUID,
    hospital_id: uuid.UUID,
    user_id: uuid.UUID,
    items_to_dispense: list[dict],
    skipped_items: Optional[list[dict]] = None,
    notes: Optional[str] = None,
) -> dict:
    """
    Dispense medicines from a prescription.
    
    Args:
        prescription_id: Prescription UUID
        hospital_id: Hospital UUID
        user_id: Pharmacist user UUID
        items_to_dispense: List of dicts with:
            - prescription_item_id: UUID, or None/omitted for an extra item
              added by the pharmacist that isn't on the prescription (extra
              medicine, or a cataloged non-medicine pharmacy item) — these
              skip prescribed-quantity validation entirely.
            - medicine_id: UUID
            - batch_id: UUID
            - quantity: int
            - unit_price: Decimal
        notes: Optional notes for this dispensing
    
    Returns:
        dict with dispensing_id, status, and details
    
    Raises:
        ValueError: If prescription not found, not finalized, or insufficient stock
    """
    
    if isinstance(prescription_id, str):
        prescription_id = uuid.UUID(prescription_id)
    
    # Get prescription
    rx = db.query(Prescription).filter(
        Prescription.id == prescription_id,
        Prescription.hospital_id == hospital_id,
        Prescription.is_deleted == False,
    ).first()
    
    if not rx:
        raise ValueError("Prescription not found")
    
    if not rx.is_finalized:
        raise ValueError("Prescription must be finalized before dispensing")
    
    # A prescription-linked dispensing sale inherits its visit's shared
    # token — same one the doctor queue and pharmacy queue entry already
    # carry for this patient — instead of showing no token at all.
    from .billing_queue_service import get_or_assign_visit_token

    # Create pharmacy_dispensing record
    dispensing = PharmacySale(
        hospital_id=hospital_id,
        invoice_number=_generate_dispensing_number(db, hospital_id),
        patient_id=rx.patient_id,
        appointment_id=rx.appointment_id,
        sale_type="prescription",
        status="dispensed",
        created_by=user_id,  # Use created_by (which maps to dispensed_by in DB)
        notes=notes,
        created_at=datetime.now(timezone.utc),
        queue_token=get_or_assign_visit_token(db, hospital_id, appointment_id=rx.appointment_id),
    )
    db.add(dispensing)
    db.flush()
    
    total_amount = Decimal("0")
    tax_amount = Decimal("0")
    processed_items_count = 0
    skipped_items_count = 0

    # Items that fail during THIS dispense call (most commonly a stock race —
    # another sale/dispense consumed the batch between the pharmacist loading
    # this screen and confirming) are collected here rather than aborting the
    # whole request. Each item's DB work below runs inside its own SAVEPOINT
    # (db.begin_nested()) specifically so a failure on one item rolls back
    # only that item's partial writes, not the items already successfully
    # processed earlier in this same loop — the pharmacist already reviewed
    # and confirmed the whole batch, so one line losing its stock in the last
    # few seconds shouldn't cost them the other 13.
    failed_items: list[dict] = []

    seen_prescription_items: set[uuid.UUID] = set()

    # Process each item
    for item_data in items_to_dispense:
        prescription_item_id = item_data.get("prescription_item_id")
        medicine_id = item_data.get("medicine_id")
        batch_id = item_data.get("batch_id")
        quantity = item_data.get("quantity", 0)
        requested_unit_price = Decimal(str(item_data.get("unit_price", 0)))
        override_prescribed_limit = bool(item_data.get("override_prescribed_limit", False))

        if not medicine_id or not batch_id or quantity <= 0:
            continue

        if isinstance(medicine_id, str):
            medicine_id = uuid.UUID(medicine_id)
        if isinstance(batch_id, str):
            batch_id = uuid.UUID(batch_id)

        # Extra item: not tied to any prescription line — the pharmacist
        # added an extra medicine, or a cataloged non-medicine pharmacy item,
        # at dispense time. No prescribed-quantity cap or rx-line matching
        # applies; go straight to stock allocation.
        if not prescription_item_id:
            medicine = db.query(Medicine).filter(
                Medicine.id == medicine_id,
                Medicine.hospital_id == hospital_id,
            ).first()
            if not medicine:
                failed_items.append({"medicine_name": "Extra item", "reason": "Selected extra item not found in medicine catalog"})
                continue

            try:
                with db.begin_nested():
                    line_total_sum = _allocate_batches_and_create_sale_items(
                        db, hospital_id, dispensing, medicine_id, medicine.name,
                        batch_id, quantity, requested_unit_price, None, user_id,
                    )
            except ValueError as item_err:
                failed_items.append({"medicine_name": medicine.name, "reason": str(item_err)})
                continue

            total_amount += line_total_sum
            processed_items_count += 1
            logger.info(f"Dispensed extra item {medicine.name} (qty {quantity}), not tied to a prescription line")
            continue

        # Convert UUID
        if isinstance(prescription_item_id, str):
            prescription_item_id = uuid.UUID(prescription_item_id)

        if prescription_item_id in seen_prescription_items:
            failed_items.append({"medicine_name": item_data.get("medicine_name") or "Unknown item", "reason": "Duplicate prescription item in dispensing request"})
            continue
        seen_prescription_items.add(prescription_item_id)

        # Get prescription item
        rx_item = db.query(PrescriptionItem).filter(
            PrescriptionItem.id == prescription_item_id,
            PrescriptionItem.prescription_id == prescription_id,
        ).first()

        if not rx_item:
            logger.warning(f"Prescription item {prescription_item_id} not found")
            continue

        if not rx_item.medicine_id:
            failed_items.append({"medicine_name": rx_item.medicine_name, "reason": "Prescription item is missing medicine linkage"})
            continue

        if rx_item.medicine_id != medicine_id:
            failed_items.append({
                "medicine_name": rx_item.medicine_name,
                "reason": "Selected medicine does not match prescription item.",
            })
            continue

        # Validate quantity doesn't exceed prescribed quantity.
        # Some older prescriptions may have null/0 quantity and rely on frequency+duration,
        # so derive and persist a usable prescribed quantity before validating.
        already_dispensed = rx_item.dispensed_quantity or 0
        prescribed_qty = calculate_prescribed_quantity(
            rx_item.frequency,
            rx_item.duration_value,
            rx_item.duration_unit,
            rx_item.quantity,
        ) or 0

        if prescribed_qty <= 0:
            # Last-resort fallback: allow current dispensing request to establish baseline.
            prescribed_qty = max(already_dispensed + quantity, 1)

        if not rx_item.quantity or rx_item.quantity <= 0:
            rx_item.quantity = prescribed_qty

        remaining_qty = prescribed_qty - already_dispensed

        if remaining_qty <= 0:
            logger.info(
                f"Skipping {rx_item.medicine_name}: already fully dispensed "
                f"(Prescribed: {prescribed_qty}, Dispensed: {already_dispensed})"
            )
            continue

        exceeds_prescribed = quantity > remaining_qty
        if exceeds_prescribed and not override_prescribed_limit:
            failed_items.append({
                "medicine_name": rx_item.medicine_name,
                "reason": (
                    f"Cannot dispense {quantity} units. Prescribed: {prescribed_qty}, "
                    f"Already dispensed: {already_dispensed}, Remaining: {remaining_qty}. "
                    f"You can dispense up to {remaining_qty} units, or explicitly confirm "
                    f"dispensing more than prescribed."
                ),
            })
            continue

        if quantity <= 0:
            logger.warning(f"Skipping item {rx_item.medicine_name} with quantity {quantity}")
            continue

        # Allocation + status update happen inside one SAVEPOINT — see the
        # failed_items comment above the loop. A stock-allocation failure
        # here rolls back only this item's batch/sale-item/movement writes
        # and the dispensed_quantity/is_dispensed flip below, leaving every
        # earlier-processed item's already-released savepoint untouched.
        try:
            with db.begin_nested():
                line_total_sum = _allocate_batches_and_create_sale_items(
                    db, hospital_id, dispensing, medicine_id, rx_item.medicine_name,
                    batch_id, quantity, requested_unit_price, prescription_item_id, user_id,
                )

                # Update prescription item dispensing status
                rx_item.dispensed_quantity = already_dispensed + quantity

                # Cap at prescribed quantity and mark as dispensed if complete.
                # Patient-requested partial closure is allowed: dispensing less than
                # prescribed quantity can still close the line item. An explicit
                # override (see exceeds_prescribed above) is the one case that
                # legitimately dispenses ABOVE prescribed_qty — don't clamp it
                # back down, or the audit trail's "requested vs recorded"
                # quantities would silently disagree.
                if exceeds_prescribed and override_prescribed_limit:
                    rx_item.is_dispensed = True
                elif rx_item.dispensed_quantity >= prescribed_qty:
                    rx_item.is_dispensed = True
                    rx_item.dispensed_quantity = prescribed_qty  # Ensure exact match
                else:
                    # Close partially dispensed line as patient-requested completion.
                    rx_item.is_dispensed = True
        except ValueError as item_err:
            failed_items.append({"medicine_name": rx_item.medicine_name, "reason": str(item_err)})
            continue

        total_amount += line_total_sum

        if exceeds_prescribed and override_prescribed_limit:
            try:
                from ..models.user import User
                from ..core.audit_logger import AuditLogger, AuditAction
                pharmacist = db.query(User).filter(User.id == user_id).first()
                AuditLogger.log(
                    action=AuditAction.PRESCRIPTION_DISPENSE,
                    user=pharmacist,
                    tenant=None,
                    resource_type="prescription_item",
                    resource_id=prescription_item_id,
                    old_values={"prescribed_quantity": str(prescribed_qty), "already_dispensed": str(already_dispensed)},
                    new_values={"dispensed_quantity": str(rx_item.dispensed_quantity)},
                    metadata={
                        "exceeded_prescribed": True,
                        "prescription_id": str(prescription_id),
                        "medicine_name": rx_item.medicine_name,
                        "excess_quantity": str(quantity - remaining_qty),
                    },
                )
            except Exception:
                logger.warning("Failed to write audit log for prescribed-quantity override", exc_info=True)
            logger.warning(
                "Pharmacist %s dispensed %s of '%s' — %s more than prescribed (prescribed %s, already dispensed %s)",
                user_id, quantity, rx_item.medicine_name, quantity - remaining_qty, prescribed_qty, already_dispensed,
            )
        processed_items_count += 1

        logger.info(
            f"Dispensed {quantity} of {rx_item.medicine_name} "
            f"(Remaining prescribed: {prescribed_qty - rx_item.dispensed_quantity})"
        )
    # Apply explicit skipped items to close remaining undispensed lines.
    for skipped in (skipped_items or []):
        skipped_item_id = skipped.get("prescription_item_id")
        if not skipped_item_id:
            continue

        if isinstance(skipped_item_id, str):
            skipped_item_id = uuid.UUID(skipped_item_id)

        rx_item = db.query(PrescriptionItem).filter(
            PrescriptionItem.id == skipped_item_id,
            PrescriptionItem.prescription_id == prescription_id,
        ).first()

        if not rx_item:
            raise ValueError(f"Skipped item {skipped_item_id} not found in prescription")

        prescribed_qty = calculate_prescribed_quantity(
            rx_item.frequency,
            rx_item.duration_value,
            rx_item.duration_unit,
            rx_item.quantity,
        ) or 0
        if prescribed_qty <= 0:
            prescribed_qty = max(rx_item.dispensed_quantity or 0, 1)

        if not rx_item.quantity or rx_item.quantity <= 0:
            rx_item.quantity = prescribed_qty

        if not rx_item.is_dispensed:
            rx_item.is_dispensed = True
            rx_item.dispensed_quantity = prescribed_qty
            skipped_items_count += 1

    # Allow partial dispensing: prescription remains finalized until all lines are closed.
    all_rx_items = db.query(PrescriptionItem).filter(
        PrescriptionItem.prescription_id == prescription_id
    ).all()

    def _is_line_closed(line: PrescriptionItem) -> bool:
        prescribed_qty = calculate_prescribed_quantity(
            line.frequency,
            line.duration_value,
            line.duration_unit,
            line.quantity,
        ) or 0
        current_dispensed = line.dispensed_quantity or 0

        if prescribed_qty <= 0:
            prescribed_qty = max(current_dispensed, 1)

        return bool(line.is_dispensed or current_dispensed >= prescribed_qty)

    all_lines_closed = all(_is_line_closed(i) for i in all_rx_items)
    
    if processed_items_count == 0:
        # All items were skipped (out of stock, patient refused, etc.).
        # Keep prescription pending/completed and preserve the audit trail
        # on the dispensing record notes, without mutating doctor clinical notes.
        if all_lines_closed:
            rx.status = "dispensed"
        else:
            rx.status = "finalized"
        # Remove the empty dispensing record we created — nothing was actually dispensed
        db.delete(dispensing)
        db.commit()
        return {
            "dispensing_id": None,
            "dispensing_number": None,
            "prescription_id": str(prescription_id),
            "prescription_number": rx.prescription_number,
            "status": rx.status,
            "total_amount": 0.0,
            "items_dispensed": 0,
            "failed_items": failed_items,
        }

    # Update prescription status: keep open for pending quantities.
    rx.status = "dispensed" if all_lines_closed else "finalized"
    
    # Update dispensing totals
    dispensing.total_amount = total_amount
    dispensing.subtotal = total_amount
    dispensing.tax_amount = tax_amount
    dispensing.net_amount = total_amount

    # Payment for a prescription-driven dispense is always collected
    # afterward (via SalesList's "Receive Payment", now that dispensing no
    # longer forces a same-flow billing page) — nothing has been tendered
    # yet, so this sale must start life as genuinely "pending" with the full
    # amount owed. Without this, paid_amount/balance_amount/payment_status
    # were left at their column defaults (0/0/"pending"), so the sale looked
    # pending but showed a ₹0.00 balance due and couldn't actually be paid.
    from .billing_queue_service import compute_payment_breakdown
    breakdown = compute_payment_breakdown(total_amount, amount_tendered=dispensing.amount_tendered)
    dispensing.paid_amount = breakdown["paid_amount"]
    dispensing.balance_amount = breakdown["balance_amount"]
    dispensing.payment_status = breakdown["payment_status"]

    # Pharmacy Queue (BRD v1.1 PQ-04) — auto-advance the matching queue entry
    # (if any) to Collected and link it to this bill, now that dispensing is done.
    from .billing_queue_service import link_pharmacy_queue_entry_to_sale
    link_pharmacy_queue_entry_to_sale(db, prescription_id, dispensing)

    db.commit()
    db.refresh(dispensing)
    
    logger.info(
        f"Dispensing completed for prescription {rx.prescription_number}. "
        f"Status: {rx.status}"
    )
    
    # Notify the prescribing doctor that their prescription has been dispensed.
    try:
        doctor = db.query(Doctor).filter(Doctor.id == rx.doctor_id).first()
        if doctor and doctor.user_id:
            patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()
            patient_name = f"{patient.first_name} {patient.last_name}".strip() if patient else "a patient"
            notify_hospital_users(
                db=db,
                hospital_id=hospital_id,
                title="Prescription Dispensed",
                message=f"Prescription {rx.prescription_number} for {patient_name} has been dispensed by pharmacy.",
                notification_type="dispensing",
                priority="normal",
                reference_type="prescription",
                reference_id=rx.id,
                extra_user_ids=[doctor.user_id],
            )
    except Exception:
        logger.warning("Failed to send dispensing notification", exc_info=True)

    return {
        "dispensing_id": str(dispensing.id),
        "dispensing_number": dispensing.invoice_number,
        "prescription_id": str(prescription_id),
        "prescription_number": rx.prescription_number,
        "status": rx.status,
        "total_amount": float(total_amount),
        "items_dispensed": processed_items_count,
        "items_skipped": skipped_items_count,
        "failed_items": failed_items,
    }


def get_dispensed_extra_items(db: Session, prescription_id: str | uuid.UUID) -> list[dict]:
    """
    Extra items (added by the pharmacist at dispense time, not tied to any
    prescription line) already dispensed for this prescription — surfaced
    when re-viewing an already-dispensed prescription, since these have no
    PrescriptionItem row of their own to reconstruct from (see
    dispense_prescription's "extra item" branch).
    """
    if isinstance(prescription_id, str):
        prescription_id = uuid.UUID(prescription_id)

    linked_sale_ids = (
        db.query(PharmacySaleItem.sale_id)
        .join(PrescriptionItem, PrescriptionItem.id == PharmacySaleItem.prescription_item_id)
        .filter(PrescriptionItem.prescription_id == prescription_id)
        .distinct()
        .subquery()
    )
    extra_rows = (
        db.query(PharmacySaleItem)
        .filter(
            PharmacySaleItem.sale_id.in_(db.query(linked_sale_ids.c.sale_id)),
            PharmacySaleItem.prescription_item_id.is_(None),
        )
        .all()
    )

    result = []
    for item in extra_rows:
        resolved_name = item.medicine_name or (item.medicine.name if item.medicine else None) or "Item"
        result.append({
            "id": str(item.id),
            "medicine_id": str(item.medicine_id) if item.medicine_id else None,
            "medicine_name": resolved_name,
            "batch_id": str(item.batch_id) if item.batch_id else None,
            "batch_number": item.batch.batch_number if item.batch else None,
            "quantity": item.quantity,
            "unit_price": float(item.unit_price) if item.unit_price else 0,
            "total_price": float(item.total_price) if item.total_price else 0,
        })
    return result


def get_consultation_fee_status(db: Session, appointment_id: Optional[uuid.UUID]) -> dict:
    """
    Whether the consultation fee tied to this appointment is fully paid, plus
    the amount owed and who to bill it to — lets the pharmacy billing screen
    fold an outstanding fee into the same payment instead of only warning
    that the patient still needs to make a separate trip to reception.
    """
    default = {"collected": True, "amount": 0.0, "appointment_id": None, "doctor_name": None}
    if not appointment_id:
        return default  # no appointment (walk-in/OTC) — nothing to gate on

    from ..models.invoice import Invoice as _Inv
    from ..models.appointment import Appointment as _Appt
    from .invoice_service import resolve_consultation_fee_amount

    appt = db.query(_Appt).filter(_Appt.id == appointment_id).first()
    if not appt:
        return default

    doctor_name = None
    if appt.doctor and appt.doctor.user:
        doctor_name = appt.doctor.user.full_name

    consult_inv = (
        db.query(_Inv)
        .filter(_Inv.appointment_id == appointment_id, _Inv.is_deleted == False)
        .order_by(_Inv.created_at.desc())
        .first()
    )
    if consult_inv:
        collected = float(consult_inv.balance_amount or 0) <= 0
        amount = float(consult_inv.balance_amount or 0) if not collected else 0.0
    else:
        collected = False  # no invoice yet — fee not collected (unless it's a free appt)
        amount = float(resolve_consultation_fee_amount(db, appt))

    return {
        "collected": collected,
        "amount": amount,
        "appointment_id": str(appointment_id),
        "doctor_name": doctor_name,
    }


def get_dispensing_details(
    db: Session,
    dispensing_id: str | uuid.UUID,
) -> Optional[dict]:
    """Get dispensing record with items."""
    if isinstance(dispensing_id, str):
        dispensing_id = uuid.UUID(dispensing_id)
    
    dispensing = db.query(PharmacySale).filter(
        PharmacySale.id == dispensing_id
    ).first()
    
    if not dispensing:
        return None
    
    # Get items with medicine + batch details for complete billing display.
    items = (
        db.query(PharmacySaleItem)
        .filter(PharmacySaleItem.sale_id == dispensing_id)
        .all()
    )
    
    # Get patient info
    patient = db.query(Patient).filter(Patient.id == dispensing.patient_id).first()

    # PharmacySale has no prescription_id column — a prescription-linked
    # dispensing is only traceable via its items' prescription_item_id (all
    # items in one dispensing batch always originate from the same prescription).
    prescription_id = None
    if dispensing.sale_type == "prescription":
        from ..models.prescription import PrescriptionItem as _RxItem
        linked_item = next((it for it in items if it.prescription_item_id), None)
        if linked_item:
            rx_item = db.query(_RxItem).filter(_RxItem.id == linked_item.prescription_item_id).first()
            if rx_item:
                prescription_id = rx_item.prescription_id

    # Check consultation fee status for prescription-linked dispensings
    consult_status = {"collected": True, "amount": 0.0, "appointment_id": None, "doctor_name": None}
    if prescription_id:
        from ..models.prescription import Prescription as _Rx
        linked_rx = db.query(_Rx).filter(_Rx.id == prescription_id).first()
        consult_status = get_consultation_fee_status(
            db, linked_rx.appointment_id if linked_rx else None
        )

    result = {
        "id": str(dispensing.id),
        "dispensing_number": dispensing.invoice_number,
        "hospital_id": str(dispensing.hospital_id),
        "patient_id": str(dispensing.patient_id) if dispensing.patient_id else None,
        "patient_name": patient.full_name if patient else None,
        "patient_reference_number": patient.patient_reference_number if patient else None,
        "prescription_id": str(prescription_id) if prescription_id else None,
        "consultation_fee_collected": consult_status["collected"],
        "consultation_fee_amount": consult_status["amount"],
        "consultation_appointment_id": consult_status["appointment_id"],
        "consultation_doctor_name": consult_status["doctor_name"],
        "sale_type": dispensing.sale_type,
        "status": dispensing.status,
        # subtotal maps to DB column total_amount in PharmacySale model
        "total_amount": float(dispensing.subtotal) if dispensing.subtotal else 0,
        "discount_amount": float(dispensing.discount_amount) if dispensing.discount_amount else 0,
        "tax_amount": float(dispensing.tax_amount) if dispensing.tax_amount else 0,
        # total_amount maps to DB column net_amount in PharmacySale model
        "net_amount": float(dispensing.total_amount) if dispensing.total_amount else 0,
        "notes": dispensing.notes,
        "dispensed_at": str(dispensing.sale_date) if dispensing.sale_date else None,  # Use sale_date
        "created_at": str(dispensing.created_at),
        "items": [],
    }
    
    for item in items:
        resolved_medicine_name = (
            item.medicine_name
            or (item.medicine.name if item.medicine else None)
            or "Medicine"
        )
        resolved_batch_number = item.batch.batch_number if item.batch else None

        result["items"].append({
            "id": str(item.id),
            "medicine_id": str(item.medicine_id),
            "batch_id": str(item.batch_id),
            "batch_number": resolved_batch_number,
            "expiry_date": str(item.batch.expiry_date) if item.batch and item.batch.expiry_date else None,
            "pack": item.medicine.units_per_pack if item.medicine and item.medicine.units_per_pack else None,
            "medicine_name": resolved_medicine_name,
            "quantity": item.quantity,
            "unit_price": float(item.unit_price) if item.unit_price else 0,
            "total_price": float(item.total_price) if item.total_price else 0,
        })
    
    return result


def mark_dispensing_paid(
    db: Session,
    dispensing_id: str | uuid.UUID,
    hospital_id: uuid.UUID,
    amount_paid: Decimal,
    payment_method: Optional[str] = None,
) -> Optional[PharmacySale]:
    """Record that a dispensing bill's invoice has been paid.

    PharmacySale.payment_status defaults to "pending" and nothing else ever
    updates it — DispensingBilling.tsx creates a separate Invoice/Payment pair
    to actually collect money (Invoice has no FK back to PharmacySale; see the
    "invoice_id removed" comment on the model), so the Sales list kept showing
    every prescription-driven sale as pending forever, even after payment was
    successfully collected and printed. This is called right after that
    payment is recorded so the two stay in sync.
    """
    if isinstance(dispensing_id, str):
        dispensing_id = uuid.UUID(dispensing_id)

    sale = db.query(PharmacySale).filter(
        PharmacySale.id == dispensing_id,
        PharmacySale.hospital_id == hospital_id,
    ).first()
    if not sale:
        return None

    total = sale.total_amount or Decimal("0")
    sale.paid_amount = amount_paid
    sale.balance_amount = max(Decimal("0"), total - amount_paid)
    sale.payment_status = "paid" if amount_paid >= total else "partially_paid"
    if payment_method:
        sale.payment_method = payment_method

    db.commit()
    db.refresh(sale)
    return sale


def _generate_dispensing_number(db: Session, hospital_id: uuid.UUID) -> str:
    """Generate unique dispensing number: DISP-YYYYMMDD-XXXXXX."""
    from datetime import date
    today = date.today().strftime("%Y%m%d")
    unique_part = uuid.uuid4().hex[:6].upper()
    return f"DISP-{today}-{unique_part}"


# ═══════════════════════════════════════════════════════════════════════════
# Get Available Batches for Medicine
# ═══════════════════════════════════════════════════════════════════════════

def get_available_batches(
    db: Session,
    medicine_id: str | uuid.UUID,
    min_quantity: int = 1,
) -> list[dict]:
    """
    Get available batches for a medicine (FEFO - First Expiry First Out).
    
    Returns batches sorted by expiry date (earliest first).
    """
    if isinstance(medicine_id, str):
        medicine_id = uuid.UUID(medicine_id)
    
    batches = db.query(MedicineBatch).filter(
        MedicineBatch.medicine_id == medicine_id,
        MedicineBatch.is_active == True,
        MedicineBatch.quantity >= min_quantity,
    ).order_by(MedicineBatch.expiry_date.asc()).all()
    
    result = []
    for batch in batches:
        result.append({
            "id": str(batch.id),
            "batch_number": batch.batch_number,
            "expiry_date": str(batch.expiry_date),
            "manufactured_date": str(batch.mfg_date) if batch.mfg_date else None,
            "quantity": batch.quantity,
            "selling_price": float(batch.selling_price) if batch.selling_price else 0,
            "purchase_price": float(batch.purchase_price) if batch.purchase_price else 0,
        })
    
    return result
