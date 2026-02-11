from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Time, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from ..database import Base


class HospitalDetails(Base):
    __tablename__ = "hospital_details"

    id = Column(Integer, primary_key=True, index=True)
    
    # Basic Information
    hospital_name = Column(String(200), nullable=False)
    hospital_code = Column(String(20), nullable=True)
    registration_number = Column(String(50), nullable=True)
    established_date = Column(Date, nullable=True)
    hospital_type = Column(String(50), default="General")
    
    # Contact Information
    primary_phone_country_code = Column(String(5), nullable=False, default="+91")
    primary_phone = Column(String(20), nullable=False)
    secondary_phone_country_code = Column(String(5), nullable=True)
    secondary_phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=False)
    website = Column(String(255), nullable=True)
    emergency_hotline_country_code = Column(String(5), nullable=True)
    emergency_hotline = Column(String(20), nullable=True)
    
    # Address
    address_line1 = Column(Text, nullable=False)
    address_line2 = Column(Text, nullable=True)
    city = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    country = Column(String(100), nullable=False)  # No default - user must select
    pin_code = Column(String(10), nullable=False)
    
    # Branding
    logo_path = Column(String(500), nullable=True)
    logo_filename = Column(String(255), nullable=True)
    logo_mime_type = Column(String(50), nullable=True)
    logo_size_kb = Column(Integer, nullable=True)
    
    # Legal & Tax
    gst_number = Column(String(20), nullable=True)
    pan_number = Column(String(20), nullable=True)
    drug_license_number = Column(String(50), nullable=True)
    medical_registration_number = Column(String(50), nullable=True)
    
    # Operations
    working_hours_start = Column(Time, nullable=True)
    working_hours_end = Column(Time, nullable=True)
    working_days = Column(JSONB, nullable=True)
    emergency_24_7 = Column(Boolean, default=False)
    
    # Metadata
    is_configured = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    @property
    def full_primary_phone(self) -> str:
        """Computed property: full phone number with country code"""
        return f"{self.primary_phone_country_code} {self.primary_phone}"
    
    @property
    def full_emergency_hotline(self) -> str:
        """Computed property: full emergency hotline with country code"""
        if self.emergency_hotline and self.emergency_hotline_country_code:
            return f"{self.emergency_hotline_country_code} {self.emergency_hotline}"
        return self.emergency_hotline or ""
    
    @property
    def full_address(self) -> str:
        """Computed property: full address with all components"""
        parts = [self.address_line1]
        if self.address_line2:
            parts.append(self.address_line2)
        parts.append(f"{self.city}, {self.state} - {self.pin_code}")
        if self.country:
            parts.append(self.country)
        return ", ".join(parts)
    
    @property
    def is_setup_complete(self) -> bool:
        """Check if minimum required fields are configured"""
        required_fields = [
            self.hospital_name,
            self.primary_phone,
            self.email,
            self.address_line1,
            self.city,
            self.state,
            self.pin_code,
        ]
        return all(required_fields) and self.is_configured
