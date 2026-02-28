"""
Doctor Pydantic schemas.
"""
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, Any
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


class DoctorCreate(BaseModel):
    user_id: str
    department_id: Optional[str] = None
    specialization: str = Field(..., min_length=2, max_length=100)
    qualification: str = Field(..., min_length=2, max_length=255)
    registration_number: str = Field(..., min_length=2, max_length=50)
    registration_authority: Optional[str] = Field(None, max_length=100)
    experience_years: Optional[int] = None
    bio: Optional[str] = None
    consultation_fee: Optional[Decimal] = None
    follow_up_fee: Optional[Decimal] = None
    is_available: bool = True


class DoctorUpdate(BaseModel):
    department_id: Optional[str] = None
    specialization: Optional[str] = Field(None, min_length=2, max_length=100)
    qualification: Optional[str] = Field(None, min_length=2, max_length=255)
    registration_number: Optional[str] = Field(None, min_length=2, max_length=50)
    registration_authority: Optional[str] = Field(None, max_length=100)
    experience_years: Optional[int] = None
    bio: Optional[str] = None
    consultation_fee: Optional[Decimal] = None
    follow_up_fee: Optional[Decimal] = None
    is_available: Optional[bool] = None
    is_active: Optional[bool] = None


class DoctorResponse(BaseModel):
    id: str
    user_id: str
    hospital_id: str
    department_id: Optional[str] = None
    employee_id: Optional[str] = None
    specialization: str
    qualification: str
    registration_number: str
    registration_authority: Optional[str] = None
    experience_years: Optional[int] = None
    bio: Optional[str] = None
    consultation_fee: Optional[Decimal] = None
    follow_up_fee: Optional[Decimal] = None
    is_available: bool = True
    is_active: bool = True
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime
    # Enriched fields (set manually)
    doctor_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class DoctorListResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[DoctorResponse]
