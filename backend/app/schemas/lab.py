"""
Laboratory module Pydantic schemas — test catalog, orders (+ result rows), sales.

Follows schemas/optical.py's shape: `_orm_to_dict` transform on responses,
denormalized/enriched fields set by the service layer.
"""
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, Any
from datetime import datetime
from decimal import Decimal


def _orm_to_dict(data: Any) -> Any:
    """Convert a SQLAlchemy ORM instance to a dict, stringifying UUIDs."""
    if hasattr(data, "__mapper__"):
        d = {}
        for attr in data.__mapper__.column_attrs:
            key = attr.key
            val = getattr(data, key)
            if hasattr(val, "hex"):
                val = str(val)
            d[key] = val
        return d
    return data


# ══════════════════════════════════════════════════
# Lab Test (catalog)
# ══════════════════════════════════════════════════
class LabTestCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=30)
    category: Optional[str] = Field(None, max_length=100)
    sample_type: Optional[str] = Field(None, max_length=50)
    price: Decimal = Field(default=Decimal("0"), ge=0)
    unit: Optional[str] = Field(None, max_length=30)
    reference_range: Optional[str] = Field(None, max_length=200)
    turnaround_hours: Optional[int] = Field(None, ge=0)
    is_active: bool = True


class LabTestUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    code: Optional[str] = Field(None, min_length=1, max_length=30)
    category: Optional[str] = Field(None, max_length=100)
    sample_type: Optional[str] = Field(None, max_length=50)
    price: Optional[Decimal] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=30)
    reference_range: Optional[str] = Field(None, max_length=200)
    turnaround_hours: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class LabTestResponse(BaseModel):
    id: str
    hospital_id: str
    name: str
    code: str
    category: Optional[str] = None
    sample_type: Optional[str] = None
    price: Decimal
    unit: Optional[str] = None
    reference_range: Optional[str] = None
    turnaround_hours: Optional[int] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class LabTestListResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[LabTestResponse]


# ══════════════════════════════════════════════════
# Lab Order
# ══════════════════════════════════════════════════
class LabOrderCreate(BaseModel):
    patient_id: str
    # Optional — when omitted, resolved server-side from the logged-in doctor
    # (the Prescription Builder never re-asks the doctor to select themselves).
    doctor_id: Optional[str] = None
    appointment_id: Optional[str] = None
    prescription_id: Optional[str] = None
    test_ids: list[str] = Field(..., min_length=1)
    notes: Optional[str] = None


class LabResultEntry(BaseModel):
    result_value: str = Field(..., min_length=1, max_length=200)
    result_unit: Optional[str] = Field(None, max_length=30)
    reference_range: Optional[str] = Field(None, max_length=200)
    result_flag: Optional[str] = Field(None, pattern="^(normal|high|low|abnormal)$")
    result_notes: Optional[str] = None


class LabOrderItemResponse(BaseModel):
    id: str
    lab_order_id: str
    lab_test_id: str
    test_name: str
    price: Decimal
    status: str = "ordered"
    result_value: Optional[str] = None
    result_unit: Optional[str] = None
    reference_range: Optional[str] = None
    result_flag: Optional[str] = None
    result_notes: Optional[str] = None
    resulted_at: Optional[datetime] = None
    resulted_by: Optional[str] = None
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class LabOrderResponse(BaseModel):
    id: str
    hospital_id: str
    order_number: str
    patient_id: str
    doctor_id: str
    appointment_id: Optional[str] = None
    prescription_id: Optional[str] = None
    notes: Optional[str] = None
    is_finalized: bool = False
    status: str = "ordered"
    queue_token: Optional[int] = None
    queue_status: Optional[str] = None
    queue_called_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    # Enriched
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None
    total_amount: Optional[Decimal] = None
    payment_status: Optional[str] = None
    sale_id: Optional[str] = None
    items: list[LabOrderItemResponse] = []

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


# ══════════════════════════════════════════════════
# Lab Queue
# ══════════════════════════════════════════════════
class LabQueueEntryResponse(BaseModel):
    id: str
    order_number: str
    patient_name: Optional[str] = None
    queue_token: Optional[int] = None
    queue_status: str = "waiting"
    status: str = "ordered"
    total_amount: Decimal = Decimal("0")
    payment_status: str = "pending"
    created_at: datetime
    queue_called_at: Optional[datetime] = None


class LabQueueStatusUpdate(BaseModel):
    queue_status: str = Field(..., pattern="^(waiting|being_served|collected)$")


# ══════════════════════════════════════════════════
# Lab Sale
# ══════════════════════════════════════════════════
class LabSaleResponse(BaseModel):
    id: str
    hospital_id: str
    sale_number: str
    lab_order_id: str
    patient_id: str
    invoice_id: Optional[str] = None
    subtotal: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    payment_method: str = "cash"
    payment_status: str = "pending"
    amount_tendered: Decimal = Decimal("0")
    advance_amount: Decimal = Decimal("0")
    paid_amount: Decimal = Decimal("0")
    balance_amount: Decimal = Decimal("0")
    status: str = "pending"
    created_at: datetime
    updated_at: Optional[datetime] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class LabMarkPaidRequest(BaseModel):
    amount_paid: Decimal = Field(..., ge=0)
    payment_method: Optional[str] = None


# ══════════════════════════════════════════════════
# Dashboard
# ══════════════════════════════════════════════════
class LabDashboard(BaseModel):
    total_tests: int = 0
    today_orders_count: int = 0
    waiting_count: int = 0
    pending_results_count: int = 0
    today_revenue: Decimal = Decimal("0")
