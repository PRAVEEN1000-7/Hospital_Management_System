from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional, List
from datetime import date, time, datetime
import re


class HospitalBase(BaseModel):
    """Base schema with common fields for create/update"""
    hospital_name: str = Field(..., min_length=3, max_length=200, description="Official hospital name")
    hospital_code: Optional[str] = Field(None, max_length=20, description="Short code for internal use")
    registration_number: Optional[str] = Field(None, max_length=50)
    established_date: Optional[date] = None
    hospital_type: str = Field(default="General", max_length=50)
    
    # Contact (with country codes for international support)
    primary_phone_country_code: str = Field(default="+91", pattern=r"^\+[0-9]{1,4}$", description="Country calling code")
    primary_phone: str = Field(..., pattern=r"^\d{4,15}$", description="Phone number (digits only, 4-15 digits)")
    secondary_phone_country_code: Optional[str] = Field(None, pattern=r"^\+[0-9]{1,4}$")
    secondary_phone: Optional[str] = Field(None, pattern=r"^\d{4,15}$")
    email: EmailStr = Field(..., description="Official hospital email")
    website: Optional[str] = Field(None, max_length=255)
    emergency_hotline_country_code: Optional[str] = Field(None, pattern=r"^\+[0-9]{1,4}$")
    emergency_hotline: Optional[str] = Field(None, pattern=r"^\d{4,15}$")
    
    # Address (country required, no default - must be selected by user)
    address_line1: str = Field(..., min_length=5, description="Street address")
    address_line2: Optional[str] = None
    city: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    country: str = Field(..., min_length=2, max_length=100, description="Country name (required)")
    pin_code: str = Field(..., min_length=3, max_length=10, description="Postal/ZIP code")
    
    # Legal & Tax (India-specific, optional for other countries)
    gst_number: Optional[str] = Field(None, max_length=20, description="GST Number (India only)")
    pan_number: Optional[str] = Field(None, max_length=20, description="PAN Number (India only)")
    drug_license_number: Optional[str] = Field(None, max_length=50)
    medical_registration_number: Optional[str] = Field(None, max_length=50)
    
    # Operations
    working_hours_start: Optional[time] = Field(None, description="Opening time (HH:MM)")
    working_hours_end: Optional[time] = Field(None, description="Closing time (HH:MM)")
    working_days: Optional[List[str]] = Field(
        default=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        description="Array of working days"
    )
    emergency_24_7: bool = Field(default=False, description="24/7 emergency services available")

    @model_validator(mode='after')
    def validate_india_specific_fields(self):
        """Validate GST and PAN only for Indian hospitals"""
        if self.country == 'India':
            # GST validation for India
            if self.gst_number and len(self.gst_number) > 0:
                if len(self.gst_number) != 15:
                    raise ValueError('GST number must be 15 characters for Indian hospitals')
                if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', self.gst_number):
                    raise ValueError('Invalid GST format. Expected: 22AAAAA0000A1Z5')
            
            # PAN validation for India
            if self.pan_number and len(self.pan_number) > 0:
                if len(self.pan_number) != 10:
                    raise ValueError('PAN number must be 10 characters for Indian hospitals')
                if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]{1}$', self.pan_number):
                    raise ValueError('Invalid PAN format. Expected: ABCDE1234F')
        
        return self
    
    @field_validator('working_days')
    @classmethod
    def validate_working_days(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v:
            valid_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
            for day in v:
                if day not in valid_days:
                    raise ValueError(f'Invalid day: {day}')
        return v


class HospitalCreate(HospitalBase):
    """Schema for creating hospital record (first-time setup)"""
    pass


class HospitalUpdate(BaseModel):
    """Schema for updating hospital record (all fields optional)"""
    hospital_name: Optional[str] = Field(None, min_length=3, max_length=200)
    hospital_code: Optional[str] = Field(None, max_length=20)
    registration_number: Optional[str] = Field(None, max_length=50)
    established_date: Optional[date] = None
    hospital_type: Optional[str] = Field(None, max_length=50)
    
    primary_phone_country_code: Optional[str] = Field(None, pattern=r"^\+[0-9]{1,4}$")
    primary_phone: Optional[str] = Field(None, pattern=r"^\d{4,15}$")
    secondary_phone_country_code: Optional[str] = Field(None, pattern=r"^\+[0-9]{1,4}$")
    secondary_phone: Optional[str] = Field(None, pattern=r"^\d{4,15}$")
    email: Optional[EmailStr] = None
    website: Optional[str] = Field(None, max_length=255)
    emergency_hotline_country_code: Optional[str] = Field(None, pattern=r"^\+[0-9]{1,4}$")
    emergency_hotline: Optional[str] = Field(None, pattern=r"^\d{4,15}$")
    
    address_line1: Optional[str] = Field(None, min_length=5)
    address_line2: Optional[str] = None
    city: Optional[str] = Field(None, min_length=2, max_length=100)
    state: Optional[str] = Field(None, min_length=2, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    pin_code: Optional[str] = Field(None, min_length=3, max_length=10)
    
    gst_number: Optional[str] = Field(None, max_length=20)
    pan_number: Optional[str] = Field(None, max_length=20)
    drug_license_number: Optional[str] = Field(None, max_length=50)
    medical_registration_number: Optional[str] = Field(None, max_length=50)
    
    working_hours_start: Optional[time] = None
    working_hours_end: Optional[time] = None
    working_days: Optional[List[str]] = None
    emergency_24_7: Optional[bool] = None


class HospitalResponse(HospitalBase):
    """Schema for hospital response with metadata"""
    id: int
    primary_phone_country_code: str = "+91"
    secondary_phone_country_code: Optional[str] = None
    emergency_hotline_country_code: Optional[str] = None
    logo_path: Optional[str] = None
    logo_filename: Optional[str] = None
    is_configured: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[int] = None
    updated_by: Optional[int] = None
    
    class Config:
        from_attributes = True


class HospitalPublicInfo(BaseModel):
    """Public hospital info (for ID cards, no sensitive data)"""
    id: int
    hospital_name: str
    primary_phone_country_code: str = "+91"
    primary_phone: str
    email: str
    website: Optional[str] = None
    emergency_hotline_country_code: Optional[str] = None
    emergency_hotline: Optional[str] = None
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    country: str
    pin_code: str
    logo_path: Optional[str] = None
    registration_number: Optional[str] = None
    
    class Config:
        from_attributes = True


class HospitalLogoUpload(BaseModel):
    """Response schema for logo upload"""
    logo_path: str
    logo_filename: str
    logo_size_kb: int
    message: str
