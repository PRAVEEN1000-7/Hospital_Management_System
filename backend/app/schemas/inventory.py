"""Pydantic schemas for the Inventory module."""
import re
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List
from datetime import date, datetime
import uuid


def _reject_future_mfg_date(v: Optional[date]) -> Optional[date]:
    if v and v > date.today():
        raise ValueError("Manufacturing date cannot be in the future")
    return v


def _reject_past_expiry_date(v: Optional[date]) -> Optional[date]:
    if v and v < date.today():
        raise ValueError("Expiry date cannot be in the past")
    return v


# ─── GST (shared by Supplier and, via schemas/hospital.py, Hospital) ───────
# Kept self-contained here (not imported from services/gst_service.py) so
# schema validation never depends on the service layer.

_GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
VALID_GST_REGISTRATION_STATUSES = ["registered", "unregistered"]
_INDIA_ALIASES = {"india", "in", "ind"}


def _validate_gstin_format(gstin: Optional[str]) -> Optional[str]:
    if gstin is None:
        return gstin
    gstin = gstin.strip().upper()
    if not gstin:
        return None
    if not _GSTIN_PATTERN.match(gstin):
        raise ValueError("GSTIN must be a valid 15-character Indian GSTIN")
    return gstin


def _require_gstin_when_registered(gstin: Optional[str], gst_registration_status: Optional[str], country: Optional[str]) -> None:
    """GSTIN is required for GST-registered Indian parties; a foreign or
    unregistered party is never forced to provide one."""
    is_india = (country or "India").strip().lower() in _INDIA_ALIASES
    if gst_registration_status == "registered" and is_india and not gstin:
        raise ValueError("GSTIN is required for a GST-registered Indian party")


def _require_state_for_india(state: Optional[str], country: Optional[str]) -> None:
    """State is required for Indian suppliers — it's what determines
    intra-state (CGST+SGST) vs inter-state (IGST) for every PO with this
    supplier. Left blank, place-of-supply silently falls back to
    'inter_state' (the safe default when it can't be confirmed — see
    gst_service.determine_place_of_supply), which looks like a bug from the
    PO screen ("why is this always IGST, never CGST+SGST?") when it's
    actually just missing supplier data. Not required for foreign suppliers,
    whose state genuinely may not apply."""
    is_india = (country or "India").strip().lower() in _INDIA_ALIASES
    if is_india and not (state or "").strip():
        raise ValueError("State is required for an Indian supplier — it determines whether GST splits into CGST+SGST or IGST")


# ─── Supplier ───────────────────────────────────────────────────────────────

# Valid product categories for suppliers
VALID_PRODUCT_CATEGORIES = ["medicine", "optical", "surgical", "equipment", "laboratory", "disposable", "other"]

class SupplierBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    # code intentionally omitted — it's server-generated (see
    # inventory_service.generate_supplier_code), never client-supplied.
    contact_person: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, pattern=r"^\d{10}$", description="Phone number digits only (exactly 10 digits)")
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    tax_id: Optional[str] = Field(None, max_length=50)
    # GST — state/country determine place of supply against the hospital's
    # own state/country (see gst_service.determine_place_of_supply); gstin is
    # only required/validated when gst_registration_status == 'registered'
    # and country is India (foreign or unregistered suppliers are never
    # forced to provide one).
    state: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field("India", max_length=100)
    gstin: Optional[str] = Field(None, max_length=15)
    gst_registration_status: Optional[str] = Field("unregistered")
    payment_terms: Optional[str] = Field(None, max_length=50)
    lead_time_days: Optional[int] = Field(None, ge=0)
    rating: Optional[float] = Field(None, ge=0, le=5)
    product_categories: Optional[List[str]] = Field(default_factory=list)

    @field_validator("product_categories")
    @classmethod
    def validate_product_categories(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        for category in v:
            if category not in VALID_PRODUCT_CATEGORIES:
                raise ValueError(f"Invalid category '{category}'. Must be one of: {', '.join(VALID_PRODUCT_CATEGORIES)}")
        return v

    @field_validator("gst_registration_status")
    @classmethod
    def validate_gst_registration_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_GST_REGISTRATION_STATUSES:
            raise ValueError(f"Must be one of: {', '.join(VALID_GST_REGISTRATION_STATUSES)}")
        return v

    @field_validator("gstin")
    @classmethod
    def validate_gstin_field(cls, v: Optional[str]) -> Optional[str]:
        return _validate_gstin_format(v)

class SupplierCreate(SupplierBase):
    @model_validator(mode="after")
    def check_gstin_required(self) -> "SupplierCreate":
        _require_gstin_when_registered(self.gstin, self.gst_registration_status, self.country)
        return self

    @model_validator(mode="after")
    def check_state_required(self) -> "SupplierCreate":
        _require_state_for_india(self.state, self.country)
        return self

class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    contact_person: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    tax_id: Optional[str] = Field(None, max_length=50)
    state: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    gstin: Optional[str] = Field(None, max_length=15)
    gst_registration_status: Optional[str] = None
    payment_terms: Optional[str] = Field(None, max_length=50)
    lead_time_days: Optional[int] = Field(None, ge=0)
    rating: Optional[float] = Field(None, ge=0, le=5)
    is_active: Optional[bool] = None
    product_categories: Optional[List[str]] = None

    @field_validator("product_categories")
    @classmethod
    def validate_product_categories(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        for category in v:
            if category not in VALID_PRODUCT_CATEGORIES:
                raise ValueError(f"Invalid category '{category}'. Must be one of: {', '.join(VALID_PRODUCT_CATEGORIES)}")
        return v

    @field_validator("gst_registration_status")
    @classmethod
    def validate_gst_registration_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_GST_REGISTRATION_STATUSES:
            raise ValueError(f"Must be one of: {', '.join(VALID_GST_REGISTRATION_STATUSES)}")
        return v

    @field_validator("gstin")
    @classmethod
    def validate_gstin_field(cls, v: Optional[str]) -> Optional[str]:
        return _validate_gstin_format(v)

class SupplierResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    gstin: Optional[str] = None
    gst_registration_status: Optional[str] = None
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    rating: Optional[float] = None
    product_categories: List[str] = Field(default_factory=list)
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_validator("product_categories", mode="before")
    @classmethod
    def parse_product_categories(cls, v):
        """Convert database PostgreSQL array format to list."""
        if v is None or v == '{}' or v == '':
            return []
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            # Handle PostgreSQL array format {a,b,c} or {"a","b"}
            if v.startswith('{') and v.endswith('}'):
                cleaned = v[1:-1]
                if not cleaned:
                    return []
                # Handle quoted and unquoted values
                return [c.strip().strip('"').strip("'") for c in cleaned.split(",") if c.strip()]
            # Fallback for empty or invalid format
            return []
        return v


# ─── Purchase Order ─────────────────────────────────────────────────────────

class PurchaseOrderItemCreate(BaseModel):
    item_type: str = Field(..., pattern=r"^(medicine|optical_product)$")
    item_id: str
    item_name: Optional[str] = Field(None, max_length=200)
    quantity_ordered: int = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    discount_percent: float = Field(0, ge=0, le=100)
    # GST% for this line — must match one of the hospital's configured tax
    # slabs (see gst_service.validate_tax_rate_against_slabs); 0 = no tax.
    gst_rate: float = Field(0, ge=0)
    # total_price is NOT accepted from the client — the backend always
    # recomputes it (base, discount, taxable, GST, total) via
    # gst_service.compute_line_item_tax so a client-side arithmetic bug or
    # tampered payload can never under/over-charge a supplier's line.

class PurchaseOrderItemResponse(BaseModel):
    id: str
    item_type: str
    item_id: str
    item_name: Optional[str] = None
    quantity_ordered: int
    quantity_received: int
    unit_price: float
    discount_percent: float = 0
    discount_amount: float = 0
    gst_rate: float = 0
    taxable_amount: float = 0
    cgst_amount: float = 0
    sgst_amount: float = 0
    igst_amount: float = 0
    ugst_amount: float = 0
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
    subtotal: float = 0
    discount_amount: float = 0
    taxable_amount: float = 0
    cgst_amount: float = 0
    sgst_amount: float = 0
    igst_amount: float = 0
    ugst_amount: float = 0
    place_of_supply_type: Optional[str] = None
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
    item_name: Optional[str] = Field(None, max_length=200)
    batch_number: Optional[str] = Field(None, max_length=50)
    manufactured_date: Optional[date] = None
    expiry_date: Optional[date] = None
    quantity_received: int = Field(..., gt=0)
    quantity_accepted: Optional[int] = Field(None, ge=0)
    quantity_rejected: int = Field(0, ge=0)
    unit_price: float = Field(..., ge=0)
    total_price: float = Field(..., ge=0)
    rejection_reason: Optional[str] = Field(None, max_length=255)

    _validate_manufactured_date = field_validator("manufactured_date")(_reject_future_mfg_date)
    _validate_expiry_date = field_validator("expiry_date")(_reject_past_expiry_date)

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
    discrepancy_notes: Optional[str] = None

    class Config:
        from_attributes = True

class GRNItemBatchUpdate(BaseModel):
    """Correct batch/packaging details on a received line item.

    Only allowed while the GRN is still 'pending' — once verified/accepted,
    stock movements and MedicineBatch/OpticalBatch rows have already been
    created keyed by this batch_number, so changing it afterward would
    desync the GRN record from the real inventory it produced.
    """
    batch_number: Optional[str] = Field(None, max_length=50)
    manufactured_date: Optional[date] = None
    expiry_date: Optional[date] = None
    # BRD 5.5 — correcting the actually-received quantity and recording why
    # (discrepancy from the PO / packing slip), still only while 'pending'.
    quantity_received: Optional[int] = Field(None, ge=0)
    discrepancy_notes: Optional[str] = Field(None, max_length=1000)

    _validate_manufactured_date = field_validator("manufactured_date")(_reject_future_mfg_date)
    _validate_expiry_date = field_validator("expiry_date")(_reject_past_expiry_date)


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
    batch_number: Optional[str] = None
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
    batch_number: Optional[str] = None
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


# ─── PO Payments ────────────────────────────────────────────────────────────

class PaymentModeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)

class PaymentModeResponse(BaseModel):
    id: str
    name: str
    is_active: bool

    class Config:
        from_attributes = True

class PurchaseOrderPaymentCreate(BaseModel):
    invoice_number: Optional[str] = Field(None, max_length=50)
    amount: float = Field(..., gt=0)
    payment_mode_id: str
    payment_date: Optional[date] = None
    reference_note: Optional[str] = None

class PurchaseOrderPaymentResponse(BaseModel):
    id: str
    purchase_order_id: str
    po_number: Optional[str] = None
    supplier_name: Optional[str] = None
    payment_number: str
    invoice_number: Optional[str] = None
    amount: float
    payment_mode_id: str
    mode_name: Optional[str] = None
    payment_date: date
    reference_note: Optional[str] = None
    recorded_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class PurchaseOrderPaymentSummary(BaseModel):
    po_total: float
    total_paid: float
    balance: float
    payments: List[PurchaseOrderPaymentResponse] = []


# ─── Pagination ─────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list


# ─── Analytics ──────────────────────────────────────────────────────────────

class StockStatusAnalytics(BaseModel):
    """Stock status for analytics dashboard."""
    item_name: str
    item_id: str
    category: str
    current_stock: int
    min_stock: int
    max_stock: int
    status: str  # 'ok', 'low', 'critical', 'overstock'
    last_restock_date: Optional[str] = None


class InventoryAgingAnalytics(BaseModel):
    """Inventory aging report for analytics."""
    range: str  # "0-30 days", "31-60 days", etc.
    item_count: int
    value: float
