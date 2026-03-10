from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator, computed_field
from typing import Optional, Any
from datetime import date, datetime


VALID_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
VALID_RELATIONSHIPS = [
    "Father", "Mother", "Husband", "Wife", "Son", "Daughter",
    "Brother", "Sister", "Friend", "Guardian", "Other",
]


VALID_TITLES = ["Mr.", "Mrs.", "Ms.", "Master", "Dr.", "Prof.", "Baby"]
CHILD_TITLES = ["Baby", "Master"]
ADULT_ONLY_TITLES = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."]


class PatientBase(BaseModel):
    title: Optional[str] = Field(None, max_length=10)
    first_name: str = Field(..., min_length=1, max_length=100, pattern=r"^[A-Za-z][A-Za-z\s'-]*$")
    last_name: str = Field(..., min_length=1, max_length=100, pattern=r"^[A-Za-z][A-Za-z\s'-]*$")
    date_of_birth: Optional[date] = None
    gender: str = Field(..., pattern="^(male|female|other|prefer_not_to_say|Male|Female|Other|Not Disclosed|Unknown)$")
    blood_group: Optional[str] = None
    phone_country_code: str = Field(default="+1", pattern=r"^\+[0-9]{1,4}$")
    phone_number: str = Field(..., pattern=r"^\d{10}$",
                               description="Phone number digits only (exactly 10 digits)")
    email: Optional[EmailStr] = None
    address_line_1: Optional[str] = Field(None, max_length=255)
    address_line_2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state_province: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    country: Optional[str] = Field(default="USA", max_length=100)
    age_years: Optional[int] = None
    age_months: Optional[int] = None
    marital_status: Optional[str] = None
    emergency_contact_name: Optional[str] = Field(None, max_length=200)
    emergency_contact_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    emergency_contact_country_code: Optional[str] = Field(None, pattern=r"^\+[0-9]{1,4}$")
    emergency_contact_relation: Optional[str] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_TITLES:
            raise ValueError(f'Title must be one of: {", ".join(VALID_TITLES)}')
        return v

    @field_validator("blood_group")
    @classmethod
    def validate_blood_group(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_BLOOD_GROUPS:
            raise ValueError(f'Blood group must be one of: {", ".join(VALID_BLOOD_GROUPS)}')
        return v

    @field_validator("emergency_contact_relation")
    @classmethod
    def validate_relationship(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_RELATIONSHIPS:
            raise ValueError(f'Relationship must be one of: {", ".join(VALID_RELATIONSHIPS)}')
        return v

    @field_validator("date_of_birth")
    @classmethod
    def validate_dob(cls, v: Optional[date]) -> Optional[date]:
        if v is None:
            return v
        if v > date.today():
            raise ValueError("Date of birth cannot be in the future")
        age = (date.today() - v).days / 365.25
        if age > 150:
            raise ValueError("Invalid date of birth")
        return v

    @field_validator("address_line_1")
    @classmethod
    def validate_address(cls, v: Optional[str]) -> Optional[str]:
        import re
        if v is not None and v != "":
            if not re.search(r"[A-Za-z]", v):
                raise ValueError("Address must contain meaningful text, not just numbers")
        return v

    @field_validator("postal_code")
    @classmethod
    def validate_postal_code(cls, v: Optional[str]) -> Optional[str]:
        import re
        if v is not None and v != "":
            if not re.match(r"^\d{6}$", v):
                raise ValueError("PIN code must be exactly 6 digits")
        return v


class PatientCreate(PatientBase):
    @model_validator(mode="after")
    def validate_rules(self) -> "PatientCreate":
        if self.date_of_birth and self.title:
            age_years = (date.today() - self.date_of_birth).days / 365.25
            if age_years < 5 and self.title in ADULT_ONLY_TITLES:
                raise ValueError(
                    f"For children under 5, please use Baby or Master instead of {self.title}"
                )
            if age_years >= 5 and self.title in CHILD_TITLES:
                raise ValueError(
                    f'Title "{self.title}" is only for children under 5. Please select Mr./Mrs./Ms./Dr./Prof.'
                )
        if (
            self.emergency_contact_phone
            and self.emergency_contact_phone == self.phone_number
        ):
            raise ValueError(
                "Emergency contact number must be different from the patient's phone number"
            )
        return self


class PatientUpdate(PatientBase):
    @model_validator(mode="after")
    def validate_rules(self) -> "PatientUpdate":
        if self.date_of_birth and self.title:
            age_years = (date.today() - self.date_of_birth).days / 365.25
            if age_years < 5 and self.title in ADULT_ONLY_TITLES:
                raise ValueError(
                    f"For children under 5, please use Baby or Master instead of {self.title}"
                )
            if age_years >= 5 and self.title in CHILD_TITLES:
                raise ValueError(
                    f'Title "{self.title}" is only for children under 5. Please select Mr./Mrs./Ms./Dr./Prof.'
                )
        if (
            self.emergency_contact_phone
            and self.emergency_contact_phone == self.phone_number
        ):
            raise ValueError(
                "Emergency contact number must be different from the patient's phone number"
            )
        return self


class PatientResponse(BaseModel):
    id: str
    patient_reference_number: str
    title: Optional[str] = None
    first_name: str
    last_name: str
    full_name: str
    date_of_birth: Optional[date] = None
    gender: str
    blood_group: Optional[str] = None
    phone_country_code: str = "+1"
    phone_number: str
    email: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    age_years: Optional[int] = None
    age_months: Optional[int] = None
    marital_status: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_country_code: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    photo_url: Optional[str] = None
    is_active: bool
    is_deleted: bool = False
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
            d["full_name"] = data.full_name
            return d
        if isinstance(data, dict):
            if "id" in data and not isinstance(data["id"], str):
                data["id"] = str(data["id"])
        return data

    class Config:
        from_attributes = True


class PatientListItem(BaseModel):
    id: str
    patient_reference_number: str
    title: Optional[str] = None
    first_name: str
    last_name: str
    gender: str
    phone_country_code: str = "+1"
    phone_number: str
    email: Optional[str] = None
    city: Optional[str] = None
    blood_group: Optional[str] = None
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

    class Config:
        from_attributes = True

    @computed_field
    @property
    def full_name(self) -> str:
        parts = []
        if self.title:
            parts.append(self.title)
        parts.append(self.first_name)
        parts.append(self.last_name)
        return " ".join(parts)


class PaginatedPatientResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[PatientListItem]