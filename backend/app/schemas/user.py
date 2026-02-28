from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional, List, Any
from datetime import datetime
import re


VALID_ROLES = [
    "super_admin", "admin", "doctor", "receptionist",
    "pharmacist", "optical_staff", "cashier",
    "inventory_manager", "report_viewer",
]


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    full_name: Optional[str] = Field(None, max_length=255)
    role: str = Field(default="staff")
    employee_id: Optional[str] = Field(None, max_length=50)
    department: Optional[str] = Field(None, max_length=100)
    phone_number: Optional[str] = Field(None, max_length=20)

    # Doctor-specific fields (required when role == 'doctor')
    specialization: Optional[str] = Field(None, max_length=100)
    qualification: Optional[str] = Field(None, max_length=255)
    registration_number: Optional[str] = Field(None, max_length=50)
    registration_authority: Optional[str] = Field(None, max_length=100)
    experience_years: Optional[int] = Field(None, ge=0)
    consultation_fee: Optional[float] = Field(None, ge=0)
    follow_up_fee: Optional[float] = Field(None, ge=0)
    bio: Optional[str] = None
    department_id: Optional[str] = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username must contain only letters, numbers, and underscores")
        return v.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError("Password must contain at least one special character")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in VALID_ROLES:
            raise ValueError(f'Role must be one of: {", ".join(VALID_ROLES)}')
        return v

    @model_validator(mode="after")
    def validate_doctor_fields(self):
        if self.role == "doctor":
            if not self.specialization:
                raise ValueError("Specialization is required for doctors")
            if not self.qualification:
                raise ValueError("Qualification is required for doctors")
            if not self.registration_number:
                raise ValueError("Registration number is required for doctors")
        return self


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    role: Optional[str] = None
    employee_id: Optional[str] = Field(None, max_length=50)
    department: Optional[str] = Field(None, max_length=100)
    phone_number: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_ROLES:
            raise ValueError(f'Role must be one of: {", ".join(VALID_ROLES)}')
        return v


class PasswordReset(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError("Password must contain at least one special character")
        return v


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: str = ""
    roles: List[str] = []
    reference_number: Optional[str] = None
    hospital_id: Optional[str] = None
    hospital_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool = True
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @model_validator(mode="before")
    @classmethod
    def transform_fields(cls, data: Any) -> Any:
        if hasattr(data, "__table__"):
            # SQLAlchemy model instance
            roles = data.roles if hasattr(data, 'roles') else []
            hospital_name = data.hospital.name if hasattr(data, 'hospital') and data.hospital else None
            return {
                "id": str(data.id),
                "username": data.username,
                "email": data.email,
                "first_name": data.first_name,
                "last_name": data.last_name,
                "full_name": f"{data.first_name} {data.last_name}".strip(),
                "roles": roles,
                "reference_number": data.reference_number,
                "hospital_id": str(data.hospital_id) if data.hospital_id else None,
                "hospital_name": hospital_name,
                "phone": data.phone,
                "avatar_url": data.avatar_url,
                "is_active": data.is_active,
                "last_login_at": data.last_login_at,
                "created_at": data.created_at,
                "updated_at": data.updated_at,
            }
        if isinstance(data, dict):
            if "id" in data and not isinstance(data["id"], str):
                data["id"] = str(data["id"])
            if "first_name" in data and "last_name" in data and "full_name" not in data:
                data["full_name"] = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
        return data

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[UserResponse]