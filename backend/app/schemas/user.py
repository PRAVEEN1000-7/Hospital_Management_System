from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional, List, Any
from datetime import datetime, date
import re


VALID_ROLES = [
    "super_admin", "admin", "doctor", "visiting_doctor", "nurse", "receptionist",
    "pharmacist", "optical_staff", "lab_technician", "cashier",
    "inventory_manager", "report_viewer", "staff",
]


class UserCreate(BaseModel):
    # Optional at the schema level only for role == "staff" — that role has
    # no login access at all (see auth_service.authenticate_user's
    # attendance-only-role block), so the router auto-generates a username/
    # placeholder email/random password server-side when these are omitted
    # rather than asking an admin to invent login details nobody will use.
    # Every other role still requires all three (see validate_login_credentials).
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=3, max_length=100)
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
    # In-house doctors see Analytics; guest doctors don't (BUG-16).
    analytics_enabled: Optional[bool] = True

    # Employee / HR fields — apply to every role, stored directly on `users`.
    designation: Optional[str] = Field(None, max_length=100)
    date_of_joining: Optional[date] = None
    date_of_leaving: Optional[date] = None
    employment_type: Optional[str] = Field(None, max_length=20)  # full_time / part_time / contract
    bank_account_holder_name: Optional[str] = Field(None, max_length=150)
    bank_account_number: Optional[str] = Field(None, max_length=50)
    bank_ifsc: Optional[str] = Field(None, max_length=20)
    bank_branch: Optional[str] = Field(None, max_length=150)
    pf_number: Optional[str] = Field(None, max_length=50)
    pan_number: Optional[str] = Field(None, max_length=20)
    paid_leave_entitlement: Optional[int] = Field(None, ge=0)
    include_in_payroll: Optional[bool] = True
    base_salary: Optional[float] = Field(None, ge=0)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if " " in v:
            raise ValueError("Username must not contain spaces")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username must contain only letters, numbers, and underscores")
        return v.lower()

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_names(cls, v: str) -> str:
        if not re.match(r"^[A-Za-z\s.'\-]+$", v):
            raise ValueError("Name must contain only letters, spaces, hyphens, and apostrophes")
        return v

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v != "":
            if not re.match(r"^\d{10}$", v):
                raise ValueError("Phone number must be exactly 10 digits")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
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

    @model_validator(mode="after")
    def validate_login_credentials(self):
        # 'staff' is the only role with no login access at all — the router
        # auto-generates username/email/password for it, so they're
        # legitimately absent from the request. Every other role must supply
        # all three (Pydantic's own Optional typing can't express "required
        # unless role == X").
        if self.role != "staff":
            if not self.username:
                raise ValueError("Username is required")
            if not self.email:
                raise ValueError("Email is required")
            if not self.password:
                raise ValueError("Password is required")
        return self


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    # The >2-letter rule (Bug #39) is enforced on UserCreate only. Edit forms
    # resend the full record including an unchanged last_name, so a stricter
    # rule here would permanently lock a person with a genuinely short
    # existing surname (e.g. "Li", "Wu") out of ever being edited again.
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    role: Optional[str] = None
    employee_id: Optional[str] = Field(None, max_length=50)
    department: Optional[str] = Field(None, max_length=100)
    phone_number: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None

    # Doctor-specific fields (optional, used when editing a doctor)
    specialization: Optional[str] = Field(None, max_length=100)
    qualification: Optional[str] = Field(None, max_length=255)
    registration_number: Optional[str] = Field(None, max_length=50)
    consultation_fee: Optional[float] = Field(None, ge=0)
    follow_up_fee: Optional[float] = Field(None, ge=0)
    analytics_enabled: Optional[bool] = None

    # Employee / HR fields — editable for every role, unlike the doctor-only
    # create-time fields above.
    designation: Optional[str] = Field(None, max_length=100)
    date_of_joining: Optional[date] = None
    date_of_leaving: Optional[date] = None
    employment_type: Optional[str] = Field(None, max_length=20)
    bank_account_holder_name: Optional[str] = Field(None, max_length=150)
    bank_account_number: Optional[str] = Field(None, max_length=50)
    bank_ifsc: Optional[str] = Field(None, max_length=20)
    bank_branch: Optional[str] = Field(None, max_length=150)
    pf_number: Optional[str] = Field(None, max_length=50)
    pan_number: Optional[str] = Field(None, max_length=20)
    paid_leave_entitlement: Optional[int] = Field(None, ge=0)
    include_in_payroll: Optional[bool] = None
    base_salary: Optional[float] = Field(None, ge=0)

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
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    registration_number: Optional[str] = None
    consultation_fee: Optional[float] = None
    follow_up_fee: Optional[float] = None
    analytics_enabled: Optional[bool] = None
    designation: Optional[str] = None
    date_of_joining: Optional[date] = None
    date_of_leaving: Optional[date] = None
    employment_type: Optional[str] = None
    bank_account_holder_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_branch: Optional[str] = None
    pf_number: Optional[str] = None
    pan_number: Optional[str] = None
    paid_leave_entitlement: Optional[int] = None
    include_in_payroll: Optional[bool] = None
    base_salary: Optional[float] = None
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform_fields(cls, data: Any) -> Any:
        if hasattr(data, "__table__"):
            # SQLAlchemy model instance
            roles = data.roles if hasattr(data, 'roles') else []
            hospital_name = data.hospital.name if hasattr(data, 'hospital') and data.hospital else None
            shift_name = data.shift.name if hasattr(data, 'shift') and data.shift else None
            # Extract doctor fields from doctor_profile if available
            specialization = None
            qualification = None
            registration_number = None
            consultation_fee = None
            follow_up_fee = None
            analytics_enabled = None
            if hasattr(data, 'doctor_profile') and data.doctor_profile:
                doc = data.doctor_profile[0] if isinstance(data.doctor_profile, list) else data.doctor_profile
                specialization = getattr(doc, 'specialization', None)
                qualification = getattr(doc, 'qualification', None)
                registration_number = getattr(doc, 'registration_number', None)
                consultation_fee = getattr(doc, 'consultation_fee', None)
                follow_up_fee = getattr(doc, 'follow_up_fee', None)
                analytics_enabled = getattr(doc, 'analytics_enabled', None)
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
                "specialization": specialization,
                "qualification": qualification,
                "registration_number": registration_number,
                "consultation_fee": float(consultation_fee) if consultation_fee is not None else None,
                "follow_up_fee": float(follow_up_fee) if follow_up_fee is not None else None,
                "analytics_enabled": analytics_enabled,
                "designation": getattr(data, 'designation', None),
                "date_of_joining": getattr(data, 'date_of_joining', None),
                "date_of_leaving": getattr(data, 'date_of_leaving', None),
                "employment_type": getattr(data, 'employment_type', None),
                "bank_account_holder_name": getattr(data, 'bank_account_holder_name', None),
                "bank_account_number": getattr(data, 'bank_account_number', None),
                "bank_ifsc": getattr(data, 'bank_ifsc', None),
                "bank_branch": getattr(data, 'bank_branch', None),
                "pf_number": getattr(data, 'pf_number', None),
                "pan_number": getattr(data, 'pan_number', None),
                "paid_leave_entitlement": getattr(data, 'paid_leave_entitlement', None),
                "include_in_payroll": getattr(data, 'include_in_payroll', None),
                "base_salary": float(data.base_salary) if getattr(data, 'base_salary', None) is not None else None,
                "shift_id": str(data.shift_id) if getattr(data, 'shift_id', None) else None,
                "shift_name": shift_name,
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