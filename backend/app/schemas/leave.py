"""
Leave Pydantic schemas.
"""
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, Any, Literal
from datetime import date, datetime


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


LeaveStatus = Literal["approved", "pending", "rejected"]


class LeaveRecordCreate(BaseModel):
    employee_id: str
    start_date: date
    end_date: date
    reason: Optional[str] = Field(None, max_length=255)
    status: LeaveStatus = "approved"

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class LeaveRecordResponse(BaseModel):
    id: str
    hospital_id: str
    employee_id: str
    start_date: date
    end_date: date
    reason: Optional[str] = None
    status: LeaveStatus = "approved"
    entered_by: str
    created_at: datetime
    # Enriched
    employee_name: Optional[str] = None
    days_taken: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class LeaveRecordListResponse(BaseModel):
    total: int
    data: list[LeaveRecordResponse]


class LeaveBalanceResponse(BaseModel):
    id: str
    employee_id: str
    year: int
    allocated: int
    used: int
    # Enriched (set post-validation — see leave.py router)
    remaining: int = 0
    employee_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)
