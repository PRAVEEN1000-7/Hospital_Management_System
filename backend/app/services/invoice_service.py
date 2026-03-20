"""
Invoice service — create, read, update, issue, void, add/remove items.
All monetary arithmetic uses Python's Decimal type for accuracy.
"""
import uuid
import random
import string
import logging
from decimal import Decimal
from math import ceil
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func

from ..models.pharmacy import MedicineBatch
from ..models.prescription import Medicine
from ..models.invoice import Invoice, InvoiceItem
from ..models.hospital_settings import HospitalSettings
from ..models.patient import Patient
from ..models.appointment import Appointment, Doctor
from ..models.tax_config import TaxConfiguration
from ..schemas.invoice import (
    InvoiceCreate, InvoiceUpdate, InvoiceResponse,
    InvoiceListItem, PaginatedInvoiceResponse,
    InvoiceItemCreate, InvoiceItemResponse,
)
from ..services.tax_service import calculate_item_tax

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Stock Validation
# ─────────────────────────────────────────────────────────────────────────────

def _validate_medicine_stock(
    db: Session, invoice_item_data: InvoiceItemCreate
) -> None:
    """
    STEP 3: Prevent overselling by validating medicine stock availability.
    
    If item is 'medicine' type with quantity specified:
    - Check if batch_number is provided: validate stock in that specific batch
    - If no batch_number: check total stock across all available batches
    - Raise ValueError if quantity exceeds available stock
    """
    if invoice_item_data.item_type != 'medicine':
        return  # No stock check needed for non-medicine items
    
    if not invoice_item_data.reference_id:
        return  # No medicine ID provided, skip validation
    
    try:
        medicine_id = uuid.UUID(invoice_item_data.reference_id)
    except (ValueError, TypeError):
        return  # Invalid ID format, let other validation handle it
    
    quantity = float(invoice_item_data.quantity or 0)
    if quantity <= 0:
        return  # No quantity to validate
    
    # Check medicine exists
    medicine = db.query(Medicine).filter(
        Medicine.id == medicine_id,
        Medicine.is_active == True,
    ).first()
    if not medicine:
        raise ValueError(f"Medicine not found or inactive: {medicine_id}")
    
    # If batch_number is specified, check that specific batch
    if invoice_item_data.batch_number:
        batch = db.query(MedicineBatch).filter(
            MedicineBatch.medicine_id == medicine_id,
            MedicineBatch.batch_number == invoice_item_data.batch_number,
            MedicineBatch.is_active == True,
            MedicineBatch.is_expired == False,
        ).first()
        if not batch:
            raise ValueError(
                f"Batch '{invoice_item_data.batch_number}' not found, "
                f"inactive, or expired"
            )
        available = int(batch.quantity or 0)
        if quantity > available:
            raise ValueError(
                f"Insufficient stock in batch {invoice_item_data.batch_number}: "
                f"requested {int(quantity)} units, only {available} available"
            )
    else:
        # Check total stock across all available batches
        total_stock = db.query(func.sum(MedicineBatch.quantity)).filter(
            MedicineBatch.medicine_id == medicine_id,
            MedicineBatch.is_active == True,
            MedicineBatch.is_expired == False,
        ).scalar() or 0
        total_stock = int(total_stock)
        if quantity > total_stock:
            raise ValueError(
                f"Insufficient stock for {medicine.name}: "
                f"requested {int(quantity)} units, only {total_stock} available"
            )
    
    logger.info(
        f"Stock validation passed: medicine={medicine.name}, "
        f"batch={invoice_item_data.batch_number or 'any'}, "
        f"quantity={int(quantity)}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Number generation
# ─────────────────────────────────────────────────────────────────────────────

def generate_invoice_number() -> str:
    date_str = date.today().strftime("%Y%m%d")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"INV-{date_str}-{suffix}"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_invoice(db: Session, invoice_id: str | uuid.UUID) -> Optional[Invoice]:
    if isinstance(invoice_id, str):
        try:
            invoice_id = uuid.UUID(invoice_id)
        except ValueError:
            return None
    return (
        db.query(Invoice)
        .options(
            joinedload(Invoice.patient),
            joinedload(Invoice.items),
        )
        .filter(Invoice.id == invoice_id, Invoice.is_deleted == False)
        .first()
    )


def _recalculate_invoice(db: Session, invoice: Invoice) -> None:
    """Recompute subtotal / tax / total / balance from current items.

    invoice.discount_amount holds the HEADER-level (cashier-applied) discount only.
    Item-level discounts live on each InvoiceItem.discount_amount.
    We deliberately do NOT overwrite invoice.discount_amount so it stays
    as the header discount across repeated calls (add/remove item cycles).
    """
    items = invoice.items or []
    subtotal = sum(
        (item.quantity or Decimal("0")) * (item.unit_price or Decimal("0"))
        for item in items
    )
    tax_amount = sum(item.tax_amount or Decimal("0") for item in items)
    item_discounts = sum(item.discount_amount or Decimal("0") for item in items)
    # Read header discount but do NOT overwrite it — prevents double-counting
    header_discount = invoice.discount_amount or Decimal("0")
    total_discount = item_discounts + header_discount
    total_amount = subtotal - total_discount + tax_amount
    balance_amount = total_amount - (invoice.paid_amount or Decimal("0"))

    invoice.subtotal = round(subtotal, 2)
    invoice.tax_amount = round(tax_amount, 2)
    # invoice.discount_amount intentionally unchanged (header value preserved)
    invoice.total_amount = round(max(total_amount, Decimal("0")), 2)
    invoice.balance_amount = round(balance_amount, 2)
    db.commit()


def _update_invoice_status(db: Session, invoice: Invoice) -> None:
    """Flip invoice status based on paid vs total amounts."""
    if invoice.status in ("draft", "void", "cancelled"):
        return
    paid = invoice.paid_amount or Decimal("0")
    total = invoice.total_amount or Decimal("0")
    if paid <= Decimal("0"):
        invoice.status = "issued"
    elif paid < total:
        invoice.status = "partially_paid"
    else:
        invoice.status = "paid"
    db.commit()


def _is_opd_credit_allowed(db: Session, hospital_id: uuid.UUID) -> bool:
    settings = db.query(HospitalSettings).filter(HospitalSettings.hospital_id == hospital_id).first()
    if not settings:
        # Safe default for legacy setups: keep existing behavior unless explicitly disabled.
        return True
    return bool(getattr(settings, "allow_opd_credit", True))


# ─────────────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────────────

def create_invoice(
    db: Session, data: InvoiceCreate, user_id: uuid.UUID, hospital_id: uuid.UUID
) -> Invoice:
    invoice_number = generate_invoice_number()
    invoice_date = data.invoice_date or date.today()
    due_date = data.due_date

    if data.invoice_type == "opd" and not _is_opd_credit_allowed(db, hospital_id):
        # OPD strict mode: invoice is due on the same date.
        due_date = invoice_date

    invoice = Invoice(
        hospital_id=hospital_id,
        invoice_number=invoice_number,
        patient_id=uuid.UUID(data.patient_id),
        appointment_id=uuid.UUID(data.appointment_id) if data.appointment_id else None,
        invoice_type=data.invoice_type,
        invoice_date=invoice_date,
        due_date=due_date,
        discount_amount=data.discount_amount or Decimal("0"),
        discount_reason=data.discount_reason,
        currency=data.currency or "INR",
        notes=data.notes,
        status="draft",
        subtotal=Decimal("0"),
        tax_amount=Decimal("0"),
        total_amount=Decimal("0"),
        paid_amount=Decimal("0"),
        balance_amount=Decimal("0"),
        created_by=user_id,
    )
    db.add(invoice)
    db.flush()  # get invoice.id without committing

    for item_data in (data.items or []):
        _add_item_to_invoice(db, invoice, item_data)

    _recalculate_invoice(db, invoice)
    logger.info(f"Created invoice {invoice_number} for patient {data.patient_id}")
    return invoice


def get_invoice_by_id(db: Session, invoice_id: str | uuid.UUID) -> Optional[Invoice]:
    return _load_invoice(db, invoice_id)


def list_invoices(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    status: Optional[str] = None,
    invoice_type: Optional[str] = None,
    patient_id: Optional[str] = None,
) -> PaginatedInvoiceResponse:
    query = (
        db.query(Invoice)
        .options(joinedload(Invoice.patient))
        .filter(Invoice.hospital_id == hospital_id, Invoice.is_deleted == False)
    )
    if status:
        query = query.filter(Invoice.status == status)
    if invoice_type:
        query = query.filter(Invoice.invoice_type == invoice_type)
    if patient_id:
        try:
            query = query.filter(Invoice.patient_id == uuid.UUID(patient_id))
        except ValueError:
            pass
    if search:
        search = search.strip()
        query = query.join(Patient, Invoice.patient_id == Patient.id).filter(
            or_(
                Invoice.invoice_number.ilike(f"%{search}%"),
                Patient.first_name.ilike(f"%{search}%"),
                Patient.last_name.ilike(f"%{search}%"),
                func.concat(Patient.first_name, " ", Patient.last_name).ilike(f"%{search}%"),
            )
        )
    total = query.count()
    rows = query.order_by(Invoice.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    items = []
    for inv in rows:
        patient_name = ""
        if inv.patient:
            patient_name = f"{inv.patient.first_name} {inv.patient.last_name}".strip()
        items.append(InvoiceListItem(
            id=str(inv.id),
            invoice_number=inv.invoice_number,
            patient_id=str(inv.patient_id),
            patient_name=patient_name,
            invoice_type=inv.invoice_type,
            invoice_date=inv.invoice_date,
            due_date=inv.due_date,
            total_amount=inv.total_amount or Decimal("0"),
            paid_amount=inv.paid_amount or Decimal("0"),
            balance_amount=inv.balance_amount or Decimal("0"),
            status=inv.status,
            created_at=inv.created_at,
        ))

    return PaginatedInvoiceResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=ceil(total / limit) if total else 1,
    )


def update_invoice(db: Session, invoice: Invoice, data: InvoiceUpdate) -> Invoice:
    if invoice.status not in ("draft",):
        raise ValueError("Only draft invoices can be updated")
    update_data = data.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        if k == "appointment_id":
            v = uuid.UUID(v) if v else None
        setattr(invoice, k, v)
    _recalculate_invoice(db, invoice)
    return invoice


def issue_invoice(db: Session, invoice: Invoice) -> Invoice:
    if invoice.status != "draft":
        raise ValueError("Only draft invoices can be issued")
    if not invoice.items:
        raise ValueError("Cannot issue an invoice with no line items")

    if invoice.invoice_type == "opd" and not _is_opd_credit_allowed(db, invoice.hospital_id):
        paid = invoice.paid_amount or Decimal("0")
        total = invoice.total_amount or Decimal("0")
        if paid < total:
            raise ValueError("OPD invoice requires full payment before issue")
        invoice.due_date = invoice.invoice_date

    paid = invoice.paid_amount or Decimal("0")
    total = invoice.total_amount or Decimal("0")
    if paid <= Decimal("0"):
        invoice.status = "issued"
    elif paid < total:
        invoice.status = "partially_paid"
    else:
        invoice.status = "paid"

    db.commit()
    db.refresh(invoice)
    logger.info(f"Issued invoice {invoice.invoice_number}")
    return invoice


def void_invoice(db: Session, invoice: Invoice) -> Invoice:
    if invoice.status in ("paid", "void"):
        raise ValueError(f"Cannot void an invoice with status '{invoice.status}'")
    if invoice.paid_amount and invoice.paid_amount > Decimal("0"):
        raise ValueError("Cannot void an invoice that has received payments. Request a refund first.")
    invoice.status = "void"
    db.commit()
    db.refresh(invoice)
    logger.info(f"Voided invoice {invoice.invoice_number}")
    return invoice


def soft_delete_invoice(db: Session, invoice: Invoice) -> None:
    if invoice.status not in ("draft", "cancelled"):
        raise ValueError("Only draft or cancelled invoices can be deleted")
    invoice.is_deleted = True
    db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# Line-item management
# ─────────────────────────────────────────────────────────────────────────────

def _add_item_to_invoice(db: Session, invoice: Invoice, item_data: InvoiceItemCreate) -> InvoiceItem:
    tax_rate = item_data.tax_rate or Decimal("0")

    # STEP 3: Validate medicine stock before adding item
    _validate_medicine_stock(db, item_data)

    # Resolve tax_rate from tax config if provided
    if item_data.tax_config_id:
        try:
            tc = db.query(TaxConfiguration).filter(
                TaxConfiguration.id == uuid.UUID(item_data.tax_config_id)
            ).first()
            if tc:
                tax_rate = tc.rate_percentage
        except (ValueError, Exception):
            pass

    calcs = calculate_item_tax(
        unit_price=float(item_data.unit_price),
        quantity=float(item_data.quantity),
        discount_pct=float(item_data.discount_percent or 0),
        tax_rate=float(tax_rate),
    )

    item = InvoiceItem(
        invoice_id=invoice.id,
        item_type=item_data.item_type,
        reference_id=uuid.UUID(item_data.reference_id) if item_data.reference_id else None,
        description=item_data.description,
        quantity=item_data.quantity,
        unit_price=item_data.unit_price,
        discount_percent=item_data.discount_percent or Decimal("0"),
        discount_amount=Decimal(str(calcs["discount_amount"])),
        tax_config_id=uuid.UUID(item_data.tax_config_id) if item_data.tax_config_id else None,
        tax_rate=tax_rate,
        tax_amount=Decimal(str(calcs["tax_amount"])),
        total_price=Decimal(str(calcs["total_price"])),
        display_order=item_data.display_order or 0,
    )
    # Use the ORM relationship so invoice.items is updated in-memory immediately.
    # Setting invoice_id alone (FK column) does NOT propagate to the parent
    # collection, which would cause _recalculate_invoice to see an empty list.
    invoice.items.append(item)
    return item


def add_invoice_item(
    db: Session, invoice: Invoice, item_data: InvoiceItemCreate
) -> InvoiceItem:
    if invoice.status not in ("draft",):
        raise ValueError("Line items can only be added to draft invoices")
    item = _add_item_to_invoice(db, invoice, item_data)
    db.flush()
    _recalculate_invoice(db, invoice)
    return item


def remove_invoice_item(db: Session, invoice: Invoice, item_id: str) -> None:
    if invoice.status not in ("draft",):
        raise ValueError("Line items can only be removed from draft invoices")
    try:
        item_uuid = uuid.UUID(item_id)
    except ValueError:
        raise ValueError("Invalid item ID")
    item = db.query(InvoiceItem).filter(
        InvoiceItem.id == item_uuid, InvoiceItem.invoice_id == invoice.id
    ).first()
    if not item:
        raise ValueError("Invoice item not found")
    db.delete(item)
    db.flush()
    # reload items
    db.refresh(invoice)
    _recalculate_invoice(db, invoice)


def get_or_create_consultation_invoice_for_appointment(
    db: Session,
    *,
    hospital_id: uuid.UUID,
    user_id: uuid.UUID,
    appointment_id: str | uuid.UUID,
    patient_id: str | uuid.UUID,
) -> Optional[Invoice]:
    """Return an issued consultation invoice for the appointment, creating one if needed."""
    if isinstance(appointment_id, str):
        try:
            appointment_id = uuid.UUID(appointment_id)
        except ValueError:
            return None

    if isinstance(patient_id, str):
        try:
            patient_id = uuid.UUID(patient_id)
        except ValueError:
            return None

    appointment = (
        db.query(Appointment)
        .options(joinedload(Appointment.doctor).joinedload(Doctor.user))
        .filter(
            Appointment.id == appointment_id,
            Appointment.hospital_id == hospital_id,
            Appointment.is_deleted == False,
        )
        .first()
    )
    if not appointment:
        return None

    consultation_fee = Decimal(appointment.consultation_fee or Decimal("0"))
    if consultation_fee <= Decimal("0") and appointment.doctor:
        consultation_fee = Decimal(appointment.doctor.consultation_fee or Decimal("0"))
    if consultation_fee <= Decimal("0"):
        return None

    existing_invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.items))
        .filter(
            Invoice.hospital_id == hospital_id,
            Invoice.appointment_id == appointment.id,
            Invoice.patient_id == patient_id,
            Invoice.is_deleted == False,
        )
        .order_by(Invoice.created_at.desc())
        .first()
    )

    doctor_name = appointment.doctor.user.full_name if appointment.doctor and appointment.doctor.user else "Doctor"
    consultation_desc = f"Consultation Fee - Dr. {doctor_name}"

    if existing_invoice:
        has_consultation_line = any(item.item_type == "consultation" for item in (existing_invoice.items or []))
        if existing_invoice.status == "draft" and not has_consultation_line:
            add_invoice_item(
                db,
                existing_invoice,
                InvoiceItemCreate(
                    item_type="consultation",
                    reference_id=str(appointment.id),
                    description=consultation_desc,
                    quantity=Decimal("1"),
                    unit_price=consultation_fee,
                    discount_percent=Decimal("0"),
                    tax_rate=Decimal("0"),
                    display_order=len(existing_invoice.items or []),
                ),
            )

        if existing_invoice.status == "draft" and (existing_invoice.items or []):
            issue_invoice(db, existing_invoice)
        db.refresh(existing_invoice)
        return existing_invoice

    created_invoice = create_invoice(
        db,
        InvoiceCreate(
            patient_id=str(patient_id),
            appointment_id=str(appointment.id),
            invoice_type="opd",
            invoice_date=date.today(),
            items=[
                InvoiceItemCreate(
                    item_type="consultation",
                    reference_id=str(appointment.id),
                    description=consultation_desc,
                    quantity=Decimal("1"),
                    unit_price=consultation_fee,
                    discount_percent=Decimal("0"),
                    tax_rate=Decimal("0"),
                    display_order=0,
                )
            ],
        ),
        user_id,
        hospital_id,
    )
    issue_invoice(db, created_invoice)
    db.refresh(created_invoice)
    return created_invoice
