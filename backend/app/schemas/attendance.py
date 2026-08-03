"""
Attendance Pydantic schemas.
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


AttendanceStatus = Literal["not_marked", "present", "absent", "holiday", "on_leave"]


class AttendanceResponse(BaseModel):
    id: str
    hospital_id: str
    employee_id: str
    date: date
    status: AttendanceStatus = "not_marked"
    is_verified: bool = False
    marked_by: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    # Enriched
    employee_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class AttendanceMarkRequest(BaseModel):
    """A single grid-cell click — always an upsert on (employee_id, date)."""
    employee_id: str
    date: date
    status: AttendanceStatus


class AttendanceBulkMarkRequest(BaseModel):
    marks: list[AttendanceMarkRequest] = Field(..., min_length=1)


class AttendanceGridResponse(BaseModel):
    """One row per employee, one entry per date in the requested range —
    the shape AttendanceGrid.tsx renders directly."""
    date_from: date
    date_to: date
    data: list[AttendanceResponse]


class AttendanceVerifyRequest(BaseModel):
    date_from: date
    date_to: date
    employee_ids: Optional[list[str]] = None
