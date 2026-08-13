from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator, ConfigDict
from typing import Optional, Any
from datetime import datetime
from .inventory import _validate_gstin_format, _require_gstin_when_registered, VALID_GST_REGISTRATION_STATUSES


class HospitalCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=200, description="Official hospital name")
    code: Optional[str] = Field(None, max_length=20)
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
    # GSTIN — the hospital's own party data for the Purchase Order
    # place-of-supply calculation (see gst_service.py). Distinct from the
    # generic tax_id above: validated to the 15-character Indian GSTIN
    # format and only required when gst_registration_status == 'registered'.
    gstin: Optional[str] = Field(None, max_length=15)
    gst_registration_status: Optional[str] = Field("registered")
    registration_number: Optional[str] = Field(None, max_length=50)
    specialty: str = Field(default="general", pattern="^(general|eye_hospital|multi_specialty)$")

    @field_validator("gst_registration_status")
    @classmethod
    def validate_gst_registration_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_GST_REGISTRATION_STATUSES:
            raise ValueError(f"Must be one of: {', '.join(VALID_GST_REGISTRATION_STATUSES)}")
        return v

    @field_validator("gstin")
    @classmethod
    def validate_gstin_field(cls, v: Optional[str]) -> Optional[str]:
        return _validate_gstin_format(v)

    @model_validator(mode="after")
    def check_gstin_required(self) -> "HospitalCreate":
        _require_gstin_when_registered(self.gstin, self.gst_registration_status, self.country)
        return self


class HospitalUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=200)
    code: Optional[str] = Field(None, max_length=20)
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
    gstin: Optional[str] = Field(None, max_length=15)
    gst_registration_status: Optional[str] = None
    registration_number: Optional[str] = Field(None, max_length=50)
    specialty: Optional[str] = Field(None, pattern="^(general|eye_hospital|multi_specialty)$")
    # logo_url intentionally excluded — it must only be set via the dedicated
    # file-upload endpoint (POST /hospital/logo/upload), never as a raw string.

    @field_validator("gst_registration_status")
    @classmethod
    def validate_gst_registration_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_GST_REGISTRATION_STATUSES:
            raise ValueError(f"Must be one of: {', '.join(VALID_GST_REGISTRATION_STATUSES)}")
        return v

    @field_validator("gstin")
    @classmethod
    def validate_gstin_field(cls, v: Optional[str]) -> Optional[str]:
        return _validate_gstin_format(v)


class HospitalResponse(BaseModel):
    id: str
    name: Optional[str] = None
    code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    timezone: Optional[str] = None
    default_currency: Optional[str] = None
    tax_id: Optional[str] = None
    gstin: Optional[str] = None
    gst_registration_status: Optional[str] = None
    registration_number: Optional[str] = None
    specialty: Optional[str] = None
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
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
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


class HospitalInstitutionOption(BaseModel):
    """One entry in the institution dual-letterhead selector (BRD §4.2/§5.3)."""
    id: str
    name: str
    specialty: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform_fields(cls, data: Any) -> Any:
        if hasattr(data, "__table__"):
            return {"id": str(data.id), "name": data.name, "specialty": data.specialty}
        return data

    model_config = ConfigDict(from_attributes=True)


class HospitalLogoUpload(BaseModel):
    logo_url: str
    message: str = "Logo updated successfully"