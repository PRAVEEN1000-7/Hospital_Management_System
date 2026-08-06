from pydantic import BaseModel, Field
from typing import Optional
from .allowance import AllowanceLineItem
from .incentive import IncentiveLineItem
from .advance_payment import AdvancePaymentLineItem


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
    # Sum of this month's 'added_to_salary' allowances — already folded into
    # net_payable below. Computed live on every read (see
    # payroll_service.get_live_payroll), so this always reflects whatever's
    # currently logged in the Allowance tab.
    allowance_added: float = 0
    # Sum of this month's incentives — already folded into net_payable below.
    incentive_added: float = 0
    # This month's advance-payment EMI deduction(s) — already folded into
    # net_payable below (subtracted).
    advance_deducted: float = 0
    net_payable: float
    # Every allowance (both types) logged for this employee this month —
    # powers the "click an employee" detail popup on the Payroll page.
    allowances: list[AllowanceLineItem] = Field(default_factory=list)
    incentives: list[IncentiveLineItem] = Field(default_factory=list)
    advances: list[AdvancePaymentLineItem] = Field(default_factory=list)


class PayrollRunResponse(BaseModel):
    year: int
    month: int
    items: list[PayrollItemResponse]
    total_net_payable: float
