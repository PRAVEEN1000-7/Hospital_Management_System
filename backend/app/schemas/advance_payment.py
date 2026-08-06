from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class AdvancePaymentCreate(BaseModel):
    user_id: str
    amount: float = Field(..., gt=0)
    installments: int = Field(..., gt=0, le=60)
    start_year: int
    start_month: int = Field(..., ge=1, le=12)
    reason: str = Field(..., min_length=1, max_length=255)
    # emi_amount is deliberately NOT accepted here — computed server-side
    # from amount / installments, never trusted from the client.


class AdvancePaymentResponse(BaseModel):
    id: str
    user_id: str
    reference_number: Optional[str] = None
    first_name: str
    last_name: str
    amount: float
    installments: int
    emi_amount: float
    start_year: int
    start_month: int
    reason: str
    created_at: Optional[datetime] = None
    # Computed live as of "now" (today's year/month) — see
    # advance_payment_service.get_status. Lets the list screen show
    # "₹35,000 remaining of ₹50,000" without a separate repayment ledger.
    repaid_amount: float
    remaining_amount: float
    is_completed: bool


class AdvancePaymentLineItem(BaseModel):
    """Slimmer shape embedded in a Payroll item's detail popup — the
    employee/month context is already known there."""
    amount: float
    emi_amount: float
    this_month_deduction: float
    remaining_after: float
    reason: str
