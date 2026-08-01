"""
Payroll Pydantic schemas.
"""
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, Any, Literal
from datetime import datetime
from decimal import Decimal


def _orm_to_dict(data: Any) -> Any:
    if hasattr(data, "__table__"):
        d = {}
        for col in data.__table__.columns:
            val = getattr(data, col.name)
            if hasattr(val, "hex"):
                val = str(val)
            d[col.name] = val
        return d
    return data


PayrollRunStatus = Literal["draft", "processed"]


class PayrollRunGenerateRequest(BaseModel):
    period_month: int = Field(..., ge=1, le=12)
    period_year: int = Field(..., ge=2000, le=2100)


class PayrollRunResponse(BaseModel):
    id: str
    hospital_id: str
    period_month: int
    period_year: int
    status: PayrollRunStatus = "draft"
    generated_by: str
    generated_at: datetime
    payslip_count: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class PayrollRunListResponse(BaseModel):
    total: int
    data: list[PayrollRunResponse]


class PayslipResponse(BaseModel):
    id: str
    payroll_run_id: str
    employee_id: str
    present_days: int
    absent_days: int
    leave_days_taken: int
    holiday_days: int
    lop_days: int
    per_day_rate: Decimal
    deduction_amount: Decimal
    gross_salary: Decimal
    net_salary: Decimal
    generated_at: datetime
    # Enriched
    employee_name: Optional[str] = None
    designation: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class PayslipListResponse(BaseModel):
    total: int
    data: list[PayslipResponse]
