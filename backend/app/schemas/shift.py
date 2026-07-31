from pydantic import BaseModel, Field, model_validator
from typing import Optional, Any
from datetime import time, datetime


def _orm_to_dict(data: Any) -> Any:
    """Stringify UUID columns before Pydantic validation — same helper used
    by schemas/department.py and every other simple response schema."""
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
    name: str = Field(..., max_length=50)
    start_time: time
    end_time: time


class ShiftUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    start_time: Optional[time] = None
    end_time: Optional[time] = None


class ShiftResponse(BaseModel):
    id: str
    hospital_id: str
    name: str
    start_time: time
    end_time: time
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    class Config:
        from_attributes = True


class ShiftAssignRequest(BaseModel):
    user_ids: list[str] = Field(..., min_length=1)
    shift_id: str
