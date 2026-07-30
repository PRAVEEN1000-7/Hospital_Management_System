"""
Shift Pydantic schemas.
"""
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, Any
from datetime import time, date, datetime


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


class ShiftCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    start_time: time
    end_time: time


class ShiftUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    start_time: Optional[time] = None
    end_time: Optional[time] = None


class ShiftResponse(BaseModel):
    id: str
    hospital_id: str
    name: str
    start_time: time
    end_time: time
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class ShiftListResponse(BaseModel):
    total: int
    data: list[ShiftResponse]


class ShiftAssignmentCreate(BaseModel):
    employee_id: str
    shift_id: str
    effective_from: date
    reason: str = Field(..., min_length=1, max_length=255)


class ShiftAssignmentResponse(BaseModel):
    id: str
    employee_id: str
    shift_id: str
    effective_from: date
    effective_to: Optional[date] = None
    assigned_by: str
    reason: Optional[str] = None
    created_at: datetime
    # Enriched
    employee_name: Optional[str] = None
    shift_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)
