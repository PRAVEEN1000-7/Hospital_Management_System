"""
Pharmacy Pydantic schemas — medicines, inventory, sales, suppliers, purchase orders.
"""
from pydantic import AliasChoices, BaseModel, Field, ConfigDict, model_validator, field_validator
from typing import Optional, Any
from datetime import date, datetime
from decimal import Decimal


def _reject_future_mfg_date(v: Optional[date]) -> Optional[date]:
    if v and v > date.today():
        raise ValueError("Manufacturing date cannot be in the future")
    return v


def _reject_past_expiry_date(v: Optional[date]) -> Optional[date]:
    if v and v < date.today():
        raise ValueError("Expiry date cannot be in the past")
    return v


_FIELD_ALIASES: dict[str, str] = {
    # Medicine model attr → pharmacy schema field name
    "unit_of_measure": "unit",
    "composition": "description",
    "storage_instructions": "storage_conditions",
}


def _orm_to_dict(data: Any) -> Any:
    """Convert SQLAlchemy ORM instance to dict, stringifying UUIDs.

    Also emits pharmacy-schema alias names for Medicine fields that have
    different names in the schema vs the ORM model (e.g. unit_of_measure → unit).
    """
    if hasattr(data, "__mapper__"):
        d = {}
        for attr in data.__mapper__.column_attrs:
            key = attr.key
            val = getattr(data, key)
            if hasattr(val, "hex"):
                val = str(val)
            d[key] = val
            alias = _FIELD_ALIASES.get(key)
            if alias:
                d[alias] = val
        return d
    return data


# ══════════════════════════════════════════════════
# Medicine
# ══════════════════════════════════════════════════
class MedicineCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    generic_name: Optional[str] = Field(None, max_length=200)
    brand: Optional[str] = Field(None, max_length=200)
    category: Optional[str] = Field(None, max_length=100)
    dosage_form: Optional[str] = Field(None, max_length=100)
    strength: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=200)
    hsn_code: Optional[str] = Field(None, max_length=20)
    sku: Optional[str] = Field(None, max_length=50)
    barcode: Optional[str] = Field(None, max_length=50)
    unit: str = Field(default="Nos", max_length=30)
    description: Optional[str] = None
    requires_prescription: bool = False
    schedule_type: Optional[str] = Field(None, max_length=10)
    rack_location: Optional[str] = Field(None, max_length=100)
    reorder_level: int = 10
    max_stock_level: Optional[int] = None
    storage_conditions: Optional[str] = Field(None, max_length=200)
    drug_interaction_notes: Optional[str] = None
    side_effects: Optional[str] = None
    # Optional so catalog/bulk imports (which carry no price) succeed; defaults to 0
    # and can be set later via the medicine form or batch pricing.
    selling_price: Decimal = Field(default=Decimal("0"), ge=0)
    purchase_price: Optional[Decimal] = Field(None, ge=0)
    is_active: bool = True


class MedicineUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    generic_name: Optional[str] = Field(None, max_length=200)
    brand: Optional[str] = Field(None, max_length=200)
    category: Optional[str] = Field(None, max_length=100)
    dosage_form: Optional[str] = Field(None, max_length=100)
    strength: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=200)
    hsn_code: Optional[str] = Field(None, max_length=20)
    sku: Optional[str] = Field(None, max_length=50)
    barcode: Optional[str] = Field(None, max_length=50)
    unit: Optional[str] = Field(None, max_length=30)
    description: Optional[str] = None
    requires_prescription: Optional[bool] = None
    schedule_type: Optional[str] = Field(None, max_length=10)
    rack_location: Optional[str] = Field(None, max_length=100)
    reorder_level: Optional[int] = None
    max_stock_level: Optional[int] = None
    storage_conditions: Optional[str] = Field(None, max_length=200)
    drug_interaction_notes: Optional[str] = None
    side_effects: Optional[str] = None
    selling_price: Optional[Decimal] = Field(None, gt=0)
    purchase_price: Optional[Decimal] = Field(None, ge=0)
    is_active: Optional[bool] = None


class MedicineResponse(BaseModel):
    id: str
    hospital_id: str
    name: str
    generic_name: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    dosage_form: Optional[str] = None
    strength: Optional[str] = None
    manufacturer: Optional[str] = None
    hsn_code: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    unit: str = "Nos"
    description: Optional[str] = None
    requires_prescription: bool = False
    schedule_type: Optional[str] = None
    rack_location: Optional[str] = None
    reorder_level: int = 10
    max_stock_level: Optional[int] = None
    storage_conditions: Optional[str] = None
    drug_interaction_notes: Optional[str] = None
    side_effects: Optional[str] = None
    selling_price: Decimal
    purchase_price: Optional[Decimal] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    # Enriched: total stock across batches (set by service)
    total_stock: Optional[int] = None
    # Enriched: earliest-expiring in-stock batch (FEFO — what dispenses next),
    # for the inventory list's Batch/MFG/EXP/MRP columns (BUG-32).
    earliest_batch_number: Optional[str] = None
    earliest_mfg_date: Optional[str] = None
    earliest_expiry_date: Optional[str] = None
    earliest_mrp: Optional[float] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class MedicineListResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[MedicineResponse]


# ══════════════════════════════════════════════════
# Medicine Batch
# ══════════════════════════════════════════════════
class BatchCreate(BaseModel):
    medicine_id: str
    batch_number: str = Field(..., min_length=1, max_length=50)
    mfg_date: Optional[date] = None
    expiry_date: date
    quantity: int = Field(..., ge=0)
    purchase_price: Decimal = Field(..., ge=0)
    selling_price: Decimal = Field(..., ge=0)
    mrp: Optional[Decimal] = Field(None, ge=0)
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    location: Optional[str] = Field(None, max_length=100)
    supplier_id: Optional[str] = None
    purchase_order_id: Optional[str] = None

    _validate_mfg_date = field_validator("mfg_date")(_reject_future_mfg_date)
    _validate_expiry_date = field_validator("expiry_date")(_reject_past_expiry_date)


class BatchUpdate(BaseModel):
    batch_number: Optional[str] = Field(None, max_length=50)
    mfg_date: Optional[date] = None
    expiry_date: Optional[date] = None
    quantity: Optional[int] = Field(None, ge=0)
    purchase_price: Optional[Decimal] = Field(None, ge=0)
    selling_price: Optional[Decimal] = Field(None, ge=0)
    mrp: Optional[Decimal] = Field(None, ge=0)
    tax_percent: Optional[Decimal] = Field(None, ge=0, le=100)
    discount_percent: Optional[Decimal] = Field(None, ge=0, le=100)

    _validate_mfg_date = field_validator("mfg_date")(_reject_future_mfg_date)
    _validate_expiry_date = field_validator("expiry_date")(_reject_past_expiry_date)
    location: Optional[str] = Field(None, max_length=100)
    is_active: Optional[bool] = None


class BatchResponse(BaseModel):
    id: str
    medicine_id: str
    batch_number: str
    mfg_date: Optional[date] = None
    expiry_date: date
    quantity: int
    purchase_price: Decimal
    selling_price: Decimal
    mrp: Optional[Decimal] = None
    tax_percent: Decimal = Decimal("0")
    discount_percent: Decimal = Decimal("0")
    location: Optional[str] = None
    supplier_id: Optional[str] = None
    purchase_order_id: Optional[str] = None
    received_date: Optional[date] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    # Enriched
    medicine_name: Optional[str] = None
    supplier_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


# ══════════════════════════════════════════════════
# Supplier
# ══════════════════════════════════════════════════
class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    contact_person: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    gst_number: Optional[str] = Field(None, max_length=20)
    drug_license_number: Optional[str] = Field(None, max_length=50)
    payment_terms: Optional[str] = Field(None, max_length=100)
    credit_limit: Optional[Decimal] = Field(None, ge=0)
    lead_time_days: Optional[int] = Field(None, ge=0)
    website: Optional[str] = Field(None, max_length=255)
    pan_number: Optional[str] = Field(None, max_length=20)
    is_active: bool = True


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    contact_person: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    gst_number: Optional[str] = Field(None, max_length=20)
    drug_license_number: Optional[str] = Field(None, max_length=50)
    payment_terms: Optional[str] = Field(None, max_length=100)
    credit_limit: Optional[Decimal] = Field(None, ge=0)
    lead_time_days: Optional[int] = Field(None, ge=0)
    website: Optional[str] = Field(None, max_length=255)
    pan_number: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None


class SupplierResponse(BaseModel):
    id: str
    hospital_id: str
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    drug_license_number: Optional[str] = None
    payment_terms: Optional[str] = None
    credit_limit: Optional[Decimal] = None
    lead_time_days: Optional[int] = None
    website: Optional[str] = None
    pan_number: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class SupplierListResponse(BaseModel):
    total: int
    data: list[SupplierResponse]


# ══════════════════════════════════════════════════
# Purchase Order
# ══════════════════════════════════════════════════
class PurchaseOrderItemCreate(BaseModel):
    medicine_id: str
    quantity_ordered: int = Field(..., ge=1)
    unit_price: Decimal = Field(..., ge=0)
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None


class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    expected_delivery: Optional[date] = None
    notes: Optional[str] = None
    items: list[PurchaseOrderItemCreate] = Field(..., min_length=1)


class PurchaseOrderUpdate(BaseModel):
    supplier_id: Optional[str] = None
    expected_delivery: Optional[date] = None
    notes: Optional[str] = None
    items: Optional[list[PurchaseOrderItemCreate]] = None


class PurchaseOrderReceiveItem(BaseModel):
    purchase_order_item_id: str
    quantity_received: int = Field(..., ge=0)
    batch_number: Optional[str] = Field(None, max_length=50)
    manufactured_date: Optional[date] = None
    expiry_date: Optional[date] = None
    unit_price: Optional[Decimal] = Field(None, ge=0)
    selling_price: Optional[Decimal] = Field(None, ge=0)


class PurchaseOrderReceiveRequest(BaseModel):
    items: list[PurchaseOrderReceiveItem] = Field(..., min_length=1)
    notes: Optional[str] = None


class PurchaseOrderItemResponse(BaseModel):
    id: str
    medicine_id: str = Field(validation_alias=AliasChoices("medicine_id", "item_id"))
    quantity_ordered: int
    quantity_received: int = 0
    unit_price: Decimal
    total_price: Decimal
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    medicine_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        payload = _orm_to_dict(data)
        if isinstance(payload, dict):
            # ORM model uses item_id, API contract uses medicine_id.
            if "medicine_id" not in payload and "item_id" in payload:
                payload["medicine_id"] = payload["item_id"]
        return payload

    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderResponse(BaseModel):
    id: str
    hospital_id: str
    supplier_id: str
    order_number: str = Field(validation_alias=AliasChoices("order_number", "po_number"))
    order_date: date
    expected_delivery: Optional[date] = Field(default=None, validation_alias=AliasChoices("expected_delivery", "expected_delivery_date"))
    status: str = "draft"
    total_amount: Decimal = Decimal("0")
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Enriched
    supplier_name: Optional[str] = None
    items: list[PurchaseOrderItemResponse] = []

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        payload = _orm_to_dict(data)
        if isinstance(payload, dict):
            # ORM model uses po_number/expected_delivery_date, API contract uses order_number/expected_delivery.
            if "order_number" not in payload and "po_number" in payload:
                payload["order_number"] = payload["po_number"]
            if "expected_delivery" not in payload and "expected_delivery_date" in payload:
                payload["expected_delivery"] = payload["expected_delivery_date"]
        return payload

    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderListResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[PurchaseOrderResponse]


# ══════════════════════════════════════════════════
# Pharmacy Sale
# ══════════════════════════════════════════════════
class SaleItemCreate(BaseModel):
    medicine_id: str
    batch_id: Optional[str] = None
    quantity: int = Field(..., ge=1)
    unit_price: Decimal = Field(..., ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    dosage_instructions: Optional[str] = Field(None, max_length=300)
    duration_days: Optional[int] = Field(None, ge=1)


class SaleCreate(BaseModel):
    patient_id: Optional[str] = None
    patient_name: Optional[str] = Field(None, max_length=200)
    doctor_name: Optional[str] = Field(None, max_length=200)
    prescription_number: Optional[str] = Field(None, max_length=50)
    prescription_date: Optional[date] = None
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    payment_method: str = Field(default="cash", pattern="^(cash|card|upi|bank_transfer|insurance)$")
    amount_tendered: Decimal = Field(default=Decimal("0"), ge=0)
    consultation_fee: Decimal = Field(default=Decimal("0"), ge=0)
    notes: Optional[str] = None
    items: list[SaleItemCreate] = Field(..., min_length=1)


class SaleItemResponse(BaseModel):
    id: str
    medicine_id: str
    batch_id: Optional[str] = None
    medicine_name: str
    batch_number: Optional[str] = None
    mfg_date: Optional[date] = None
    expiry_date: Optional[date] = None
    mrp: Optional[Decimal] = None
    supplier_name: Optional[str] = None
    quantity: int
    unit_price: Decimal
    dosage_instructions: Optional[str] = None
    duration_days: Optional[int] = None
    discount_percent: Decimal = Decimal("0")
    tax_percent: Decimal = Decimal("0")
    total_price: Decimal

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class SaleResponse(BaseModel):
    id: str
    hospital_id: str
    invoice_number: str
    sale_date: Optional[datetime] = None  # Made optional since it can be null
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None
    prescription_number: Optional[str] = None
    prescription_date: Optional[date] = None
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
    consultation_fee: Decimal = Decimal("0")
    queue_token: Optional[int] = None
    queue_status: Optional[str] = None
    status: str = "completed"
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None  # Made optional
    item_count: Optional[int] = 0
    items: list[SaleItemResponse] = []

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class SaleListResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[SaleResponse]


# ══════════════════════════════════════════════════
# Pharmacy Queue — BRD v1.1 PQ-01..06. A token is assigned when a doctor
# finalizes a prescription with medicines (or staff manually add a walk-in),
# decoupled from billing — see billing_queue_service.py.
# ══════════════════════════════════════════════════
class PharmacyQueueEntryResponse(BaseModel):
    id: str
    queue_token: Optional[int] = None
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None
    prescription_id: Optional[str] = None
    prescription_number: Optional[str] = None
    sale_id: Optional[str] = None
    status: str = "waiting"
    created_at: datetime
    queue_called_at: Optional[datetime] = None


class PharmacyQueueStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(waiting|being_served|collected)$")


class PharmacyQueueManualAdd(BaseModel):
    """Manual 'walk-in' add (BRD PQ-03) — either an existing patient or a free-text name."""
    patient_id: Optional[str] = None
    patient_name: Optional[str] = Field(None, max_length=200)
    doctor_name: Optional[str] = Field(None, max_length=200)

    @model_validator(mode="after")
    def require_identity(self) -> "PharmacyQueueManualAdd":
        if not self.patient_id and not (self.patient_name and self.patient_name.strip()):
            raise ValueError("Provide either patient_id or patient_name")
        return self


# ══════════════════════════════════════════════════
# Stock Adjustment (uses inventory model)
# ══════════════════════════════════════════════════
class StockAdjustmentCreate(BaseModel):
    medicine_id: str  # item_id in inventory model
    batch_id: Optional[str] = None
    adjustment_type: str = Field(..., pattern="^(increase|decrease|write_off|damage|expired|correction|return)$")
    quantity: int     # Positive = stock in, Negative = stock out
    # The stock_adjustments table has a NOT NULL constraint on this column —
    # it was previously typed Optional here, so a blank reason passed pydantic
    # validation and only failed later as a raw 500 DB IntegrityError.
    reason: str = Field(..., min_length=1, max_length=500)


class StockAdjustmentResponse(BaseModel):
    id: str
    hospital_id: str
    item_id: str      # medicine_id
    batch_id: Optional[str] = None
    adjustment_type: str
    quantity: int
    reason: Optional[str] = None
    status: str
    approved_by: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    medicine_name: Optional[str] = None  # Computed field for display

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        """Transform inventory StockAdjustment to pharmacy response format."""
        if isinstance(data, dict):
            # Map item_id to medicine_id for pharmacy
            data['medicine_id'] = data.get('item_id')
            # Get medicine name if available
            if not data.get('medicine_name') and data.get('item_name'):
                data['medicine_name'] = data['item_name']
        return data

    model_config = ConfigDict(from_attributes=True)


# ══════════════════════════════════════════════════
# Dashboard / Summary
# ══════════════════════════════════════════════════
class PharmacyDashboard(BaseModel):
    total_medicines: int = 0
    low_stock_count: int = 0
    expiring_soon_count: int = 0
    expired_count: int = 0
    today_sales_count: int = 0
    today_sales_amount: Decimal = Decimal("0")
    pending_orders: int = 0


# ══════════════════════════════════════════════════
# Analytics
# ══════════════════════════════════════════════════
class PharmacySalesAnalytics(BaseModel):
    """Daily pharmacy sales for analytics charts."""
    date: str
    sales: Decimal = Decimal("0")
    prescriptions_filled: int = 0


class TopSellingMedicineAnalytics(BaseModel):
    """Top selling medicine for analytics."""
    name: str
    medicine_id: str
    quantity_sold: int
    revenue: Decimal = Decimal("0")
    category: Optional[str] = None
