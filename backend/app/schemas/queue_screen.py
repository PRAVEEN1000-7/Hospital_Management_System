"""
Queue Display Screen schemas (BRD-005 — multi-screen queue display config).
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class QueueDisplayScreenCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=50)
    display_name: str = Field(..., min_length=1, max_length=150)
    department_id: Optional[str] = None
    doctor_id: Optional[str] = None
    show_doctor2: bool = False
    doctor2_id: Optional[str] = None
    show_pharmacy: bool = False
    show_opthal: bool = False
    token_format: str = Field(default="#{n}", max_length=50)
    refresh_seconds: int = Field(default=10, ge=3, le=120)


class QueueDisplayScreenUpdate(BaseModel):
    slug: Optional[str] = Field(None, min_length=1, max_length=50)
    display_name: Optional[str] = Field(None, min_length=1, max_length=150)
    department_id: Optional[str] = None
    doctor_id: Optional[str] = None
    show_doctor2: Optional[bool] = None
    doctor2_id: Optional[str] = None
    show_pharmacy: Optional[bool] = None
    show_opthal: Optional[bool] = None
    token_format: Optional[str] = Field(None, max_length=50)
    refresh_seconds: Optional[int] = Field(None, ge=3, le=120)
    is_active: Optional[bool] = None


class QueueDisplayScreenResponse(BaseModel):
    id: str
    hospital_id: str
    slug: str
    display_name: str
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    show_doctor2: bool
    doctor2_id: Optional[str] = None
    doctor2_name: Optional[str] = None
    show_pharmacy: bool
    show_opthal: bool
    token_format: str
    refresh_seconds: int
    is_active: bool
    is_configured: bool
    public_url_path: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        if hasattr(obj, "__dict__"):
            data = {
                "id": str(obj.id),
                "hospital_id": str(obj.hospital_id),
                "slug": obj.slug,
                "display_name": obj.display_name,
                "department_id": str(obj.department_id) if obj.department_id else None,
                "department_name": obj.department.name if getattr(obj, "department", None) else None,
                "doctor_id": str(obj.doctor_id) if obj.doctor_id else None,
                "doctor_name": f"Dr. {obj.doctor.user.full_name}" if getattr(obj, "doctor", None) and obj.doctor.user else None,
                "show_doctor2": obj.show_doctor2,
                "doctor2_id": str(obj.doctor2_id) if obj.doctor2_id else None,
                "doctor2_name": f"Dr. {obj.doctor2.user.full_name}" if getattr(obj, "doctor2", None) and obj.doctor2.user else None,
                "show_pharmacy": obj.show_pharmacy,
                "show_opthal": obj.show_opthal,
                "token_format": obj.token_format,
                "refresh_seconds": obj.refresh_seconds,
                "is_active": obj.is_active,
                "is_configured": obj.is_configured,
                "public_url_path": f"/public/queue/{{hospital_code}}/{obj.slug}",
                "created_at": obj.created_at,
                "updated_at": obj.updated_at,
            }
            return cls(**data)
        return super().model_validate(obj, **kwargs)
