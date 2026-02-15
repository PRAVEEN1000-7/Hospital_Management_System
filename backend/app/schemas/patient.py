from pydantic import BaseModel, EmailStr, Field, field_validator, computed_field
from typing import Optional
from datetime import date, datetime


VALID_TITLES = ["Mr.", "Mrs.", "Ms.", "Master", "Dr.", "Prof.", "Baby"]
VALID_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
VALID_RELATIONSHIPS = [
    "Father", "Mother", "Husband", "Wife", "Son", "Daughter",
    "Brother", "Sister", "Friend", "Guardian", "Other",
]


class PatientBase(BaseModel):
    """Input schema with validations for create/update operations"""
    title: str = Field(..., description="Name title")
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    date_of_birth: date
    gender: str = Field(..., pattern="^(Male|Female|Other)$")
    blood_group: Optional[str] = None
    country_code: str = Field(default="+91", pattern=r"^\+[0-9]{1,4}$")
    mobile_number: str = Field(..., pattern=r"^\d{4,15}$",
                                description="Phone number digits only (4-15 digits, no spaces or dashes)")
    email: Optional[EmailStr] = None
    address_line1: str = Field(..., min_length=5, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    pin_code: Optional[str] = Field(None, max_length=10,
                                     description="Postal/ZIP/PIN code (3-10 alphanumeric chars)")
    country: Optional[str] = Field(default="India", max_length=100)
    emergency_contact_name: Optional[str] = Field(None, max_length=255)
    emergency_contact_country_code: Optional[str] = Field(default="+91", pattern=r"^\+[0-9]{1,4}$")
    emergency_contact_mobile: Optional[str] = Field(None, pattern=r"^\d{4,15}$")
    emergency_contact_relationship: Optional[str] = None

    @field_validator('title')
    @classmethod
    def validate_title(cls, v: str) -> str:
        if v not in VALID_TITLES:
            raise ValueError(f'Title must be one of: {", ".join(VALID_TITLES)}')
        return v

    @field_validator('blood_group')
    @classmethod
    def validate_blood_group(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_BLOOD_GROUPS:
            raise ValueError(f'Blood group must be one of: {", ".join(VALID_BLOOD_GROUPS)}')
        return v

    @field_validator('emergency_contact_relationship')
    @classmethod
    def validate_relationship(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_RELATIONSHIPS:
            raise ValueError(f'Relationship must be one of: {", ".join(VALID_RELATIONSHIPS)}')
        return v

    @field_validator('date_of_birth')
    @classmethod
    def validate_dob(cls, v: date) -> date:
        if v > date.today():
            raise ValueError('Date of birth cannot be in the future')
        age = (date.today() - v).days / 365.25
        if age > 150:
            raise ValueError('Invalid date of birth')
        return v

    @field_validator('pin_code')
    @classmethod
    def validate_pin_code(cls, v: Optional[str]) -> Optional[str]:
        import re
        if v is not None and v != '':
            if not re.match(r'^[A-Za-z0-9 \-]{3,10}$', v):
                raise ValueError('Postal/ZIP code must be 3-10 alphanumeric characters')
        return v


class PatientCreate(PatientBase):
    pass


class PatientUpdate(PatientBase):
    pass


class PatientResponse(BaseModel):
    """Response schema - no strict input validations, just fields for serialization"""
    id: int
    prn: str
    title: str
    first_name: str
    last_name: str
    full_name: str
    date_of_birth: date
    gender: str
    blood_group: Optional[str] = None
    country_code: str = "+91"
    mobile_number: str
    email: Optional[str] = None
    address_line1: str
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    country: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_country_code: Optional[str] = None
    emergency_contact_mobile: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PatientListItem(BaseModel):
    id: int
    prn: str
    title: str
    first_name: str
    last_name: str
    country_code: str = "+91"
    mobile_number: str
    email: Optional[str] = None
    city: Optional[str] = None
    blood_group: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

    @computed_field
    @property
    def full_name(self) -> str:
        return f"{self.title} {self.first_name} {self.last_name}"


class PaginatedPatientResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[PatientListItem]
