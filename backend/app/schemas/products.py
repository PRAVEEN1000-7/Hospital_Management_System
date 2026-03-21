"""Pydantic schemas for Products and Stock Management."""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import date, datetime
import uuid


# Valid product categories
VALID_PRODUCT_CATEGORIES = [
    "medicine", "optical", "surgical", "equipment", 
    "laboratory", "disposable", "other"
]

VALID_ALERT_TYPES = [
    "low_stock", "expiring_soon", "expired", "overstocked", "near_expiry"
]

VALID_SEVERITY_LEVELS = [
    "low", "medium", "high", "critical"
]


# ─────────────────────────────────────────────────────────────────────────────
# Product Schemas
# ─────────────────────────────────────────────────────────────────────────────

class ProductBase(BaseModel):
    product_name: str = Field(..., min_length=1, max_length=200)
    generic_name: Optional[str] = Field(None, max_length=200)
    brand_name: Optional[str] = Field(None, max_length=200)
    category: str = Field(..., max_length=50)
    subcategory: Optional[str] = Field(None, max_length=100)
    sku: Optional[str] = Field(None, max_length=50)
    barcode: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=200)
    supplier_id: Optional[str] = None
    purchase_price: float = Field(0, ge=0)
    selling_price: float = Field(0, ge=0)
    mrp: float = Field(0, ge=0)
    tax_percentage: float = Field(0, ge=0, le=100)
    unit_type: str = Field("unit", max_length=50)
    pack_size: int = Field(1, ge=1)
    min_stock_level: int = Field(10, ge=0)
    max_stock_level: int = Field(1000, ge=0)
    reorder_level: int = Field(20, ge=0)
    storage_conditions: Optional[str] = None
    shelf_life_days: Optional[int] = Field(None, ge=0)
    requires_refrigeration: bool = False
    is_hazardous: bool = False
    is_narcotic: bool = False
    requires_prescription: bool = False

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_PRODUCT_CATEGORIES:
            raise ValueError(f"Category must be one of: {', '.join(VALID_PRODUCT_CATEGORIES)}")
        return v


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    product_name: Optional[str] = Field(None, min_length=1, max_length=200)
    generic_name: Optional[str] = Field(None, max_length=200)
    brand_name: Optional[str] = Field(None, max_length=200)
    category: Optional[str] = Field(None, max_length=50)
    subcategory: Optional[str] = Field(None, max_length=100)
    sku: Optional[str] = Field(None, max_length=50)
    barcode: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=200)
    supplier_id: Optional[str] = None
    purchase_price: Optional[float] = Field(None, ge=0)
    selling_price: Optional[float] = Field(None, ge=0)
    mrp: Optional[float] = Field(None, ge=0)
    tax_percentage: Optional[float] = Field(None, ge=0, le=100)
    unit_type: Optional[str] = Field(None, max_length=50)
    pack_size: Optional[int] = Field(None, ge=1)
    min_stock_level: Optional[int] = Field(None, ge=0)
    max_stock_level: Optional[int] = Field(None, ge=0)
    reorder_level: Optional[int] = Field(None, ge=0)
    storage_conditions: Optional[str] = None
    shelf_life_days: Optional[int] = Field(None, ge=0)
    requires_refrigeration: Optional[bool] = None
    is_hazardous: Optional[bool] = None
    is_narcotic: Optional[bool] = None
    requires_prescription: Optional[bool] = None
    is_active: Optional[bool] = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_PRODUCT_CATEGORIES:
            raise ValueError(f"Category must be one of: {', '.join(VALID_PRODUCT_CATEGORIES)}")
        return v


class ProductResponse(ProductBase):
    id: str
    hospital_id: str
    is_active: bool
    is_deleted: bool
    created_by_name: Optional[str] = None
    updated_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProductWithStockResponse(ProductResponse):
    """Product with current stock summary."""
    total_stock: int = 0
    available_stock: int = 0
    reserved_stock: int = 0
    total_value: float = 0
    is_low_stock: bool = False
    is_expiring_soon: bool = False
    earliest_expiry: Optional[date] = None


# ─────────────────────────────────────────────────────────────────────────────
# Stock Summary Schemas
# ─────────────────────────────────────────────────────────────────────────────

class StockSummaryBase(BaseModel):
    total_stock: int = 0
    available_stock: int = 0
    reserved_stock: int = 0
    damaged_stock: int = 0
    expired_stock: int = 0
    total_batches: int = 0
    earliest_expiry: Optional[date] = None
    avg_cost_price: float = 0
    total_value: float = 0
    is_low_stock: bool = False
    is_expiring_soon: bool = False
    last_movement_at: Optional[datetime] = None


class StockSummaryResponse(StockSummaryBase):
    id: str
    hospital_id: str
    product_id: str
    product_name: Optional[str] = None
    category: Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────────────────────
# Stock Alert Schemas
# ─────────────────────────────────────────────────────────────────────────────

class StockAlertBase(BaseModel):
    alert_type: str = Field(..., max_length=50)
    severity: str = Field("medium", max_length=20)
    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1)
    current_stock: Optional[int] = None
    threshold_stock: Optional[int] = None
    expiry_date: Optional[date] = None
    days_until_expiry: Optional[int] = None

    @field_validator("alert_type")
    @classmethod
    def validate_alert_type(cls, v: str) -> str:
        if v not in VALID_ALERT_TYPES:
            raise ValueError(f"Alert type must be one of: {', '.join(VALID_ALERT_TYPES)}")
        return v

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        if v not in VALID_SEVERITY_LEVELS:
            raise ValueError(f"Severity must be one of: {', '.join(VALID_SEVERITY_LEVELS)}")
        return v


class StockAlertCreate(StockAlertBase):
    pass


class StockAlertUpdate(BaseModel):
    is_resolved: Optional[bool] = None
    acknowledged_at: Optional[datetime] = None


class StockAlertResponse(StockAlertBase):
    id: str
    hospital_id: str
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    is_resolved: bool
    resolved_at: Optional[datetime] = None
    resolved_by_name: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledged_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard & Overview Schemas
# ─────────────────────────────────────────────────────────────────────────────

class StockDashboardResponse(BaseModel):
    """Stock overview dashboard data."""
    total_products: int
    active_products: int
    total_stock_value: float
    low_stock_count: int
    expiring_soon_count: int
    expired_count: int
    overstocked_count: int
    total_alerts: int
    critical_alerts: int


class LowStockItemResponse(BaseModel):
    """Low stock item details."""
    product_id: str
    product_name: str
    category: str
    sku: Optional[str] = None
    current_stock: int
    min_stock_level: int
    reorder_level: int
    purchase_price: float
    supplier_name: Optional[str] = None


class ExpiringItemResponse(BaseModel):
    """Expiring item details."""
    product_id: str
    product_name: str
    category: str
    batch_number: Optional[str] = None
    expiry_date: date
    days_until_expiry: int
    quantity: int
    unit_price: float


class StockOverviewFilters(BaseModel):
    """Filters for stock overview queries."""
    category: Optional[str] = None
    min_stock: Optional[int] = None
    max_stock: Optional[int] = None
    low_stock_only: bool = False
    expiring_only: bool = False
    search: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Paginated Response
# ─────────────────────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list
