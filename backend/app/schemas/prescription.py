"""
Pydantic schemas for the Prescription module.
Follows the same patterns as appointment.py schemas.
"""
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from typing import Optional, Any
from datetime import date, datetime


VALID_PRESCRIPTION_STATUSES = ["draft", "finalized", "dispensed", "partially_dispensed"]
VALID_PRESCRIPTION_TYPES = ["general", "optical"]
VALID_DURATION_UNITS = ["days", "weeks", "months"]
VALID_ROUTES = ["oral", "topical", "injection", "inhalation", "sublingual", "rectal", "nasal", "ophthalmic", "otic"]
VALID_LENS_TYPES = ["single_vision", "bifocal", "progressive", "contact"]
VALID_MEDICINE_CATEGORIES = ["tablet", "capsule", "syrup", "injection", "cream", "drops", "ointment", "inhaler", "powder", "suspension"]


# —— Helper: ORM -> dict with stringified UUIDs ——

def _orm_to_dict(data: Any) -> Any:
    """Convert SQLAlchemy model instance to dict with all UUIDs as strings."""
    if hasattr(data, "__table__"):
        d = {}
        for col in data.__table__.columns:
            val = getattr(data, col.name)
            if hasattr(val, "hex"):  # uuid.UUID
                val = str(val)
            d[col.name] = val
        return d
    if isinstance(data, dict):
        return data
    return data


# ═══════════════════════════════════════════════════════════════════════════
# Medicine Schemas
# ═══════════════════════════════════════════════════════════════════════════

class MedicineCreate(BaseModel):
    name: str = Field(..., max_length=200)
    generic_name: str = Field(..., max_length=200)
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    composition: Optional[str] = None
    strength: Optional[str] = None
    unit_of_measure: str = Field(default="strip", max_length=20)
    units_per_pack: int = Field(default=1, ge=1)
    requires_prescription: bool = True
    is_controlled: bool = False
    selling_price: float = Field(..., ge=0)
    purchase_price: Optional[float] = None
    reorder_level: int = Field(default=10, ge=0)
    storage_instructions: Optional[str] = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in VALID_MEDICINE_CATEGORIES:
            raise ValueError(f"Must be one of: {', '.join(VALID_MEDICINE_CATEGORIES)}")
        return v


class MedicineUpdate(BaseModel):
    name: Optional[str] = None
    generic_name: Optional[str] = None
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    composition: Optional[str] = None
    strength: Optional[str] = None
    unit_of_measure: Optional[str] = None
    selling_price: Optional[float] = None
    purchase_price: Optional[float] = None
    reorder_level: Optional[int] = None
    is_active: Optional[bool] = None
    storage_instructions: Optional[str] = None


class MedicineResponse(BaseModel):
    id: str
    hospital_id: str
    name: str
    generic_name: str
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    composition: Optional[str] = None
    strength: Optional[str] = None
    unit_of_measure: str
    units_per_pack: int = 1
    requires_prescription: bool = True
    is_controlled: bool = False
    selling_price: float
    purchase_price: Optional[float] = None
    reorder_level: int = 10
    storage_instructions: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class PaginatedMedicineResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[MedicineResponse]


# ═══════════════════════════════════════════════════════════════════════════
# Prescription Item Schemas
# ═══════════════════════════════════════════════════════════════════════════

class PrescriptionItemCreate(BaseModel):
    medicine_id: Optional[str] = None
    medicine_name: str = Field(..., max_length=200)
    generic_name: Optional[str] = None
    dosage: str = Field(..., max_length=50)
    frequency: str = Field(..., max_length=50)  # e.g., '1-0-1'
    duration_value: Optional[int] = Field(None, ge=1)
    duration_unit: Optional[str] = None
    route: Optional[str] = None
    instructions: Optional[str] = None
    quantity: Optional[int] = Field(None, ge=1)
    allow_substitution: bool = True
    display_order: int = 0

    @field_validator("duration_unit")
    @classmethod
    def validate_duration_unit(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in VALID_DURATION_UNITS:
            raise ValueError(f"Must be one of: {', '.join(VALID_DURATION_UNITS)}")
        return v

    @field_validator("route")
    @classmethod
    def validate_route(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in VALID_ROUTES:
            raise ValueError(f"Must be one of: {', '.join(VALID_ROUTES)}")
        return v


class PrescriptionItemUpdate(BaseModel):
    medicine_name: Optional[str] = None
    generic_name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration_value: Optional[int] = None
    duration_unit: Optional[str] = None
    route: Optional[str] = None
    instructions: Optional[str] = None
    quantity: Optional[int] = None
    allow_substitution: Optional[bool] = None
    display_order: Optional[int] = None


class PrescriptionItemResponse(BaseModel):
    id: str
    prescription_id: str
    medicine_id: Optional[str] = None
    medicine_name: str
    generic_name: Optional[str] = None
    dosage: str
    frequency: str
    duration_value: Optional[int] = None
    duration_unit: Optional[str] = None
    route: Optional[str] = None
    instructions: Optional[str] = None
    quantity: Optional[int] = None
    allow_substitution: bool = True
    is_dispensed: bool = False
    dispensed_quantity: int = 0
    display_order: int = 0
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


# ═══════════════════════════════════════════════════════════════════════════
# Prescription Schemas
# ═══════════════════════════════════════════════════════════════════════════

class PrescriptionCreate(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None  # Defaults to current doctor
    appointment_id: Optional[str] = None
    prescription_type: str = Field(default="general", max_length=20)
    diagnosis: Optional[str] = None
    clinical_notes: Optional[str] = None
    advice: Optional[str] = None
    vitals_bp: Optional[str] = None
    vitals_pulse: Optional[str] = None
    vitals_temp: Optional[str] = None
    # Optical fields
    right_sphere: Optional[str] = None
    right_cylinder: Optional[str] = None
    right_axis: Optional[str] = None
    right_add: Optional[str] = None
    right_va: Optional[str] = None
    right_ipd: Optional[str] = None
    left_sphere: Optional[str] = None
    left_cylinder: Optional[str] = None
    left_axis: Optional[str] = None
    left_add: Optional[str] = None
    left_va: Optional[str] = None
    left_ipd: Optional[str] = None
    lens_type: Optional[str] = None
    lens_material: Optional[str] = None
    lens_coating: Optional[str] = None
    optical_notes: Optional[str] = None

    @field_validator("prescription_type")
    @classmethod
    def validate_prescription_type(cls, v: str) -> str:
        if v not in VALID_PRESCRIPTION_TYPES:
            raise ValueError(f"Must be one of: {', '.join(VALID_PRESCRIPTION_TYPES)}")
        return v

    @field_validator("lens_type")
    @classmethod
    def validate_lens_type(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in VALID_LENS_TYPES:
            raise ValueError(f"Must be one of: {', '.join(VALID_LENS_TYPES)}")
        return v
    vitals_weight: Optional[str] = None
    vitals_spo2: Optional[str] = None
    follow_up_date: Optional[date] = None
    queue_id: Optional[str] = None
    valid_until: Optional[date] = None
    items: list[PrescriptionItemCreate] = Field(default_factory=list)


class PrescriptionUpdate(BaseModel):
    diagnosis: Optional[str] = None
    clinical_notes: Optional[str] = None
    advice: Optional[str] = None
    vitals_bp: Optional[str] = None
    vitals_pulse: Optional[str] = None
    vitals_temp: Optional[str] = None
    vitals_weight: Optional[str] = None
    vitals_spo2: Optional[str] = None
    follow_up_date: Optional[date] = None
    valid_until: Optional[date] = None
    items: Optional[list[PrescriptionItemCreate]] = None
    # Optical fields
    right_sphere: Optional[str] = None
    right_cylinder: Optional[str] = None
    right_axis: Optional[str] = None
    right_add: Optional[str] = None
    right_va: Optional[str] = None
    right_ipd: Optional[str] = None
    left_sphere: Optional[str] = None
    left_cylinder: Optional[str] = None
    left_axis: Optional[str] = None
    left_add: Optional[str] = None
    left_va: Optional[str] = None
    left_ipd: Optional[str] = None
    lens_type: Optional[str] = None
    lens_material: Optional[str] = None
    lens_coating: Optional[str] = None
    optical_notes: Optional[str] = None


class PrescriptionResponse(BaseModel):
    id: str
    hospital_id: str
    prescription_number: str
    prescription_type: str = "general"
    appointment_id: Optional[str] = None
    patient_id: str
    doctor_id: str
    diagnosis: Optional[str] = None
    clinical_notes: Optional[str] = None
    advice: Optional[str] = None
    vitals_bp: Optional[str] = None
    vitals_pulse: Optional[str] = None
    vitals_temp: Optional[str] = None
    vitals_weight: Optional[str] = None
    vitals_spo2: Optional[str] = None
    follow_up_date: Optional[date] = None
    # Optical fields
    right_sphere: Optional[str] = None
    right_cylinder: Optional[str] = None
    right_axis: Optional[str] = None
    right_add: Optional[str] = None
    right_va: Optional[str] = None
    right_ipd: Optional[str] = None
    left_sphere: Optional[str] = None
    left_cylinder: Optional[str] = None
    left_axis: Optional[str] = None
    left_add: Optional[str] = None
    left_va: Optional[str] = None
    left_ipd: Optional[str] = None
    lens_type: Optional[str] = None
    lens_material: Optional[str] = None
    lens_coating: Optional[str] = None
    optical_notes: Optional[str] = None
    queue_id: Optional[str] = None
    version: int = 1
    status: str = "draft"
    is_finalized: bool = False
    finalized_at: Optional[datetime] = None
    valid_until: Optional[date] = None
    created_by: Optional[str] = None
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime
    # Enriched fields
    patient_name: Optional[str] = None
    patient_reference_number: Optional[str] = None
    appointment_number: Optional[str] = None
    doctor_name: Optional[str] = None
    items: list[PrescriptionItemResponse] = []

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class PrescriptionListItem(BaseModel):
    id: str
    prescription_number: str
    prescription_type: str = "general"
    patient_id: str
    doctor_id: str
    diagnosis: Optional[str] = None
    status: str = "draft"
    is_finalized: bool = False
    item_count: int = 0
    created_at: datetime
    updated_at: datetime
    patient_name: Optional[str] = None
    patient_reference_number: Optional[str] = None
    appointment_number: Optional[str] = None
    doctor_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class PaginatedPrescriptionResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[PrescriptionListItem]


# ═══════════════════════════════════════════════════════════════════════════
# Prescription Template Schemas
# ═══════════════════════════════════════════════════════════════════════════

class TemplateItemSchema(BaseModel):
    medicine_name: str
    generic_name: Optional[str] = None
    dosage: str
    frequency: str
    duration_value: Optional[int] = None
    duration_unit: Optional[str] = None
    route: Optional[str] = None
    instructions: Optional[str] = None


class PrescriptionTemplateCreate(BaseModel):
    name: str = Field(..., max_length=100)
    diagnosis: Optional[str] = None
    items: list[TemplateItemSchema]
    advice: Optional[str] = None


class PrescriptionTemplateUpdate(BaseModel):
    name: Optional[str] = None
    diagnosis: Optional[str] = None
    items: Optional[list[TemplateItemSchema]] = None
    advice: Optional[str] = None
    is_active: Optional[bool] = None


class PrescriptionTemplateResponse(BaseModel):
    id: str
    doctor_id: str
    name: str
    diagnosis: Optional[str] = None
    items: list[dict]
    advice: Optional[str] = None
    is_active: bool = True
    usage_count: int = 0
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


# ═══════════════════════════════════════════════════════════════════════════
# Prescription Version Schemas
# ═══════════════════════════════════════════════════════════════════════════

class PrescriptionVersionResponse(BaseModel):
    id: str
    prescription_id: str
    version: int
    snapshot: dict
    changed_by: Optional[str] = None
    change_reason: Optional[str] = None
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)
