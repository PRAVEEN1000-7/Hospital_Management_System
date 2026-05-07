"""
Payments router — /api/v1/payments
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..dependencies import get_current_active_user
from ..models.user import User
from ..schemas.payment import PaymentCreate, PaymentResponse, PaginatedPaymentResponse
from ..services.payment_service import (
    record_payment, list_payments, get_payment_by_id
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["Billing — Payments"])

BILLING_STAFF_ROLES = {"super_admin", "admin", "cashier", "pharmacist", "receptionist"}
BILLING_VIEW_ROLES  = {"super_admin", "admin", "cashier", "pharmacist", "receptionist", "doctor"}


def _has_any_role(current_user: User, allowed_roles: set[str]) -> bool:
    roles = {str(r).strip().lower() for r in (current_user.roles or [])}
    return bool(roles & {r.lower() for r in allowed_roles})


def _require_billing_staff(current_user: User) -> None:
    if not _has_any_role(current_user, BILLING_STAFF_ROLES):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Billing staff access required")


def _require_billing_view(current_user: User) -> None:
    if not _has_any_role(current_user, BILLING_VIEW_ROLES):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied")


@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_new_payment(
    data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Record a payment against an invoice."""
    _require_billing_staff(current_user)
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
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    date_range: Optional[str] = Query(None, description="24h | 7d | 30d | 1y"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all payments with filters and pagination."""
    _require_billing_view(current_user)
    try:
        return list_payments(
            db, current_user.hospital_id, page, limit,
            search=search, payment_mode=payment_mode, invoice_id=invoice_id,
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
    _require_billing_view(current_user)
    try:
        return list_payments(db, current_user.hospital_id, page, limit, invoice_id=invoice_id)
    except Exception as e:
        logger.error(f"Error listing invoice payments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve payments")


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get payment details."""
    _require_billing_view(current_user)
    payment = get_payment_by_id(db, payment_id)
    if not payment or str(payment.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Payment not found")
    return PaymentResponse.model_validate(payment)
