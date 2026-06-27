"""
Optical Store Pydantic schemas — products, batches, eye prescriptions, sales, stock adjustments.
"""
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, Any
from datetime import date, datetime
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
# Optical Product
# ══════════════════════════════════════════════════
class OpticalProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., max_length=50)  # 'frame' | 'lens' | 'contact_lens' | 'solution' | 'accessory'
    brand: Optional[str] = Field(None, max_length=100)
    model_number: Optional[str] = Field(None, max_length=100)
    color: Optional[str] = Field(None, max_length=50)
    material: Optional[str] = Field(None, max_length=50)
    size: Optional[str] = Field(None, max_length=20)
    gender: Optional[str] = Field(None, max_length=10)
    sku: Optional[str] = Field(None, max_length=50)
    barcode: Optional[str] = Field(None, max_length=50)
    selling_price: Decimal = Field(default=Decimal("0"), ge=0)
    purchase_price: Optional[Decimal] = Field(None, ge=0)
    tax_config_id: Optional[str] = None
    reorder_level: int = 5
    lens_type: Optional[str] = Field(None, max_length=30)
    lens_index: Optional[str] = Field(None, max_length=10)
    lens_coating: Optional[str] = Field(None, max_length=50)
    image_url: Optional[str] = Field(None, max_length=500)
    is_active: bool = True

    model_config = ConfigDict(protected_namespaces=())


class OpticalProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[str] = Field(None, max_length=50)
    brand: Optional[str] = Field(None, max_length=100)
    model_number: Optional[str] = Field(None, max_length=100)
    color: Optional[str] = Field(None, max_length=50)
    material: Optional[str] = Field(None, max_length=50)
    size: Optional[str] = Field(None, max_length=20)
    gender: Optional[str] = Field(None, max_length=10)
    sku: Optional[str] = Field(None, max_length=50)
    barcode: Optional[str] = Field(None, max_length=50)
    selling_price: Optional[Decimal] = Field(None, gt=0)
    purchase_price: Optional[Decimal] = Field(None, ge=0)
    tax_config_id: Optional[str] = None
    reorder_level: Optional[int] = None
    lens_type: Optional[str] = Field(None, max_length=30)
    lens_index: Optional[str] = Field(None, max_length=10)
    lens_coating: Optional[str] = Field(None, max_length=50)
    image_url: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None

    model_config = ConfigDict(protected_namespaces=())


class OpticalProductResponse(BaseModel):
    id: str
    hospital_id: str
    name: str
    category: str
    brand: Optional[str] = None
    model_number: Optional[str] = None
    color: Optional[str] = None
    material: Optional[str] = None
    size: Optional[str] = None
    gender: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    selling_price: Decimal
    purchase_price: Optional[Decimal] = None
    tax_config_id: Optional[str] = None
    reorder_level: int = 5
    lens_type: Optional[str] = None
    lens_index: Optional[str] = None
    lens_coating: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    # Enriched: total stock across active batches (set by service)
    total_stock: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


class OpticalProductListResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[OpticalProductResponse]


# ══════════════════════════════════════════════════
# Optical Batch
# ══════════════════════════════════════════════════
class OpticalBatchCreate(BaseModel):
    product_id: str
    batch_number: str = Field(..., min_length=1, max_length=50)
    mfg_date: Optional[date] = None
    expiry_date: Optional[date] = None  # nullable — only contact lenses meaningfully expire
    quantity: int = Field(..., ge=0)
    purchase_price: Decimal = Field(default=Decimal("0"), ge=0)
    selling_price: Decimal = Field(default=Decimal("0"), ge=0)
    mrp: Optional[Decimal] = Field(None, ge=0)


class OpticalBatchUpdate(BaseModel):
    batch_number: Optional[str] = Field(None, max_length=50)
    mfg_date: Optional[date] = None
    expiry_date: Optional[date] = None
    quantity: Optional[int] = Field(None, ge=0)
    purchase_price: Optional[Decimal] = Field(None, ge=0)
    selling_price: Optional[Decimal] = Field(None, ge=0)
    mrp: Optional[Decimal] = Field(None, ge=0)
    is_active: Optional[bool] = None


class OpticalBatchResponse(BaseModel):
    id: str
    product_id: str
    batch_number: str
    mfg_date: Optional[date] = None
    expiry_date: Optional[date] = None
    quantity: int
    purchase_price: Decimal
    selling_price: Decimal
    mrp: Optional[Decimal] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    # Enriched
    product_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


# ══════════════════════════════════════════════════
# Optical Prescription
# ══════════════════════════════════════════════════
class OpticalPrescriptionCreate(BaseModel):
    patient_id: str
    doctor_id: str
    appointment_id: Optional[str] = None
    right_sph: Optional[Decimal] = None
    right_cyl: Optional[Decimal] = None
    right_axis: Optional[int] = Field(None, ge=0, le=180)
    right_add: Optional[Decimal] = None
    right_va: Optional[str] = Field(None, max_length=20)
    left_sph: Optional[Decimal] = None
    left_cyl: Optional[Decimal] = None
    left_axis: Optional[int] = Field(None, ge=0, le=180)
    left_add: Optional[Decimal] = None
    left_va: Optional[str] = Field(None, max_length=20)
    pd_distance: Optional[Decimal] = None
    pd_near: Optional[Decimal] = None
    pd_right: Optional[Decimal] = None
    pd_left: Optional[Decimal] = None
    notes: Optional[str] = None
    valid_until: Optional[date] = None


class OpticalPrescriptionUpdate(BaseModel):
    right_sph: Optional[Decimal] = None
    right_cyl: Optional[Decimal] = None
    right_axis: Optional[int] = Field(None, ge=0, le=180)
    right_add: Optional[Decimal] = None
    right_va: Optional[str] = Field(None, max_length=20)
    left_sph: Optional[Decimal] = None
    left_cyl: Optional[Decimal] = None
    left_axis: Optional[int] = Field(None, ge=0, le=180)
    left_add: Optional[Decimal] = None
    left_va: Optional[str] = Field(None, max_length=20)
    pd_distance: Optional[Decimal] = None
    pd_near: Optional[Decimal] = None
    pd_right: Optional[Decimal] = None
    pd_left: Optional[Decimal] = None
    notes: Optional[str] = None
    valid_until: Optional[date] = None


class OpticalPrescriptionResponse(BaseModel):
    id: str
    hospital_id: str
    prescription_number: str
    patient_id: str
    doctor_id: str
    appointment_id: Optional[str] = None
    right_sph: Optional[Decimal] = None
    right_cyl: Optional[Decimal] = None
    right_axis: Optional[int] = None
    right_add: Optional[Decimal] = None
    right_va: Optional[str] = None
    left_sph: Optional[Decimal] = None
    left_cyl: Optional[Decimal] = None
    left_axis: Optional[int] = None
    left_add: Optional[Decimal] = None
    left_va: Optional[str] = None
    pd_distance: Optional[Decimal] = None
    pd_near: Optional[Decimal] = None
    pd_right: Optional[Decimal] = None
    pd_left: Optional[Decimal] = None
    notes: Optional[str] = None
    is_finalized: bool = False
    valid_until: Optional[date] = None
    created_at: datetime
    updated_at: datetime
    # Enriched
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class OpticalPrescriptionListResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[OpticalPrescriptionResponse]


# ══════════════════════════════════════════════════
# Optical Sale
# ══════════════════════════════════════════════════
class OpticalSaleItemCreate(BaseModel):
    product_id: str
    batch_id: Optional[str] = None
    quantity: int = Field(..., ge=1)
    unit_price: Decimal = Field(..., ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)


class OpticalSaleCreate(BaseModel):
    patient_id: str
    prescription_id: Optional[str] = None
    sale_type: str = Field(default="new", pattern="^(new|replacement|repair_order)$")
    frame_product_id: Optional[str] = None
    right_lens_product_id: Optional[str] = None
    left_lens_product_id: Optional[str] = None
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    payment_method: str = Field(default="cash", pattern="^(cash|card|upi|bank_transfer|insurance)$")
    amount_tendered: Decimal = Field(default=Decimal("0"), ge=0)
    advance_amount: Decimal = Field(default=Decimal("0"), ge=0)
    notes: Optional[str] = None
    items: list[OpticalSaleItemCreate] = Field(..., min_length=1)


class OpticalSaleItemResponse(BaseModel):
    id: str
    product_id: str
    batch_id: Optional[str] = None
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    quantity: int
    unit_price: Decimal
    discount_percent: Decimal = Decimal("0")
    tax_percent: Decimal = Decimal("0")
    total_price: Decimal

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class OpticalSaleResponse(BaseModel):
    id: str
    hospital_id: str
    invoice_number: str
    patient_id: str
    prescription_id: Optional[str] = None
    sale_type: str = "new"
    status: str = "placed"
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
    queue_token: Optional[int] = None
    queue_status: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    # Enriched
    patient_name: Optional[str] = None
    item_count: Optional[int] = 0
    items: list[OpticalSaleItemResponse] = []

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class OpticalSaleListResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[OpticalSaleResponse]


# ══════════════════════════════════════════════════
# Dispensing Queue — sale-triggered (unlike Pharmacy's prescription-triggered
# PharmacyQueueEntryResponse/PharmacyQueueStatusUpdate in schemas/pharmacy.py).
# ══════════════════════════════════════════════════
class OpticalQueueEntryResponse(BaseModel):
    id: str
    invoice_number: str
    patient_name: Optional[str] = None
    queue_token: Optional[int] = None
    queue_status: str = "waiting"
    total_amount: Decimal = Decimal("0")
    payment_status: str = "pending"
    created_at: datetime
    queue_called_at: Optional[datetime] = None


class OpticalQueueStatusUpdate(BaseModel):
    queue_status: str = Field(..., pattern="^(waiting|being_served|ready|collected)$")


# ══════════════════════════════════════════════════
# Stock Adjustment (reuses the shared inventory model)
# ══════════════════════════════════════════════════
class OpticalStockAdjustmentCreate(BaseModel):
    product_id: str  # item_id in inventory model
    batch_id: Optional[str] = None
    adjustment_type: str = Field(..., pattern="^(increase|decrease|write_off|damage|expired|correction|return)$")
    quantity: int  # Positive = stock in, Negative = stock out
    reason: Optional[str] = None


class OpticalStockAdjustmentResponse(BaseModel):
    id: str
    hospital_id: str
    item_id: str  # product_id
    batch_id: Optional[str] = None
    adjustment_type: str
    quantity: int
    reason: Optional[str] = None
    status: str
    approved_by: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    product_name: Optional[str] = None  # Computed field for display

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        if isinstance(data, dict):
            data['product_id'] = data.get('item_id')
            if not data.get('product_name') and data.get('item_name'):
                data['product_name'] = data['item_name']
        return data

    model_config = ConfigDict(from_attributes=True)


# ══════════════════════════════════════════════════
# Dashboard / Analytics
# ══════════════════════════════════════════════════
class OpticalDashboard(BaseModel):
    total_products: int = 0
    low_stock_count: int = 0
    expiring_soon_count: int = 0
    expired_count: int = 0
    today_sales_count: int = 0
    today_sales_amount: Decimal = Decimal("0")
    pending_prescriptions: int = 0


class OpticalSalesAnalytics(BaseModel):
    """Daily optical sales for analytics charts."""
    date: str
    sales: Decimal = Decimal("0")
    orders_count: int = 0


class TopSellingOpticalProductAnalytics(BaseModel):
    """Top selling optical product for analytics."""
    name: str
    product_id: str
    quantity_sold: int
    revenue: Decimal = Decimal("0")
    category: Optional[str] = None
