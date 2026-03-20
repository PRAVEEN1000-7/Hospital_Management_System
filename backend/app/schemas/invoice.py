"""
Invoice and InvoiceItem Pydantic schemas.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal

VALID_INVOICE_TYPES = ["opd", "pharmacy", "optical", "combined"]
VALID_INVOICE_STATUSES = ["draft", "issued", "partially_paid", "paid", "overdue", "cancelled", "void"]
VALID_ITEM_TYPES = ["consultation", "medicine", "optical_product", "service", "procedure", "registration"]

# Mapping: invoice_type → allowed item_types
INVOICE_TYPE_ITEM_MAPPING = {
    "opd": ["consultation", "service", "procedure", "registration"],
    "pharmacy": ["medicine"],
    "optical": ["optical_product", "service"],
    "combined": ["consultation", "medicine", "optical_product", "service", "procedure", "registration"],
}


# ─────────────────────────────────────────────────────────────────────────────
# Invoice Item
# ─────────────────────────────────────────────────────────────────────────────

class InvoiceItemCreate(BaseModel):
    item_type: str = Field(..., description="consultation | medicine | optical_product | service | procedure | registration")
    reference_id: Optional[str] = None
    description: str = Field(..., min_length=1, max_length=255)
    quantity: Decimal = Field(..., gt=0, decimal_places=2)
    unit_price: Decimal = Field(..., ge=0, decimal_places=2)
    discount_percent: Optional[Decimal] = Field(default=Decimal("0"), ge=0, le=100)
    tax_config_id: Optional[str] = None
    tax_rate: Optional[Decimal] = Field(default=Decimal("0"), ge=0, le=100)
    display_order: Optional[int] = 0
    batch_number: Optional[str] = Field(None, max_length=50)

    @field_validator("item_type")
    @classmethod
    def validate_item_type(cls, v: str) -> str:
        if v not in VALID_ITEM_TYPES:
            raise ValueError(f"item_type must be one of: {', '.join(VALID_ITEM_TYPES)}")
        return v


class InvoiceItemResponse(BaseModel):
    id: str
    invoice_id: str
    item_type: str
    reference_id: Optional[str]
    description: str
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    discount_amount: Decimal
    tax_config_id: Optional[str]
    tax_rate: Decimal
    tax_amount: Decimal
    total_price: Decimal
    display_order: int
    batch_number: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        if hasattr(obj, "__dict__"):
            data = {
                "id": str(obj.id),
                "invoice_id": str(obj.invoice_id),
                "item_type": obj.item_type,
                "reference_id": str(obj.reference_id) if obj.reference_id else None,
                "description": obj.description,
                "quantity": obj.quantity or Decimal("0"),
                "unit_price": obj.unit_price or Decimal("0"),
                "discount_percent": obj.discount_percent or Decimal("0"),
                "discount_amount": obj.discount_amount or Decimal("0"),
                "tax_config_id": str(obj.tax_config_id) if obj.tax_config_id else None,
                "tax_rate": obj.tax_rate or Decimal("0"),
                "tax_amount": obj.tax_amount or Decimal("0"),
                "total_price": obj.total_price or Decimal("0"),
                "display_order": obj.display_order or 0,
                "batch_number": obj.batch_number or None,
                "created_at": obj.created_at,
            }
            return cls(**data)
        return super().model_validate(obj, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# Invoice
# ─────────────────────────────────────────────────────────────────────────────

class InvoiceCreate(BaseModel):
    patient_id: str
    appointment_id: Optional[str] = None
    invoice_type: str = Field(..., description="opd | pharmacy | optical | combined")
    invoice_date: Optional[date] = None   # defaults to today if omitted
    due_date: Optional[date] = None
    discount_amount: Optional[Decimal] = Field(default=Decimal("0"), ge=0)
    discount_reason: Optional[str] = Field(None, max_length=255)
    currency: Optional[str] = Field(default="INR", max_length=3)
    notes: Optional[str] = None
    items: Optional[List[InvoiceItemCreate]] = []

    @field_validator("invoice_type")
    @classmethod
    def validate_invoice_type(cls, v: str) -> str:
        if v not in VALID_INVOICE_TYPES:
            raise ValueError(f"invoice_type must be one of: {', '.join(VALID_INVOICE_TYPES)}")
        return v

    @field_validator("items")
    @classmethod
    def validate_items_match_type(cls, items: List[InvoiceItemCreate], info) -> List[InvoiceItemCreate]:
        """Validate that all items match the invoice type allowed items"""
        if not items:
            return items
        
        invoice_type = info.data.get("invoice_type", "combined")
        allowed_types = INVOICE_TYPE_ITEM_MAPPING.get(invoice_type, VALID_ITEM_TYPES)
        
        for item in items:
            if item.item_type not in allowed_types:
                raise ValueError(
                    f"Item type '{item.item_type}' not allowed for invoice type '{invoice_type}'. "
                    f"Allowed types: {', '.join(allowed_types)}"
                )
        return items


class InvoiceUpdate(BaseModel):
    appointment_id: Optional[str] = None
    due_date: Optional[date] = None
    discount_amount: Optional[Decimal] = Field(None, ge=0)
    discount_reason: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = None


class InvoiceListItem(BaseModel):
    id: str
    invoice_number: str
    patient_id: str
    patient_name: str
    invoice_type: str
    invoice_date: date
    due_date: Optional[date]
    total_amount: Decimal
    paid_amount: Decimal
    balance_amount: Decimal
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class InvoiceResponse(BaseModel):
    id: str
    hospital_id: str
    invoice_number: str
    patient_id: str
    patient_name: str
    appointment_id: Optional[str]
    invoice_type: str
    invoice_date: date
    due_date: Optional[date]
    subtotal: Decimal
    discount_amount: Decimal
    discount_reason: Optional[str]
    tax_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    balance_amount: Decimal
    currency: str
    status: str
    notes: Optional[str]
    items: List[InvoiceItemResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        if hasattr(obj, "__dict__"):
            patient_name = ""
            if obj.patient:
                patient_name = f"{obj.patient.first_name} {obj.patient.last_name}".strip()
            data = {
                "id": str(obj.id),
                "hospital_id": str(obj.hospital_id),
                "invoice_number": obj.invoice_number,
                "patient_id": str(obj.patient_id),
                "patient_name": patient_name,
                "appointment_id": str(obj.appointment_id) if obj.appointment_id else None,
                "invoice_type": obj.invoice_type,
                "invoice_date": obj.invoice_date,
                "due_date": obj.due_date,
                "subtotal": obj.subtotal or Decimal("0"),
                "discount_amount": (obj.discount_amount or Decimal("0")) + sum(
                    i.discount_amount or Decimal("0") for i in (obj.items or [])
                ),
                "discount_reason": obj.discount_reason,
                "tax_amount": obj.tax_amount or Decimal("0"),
                "total_amount": obj.total_amount or Decimal("0"),
                "paid_amount": obj.paid_amount or Decimal("0"),
                "balance_amount": obj.balance_amount or Decimal("0"),
                "currency": obj.currency or "INR",
                "status": obj.status,
                "notes": obj.notes,
                "items": [InvoiceItemResponse.model_validate(i) for i in (obj.items or [])],
                "created_at": obj.created_at,
                "updated_at": obj.updated_at,
            }
            return cls(**data)
        return super().model_validate(obj, **kwargs)


class PaginatedInvoiceResponse(BaseModel):
    items: list[InvoiceListItem]
    total: int
    page: int
    limit: int
    pages: int


class InvoiceTypeItemMappingResponse(BaseModel):
    """Mapping of invoice types to allowed item types for UI filtering"""
    class Config:
        json_schema_extra = {
            "example": {
                "opd": ["consultation", "service", "procedure", "registration"],
                "pharmacy": ["medicine"],
                "optical": ["optical_product", "service"],
                "combined": ["consultation", "medicine", "optical_product", "service", "procedure", "registration"]
            }
        }
    
    def __iter__(self):
        """Make this work as a dict in responses"""
        return iter(INVOICE_TYPE_ITEM_MAPPING.items())
