from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
import calendar


def _validate_days(v: list[int]) -> list[int]:
    if any(d < 1 or d > 31 for d in v):
        raise ValueError("Each day must be between 1 and 31")
    return sorted(set(v))


class HolidayMonthUpdate(BaseModel):
    holiday_days: list[int] = Field(default_factory=list)
    festival_days: list[int] = Field(default_factory=list)

    @field_validator("holiday_days", "festival_days")
    @classmethod
    def validate_days(cls, v: list[int]) -> list[int]:
        return _validate_days(v)


class HolidayMonthResponse(BaseModel):
    hospital_id: str
    year: int
    month: int
    holiday_days: list[int]
    festival_days: list[int]
    working_days: int
    total_days: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

    @staticmethod
    def build(hospital_id: str, year: int, month: int, holiday_days: list[int],
              festival_days: Optional[list[int]] = None,
              created_at: Optional[datetime] = None, updated_at: Optional[datetime] = None) -> "HolidayMonthResponse":
        total_days = calendar.monthrange(year, month)[1]
        # Only regular/weekly-off (holiday_days) reduces working_days — festival_days
        # are paid regardless of attendance, so they stay inside the count.
        working_days = total_days - len([d for d in holiday_days if 1 <= d <= total_days])
        return HolidayMonthResponse(
            hospital_id=hospital_id, year=year, month=month,
            holiday_days=holiday_days, festival_days=festival_days or [],
            working_days=working_days, total_days=total_days,
            created_at=created_at, updated_at=updated_at,
        )
