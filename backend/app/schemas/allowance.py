from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

AllowanceType = Literal["in_hand", "added_to_salary"]


class AllowanceCreate(BaseModel):
    user_id: str
    year: int
    month: int = Field(..., ge=1, le=12)
    amount: float = Field(..., gt=0)
    reason: str = Field(..., min_length=1, max_length=255)
    allowance_type: AllowanceType


class AllowanceResponse(BaseModel):
    id: str
    user_id: str
    reference_number: Optional[str] = None
    first_name: str
    last_name: str
    year: int
    month: int
    amount: float
    reason: str
    allowance_type: AllowanceType
    created_at: Optional[datetime] = None


class AllowanceLineItem(BaseModel):
    """Slimmer shape embedded in a Payroll item's detail popup — the
    employee/month context is already known there, so only the event
    itself needs representing."""
    amount: float
    reason: str
    allowance_type: AllowanceType
