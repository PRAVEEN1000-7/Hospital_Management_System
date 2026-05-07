"""
TaxConfiguration Pydantic schemas.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import date, datetime
from decimal import Decimal

VALID_APPLIES_TO = ["product", "service", "both"]


class TaxConfigBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=20, pattern=r"^[A-Z0-9_]+$")
    rate_percentage: Decimal = Field(..., ge=0, le=100, decimal_places=2)
    applies_to: str = Field(..., description="product | service | both")
    category: Optional[str] = Field(None, max_length=50)
    is_compound: bool = False
    effective_from: date
    effective_to: Optional[date] = None

    @field_validator("applies_to")
    @classmethod
    def validate_applies_to(cls, v: str) -> str:
        if v not in VALID_APPLIES_TO:
            raise ValueError(f"applies_to must be one of: {', '.join(VALID_APPLIES_TO)}")
        return v

    @field_validator("effective_to")
    @classmethod
    def validate_effective_to(cls, v: Optional[date], info) -> Optional[date]:
        if v is not None:
            from_val = info.data.get("effective_from")
            if from_val and v <= from_val:
                raise ValueError("effective_to must be after effective_from")
        return v


class TaxConfigCreate(TaxConfigBase):
    pass


class TaxConfigUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    rate_percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    applies_to: Optional[str] = None
    category: Optional[str] = None
    is_compound: Optional[bool] = None
    effective_to: Optional[date] = None

    @field_validator("applies_to")
    @classmethod
    def validate_applies_to(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_APPLIES_TO:
            raise ValueError(f"applies_to must be one of: {', '.join(VALID_APPLIES_TO)}")
        return v


class TaxConfigResponse(BaseModel):
    id: str
    hospital_id: str
    name: str
    code: str
    rate_percentage: Decimal
    applies_to: str
    category: Optional[str]
    is_compound: bool
    is_active: bool
    effective_from: date
    effective_to: Optional[date]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        if hasattr(obj, "__dict__"):
            data = {
                "id": str(obj.id),
                "hospital_id": str(obj.hospital_id),
                "name": obj.name,
                "code": obj.code,
                "rate_percentage": obj.rate_percentage,
                "applies_to": obj.applies_to,
                "category": obj.category,
                "is_compound": obj.is_compound,
                "is_active": obj.is_active,
                "effective_from": obj.effective_from,
                "effective_to": obj.effective_to,
                "created_at": obj.created_at,
                "updated_at": obj.updated_at,
            }
            return cls(**data)
        return super().model_validate(obj, **kwargs)


class PaginatedTaxConfigResponse(BaseModel):
    items: list[TaxConfigResponse]
    total: int
    page: int
    limit: int
    pages: int
