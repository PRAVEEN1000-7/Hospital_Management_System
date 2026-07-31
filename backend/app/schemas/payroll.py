from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PayrollItemResponse(BaseModel):
    user_id: str
    reference_number: Optional[str] = None
    first_name: str
    last_name: str
    designation: Optional[str] = None
    present_count: float
    absent_count: float
    paid_leave_entitlement: int
    working_days: int
    base_salary: float
    per_day_salary: float
    deduction_days: float
    deduction_amount: float
    net_payable: float


class PayrollRunResponse(BaseModel):
    year: int
    month: int
    generated_at: Optional[datetime] = None
    items: list[PayrollItemResponse]
    total_net_payable: float
