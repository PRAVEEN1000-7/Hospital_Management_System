from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class IncentiveCreate(BaseModel):
    user_id: str
    year: int
    month: int = Field(..., ge=1, le=12)
    sales_amount: float = Field(..., gt=0)
    incentive_percent: float = Field(..., gt=0, le=100)
    # incentive_amount is deliberately NOT accepted here — computed
    # server-side from sales_amount * incentive_percent, never trusted
    # from the client.


class IncentiveResponse(BaseModel):
    id: str
    user_id: str
    reference_number: Optional[str] = None
    first_name: str
    last_name: str
    year: int
    month: int
    sales_amount: float
    incentive_percent: float
    incentive_amount: float
    created_at: Optional[datetime] = None


class IncentiveLineItem(BaseModel):
    """Slimmer shape embedded in a Payroll item's detail popup — the
    employee/month context is already known there."""
    sales_amount: float
    incentive_percent: float
    incentive_amount: float
