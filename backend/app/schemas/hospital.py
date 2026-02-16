from pydantic import BaseModel, EmailStr, Field, field_validator, field_serializer, model_validator, ConfigDict
from typing import Optional, List, Any
from datetime import date, time, datetime
import re


class HospitalBase(BaseModel):
    """Base schema with common fields for create/update"""
    hospital_name: str = Field(..., min_length=3, max_length=200, description="Official hospital name")
    hospital_code: Optional[str] = Field(None, max_length=20, description="Short code for internal use")
    registration_number: Optional[str] = Field(None, max_length=50)
    established_date: Optional[date] = None
    hospital_type: str = Field(default="General", max_length=50)
    
    # Facility Admin
    facility_admin_name: Optional[str] = Field(None, max_length=200, description="Facility admin contact name")
    facility_admin_phone: Optional[str] = Field(None, max_length=20, description="Facility admin phone number")
    
    # Accreditation & Specialisation
    nabh_accreditation: Optional[str] = Field(None, max_length=100, description="NABH Accreditation details")
    specialisation: Optional[str] = Field(None, max_length=100, description="Hospital specialisation")
    
    # Facility Strength
    number_of_beds: Optional[int] = Field(None, ge=0, description="Total number of beds")
    staff_strength: Optional[int] = Field(None, ge=0, description="Total staff strength")
    establishment_location: Optional[str] = Field(None, description="Establishment location / GPS coordinates")
    
    # Contact (with country codes for international support)
    primary_phone_country_code: str = Field(default="+91", pattern=r"^\+[0-9]{1,4}$", description="Country calling code")
    primary_phone: str = Field(..., pattern=r"^\d{4,15}$", description="Phone number (digits only, 4-15 digits)")
    secondary_phone_country_code: Optional[str] = Field(None, pattern=r"^\+[0-9]{1,4}$")
    secondary_phone: Optional[str] = Field(None, pattern=r"^\d{4,15}$")
    email: EmailStr = Field(..., description="Official hospital email")
    website: Optional[str] = Field(None, max_length=255)
    emergency_hotline_country_code: Optional[str] = Field(None, pattern=r"^\+[0-9]{1,4}$")
    emergency_hotline: Optional[str] = Field(None, pattern=r"^\d{4,15}$")
    
    @model_validator(mode='before')
    @classmethod
    def convert_empty_strings_to_none(cls, data: Any) -> Any:
        """Convert empty strings to None for optional fields to avoid pattern validation failures"""
        if isinstance(data, dict):
            optional_fields = [
                'hospital_code', 'registration_number', 'established_date',
                'facility_admin_name', 'facility_admin_phone',
                'nabh_accreditation', 'specialisation', 'establishment_location',
                'secondary_phone_country_code', 'secondary_phone',
                'website', 'emergency_hotline_country_code', 'emergency_hotline',
                'address_line2', 'gst_number', 'pan_number',
                'drug_license_number', 'medical_registration_number',
                'working_hours_start', 'working_hours_end',
            ]
            for field in optional_fields:
                if field in data and data[field] == '':
                    data[field] = None
            
            # Ensure working_days is a proper list
            if 'working_days' in data:
                wd = data['working_days']
                if isinstance(wd, str):
                    import json
                    try:
                        data['working_days'] = json.loads(wd)
                    except (json.JSONDecodeError, TypeError):
                        data['working_days'] = [wd]
                elif wd is False or wd is None:
                    data['working_days'] = None
            
            # Ensure emergency_24_7 is boolean
            if 'emergency_24_7' in data:
                val = data['emergency_24_7']
                if isinstance(val, str):
                    data['emergency_24_7'] = val.lower() in ('true', '1', 'on', 'yes')
        return data
    
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
    
    @field_serializer('working_days', when_used='json')
    def serialize_working_days(self, v: Any) -> Optional[List[str]]:
        """Ensure working_days from JSONB is properly serialized"""
        if v is None:
            return None
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v
    
    @field_serializer('working_hours_start', 'working_hours_end', when_used='json')
    def serialize_time(self, v: Any) -> Optional[str]:
        """Ensure time fields are properly serialized"""
        if v is None:
            return None
        if isinstance(v, time):
            return v.strftime('%H:%M:%S')
        return str(v)


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
    
    # New fields
    facility_admin_name: Optional[str] = Field(None, max_length=200)
    facility_admin_phone: Optional[str] = Field(None, max_length=20)
    nabh_accreditation: Optional[str] = Field(None, max_length=100)
    specialisation: Optional[str] = Field(None, max_length=100)
    number_of_beds: Optional[int] = None
    staff_strength: Optional[int] = None
    establishment_location: Optional[str] = None


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
    
    model_config = ConfigDict(from_attributes=True)


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
    
    model_config = ConfigDict(from_attributes=True)


class HospitalLogoUpload(BaseModel):
    """Response schema for logo upload"""
    logo_path: str
    logo_filename: str
    logo_size_kb: int
    message: str
