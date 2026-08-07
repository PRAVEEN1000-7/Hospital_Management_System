"""
Payments router — /api/v1/payments
"""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..dependencies import get_current_active_user
from ..core.module_roles import check_permission
from ..models.user import User
from ..models.invoice import Invoice
from ..schemas.payment import PaymentCreate, PaymentResponse, PaginatedPaymentResponse
from ..services.payment_service import (
    record_payment, list_payments, get_payment_by_id, list_collectors
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["Billing — Payments"])

# Driven by the shared "billing" permission matrix — see the flagged
# conflict in docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md.
def _require_billing_staff(db: Session, current_user: User) -> None:
    if not check_permission(db, current_user, "billing", "edit"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Billing staff access required")


def _require_billing_view(db: Session, current_user: User) -> None:
    if not check_permission(db, current_user, "billing", "view"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied")


def _has_any_role(current_user: User, allowed_roles: set[str]) -> bool:
    roles = {str(r).strip().lower() for r in (current_user.roles or [])}
    return bool(roles & {r.lower() for r in allowed_roles})


# Narrow carve-out for receptionist "Collect Fee" AND lab staff "Collect
# Fee": unlike the consultation-invoice endpoint in invoices.py, POST
# /payments is generic — it records payments against ANY invoice (OPD,
# pharmacy, optical, lab, combined), so neither role can be let through
# unconditionally here or they could pay off arbitrary invoices. Only allow:
#   - a receptionist, when the target invoice is the consultation/OPD type
#     created for an appointment (see get_or_create_consultation_invoice_for_appointment
#     in services/invoice_service.py, which always uses invoice_type="opd"
#     and sets appointment_id);
#   - a lab_technician, when the target invoice is invoice_type="lab" (see
#     LabOrderDetail.tsx's Collect Payment flow / invoices.py's matching
#     _require_billing_staff_or_lab_invoice carve-out for create/issue).
# Cashier/admin/anyone who already passes _require_billing_staff is
# unaffected — they never reach this fallback.
def _require_billing_staff_or_consultation_payment(
    db: Session, current_user: User, data: PaymentCreate
) -> None:
    if check_permission(db, current_user, "billing", "edit"):
        return

    try:
        invoice_uuid = uuid.UUID(data.invoice_id)
    except ValueError:
        invoice_uuid = None
    invoice = (
        db.query(Invoice)
        .filter(
            Invoice.id == invoice_uuid,
            Invoice.hospital_id == current_user.hospital_id,
            Invoice.is_deleted == False,
        )
        .first()
        if invoice_uuid is not None
        else None
    )

    if _has_any_role(current_user, {"receptionist"}):
        if invoice is not None and invoice.invoice_type == "opd" and invoice.appointment_id is not None:
            return

    if _has_any_role(current_user, {"lab_technician"}):
        if invoice is not None and invoice.invoice_type == "lab":
            return

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Billing staff access required")


@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_new_payment(
    data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Record a payment against an invoice."""
    _require_billing_staff_or_consultation_payment(db, current_user, data)
    try:
        payment = record_payment(db, data, current_user.id, current_user.hospital_id)
        db.refresh(payment)
        return PaymentResponse.model_validate(payment)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error recording payment: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to record payment")


@router.get("", response_model=PaginatedPaymentResponse)
async def list_all_payments(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    payment_mode: Optional[str] = None,
    invoice_id: Optional[str] = None,
    payment_status: Optional[str] = Query(None, description="not_paid | partially_paid | paid — filters by the linked invoice's payment status"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    date_range: Optional[str] = Query(None, description="24h | 7d | 30d | 1y"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all payments with filters and pagination."""
    _require_billing_view(db, current_user)
    try:
        return list_payments(
            db, current_user.hospital_id, page, limit,
            search=search, payment_mode=payment_mode, invoice_id=invoice_id,
            payment_status=payment_status,
            date_from=date_from, date_to=date_to, date_range=date_range,
        )
    except Exception as e:
        logger.error(f"Error listing payments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve payments")


@router.get("/invoice/{invoice_id}", response_model=PaginatedPaymentResponse)
async def list_invoice_payments(
    invoice_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get all payments for a specific invoice."""
    _require_billing_view(db, current_user)
    try:
        return list_payments(db, current_user.hospital_id, page, limit, invoice_id=invoice_id)
    except Exception as e:
        logger.error(f"Error listing invoice payments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve payments")


@router.get("/collectors")
async def list_payment_collectors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Staff eligible to be selected as "who collected" a payment — used to
    populate the Collected By dropdown at fee-collection time. Open to the
    same billing-staff roles that can record payments (not admin-only) so
    receptionists can populate it themselves."""
    _require_billing_staff(db, current_user)
    return list_collectors(db, current_user.hospital_id)


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get payment details."""
    _require_billing_view(db, current_user)
    payment = get_payment_by_id(db, payment_id)
    if not payment or str(payment.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Payment not found")
    return PaymentResponse.model_validate(payment)
