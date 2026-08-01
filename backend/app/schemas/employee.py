"""
Employee Pydantic schemas.
"""
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, Any, Literal
from datetime import date, datetime
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


EmploymentType = Literal["full_time", "part_time", "contract"]


class EmployeeProfileCreate(BaseModel):
    user_id: str
    department_id: Optional[str] = None
    designation: Optional[str] = Field(None, max_length=100)
    date_of_joining: Optional[date] = None
    date_of_leaving: Optional[date] = None
    employment_type: EmploymentType = "full_time"
    bank_account_holder_name: Optional[str] = Field(None, max_length=150)
    bank_account_number: Optional[str] = Field(None, max_length=30)
    bank_ifsc: Optional[str] = Field(None, max_length=15)
    bank_branch: Optional[str] = Field(None, max_length=150)
    pf_number: Optional[str] = Field(None, max_length=30)
    pan_number: Optional[str] = Field(None, max_length=15)
    reporting_manager_id: Optional[str] = None
    paid_leave_entitlement: int = 0
    include_in_payroll: bool = True


class EmployeeProfileUpdate(BaseModel):
    department_id: Optional[str] = None
    designation: Optional[str] = Field(None, max_length=100)
    date_of_joining: Optional[date] = None
    date_of_leaving: Optional[date] = None
    employment_type: Optional[EmploymentType] = None
    bank_account_holder_name: Optional[str] = Field(None, max_length=150)
    bank_account_number: Optional[str] = Field(None, max_length=30)
    bank_ifsc: Optional[str] = Field(None, max_length=15)
    bank_branch: Optional[str] = Field(None, max_length=150)
    pf_number: Optional[str] = Field(None, max_length=30)
    pan_number: Optional[str] = Field(None, max_length=15)
    reporting_manager_id: Optional[str] = None
    paid_leave_entitlement: Optional[int] = None
    include_in_payroll: Optional[bool] = None


class EmployeeProfileResponse(BaseModel):
    id: str
    user_id: str
    hospital_id: str
    department_id: Optional[str] = None
    designation: Optional[str] = None
    date_of_joining: Optional[date] = None
    date_of_leaving: Optional[date] = None
    employment_type: str = "full_time"
    bank_account_holder_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_branch: Optional[str] = None
    pf_number: Optional[str] = None
    pan_number: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    paid_leave_entitlement: int = 0
    include_in_payroll: bool = True
    created_at: datetime
    updated_at: datetime
    # Enriched fields (set manually) — same convention as DoctorResponse.doctor_name
    employee_name: Optional[str] = None
    department_name: Optional[str] = None
    reporting_manager_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class EmployeeProfileListResponse(BaseModel):
    total: int
    data: list[EmployeeProfileResponse]


class EmployeeSalaryCreate(BaseModel):
    basic_salary: Decimal = Field(..., ge=0)
    flexi_allowance: Decimal = Decimal("0")
    pf_contribution_employee: Decimal = Decimal("0")
    effective_from: date


class EmployeeSalaryResponse(BaseModel):
    id: str
    employee_id: str
    hospital_id: str
    basic_salary: Decimal
    per_day_salary: Decimal
    flexi_allowance: Decimal
    pf_contribution_employee: Decimal
    effective_from: date
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)
