"""
Advance Payments router — /api/v1/advance-payments, gated by the
`attendance` module (same submodule area as Allowance, Incentive, Payroll).
"""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.advance_payment import AdvancePayment
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.advance_payment import AdvancePaymentCreate, AdvancePaymentResponse
from ..services import advance_payment_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/advance-payments", tags=["Advance Payments"])


def _to_response(a: AdvancePayment) -> AdvancePaymentResponse:
    year, month = advance_payment_service.today_year_month()
    repaid, remaining, completed = advance_payment_service.get_status(a, year, month)
    return AdvancePaymentResponse(
        id=str(a.id),
        user_id=str(a.user_id),
        reference_number=a.user.reference_number if a.user else None,
        first_name=a.user.first_name if a.user else "",
        last_name=a.user.last_name if a.user else "",
        amount=float(a.amount),
        installments=a.installments,
        emi_amount=float(a.emi_amount),
        start_year=a.start_year,
        start_month=a.start_month,
        reason=a.reason,
        created_at=a.created_at,
        repaid_amount=repaid,
        remaining_amount=remaining,
        is_completed=completed,
    )


@router.get("", response_model=list[AdvancePaymentResponse])
async def list_advance_payments(
    user_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    rows = advance_payment_service.list_advance_payments(
        db, current_user.hospital_id, user_id=uuid.UUID(user_id) if user_id else None,
    )
    return [_to_response(r) for r in rows]


@router.post("", response_model=AdvancePaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_advance_payment(
    body: AdvancePaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    row = advance_payment_service.create_advance_payment(
        db, current_user.hospital_id, uuid.UUID(body.user_id), body.amount, body.installments,
        body.start_year, body.start_month, body.reason, current_user.id,
    )
    return _to_response(row)


@router.delete("/{advance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_advance_payment(
    advance_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    ok = advance_payment_service.delete_advance_payment(db, current_user.hospital_id, uuid.UUID(advance_id))
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Advance payment not found")
