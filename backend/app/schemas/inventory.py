"""Pydantic schemas for the Inventory module."""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import date, datetime
import uuid


# ─── Supplier ───────────────────────────────────────────────────────────────

class SupplierBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=20)
    contact_person: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    tax_id: Optional[str] = Field(None, max_length=50)
    payment_terms: Optional[str] = Field(None, max_length=50)
    lead_time_days: Optional[int] = Field(None, ge=0)
    rating: Optional[float] = Field(None, ge=0, le=5)

class SupplierCreate(SupplierBase):
    pass

class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    contact_person: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    tax_id: Optional[str] = Field(None, max_length=50)
    payment_terms: Optional[str] = Field(None, max_length=50)
    lead_time_days: Optional[int] = Field(None, ge=0)
    rating: Optional[float] = Field(None, ge=0, le=5)
    is_active: Optional[bool] = None

class SupplierResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    rating: Optional[float] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Purchase Order ─────────────────────────────────────────────────────────

class PurchaseOrderItemCreate(BaseModel):
    item_type: str = Field(..., pattern=r"^(medicine|optical_product)$")
    item_id: str
    quantity_ordered: int = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    total_price: float = Field(..., ge=0)

class PurchaseOrderItemResponse(BaseModel):
    id: str
    item_type: str
    item_id: str
    item_name: Optional[str] = None
    quantity_ordered: int
    quantity_received: int
    unit_price: float
    total_price: float

    class Config:
        from_attributes = True

class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    order_date: date
    expected_delivery_date: Optional[date] = None
    status: Optional[str] = Field("draft", pattern=r"^(draft|submitted)$")
    notes: Optional[str] = None
    items: List[PurchaseOrderItemCreate] = Field(..., min_length=1)

class PurchaseOrderUpdate(BaseModel):
    expected_delivery_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        valid = ["draft", "submitted", "approved", "partially_received", "received", "cancelled"]
        if v is not None and v not in valid:
            raise ValueError(f"Status must be one of: {', '.join(valid)}")
        return v

class PurchaseOrderResponse(BaseModel):
    id: str
    po_number: str
    supplier_id: str
    supplier_name: Optional[str] = None
    order_date: date
    expected_delivery_date: Optional[date] = None
    status: str
    total_amount: float
    tax_amount: float
    notes: Optional[str] = None
    items: List[PurchaseOrderItemResponse] = []
    created_by_name: Optional[str] = None
    approved_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── GRN ────────────────────────────────────────────────────────────────────

class GRNItemCreate(BaseModel):
    item_type: str = Field(..., pattern=r"^(medicine|optical_product)$")
    item_id: str
    batch_number: Optional[str] = Field(None, max_length=50)
    manufactured_date: Optional[date] = None
    expiry_date: Optional[date] = None
    quantity_received: int = Field(..., gt=0)
    quantity_accepted: Optional[int] = Field(None, ge=0)
    quantity_rejected: int = Field(0, ge=0)
    unit_price: float = Field(..., ge=0)
    total_price: float = Field(..., ge=0)
    rejection_reason: Optional[str] = Field(None, max_length=255)

class GRNItemResponse(BaseModel):
    id: str
    item_type: str
    item_id: str
    item_name: Optional[str] = None
    batch_number: Optional[str] = None
    manufactured_date: Optional[date] = None
    expiry_date: Optional[date] = None
    quantity_received: int
    quantity_accepted: Optional[int] = None
    quantity_rejected: int
    unit_price: float
    total_price: float
    rejection_reason: Optional[str] = None

    class Config:
        from_attributes = True

class GRNCreate(BaseModel):
    purchase_order_id: Optional[str] = None
    supplier_id: str
    receipt_date: date
    invoice_number: Optional[str] = Field(None, max_length=50)
    invoice_date: Optional[date] = None
    notes: Optional[str] = None
    items: List[GRNItemCreate] = Field(..., min_length=1)

class GRNUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        valid = ["pending", "verified", "accepted", "rejected"]
        if v is not None and v not in valid:
            raise ValueError(f"Status must be one of: {', '.join(valid)}")
        return v

class GRNResponse(BaseModel):
    id: str
    grn_number: str
    purchase_order_id: Optional[str] = None
    po_number: Optional[str] = None
    supplier_id: str
    supplier_name: Optional[str] = None
    receipt_date: date
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    total_amount: float
    status: str
    notes: Optional[str] = None
    items: List[GRNItemResponse] = []
    created_by_name: Optional[str] = None
    verified_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Stock Movement ─────────────────────────────────────────────────────────

class StockMovementResponse(BaseModel):
    id: str
    item_type: str
    item_id: str
    item_name: Optional[str] = None
    batch_id: Optional[str] = None
    movement_type: str
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    quantity: int
    balance_after: int
    unit_cost: Optional[float] = None
    notes: Optional[str] = None
    performed_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Stock Adjustment ───────────────────────────────────────────────────────

class StockAdjustmentCreate(BaseModel):
    item_type: str = Field(..., pattern=r"^(medicine|optical_product)$")
    item_id: str
    batch_id: Optional[str] = None
    adjustment_type: str = Field(...)
    quantity: int = Field(..., gt=0)
    reason: str = Field(..., min_length=1, max_length=255)

    @field_validator("adjustment_type")
    @classmethod
    def validate_adjustment_type(cls, v: str) -> str:
        valid = ["increase", "decrease", "write_off"]
        if v not in valid:
            raise ValueError(f"Adjustment type must be one of: {', '.join(valid)}")
        return v

class StockAdjustmentUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        valid = ["approved", "rejected"]
        if v not in valid:
            raise ValueError(f"Status must be one of: approved, rejected")
        return v

class StockAdjustmentResponse(BaseModel):
    id: str
    adjustment_number: str
    item_type: str
    item_id: str
    item_name: Optional[str] = None
    batch_id: Optional[str] = None
    adjustment_type: str
    quantity: int
    reason: str
    status: str
    approved_by_name: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Cycle Count ────────────────────────────────────────────────────────────

class CycleCountItemCreate(BaseModel):
    item_type: str = Field(..., pattern=r"^(medicine|optical_product)$")
    item_id: str
    batch_id: Optional[str] = None
    system_quantity: int = Field(..., ge=0)
    counted_quantity: int = Field(..., ge=0)
    variance_reason: Optional[str] = Field(None, max_length=255)

class CycleCountItemResponse(BaseModel):
    id: str
    item_type: str
    item_id: str
    item_name: Optional[str] = None
    batch_id: Optional[str] = None
    system_quantity: int
    counted_quantity: int
    variance: int
    variance_reason: Optional[str] = None

    class Config:
        from_attributes = True

class CycleCountCreate(BaseModel):
    count_date: date
    notes: Optional[str] = None
    items: List[CycleCountItemCreate] = Field(..., min_length=1)

class CycleCountUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        valid = ["in_progress", "completed", "verified"]
        if v is not None and v not in valid:
            raise ValueError(f"Status must be one of: {', '.join(valid)}")
        return v

class CycleCountResponse(BaseModel):
    id: str
    count_number: str
    count_date: date
    status: str
    notes: Optional[str] = None
    items: List[CycleCountItemResponse] = []
    counted_by_name: Optional[str] = None
    verified_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Pagination ─────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list
