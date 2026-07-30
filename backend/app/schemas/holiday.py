"""
Holiday Pydantic schemas.
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


HolidayType = Literal["festival", "weekly_off", "other"]


class HolidayCreate(BaseModel):
    date: date
    name: str = Field(..., min_length=1, max_length=150)
    type: HolidayType = "other"


class HolidayUpdate(BaseModel):
    date: Optional[date] = None
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    type: Optional[HolidayType] = None


class HolidayResponse(BaseModel):
    id: str
    hospital_id: str
    date: date
    name: str
    type: str = "other"
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class HolidayListResponse(BaseModel):
    total: int
    data: list[HolidayResponse]


class BulkWeeklyOffCreate(BaseModel):
    """Mark every occurrence of one weekday as a holiday for a given year —
    the "recurring weekly-off" bulk action (inserts one row per date)."""
    year: int = Field(..., ge=2000, le=2100)
    weekday: int = Field(..., ge=0, le=6)  # 0=Monday .. 6=Sunday (Python date.weekday())
    name: str = Field("Weekly Off", max_length=150)
