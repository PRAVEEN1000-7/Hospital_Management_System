"""
Refund service — request, approve, reject, process workflow.
"""
import uuid
import random
import string
import logging
from decimal import Decimal
from math import ceil
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from ..models.refund import Refund
from ..models.payment import Payment
from ..models.invoice import Invoice
from ..models.patient import Patient
from ..schemas.refund import (
    RefundCreate, RefundResponse, RefundListItem,
    PaginatedRefundResponse, RefundProcessRequest, RefundRejectRequest,
)

logger = logging.getLogger(__name__)


def generate_refund_number() -> str:
    date_str = date.today().strftime("%Y%m%d")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"REF-{date_str}-{suffix}"


def _load_refund(db: Session, refund_id: str | uuid.UUID) -> Optional[Refund]:
    if isinstance(refund_id, str):
        try:
            refund_id = uuid.UUID(refund_id)
        except ValueError:
            return None
    return (
        db.query(Refund)
        .options(
            joinedload(Refund.invoice),
            joinedload(Refund.payment),
            joinedload(Refund.patient),
        )
        .filter(Refund.id == refund_id)
        .first()
    )


def request_refund(
    db: Session, data: RefundCreate, user_id: uuid.UUID, hospital_id: uuid.UUID
) -> Refund:
    try:
        payment_uuid = uuid.UUID(data.payment_id)
    except ValueError:
        raise ValueError("Invalid payment ID")

    payment = (
        db.query(Payment)
        .filter(Payment.id == payment_uuid, Payment.hospital_id == hospital_id)
        .first()
    )
    if not payment:
        raise ValueError("Payment not found")
    if payment.status != "completed":
        raise ValueError("Refund can only be requested for completed payments")

    # Check requested amount doesn't exceed payment
    existing_refunds = (
        db.query(Refund)
        .filter(Refund.payment_id == payment_uuid, Refund.status.in_(["pending", "approved", "processed"]))
        .all()
    )
    already_refunded = sum(r.amount for r in existing_refunds)
    available = payment.amount - already_refunded
    if data.amount > available:
        raise ValueError(
            f"Refund amount ({data.amount}) exceeds available refundable amount ({available:.2f})"
        )

    refund = Refund(
        hospital_id=hospital_id,
        refund_number=generate_refund_number(),
        invoice_id=uuid.UUID(data.invoice_id),
        payment_id=payment_uuid,
        patient_id=uuid.UUID(data.patient_id),
        amount=data.amount,
        reason_code=data.reason_code,
        reason_detail=data.reason_detail,
        status="pending",
        refund_mode=data.refund_mode,
        requested_by=user_id,
    )
    db.add(refund)
    db.commit()
    db.refresh(refund)
    logger.info(f"Refund requested: {refund.refund_number} — amount={data.amount}")
    return refund


def approve_refund(db: Session, refund: Refund, approver_id: uuid.UUID) -> Refund:
    if refund.status != "pending":
        raise ValueError(f"Cannot approve a refund with status '{refund.status}'")
    refund.status = "approved"
    refund.approved_by = approver_id
    db.commit()
    db.refresh(refund)
    logger.info(f"Refund approved: {refund.refund_number}")
    return refund


def reject_refund(
    db: Session, refund: Refund, user_id: uuid.UUID, data: RefundRejectRequest
) -> Refund:
    if refund.status not in ("pending",):
        raise ValueError(f"Cannot reject a refund with status '{refund.status}'")
    refund.status = "rejected"
    refund.approved_by = user_id
    if data.reason_detail:
        refund.reason_detail = data.reason_detail
    db.commit()
    db.refresh(refund)
    logger.info(f"Refund rejected: {refund.refund_number}")
    return refund


def process_refund(
    db: Session, refund: Refund, data: RefundProcessRequest
) -> Refund:
    if refund.status != "approved":
        raise ValueError("Only approved refunds can be processed")
    refund.status = "processed"
    if data.refund_mode:
        refund.refund_mode = data.refund_mode
    if data.refund_reference:
        refund.refund_reference = data.refund_reference
    refund.processed_at = datetime.now(tz=timezone.utc)

    # Reduce invoice paid_amount and recalculate balance
    invoice = db.query(Invoice).filter(Invoice.id == refund.invoice_id).first()
    if invoice:
        new_paid = max(Decimal("0"), (invoice.paid_amount or Decimal("0")) - refund.amount)
        invoice.paid_amount = round(new_paid, 2)
        invoice.balance_amount = round(
            (invoice.total_amount or Decimal("0")) - invoice.paid_amount, 2
        )
        # Keep invoice state machine consistent after refund adjustments.
        if invoice.status not in ("draft", "void", "cancelled"):
            if invoice.paid_amount <= Decimal("0"):
                invoice.status = "issued"
            elif invoice.paid_amount < (invoice.total_amount or Decimal("0")):
                invoice.status = "partially_paid"
            else:
                invoice.status = "paid"
        # Mark the source payment as reversed if fully refunded
        if refund.payment_id:
            payment = db.query(Payment).filter(Payment.id == refund.payment_id).first()
            if payment:
                existing_processed = (
                    db.query(Refund)
                    .filter(
                        Refund.payment_id == refund.payment_id,
                        Refund.status == "processed",
                    )
                    .all()
                )
                total_refunded = sum(r.amount for r in existing_processed)
                if total_refunded >= payment.amount:
                    payment.status = "reversed"

    db.commit()
    db.refresh(refund)
    logger.info(f"Refund processed: {refund.refund_number}")
    return refund


def list_refunds(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 10,
    status: Optional[str] = None,
    invoice_id: Optional[str] = None,
    patient_id: Optional[str] = None,
) -> PaginatedRefundResponse:
    query = (
        db.query(Refund)
        .options(
            joinedload(Refund.invoice),
            joinedload(Refund.payment),
            joinedload(Refund.patient),
        )
        .filter(Refund.hospital_id == hospital_id)
    )
    if status:
        query = query.filter(Refund.status == status)
    if invoice_id:
        try:
            query = query.filter(Refund.invoice_id == uuid.UUID(invoice_id))
        except (ValueError, AttributeError):
            pass
    if patient_id:
        try:
            query = query.filter(Refund.patient_id == uuid.UUID(patient_id))
        except (ValueError, AttributeError):
            pass
    total = query.count()
    rows = query.order_by(Refund.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    items = []
    for r in rows:
        patient_name = ""
        if r.patient:
            patient_name = f"{r.patient.first_name} {r.patient.last_name}".strip()
        invoice_number = r.invoice.invoice_number if r.invoice else ""
        items.append(RefundListItem(
            id=str(r.id),
            refund_number=r.refund_number,
            invoice_id=str(r.invoice_id),
            invoice_number=invoice_number,
            patient_id=str(r.patient_id),
            patient_name=patient_name,
            amount=r.amount,
            reason_code=r.reason_code,
            reason_detail=r.reason_detail,
            status=r.status,
            created_at=r.created_at,
        ))

    return PaginatedRefundResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=ceil(total / limit) if total else 1,
    )


def get_refund_by_id(db: Session, refund_id: str | uuid.UUID) -> Optional[Refund]:
    return _load_refund(db, refund_id)
