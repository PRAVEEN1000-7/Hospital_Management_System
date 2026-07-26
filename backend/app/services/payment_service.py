"""
Payment service — record payments, update invoice balance, generate payment numbers.
"""
import uuid
import random
import string
import logging
from decimal import Decimal
from math import ceil
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func

from ..core.hospital_time import hospital_today_by_id
from ..core.billing_status import payment_status_bucket, invoice_statuses_for_payment_status

from ..models.payment import Payment
from ..models.invoice import Invoice
from ..models.patient import Patient
from ..models.user import User
from ..schemas.payment import (
    PaymentCreate, PaymentResponse, PaymentListItem, PaginatedPaymentResponse
)

logger = logging.getLogger(__name__)

# Roles allowed to be picked as "who actually collected" a payment — matches
# the roles already permitted to record payments in the first place
# (routers/payments.py: BILLING_STAFF_ROLES).
COLLECTOR_ROLES = {"super_admin", "admin", "cashier", "pharmacist", "receptionist"}


def generate_payment_number() -> str:
    date_str = date.today().strftime("%Y%m%d")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"PAY-{date_str}-{suffix}"


def payment_net_amount(payment: Payment) -> Decimal:
    """What's actually still collected on this payment — its amount minus any
    refunds against it that are pending/approved/processed. Pending/approved
    are reserved too, not just processed ones: a refund that's been requested
    or approved is effectively committed money leaving, so counting it as
    still "collected" until the processed step would overstate revenue for
    the window in between. Shared by the payments list (Net column) and any
    dashboard/report that sums real collections, so they can't drift apart."""
    reserved = sum(
        (r.amount or Decimal("0"))
        for r in (payment.refunds or [])
        if r.status in ("pending", "approved", "processed")
    )
    return max(Decimal("0"), (payment.amount or Decimal("0")) - reserved)


def _load_payment(db: Session, payment_id: str | uuid.UUID) -> Optional[Payment]:
    if isinstance(payment_id, str):
        try:
            payment_id = uuid.UUID(payment_id)
        except ValueError:
            return None
    return (
        db.query(Payment)
        .options(joinedload(Payment.invoice), joinedload(Payment.patient), joinedload(Payment.receiver))
        .filter(Payment.id == payment_id)
        .first()
    )


def _sync_invoice_after_payment(db: Session, invoice: Invoice) -> None:
    """Recompute paid_amount, balance_amount, and flip invoice status."""
    completed_payments = [p for p in (invoice.payments or []) if p.status == "completed"]
    paid_total = sum(p.amount for p in completed_payments)
    invoice.paid_amount = round(paid_total, 2)
    invoice.balance_amount = round((invoice.total_amount or Decimal("0")) - paid_total, 2)

    if invoice.status not in ("draft", "void", "cancelled"):
        if paid_total <= Decimal("0"):
            invoice.status = "issued"
        elif paid_total < (invoice.total_amount or Decimal("0")):
            invoice.status = "partially_paid"
        else:
            invoice.status = "paid"
    db.commit()


def record_payment(
    db: Session, data: PaymentCreate, user_id: uuid.UUID, hospital_id: uuid.UUID
) -> Payment:
    # Validate invoice
    try:
        invoice_uuid = uuid.UUID(data.invoice_id)
    except ValueError:
        raise ValueError("Invalid invoice ID")

    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.payments))
        .filter(
            Invoice.id == invoice_uuid,
            Invoice.hospital_id == hospital_id,
            Invoice.is_deleted == False,
        )
        .first()
    )
    if not invoice:
        raise ValueError("Invoice not found")

    try:
        patient_uuid = uuid.UUID(data.patient_id)
    except ValueError:
        raise ValueError("Invalid patient ID")

    if invoice.patient_id != patient_uuid:
        raise ValueError("Payment patient does not match invoice patient")

    if invoice.status in ("void", "cancelled"):
        raise ValueError(f"Cannot accept payment for a {invoice.status} invoice")
    if invoice.status == "paid":
        raise ValueError("Invoice is already fully paid")

    current_balance = (invoice.balance_amount or Decimal("0"))
    if Decimal(str(data.amount)) > current_balance:
        raise ValueError(
            f"Payment amount ₹{data.amount} exceeds the outstanding balance ₹{current_balance}"
        )

    collector_id = user_id
    if data.received_by:
        try:
            received_by_uuid = uuid.UUID(data.received_by)
        except ValueError:
            raise ValueError("Invalid collected-by user ID")
        collector = db.query(User).filter(
            User.id == received_by_uuid, User.hospital_id == hospital_id,
        ).first()
        if not collector:
            raise ValueError("Collected-by user not found in this hospital")
        collector_roles = {str(r).strip().lower() for r in (collector.roles or [])}
        if not (collector_roles & {r.lower() for r in COLLECTOR_ROLES}):
            raise ValueError("Selected user is not eligible to collect payments")
        collector_id = received_by_uuid

    payment = Payment(
        hospital_id=hospital_id,
        payment_number=generate_payment_number(),
        invoice_id=invoice_uuid,
        patient_id=patient_uuid,
        amount=data.amount,
        payment_mode=data.payment_mode,
        payment_reference=data.payment_reference,
        payment_date=data.payment_date or hospital_today_by_id(db, hospital_id),
        status="completed",
        received_by=collector_id,
        notes=data.notes,
    )
    db.add(payment)
    db.flush()

    # Reload invoice with fresh payments to recalculate
    db.refresh(invoice)
    _sync_invoice_after_payment(db, invoice)

    logger.info(f"Recorded payment {payment.payment_number} — {data.amount} via {data.payment_mode}")
    return payment


def list_payments(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    payment_mode: Optional[str] = None,
    invoice_id: Optional[str] = None,
    payment_status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    date_range: Optional[str] = None,
) -> PaginatedPaymentResponse:
    query = (
        db.query(Payment)
        .options(
            joinedload(Payment.invoice),
            joinedload(Payment.patient),
            joinedload(Payment.refunds),
        )
        .filter(Payment.hospital_id == hospital_id)
    )
    if payment_mode:
        query = query.filter(Payment.payment_mode == payment_mode)
    if payment_status:
        # BRD-001: filter Payment History by the linked invoice's derived
        # payment status (not_paid/partially_paid/paid) — see core/billing_status.py.
        statuses = invoice_statuses_for_payment_status(payment_status)
        if statuses:
            query = query.join(Invoice, Payment.invoice_id == Invoice.id).filter(Invoice.status.in_(statuses))
    if invoice_id:
        try:
            query = query.filter(Payment.invoice_id == uuid.UUID(invoice_id))
        except ValueError:
            pass
    if search:
        search = search.strip()
        query = query.join(Patient, Payment.patient_id == Patient.id).filter(
            or_(
                Payment.payment_number.ilike(f"%{search}%"),
                Patient.first_name.ilike(f"%{search}%"),
                Patient.last_name.ilike(f"%{search}%"),
            )
        )
    # Date-range shorthand takes priority over explicit from/to
    if date_range:
        now = datetime.now(timezone.utc)
        if date_range == "1h":
            cutoff = now - timedelta(hours=1)
            query = query.filter(Payment.created_at >= cutoff)
        elif date_range == "24h":
            cutoff = now - timedelta(hours=24)
            query = query.filter(Payment.created_at >= cutoff)
        elif date_range == "7d":
            cutoff = now - timedelta(days=7)
            query = query.filter(Payment.created_at >= cutoff)
        elif date_range == "30d":
            cutoff = now - timedelta(days=30)
            query = query.filter(Payment.created_at >= cutoff)
        elif date_range == "1y":
            cutoff = now - timedelta(days=365)
            query = query.filter(Payment.created_at >= cutoff)
    else:
        if date_from:
            try:
                query = query.filter(Payment.payment_date >= date.fromisoformat(date_from))
            except ValueError:
                pass
        if date_to:
            try:
                query = query.filter(Payment.payment_date <= date.fromisoformat(date_to))
            except ValueError:
                pass
    total = query.count()
    rows = query.order_by(Payment.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    items = []
    for p in rows:
        patient_name = ""
        if p.patient:
            patient_name = f"{p.patient.first_name} {p.patient.last_name}".strip()
        invoice_number = p.invoice.invoice_number if p.invoice else ""
        refunded_amount = sum(
            (r.amount or Decimal("0"))
            for r in (p.refunds or [])
            if r.status == "processed"
        )
        net_amount = payment_net_amount(p)
        items.append(PaymentListItem(
            id=str(p.id),
            payment_number=p.payment_number,
            invoice_id=str(p.invoice_id),
            invoice_number=invoice_number,
            patient_id=str(p.patient_id),
            patient_name=patient_name,
            amount=p.amount,
            payment_mode=p.payment_mode,
            payment_reference=p.payment_reference,
            payment_date=p.payment_date,
            status=p.status,
            invoice_payment_status=payment_status_bucket(p.invoice.status) if p.invoice else None,
            refunded_amount=refunded_amount,
            net_amount=net_amount,
            created_at=p.created_at,
        ))

    return PaginatedPaymentResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=ceil(total / limit) if total else 1,
    )


def get_payment_by_id(db: Session, payment_id: str | uuid.UUID) -> Optional[Payment]:
    return _load_payment(db, payment_id)


def list_collectors(db: Session, hospital_id: uuid.UUID) -> list[dict]:
    """Staff eligible to be picked as "who collected" a payment — used to
    populate the Collected By dropdown (any billing-capable role, not just
    the logged-in user)."""
    users = (
        db.query(User)
        .filter(User.hospital_id == hospital_id, User.is_active == True, User.is_deleted == False)
        .all()
    )
    eligible = {r.lower() for r in COLLECTOR_ROLES}
    result = []
    for u in users:
        roles = {str(r).strip().lower() for r in (u.roles or [])}
        if roles & eligible:
            result.append({"id": str(u.id), "first_name": u.first_name, "last_name": u.last_name})
    return sorted(result, key=lambda x: (x["first_name"], x["last_name"]))
