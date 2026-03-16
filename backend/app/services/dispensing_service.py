"""
Dispensing Service — Handles prescription dispensing workflow.

This service manages the flow from finalized prescription to pharmacy dispensing:
1. Get pending prescriptions queue (finalized but not dispensed)
2. Dispense medicines from prescription
3. Update prescription status
4. Track partial dispensing
"""
import uuid
import logging
from datetime import datetime, timezone
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

logger = logging.getLogger(__name__)


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
    - 'finalized' → Ready to dispense (not started)
    - 'partially_dispensed' → Some items dispensed, some pending
    - 'dispensed' → All items dispensed (complete)
    """
    from math import ceil
    
    # Base query: finalized prescriptions for this hospital
    query = db.query(Prescription).filter(
        Prescription.hospital_id == hospital_id,
        Prescription.is_finalized == True,
        Prescription.is_deleted == False,
    )
    
    # Filter by status
    if status_filter:
        if status_filter == 'pending':
            # Not started dispensing
            query = query.filter(
                Prescription.status.in_(['finalized'])
            )
        elif status_filter == 'partial':
            query = query.filter(
                Prescription.status == 'partially_dispensed'
            )
        elif status_filter == 'dispensed':
            query = query.filter(
                Prescription.status == 'dispensed'
            )
    else:
        # Default: show pending and partial (work queue)
        query = query.filter(
            Prescription.status.in_(['finalized', 'partially_dispensed'])
        )
    
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
    
    # Order by priority (stat first), then by creation time
    rows = (
        query
        .order_by(
            # Stat prescriptions first (you can add priority field later)
            Prescription.created_at.desc()
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
    d = {
        "id": str(rx.id),
        "prescription_number": rx.prescription_number,
        "status": rx.status,
        "is_finalized": rx.is_finalized,
        "finalized_at": str(rx.finalized_at) if rx.finalized_at else None,
        "created_at": str(rx.created_at),
        "hospital_id": str(rx.hospital_id),
        "patient_id": str(rx.patient_id),
        "doctor_id": str(rx.doctor_id),
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
        d["patient_age"] = patient.age_years
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
        d["doctor_name"] = doctor.user.full_name
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
            "quantity": item.quantity,
            "dispensed_quantity": item.dispensed_quantity,
            "allow_substitution": item.allow_substitution,
            "is_dispensed": item.is_dispensed,
        }
        
        # Get available stock for this medicine
        if item.medicine_id:
            batch = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == item.medicine_id,
                MedicineBatch.is_active == True,
                MedicineBatch.quantity > 0,
            ).order_by(MedicineBatch.expiry_date.asc()).first()
            
            if batch:
                item_dict["available_batches"] = [{
                    "id": str(batch.id),
                    "batch_number": batch.batch_number,
                    "expiry_date": str(batch.expiry_date),
                    "quantity": batch.quantity,
                    "selling_price": float(batch.selling_price) if batch.selling_price else 0,
                }]
                item_dict["available_quantity"] = batch.quantity
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

def dispense_prescription(
    db: Session,
    prescription_id: str | uuid.UUID,
    hospital_id: uuid.UUID,
    user_id: uuid.UUID,
    items_to_dispense: list[dict],
    notes: Optional[str] = None,
) -> dict:
    """
    Dispense medicines from a prescription.
    
    Args:
        prescription_id: Prescription UUID
        hospital_id: Hospital UUID
        user_id: Pharmacist user UUID
        items_to_dispense: List of dicts with:
            - prescription_item_id: UUID
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
    
    # Create pharmacy_dispensing record
    dispensing = PharmacySale(
        hospital_id=hospital_id,
        invoice_number=_generate_dispensing_number(db, hospital_id),
        patient_id=rx.patient_id,
        sale_type="prescription",
        status="dispensed",
        dispensed_by=user_id,
        notes=notes,
        created_at=datetime.now(timezone.utc),
    )
    db.add(dispensing)
    db.flush()
    
    total_amount = Decimal("0")
    tax_amount = Decimal("0")
    all_items_dispensed = True
    partial_dispensing = False
    
    # Process each item
    for item_data in items_to_dispense:
        prescription_item_id = item_data.get("prescription_item_id")
        medicine_id = item_data.get("medicine_id")
        batch_id = item_data.get("batch_id")
        quantity = item_data.get("quantity", 0)
        unit_price = Decimal(str(item_data.get("unit_price", 0)))
        
        if not prescription_item_id or not medicine_id or not batch_id or quantity <= 0:
            continue
        
        # Convert UUIDs
        if isinstance(prescription_item_id, str):
            prescription_item_id = uuid.UUID(prescription_item_id)
        if isinstance(medicine_id, str):
            medicine_id = uuid.UUID(medicine_id)
        if isinstance(batch_id, str):
            batch_id = uuid.UUID(batch_id)
        
        # Get prescription item
        rx_item = db.query(PrescriptionItem).filter(
            PrescriptionItem.id == prescription_item_id,
            PrescriptionItem.prescription_id == prescription_id,
        ).first()
        
        if not rx_item:
            logger.warning(f"Prescription item {prescription_item_id} not found")
            continue
        
        # Get batch and validate stock
        batch = db.query(MedicineBatch).filter(
            MedicineBatch.id == batch_id,
            MedicineBatch.medicine_id == medicine_id,
        ).first()
        
        if not batch:
            raise ValueError(f"Batch not found for medicine {rx_item.medicine_name}")
        
        if batch.quantity < quantity:
            raise ValueError(
                f"Insufficient stock for {rx_item.medicine_name}. "
                f"Required: {quantity}, Available: {batch.quantity}"
            )
        
        # Reduce batch stock
        batch.quantity -= quantity
        
        # Calculate totals
        line_total = unit_price * quantity
        total_amount += line_total
        
        # Create dispensing item
        dispensing_item = PharmacySaleItem(
            sale_id=dispensing.id,
            prescription_item_id=prescription_item_id,
            medicine_id=medicine_id,
            batch_id=batch_id,
            quantity=quantity,
            unit_price=unit_price,
            total_price=line_total,
        )
        db.add(dispensing_item)
        
        # Update prescription item
        rx_item.dispensed_quantity = (rx_item.dispensed_quantity or 0) + quantity
        if rx_item.dispensed_quantity >= (rx_item.quantity or 0):
            rx_item.is_dispensed = True
            rx_item.dispensed_quantity = rx_item.quantity  # Cap at prescribed quantity
        else:
            # Partial dispensing
            partial_dispensing = True
            all_items_dispensed = False
        
        logger.info(
            f"Dispensed {quantity} of {rx_item.medicine_name} "
            f"(Batch: {batch.batch_number})"
        )
    
    # Check if any items were not dispensed at all
    all_rx_items = db.query(PrescriptionItem).filter(
        PrescriptionItem.prescription_id == prescription_id
    ).all()
    
    for rx_item in all_rx_items:
        if not rx_item.is_dispensed and rx_item.dispensed_quantity == 0:
            all_items_dispensed = False
            partial_dispensing = True
    
    # Update prescription status
    if all_items_dispensed:
        rx.status = "dispensed"
    elif partial_dispensing:
        rx.status = "partially_dispensed"
    
    # Update dispensing totals
    dispensing.total_amount = total_amount
    dispensing.subtotal = total_amount
    dispensing.tax_amount = tax_amount
    dispensing.net_amount = total_amount
    
    db.commit()
    db.refresh(dispensing)
    
    logger.info(
        f"Dispensing completed for prescription {rx.prescription_number}. "
        f"Status: {rx.status}"
    )
    
    return {
        "dispensing_id": str(dispensing.id),
        "dispensing_number": dispensing.invoice_number,
        "prescription_id": str(prescription_id),
        "prescription_number": rx.prescription_number,
        "status": rx.status,
        "total_amount": float(total_amount),
        "items_dispensed": len(items_to_dispense),
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
    
    # Get items
    items = db.query(PharmacySaleItem).filter(
        PharmacySaleItem.sale_id == dispensing_id
    ).all()
    
    # Get patient info
    patient = db.query(Patient).filter(Patient.id == dispensing.patient_id).first()
    
    result = {
        "id": str(dispensing.id),
        "dispensing_number": dispensing.invoice_number,
        "hospital_id": str(dispensing.hospital_id),
        "patient_id": str(dispensing.patient_id) if dispensing.patient_id else None,
        "patient_name": patient.full_name if patient else None,
        "sale_type": dispensing.sale_type,
        "status": dispensing.status,
        "total_amount": float(dispensing.total_amount) if dispensing.total_amount else 0,
        "discount_amount": float(dispensing.discount_amount) if dispensing.discount_amount else 0,
        "tax_amount": float(dispensing.tax_amount) if dispensing.tax_amount else 0,
        "net_amount": float(dispensing.net_amount) if dispensing.net_amount else 0,
        "notes": dispensing.notes,
        "dispensed_at": str(dispensing.dispensed_at) if dispensing.dispensed_at else None,
        "created_at": str(dispensing.created_at),
        "items": [],
    }
    
    for item in items:
        result["items"].append({
            "id": str(item.id),
            "medicine_id": str(item.medicine_id),
            "batch_id": str(item.batch_id),
            "quantity": item.quantity,
            "unit_price": float(item.unit_price) if item.unit_price else 0,
            "total_price": float(item.total_price) if item.total_price else 0,
        })
    
    return result


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
