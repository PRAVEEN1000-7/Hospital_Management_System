"""
Refunds router — /api/v1/refunds
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..dependencies import get_current_active_user
from ..models.user import User
from ..schemas.refund import (
    RefundCreate, RefundResponse, PaginatedRefundResponse,
    RefundProcessRequest, RefundRejectRequest,
)
from ..services.refund_service import (
    request_refund, list_refunds, get_refund_by_id,
    approve_refund, reject_refund, process_refund,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/refunds", tags=["Billing — Refunds"])

BILLING_ADMIN_ROLES = {"super_admin", "admin"}
BILLING_STAFF_ROLES = {"super_admin", "admin", "cashier", "pharmacist"}


def _has_any_role(current_user: User, allowed_roles: set[str]) -> bool:
    roles = {str(r).strip().lower() for r in (current_user.roles or [])}
    return bool(roles & {r.lower() for r in allowed_roles})


def _require_billing_staff(current_user: User) -> None:
    if not _has_any_role(current_user, BILLING_STAFF_ROLES):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Billing staff access required")


def _require_billing_admin(current_user: User) -> None:
    if not _has_any_role(current_user, BILLING_ADMIN_ROLES):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Admin or Super Admin role required")


@router.post("", response_model=RefundResponse, status_code=status.HTTP_201_CREATED)
async def request_new_refund(
    data: RefundCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Request a refund for a completed payment."""
    _require_billing_staff(current_user)
    try:
        refund = request_refund(db, data, current_user.id, current_user.hospital_id)
        db.refresh(refund)
        return RefundResponse.model_validate(refund)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error requesting refund: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to request refund")


@router.get("", response_model=PaginatedRefundResponse)
async def list_all_refunds(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    invoice_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all refunds with optional status, invoice, and patient filters."""
    _require_billing_staff(current_user)
    try:
        return list_refunds(
            db, current_user.hospital_id, page, limit,
            status=status, invoice_id=invoice_id, patient_id=patient_id,
        )
    except Exception as e:
        logger.error(f"Error listing refunds: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve refunds")


@router.get("/{refund_id}", response_model=RefundResponse)
async def get_refund(
    refund_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get refund details."""
    _require_billing_staff(current_user)
    refund = get_refund_by_id(db, refund_id)
    if not refund or str(refund.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Refund not found")
    return RefundResponse.model_validate(refund)


@router.patch("/{refund_id}/approve", response_model=RefundResponse)
async def approve_refund_endpoint(
    refund_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Approve a pending refund request."""
    _require_billing_admin(current_user)
    refund = get_refund_by_id(db, refund_id)
    if not refund or str(refund.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Refund not found")
    try:
        refund = approve_refund(db, refund, current_user.id)
        return RefundResponse.model_validate(refund)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error approving refund {refund_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to approve refund")


@router.patch("/{refund_id}/reject", response_model=RefundResponse)
async def reject_refund_endpoint(
    refund_id: str,
    data: RefundRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Reject a pending refund request."""
    _require_billing_admin(current_user)
    refund = get_refund_by_id(db, refund_id)
    if not refund or str(refund.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Refund not found")
    try:
        refund = reject_refund(db, refund, current_user.id, data)
        return RefundResponse.model_validate(refund)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error rejecting refund {refund_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to reject refund")


@router.patch("/{refund_id}/process", response_model=RefundResponse)
async def process_refund_endpoint(
    refund_id: str,
    data: RefundProcessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Mark an approved refund as processed (money returned to patient)."""
    _require_billing_staff(current_user)
    refund = get_refund_by_id(db, refund_id)
    if not refund or str(refund.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Refund not found")
    try:
        refund = process_refund(db, refund, data)
        return RefundResponse.model_validate(refund)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing refund {refund_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to process refund")
