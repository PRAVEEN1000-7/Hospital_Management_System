from pydantic import BaseModel, Field
from typing import Optional, Literal


class AttendanceMarkRequest(BaseModel):
    status: Literal["present", "absent", "half_day"]
    reason: Optional[str] = Field(None, max_length=255)


class AttendanceEmployeeRow(BaseModel):
    user_id: str
    reference_number: Optional[str] = None
    first_name: str
    last_name: str
    designation: Optional[str] = None
    emp_status: Literal["active", "ex_employee"]
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None
    # One entry per day of the month (index 0 = day 1), each one of:
    # 'present' | 'absent' | 'half_day' | 'holiday' | 'festival' | 'na' | 'unmarked'
    # 'unmarked' = never explicitly marked — blank on the grid, but still
    # paid as Present (see attendance_service.get_month_report).
    days: list[str]
    present_count: float
    absent_count: float
    half_day_count: int
    holiday_count: int
    festival_count: int
    na_count: int
    unmarked_count: int
    # Payroll deduction — see attendance_service.get_month_report for the formula.
    paid_leave_entitlement: int
    working_days: int
    per_day_salary: float
    deduction_days: float
    deduction_amount: float


class AttendanceReportResponse(BaseModel):
    year: int
    month: int
    total_days: int
    shifts: list[dict]
    employees: list[AttendanceEmployeeRow]
    summary: dict = Field(default_factory=dict)
    # Day-of-month numbers strictly before today — mark_day rejects edits to
    # these server-side; the grid disables them and shows a download button.
    locked_days: list[int] = Field(default_factory=list)


class LeaveRecord(BaseModel):
    user_id: str
    reference_number: Optional[str] = None
    first_name: str
    last_name: str
    designation: Optional[str] = None
    shift_name: Optional[str] = None
    date: str  # YYYY-MM-DD
    status: Literal["absent", "half_day"]
    reason: Optional[str] = None
