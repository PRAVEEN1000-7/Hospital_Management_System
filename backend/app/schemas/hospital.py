from pydantic import BaseModel, EmailStr, Field, model_validator, field_validator, ConfigDict
from typing import Optional, Any
from datetime import datetime
import re


class HospitalCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=200, description="Official hospital name")
    code: Optional[str] = Field(None, max_length=20)
    phone_country_code: str = Field(default="+1", max_length=5)
    phone: str = Field(..., description="Primary phone number")
    email: EmailStr
    website: Optional[str] = Field(None, max_length=255)
    address_line_1: str = Field(..., min_length=5, description="Street address")
    address_line_2: Optional[str] = None
    city: str = Field(..., min_length=2, max_length=100)
    state_province: str = Field(..., min_length=2, max_length=100)
    country: str = Field(default="India", min_length=2, max_length=100)
    postal_code: str = Field(..., min_length=3, max_length=10)
    timezone: str = Field(default="Asia/Kolkata", max_length=50)
    default_currency: str = Field(default="INR", max_length=10)
    tax_id: Optional[str] = Field(None, max_length=50)
    registration_number: Optional[str] = Field(None, max_length=50)

    @field_validator("phone_country_code")
    @classmethod
    def validate_phone_country_code(cls, v: str) -> str:
        if not re.match(r"^\+[0-9]{1,4}$", v):
            raise ValueError("Phone country code must be in +<digits> format")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v or "")
        if len(digits) < 7 or len(digits) > 15:
            raise ValueError("Phone number must contain 7 to 15 digits")
        return digits


class HospitalUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=200)
    code: Optional[str] = Field(None, max_length=20)
    phone_country_code: Optional[str] = Field(None, max_length=5)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    website: Optional[str] = Field(None, max_length=255)
    address_line_1: Optional[str] = Field(None, min_length=5)
    address_line_2: Optional[str] = None
    city: Optional[str] = Field(None, min_length=2, max_length=100)
    state_province: Optional[str] = Field(None, min_length=2, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, min_length=3, max_length=10)
    timezone: Optional[str] = Field(None, max_length=50)
    default_currency: Optional[str] = Field(None, max_length=10)
    tax_id: Optional[str] = Field(None, max_length=50)
    registration_number: Optional[str] = Field(None, max_length=50)

    @field_validator("phone_country_code")
    @classmethod
    def validate_optional_phone_country_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return v
        if not re.match(r"^\+[0-9]{1,4}$", v):
            raise ValueError("Phone country code must be in +<digits> format")
        return v

    @field_validator("phone")
    @classmethod
    def validate_optional_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return v
        digits = re.sub(r"\D", "", v)
        if len(digits) < 7 or len(digits) > 15:
            raise ValueError("Phone number must contain 7 to 15 digits")
        return digits


class HospitalResponse(BaseModel):
    id: str
    name: str
    code: Optional[str] = None
    phone_country_code: str = "+1"
    phone: str
    email: str
    website: Optional[str] = None
    address_line_1: str
    address_line_2: Optional[str] = None
    city: str
    state_province: str
    country: str
    postal_code: str
    timezone: str
    default_currency: str
    tax_id: Optional[str] = None
    registration_number: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform_fields(cls, data: Any) -> Any:
        if hasattr(data, "__table__"):
            d = {}
            for col in data.__table__.columns:
                d[col.name] = getattr(data, col.name)
            d["id"] = str(data.id)
            return d
        if isinstance(data, dict):
            if "id" in data and not isinstance(data["id"], str):
                data["id"] = str(data["id"])
        return data

    model_config = ConfigDict(from_attributes=True)


class HospitalPublicInfo(BaseModel):
    id: str
    name: str
    phone_country_code: str = "+1"
    phone: str
    email: str
    website: Optional[str] = None
    address_line_1: str
    address_line_2: Optional[str] = None
    city: str
    state_province: str
    country: str
    postal_code: str
    logo_url: Optional[str] = None
    registration_number: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform_fields(cls, data: Any) -> Any:
        if hasattr(data, "__table__"):
            d = {}
            for col in data.__table__.columns:
                d[col.name] = getattr(data, col.name)
            d["id"] = str(data.id)
            return d
        if isinstance(data, dict):
            if "id" in data and not isinstance(data["id"], str):
                data["id"] = str(data["id"])
        return data

    model_config = ConfigDict(from_attributes=True)


class HospitalLogoUpload(BaseModel):
    logo_url: str
    message: str = "Logo updated successfully"