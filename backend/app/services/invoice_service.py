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
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func

from ..core.hospital_time import hospital_today_by_id
from ..core.billing_status import payment_status_bucket, invoice_statuses_for_payment_status

from ..models.pharmacy import MedicineBatch
from ..models.prescription import Medicine
from ..models.invoice import Invoice, InvoiceItem
from ..models.payment import Payment
from ..models.inventory import StockMovement
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
from .notification_service import notify_hospital_users

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Stock Validation
# ─────────────────────────────────────────────────────────────────────────────

def _validate_medicine_stock(
    db: Session,
    invoice_item_data: InvoiceItemCreate,
    invoice: Optional[Invoice] = None,
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
        raise ValueError("Medicine line item must include a valid reference_id")

    if not (invoice_item_data.batch_number or "").strip():
        raise ValueError("Medicine line item must include a batch_number")
    
    try:
        medicine_id = uuid.UUID(invoice_item_data.reference_id)
    except (ValueError, TypeError):
        return  # Invalid ID format, let other validation handle it
    
    quantity = float(invoice_item_data.quantity or 0)
    if quantity <= 0:
        return  # No quantity to validate

    # Include already-added draft lines so multiple lines cannot oversell stock.
    reserved_qty = 0.0
    if invoice is not None and getattr(invoice, "items", None):
        for line in invoice.items:
            if line.item_type != "medicine":
                continue
            if not line.reference_id:
                continue
            if str(line.reference_id) != str(medicine_id):
                continue

            if invoice_item_data.batch_number:
                if (line.batch_number or "") != invoice_item_data.batch_number:
                    continue

            reserved_qty += float(line.quantity or 0)

    effective_requested_qty = quantity + reserved_qty
    
    # Check medicine exists — scoped to the invoice's hospital (plus shared common
    # medicines) so a cross-tenant medicine_id can never be billed/deducted.
    med_query = db.query(Medicine).filter(
        Medicine.id == medicine_id,
        Medicine.is_active == True,
    )
    if invoice is not None and getattr(invoice, "hospital_id", None):
        med_query = med_query.filter(
            or_(Medicine.hospital_id == invoice.hospital_id, Medicine.is_global == True)
        )
    medicine = med_query.first()
    if not medicine:
        raise ValueError(f"Medicine not found or inactive: {medicine_id}")
    
    # `MedicineBatch.is_expired` is a stored flag nothing in this codebase ever
    # sets to True (it only ever keeps its default False) — filtering on it was
    # a no-op that let truly expired batches be billed with no warning.
    # Compare the real expiry_date against the invoice's own hospital-local
    # "today" instead, same as dispensing_service/pharmacy_service's FEFO
    # pickers.
    today = hospital_today_by_id(db, getattr(invoice, "hospital_id", None))
    batch = db.query(MedicineBatch).filter(
        MedicineBatch.medicine_id == medicine_id,
        MedicineBatch.batch_number == invoice_item_data.batch_number,
        MedicineBatch.is_active == True,
        MedicineBatch.expiry_date >= today,
    ).first()
    if not batch:
        raise ValueError(
            f"Batch '{invoice_item_data.batch_number}' not found, inactive, or expired"
        )

    available = int(batch.quantity or 0)
    if effective_requested_qty > available:
        raise ValueError(
            f"Insufficient stock in batch {invoice_item_data.batch_number}: "
            f"requested {int(effective_requested_qty)} units, only {available} available"
        )
    
    logger.info(
        f"Stock validation passed: medicine={medicine.name}, "
        f"batch={invoice_item_data.batch_number or 'any'}, "
        f"quantity={int(quantity)}, reserved={int(reserved_qty)}"
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
    """Flip invoice status based on paid vs total amounts. Deliberately does
    NOT special-case total<=0 (a free consultation) as auto-"paid" — same
    reasoning as issue_invoice: it stays "issued" until the explicit ₹0
    collection step (see payment_service._sync_invoice_after_payment)."""
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
    invoice_date = data.invoice_date or hospital_today_by_id(db, hospital_id)
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

    # Notify cashiers and admins that a new invoice has been created.
    try:
        patient = db.query(Patient).filter(Patient.id == uuid.UUID(data.patient_id)).first()
        patient_name = f"{patient.first_name} {patient.last_name}".strip() if patient else "a patient"
        notify_hospital_users(
            db=db,
            hospital_id=hospital_id,
            title="New Invoice Created",
            message=f"Invoice {invoice_number} for {patient_name} has been created.",
            notification_type="invoice",
            priority="normal",
            reference_type="invoice",
            reference_id=invoice.id,
            role_names=["cashier", "admin", "super_admin"],
            exclude_user_ids=[user_id],
        )
    except Exception:
        logger.warning("Failed to send invoice creation notification", exc_info=True)

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
    payment_status: Optional[str] = None,
    invoice_type: Optional[str] = None,
    patient_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> PaginatedInvoiceResponse:
    query = (
        db.query(Invoice)
        .options(joinedload(Invoice.patient))
        .filter(Invoice.hospital_id == hospital_id, Invoice.is_deleted == False)
    )
    if status:
        query = query.filter(Invoice.status == status)
    if payment_status:
        # BRD-001: derived 3-state filter (not_paid/partially_paid/paid),
        # layered on top of the granular `status` filter above — see
        # core/billing_status.py for the mapping.
        statuses = invoice_statuses_for_payment_status(payment_status)
        if statuses:
            query = query.filter(Invoice.status.in_(statuses))
    if invoice_type:
        query = query.filter(Invoice.invoice_type == invoice_type)
    if patient_id:
        try:
            query = query.filter(Invoice.patient_id == uuid.UUID(patient_id))
        except ValueError:
            pass
    if date_from:
        query = query.filter(Invoice.invoice_date >= date_from)
    if date_to:
        query = query.filter(Invoice.invoice_date <= date_to)
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
            payment_status=payment_status_bucket(inv.status),
            created_at=inv.created_at,
        ))

    return PaginatedInvoiceResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=ceil(total / limit) if total else 1,
    )


def get_payment_status_summary(db: Session, hospital_id: uuid.UUID) -> dict:
    """BRD-001 — counts + total amounts per payment-status bucket
    (not_paid/partially_paid/paid), hospital-scoped, for the Reports panel."""
    rows = (
        db.query(Invoice.status, func.count(Invoice.id), func.coalesce(func.sum(Invoice.total_amount), 0))
        .filter(Invoice.hospital_id == hospital_id, Invoice.is_deleted == False)
        .group_by(Invoice.status)
        .all()
    )
    summary = {
        "not_paid": {"count": 0, "total_amount": Decimal("0")},
        "partially_paid": {"count": 0, "total_amount": Decimal("0")},
        "paid": {"count": 0, "total_amount": Decimal("0")},
    }
    for inv_status, count, total in rows:
        bucket = payment_status_bucket(inv_status)
        if bucket:
            summary[bucket]["count"] += count
            summary[bucket]["total_amount"] += (total or Decimal("0"))
    return summary


# ═══════════════════════════════════════════════════════════════════════════
# Analytics — Reports & Analytics dashboard (real data, replacing the
# frontend's previously-mocked Revenue/Financial panels). "Revenue" is always
# measured from `Payment.amount`/`payment_date` (money actually collected in
# the period), not `Invoice.paid_amount`/`invoice_date` — an invoice raised
# weeks ago can still be paid today, and the dashboard's period filter is
# about when money moved, not when the invoice was created.
# ═══════════════════════════════════════════════════════════════════════════

def _pct_change(current: float, previous: float) -> float:
    if previous <= 0:
        return 0.0
    return round((current - previous) / previous * 100, 1)


def get_revenue_summary(db: Session, hospital_id, date_from: date, date_to: date) -> dict:
    """Total revenue collected in the period (+ %-change vs the immediately
    preceding period of equal length), and current outstanding dues.

    Outstanding dues is a running snapshot (like "Low Stock Items" elsewhere
    on this dashboard), not scoped to the period — an unpaid invoice from
    3 months ago is still owed today regardless of which period is selected.
    """
    from ..models.pharmacy import PharmacySale
    from ..models.optical import OpticalSale

    period_days = (date_to - date_from).days + 1
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=period_days - 1)

    def _collected(d_from: date, d_to: date) -> float:
        # OPD + Lab are billed through Invoice/Payment. Pharmacy and Optical
        # are NOT — their sale revenue lives only on PharmacySale/OpticalSale
        # and never creates an Invoice/Payment row — see get_revenue_trend's
        # docstring for the full reasoning. Must be added here too, or this
        # KPI tile permanently undercounts total revenue by the entire
        # pharmacy + optical take.
        invoice_val = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.hospital_id == hospital_id,
            Payment.status == "completed",
            Payment.payment_date >= d_from,
            Payment.payment_date <= d_to,
        ).scalar()
        pharmacy_val = db.query(func.coalesce(func.sum(PharmacySale.paid_amount), 0)).filter(
            PharmacySale.hospital_id == hospital_id,
            func.date(PharmacySale.created_at) >= d_from,
            func.date(PharmacySale.created_at) <= d_to,
        ).scalar()
        optical_val = db.query(func.coalesce(func.sum(OpticalSale.paid_amount), 0)).filter(
            OpticalSale.hospital_id == hospital_id,
            func.date(OpticalSale.created_at) >= d_from,
            func.date(OpticalSale.created_at) <= d_to,
        ).scalar()
        return float(invoice_val or 0) + float(pharmacy_val or 0) + float(optical_val or 0)

    revenue = _collected(date_from, date_to)
    prev_revenue = _collected(prev_from, prev_to)

    dues = float(db.query(func.coalesce(func.sum(Invoice.balance_amount), 0)).filter(
        Invoice.hospital_id == hospital_id,
        Invoice.is_deleted == False,
        Invoice.status.notin_(["void", "cancelled", "draft"]),
        Invoice.balance_amount > 0,
    ).scalar() or 0)

    return {
        "total_revenue": revenue,
        "revenue_change_pct": _pct_change(revenue, prev_revenue),
        "outstanding_dues": dues,
        # Not period-comparable — see docstring. Matches KPIStrip's existing
        # "Low Stock Items" precedent of change=0 for snapshot metrics.
        "dues_change_pct": 0.0,
    }


_REVENUE_MODULES = ("opd", "pharmacy", "optical", "lab")
_REVENUE_MODULE_COLORS = {"opd": "#137fec", "pharmacy": "#10b981", "optical": "#8b5cf6", "lab": "#ec4899"}


def _new_bucket() -> dict:
    return {m: 0.0 for m in _REVENUE_MODULES} | {"total": 0.0}


def get_revenue_trend(
    db: Session, hospital_id, granularity: str, date_from: date, date_to: date,
) -> list[dict]:
    """Revenue collected per day/month, broken down by module.

    OPD and Lab revenue is billed through the generic Invoice/Payment system
    (Invoice.invoice_type). Pharmacy and Optical are NOT — dispensing/sale
    revenue is recorded directly on PharmacySale/OpticalSale and never
    creates an Invoice or Payment row at all, so those two modules are
    pulled from their own tables and merged into the same per-period
    buckets. `invoice_type='combined'` spans more than one module, so it's
    folded into each period's `total` only, never attributed to a single
    bucket.
    """
    from ..models.pharmacy import PharmacySale
    from ..models.optical import OpticalSale

    buckets: dict = {}

    def bucket_for(period) -> dict:
        key = period if isinstance(period, date) else period.date()
        return buckets.setdefault(key, _new_bucket())

    period_col = (
        func.date(Payment.payment_date) if granularity == "daily"
        else func.date_trunc("month", Payment.payment_date)
    )
    invoice_rows = (
        db.query(period_col.label("period"), Invoice.invoice_type, func.coalesce(func.sum(Payment.amount), 0))
        .join(Invoice, Invoice.id == Payment.invoice_id)
        .filter(
            Payment.hospital_id == hospital_id,
            Payment.status == "completed",
            Payment.payment_date >= date_from,
            Payment.payment_date <= date_to,
        )
        .group_by("period", Invoice.invoice_type)
        .order_by("period")
        .all()
    )
    for period, inv_type, amount in invoice_rows:
        b = bucket_for(period)
        amt = float(amount or 0)
        if inv_type in _REVENUE_MODULES:
            b[inv_type] += amt
        b["total"] += amt

    pharmacy_period_col = (
        func.date(PharmacySale.created_at) if granularity == "daily"
        else func.date_trunc("month", PharmacySale.created_at)
    )
    pharmacy_rows = (
        db.query(pharmacy_period_col.label("period"), func.coalesce(func.sum(PharmacySale.paid_amount), 0))
        .filter(
            PharmacySale.hospital_id == hospital_id,
            func.date(PharmacySale.created_at) >= date_from,
            func.date(PharmacySale.created_at) <= date_to,
        )
        .group_by("period")
        .all()
    )
    for period, amount in pharmacy_rows:
        b = bucket_for(period)
        amt = float(amount or 0)
        b["pharmacy"] += amt
        b["total"] += amt

    optical_period_col = (
        func.date(OpticalSale.created_at) if granularity == "daily"
        else func.date_trunc("month", OpticalSale.created_at)
    )
    optical_rows = (
        db.query(optical_period_col.label("period"), func.coalesce(func.sum(OpticalSale.paid_amount), 0))
        .filter(
            OpticalSale.hospital_id == hospital_id,
            func.date(OpticalSale.created_at) >= date_from,
            func.date(OpticalSale.created_at) <= date_to,
        )
        .group_by("period")
        .all()
    )
    for period, amount in optical_rows:
        b = bucket_for(period)
        amt = float(amount or 0)
        b["optical"] += amt
        b["total"] += amt

    result = []
    for key in sorted(buckets.keys()):
        b = buckets[key]
        if granularity == "daily":
            result.append({"date": key.isoformat(), **b})
        else:
            result.append({"month": key.strftime("%b"), **b})
    return result


def get_revenue_by_module(db: Session, hospital_id, date_from: date, date_to: date) -> list[dict]:
    """Single-period revenue totals per module, for the Revenue-by-Module pie chart.

    Same OPD/Lab-via-Invoice vs Pharmacy/Optical-via-their-own-tables split
    as get_revenue_trend — see that function's docstring for why."""
    from ..models.pharmacy import PharmacySale
    from ..models.optical import OpticalSale

    rows = (
        db.query(Invoice.invoice_type, func.coalesce(func.sum(Payment.amount), 0))
        .join(Invoice, Invoice.id == Payment.invoice_id)
        .filter(
            Payment.hospital_id == hospital_id,
            Payment.status == "completed",
            Payment.payment_date >= date_from,
            Payment.payment_date <= date_to,
        )
        .group_by(Invoice.invoice_type)
        .all()
    )
    totals = {m: 0.0 for m in _REVENUE_MODULES}
    grand_total = 0.0
    for inv_type, amount in rows:
        amt = float(amount or 0)
        if inv_type in totals:
            totals[inv_type] += amt
        grand_total += amt  # 'combined' counts toward the denominator, no single bucket

    pharmacy_total = float(
        db.query(func.coalesce(func.sum(PharmacySale.paid_amount), 0))
        .filter(
            PharmacySale.hospital_id == hospital_id,
            func.date(PharmacySale.created_at) >= date_from,
            func.date(PharmacySale.created_at) <= date_to,
        )
        .scalar() or 0
    )
    totals["pharmacy"] += pharmacy_total
    grand_total += pharmacy_total

    optical_total = float(
        db.query(func.coalesce(func.sum(OpticalSale.paid_amount), 0))
        .filter(
            OpticalSale.hospital_id == hospital_id,
            func.date(OpticalSale.created_at) >= date_from,
            func.date(OpticalSale.created_at) <= date_to,
        )
        .scalar() or 0
    )
    totals["optical"] += optical_total
    grand_total += optical_total

    return [
        {
            "department": module.capitalize(),
            "revenue": amt,
            "percentage": round(amt / grand_total * 100, 1) if grand_total > 0 else 0.0,
            "color": _REVENUE_MODULE_COLORS[module],
        }
        for module, amt in totals.items()
    ]


_COLLECTION_MODE_LABELS = {
    "cash": "Cash", "upi": "UPI", "debit_card": "Debit Card",
    "credit_card": "Credit Card", "insurance": "Insurance",
}
_COLLECTION_MODE_COLORS = {
    "cash": "#10b981", "upi": "#8b5cf6", "debit_card": "#137fec",
    "credit_card": "#6366f1", "insurance": "#f59e0b",
}


def get_collections_by_mode(db: Session, hospital_id, date_from: date, date_to: date) -> list[dict]:
    """Collected amount grouped by Payment.payment_mode, for the Financial panel."""
    rows = (
        db.query(Payment.payment_mode, func.coalesce(func.sum(Payment.amount), 0))
        .filter(
            Payment.hospital_id == hospital_id,
            Payment.status == "completed",
            Payment.payment_date >= date_from,
            Payment.payment_date <= date_to,
        )
        .group_by(Payment.payment_mode)
        .all()
    )
    total = sum(float(a or 0) for _, a in rows)
    result = [
        {
            "method": _COLLECTION_MODE_LABELS.get(mode, mode.replace("_", " ").title()),
            "amount": float(amount or 0),
            "percentage": round(float(amount or 0) / total * 100, 1) if total > 0 else 0.0,
            "color": _COLLECTION_MODE_COLORS.get(mode, "#94a3b8"),
        }
        for mode, amount in rows
    ]
    return sorted(result, key=lambda r: -r["amount"])


def get_outstanding_aging(db: Session, hospital_id) -> list[dict]:
    """Unpaid invoice balances bucketed by days-since-invoice-date — a running
    snapshot as of today, not scoped to the dashboard's period filter."""
    today = hospital_today_by_id(db, hospital_id)
    rows = db.query(Invoice.invoice_date, Invoice.balance_amount).filter(
        Invoice.hospital_id == hospital_id,
        Invoice.is_deleted == False,
        Invoice.status.notin_(["void", "cancelled", "draft"]),
        Invoice.balance_amount > 0,
    ).all()

    brackets = ["0-30 days", "31-60 days", "61-90 days", "90+ days"]
    buckets = {b: {"count": 0, "amount": 0.0} for b in brackets}
    for inv_date, balance in rows:
        age = (today - inv_date).days
        bracket = brackets[3] if age > 90 else brackets[min(age // 31, 2)]
        buckets[bracket]["count"] += 1
        buckets[bracket]["amount"] += float(balance or 0)

    return [{"age_bracket": b, **buckets[b]} for b in brackets]


def get_tax_summary(db: Session, hospital_id, date_from: date, date_to: date) -> list[dict]:
    """Taxable/tax/total for the period. `InvoiceItem.tax_config_id` exists in
    the schema for a per-tax-type (CGST/SGST/IGST) breakdown, but no invoice
    item in this system actually sets it today (billing flows only populate
    the flat `tax_rate`/`tax_amount` fields) — so a real per-type split would
    just be one giant "uncategorized" bucket. Returning the one real total
    here instead of fabricating a type split that doesn't exist in the data.
    """
    row = db.query(
        func.coalesce(func.sum(Invoice.subtotal), 0),
        func.coalesce(func.sum(Invoice.tax_amount), 0),
        func.coalesce(func.sum(Invoice.total_amount), 0),
    ).filter(
        Invoice.hospital_id == hospital_id,
        Invoice.is_deleted == False,
        Invoice.invoice_date >= date_from,
        Invoice.invoice_date <= date_to,
    ).first()
    return [{
        "tax_type": "All Taxes",
        "taxable_amount": float(row[0] or 0),
        "tax_amount": float(row[1] or 0),
        "total": float(row[2] or 0),
    }]


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

    _deduct_invoice_medicine_stock(db, invoice)

    if invoice.invoice_type == "opd" and not _is_opd_credit_allowed(db, invoice.hospital_id):
        paid = invoice.paid_amount or Decimal("0")
        total = invoice.total_amount or Decimal("0")
        if paid < total:
            raise ValueError("OPD invoice requires full payment before issue")
        invoice.due_date = invoice.invoice_date

    paid = invoice.paid_amount or Decimal("0")
    total = invoice.total_amount or Decimal("0")
    # A ₹0 invoice (e.g. a free MC1/MC2 follow-up consultation) is
    # deliberately left "issued" here, same as any other invoice — it still
    # needs the explicit ₹0 collection step (payment_service.record_payment)
    # to reach "paid", so staff get a visible "Collect Fee" action to
    # acknowledge/confirm the free visit rather than it silently vanishing
    # from their worklist as already settled.
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


def _deduct_invoice_medicine_stock(db: Session, invoice: Invoice) -> None:
    """STEP 4: Deduct medicine stock on issue with idempotency guard."""
    existing = db.query(StockMovement.id).filter(
        StockMovement.reference_type == "invoice_issue",
        StockMovement.reference_id == invoice.id,
    ).first()
    if existing:
        logger.warning(
            "Stock movements already exist for invoice %s; skipping duplicate deduction",
            invoice.invoice_number,
        )
        return

    for line in invoice.items:
        if line.item_type != "medicine":
            continue
        if not line.reference_id:
            raise ValueError(
                f"Medicine line item {line.id} missing reference_id; cannot deduct stock"
            )

        try:
            qty_decimal = Decimal(line.quantity or 0)
        except Exception:
            raise ValueError(f"Invalid quantity for medicine line item {line.id}")

        if qty_decimal <= 0:
            continue
        if qty_decimal != qty_decimal.to_integral_value():
            raise ValueError(
                f"Medicine line quantity must be whole number for stock deduction (item {line.id})"
            )

        medicine_id = line.reference_id
        remaining = int(qty_decimal)

        # `MedicineBatch.is_expired` is a stored flag nothing in this codebase
        # ever sets to True — filtering on it below was a no-op that let
        # already-expired batches be deducted from on invoice issue with no
        # warning. Compare the real expiry_date against this invoice's
        # hospital-local "today" instead.
        today = hospital_today_by_id(db, invoice.hospital_id)

        batch_num = (line.batch_number or "").strip()
        if batch_num:
            # Specific batch requested — row-lock it (FOR UPDATE) to prevent
            # concurrent invoice/dispense deductions from overselling.
            batches = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == medicine_id,
                MedicineBatch.batch_number == batch_num,
                MedicineBatch.is_active == True,
                MedicineBatch.expiry_date >= today,
            ).with_for_update().all()
            if not batches:
                raise ValueError(
                    f"Batch '{batch_num}' not found for medicine line item {line.id}"
                )
        else:
            # No batch specified — use FIFO (earliest-expiring batches with stock)
            batches = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == medicine_id,
                MedicineBatch.is_active == True,
                MedicineBatch.expiry_date >= today,
                MedicineBatch.quantity > 0,
            ).with_for_update().order_by(MedicineBatch.expiry_date.asc()).all()
            if not batches:
                raise ValueError(
                    f"No stock available for medicine in line item {line.id}"
                )

        for batch in batches:
            if remaining <= 0:
                break
            available = int(batch.quantity or 0)
            deduct = min(remaining, available)
            batch.quantity = available - deduct
            remaining -= deduct
            balance_after = _get_medicine_total_stock(db, medicine_id)
            db.add(StockMovement(
                hospital_id=invoice.hospital_id,
                item_type="medicine",
                item_id=medicine_id,
                batch_id=batch.id,
                movement_type="sale",
                reference_type="invoice_issue",
                reference_id=invoice.id,
                quantity=-deduct,
                balance_after=balance_after,
                unit_cost=line.unit_price,
                notes=f"Invoice issue {invoice.invoice_number}",
                performed_by=invoice.created_by,
            ))

        if remaining > 0:
            raise ValueError(
                f"Insufficient stock for medicine line item {line.id}: still need {remaining} units"
            )


def _get_medicine_total_stock(db: Session, medicine_id: uuid.UUID) -> int:
    total = db.query(func.sum(MedicineBatch.quantity)).filter(
        MedicineBatch.medicine_id == medicine_id,
        MedicineBatch.is_active == True,
    ).scalar() or 0
    return int(total)


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
    _validate_medicine_stock(db, item_data, invoice)

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


def resolve_consultation_fee_amount(
    db: Session, appointment: Appointment, has_invoice: Optional[bool] = None
) -> Decimal:
    """Consultation fee owed for this appointment.

    Bug #40: an appointment's consultation_fee is auto-filled from the
    doctor's rate at BOOKING time (resolve_new_appointment_fee) and there's
    no UI to set a genuine per-appointment override — so that frozen value
    is never a deliberate one-off, it's just whatever the doctor's rate
    happened to be when the appointment was created. Editing the doctor's
    rate afterward must still reach any appointment that hasn't been billed
    yet. Once an invoice exists, the amount actually charged is locked in and
    must never be silently rewritten by a later rate change.

    Priority order:
      - Free follow-up (follow_up_label MC1/MC2/... — a return visit within
        the hospital's free-follow-up window, see
        appointment_service.compute_follow_up_label): always 0, overriding
        every other source below. "MCR" (Renewal, i.e. the free window has
        lapsed) is a normal paid visit and does NOT get this waiver.
      - Not yet invoiced: doctor's CURRENT rate > frozen appointment snapshot > hospital default.
      - Already invoiced: frozen appointment snapshot (what was actually billed) > doctor's rate > hospital default.
    """
    label = appointment.follow_up_label
    if label and label != "MCR" and label.startswith("MC"):
        return Decimal("0")

    if has_invoice is None:
        has_invoice = db.query(Invoice.id).filter(
            Invoice.appointment_id == appointment.id, Invoice.is_deleted == False,
        ).first() is not None

    doctor_fee = (
        Decimal(appointment.doctor.consultation_fee)
        if appointment.doctor and appointment.doctor.consultation_fee is not None
        else None
    )
    appt_fee = Decimal(appointment.consultation_fee) if appointment.consultation_fee is not None else None

    if not has_invoice and doctor_fee is not None and doctor_fee > Decimal("0"):
        return doctor_fee
    if appt_fee is not None:
        return appt_fee
    if doctor_fee is not None and doctor_fee > Decimal("0"):
        return doctor_fee

    from ..models.hospital_settings import HospitalSettings as _HospSettings
    hs = db.query(_HospSettings).filter(_HospSettings.hospital_id == appointment.hospital_id).first()
    if hs and hs.consultation_fee_default:
        try:
            fallback = Decimal(str(hs.consultation_fee_default))
            if fallback > Decimal("0"):
                return fallback
        except Exception:
            pass
    return Decimal("0")


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

    consultation_fee = resolve_consultation_fee_amount(db, appointment)
    # Allow ₹0 invoices (free consultation) — do not block the flow

    existing_invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.items))
        .filter(
            Invoice.hospital_id == hospital_id,
            Invoice.appointment_id == appointment.id,
            Invoice.patient_id == patient_id,
            Invoice.is_deleted == False,
            # A void/cancelled invoice can never accept payment (see
            # record_payment) — reusing one here would trap the appointment
            # behind an unpayable invoice forever. Fall through and create a
            # fresh one instead.
            Invoice.status.notin_(["void", "cancelled"]),
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
