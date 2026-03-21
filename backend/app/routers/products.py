"""
Products and Stock Management API routes.
Centralized product catalog and stock tracking endpoints.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_active_user, require_any_role
from ..models.user import User
from ..schemas.products import (
    ProductCreate, ProductUpdate, ProductResponse, ProductWithStockResponse,
    StockSummaryResponse, StockAlertCreate, StockAlertUpdate, StockAlertResponse,
    StockDashboardResponse, LowStockItemResponse, ExpiringItemResponse,
    PaginatedResponse,
)
from ..services import products_service as svc

logger = logging.getLogger(__name__)

# ─── Routers ────────────────────────────────────────────────────────────────

products_router = APIRouter(prefix="/inventory/products", tags=["Inventory – Products"])
stock_router = APIRouter(prefix="/inventory/stock", tags=["Inventory – Stock"])
alerts_router = APIRouter(prefix="/inventory/alerts", tags=["Inventory – Alerts"])

# Role requirements
inventory_view_roles = require_any_role("super_admin", "admin", "inventory_manager", "pharmacist")
inventory_manage_roles = require_any_role("super_admin", "admin", "inventory_manager")


# ═══════════════════════════════════════════════════════════════════════════
#  PRODUCTS
# ═══════════════════════════════════════════════════════════════════════════

@products_router.get("", response_model=PaginatedResponse)
async def list_products(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    search: Optional[str] = None,
    is_active: Optional[bool] = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """List all products in the catalog with pagination and filters."""
    result = svc.list_products(
        db, current_user.hospital_id, page, limit,
        category=category, search=search, is_active=is_active,
    )
    data = [ProductResponse.model_validate(p) for p in result["data"]]
    return {**result, "data": data}


@products_router.get("/{product_id}", response_model=ProductWithStockResponse)
async def get_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Get product details with current stock summary."""
    product = svc.get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Get stock summary
    stock_summary = db.query(svc.StockSummary).filter(
        svc.StockSummary.product_id == product.id
    ).first()
    
    response = ProductWithStockResponse(
        id=str(product.id),
        hospital_id=str(product.hospital_id),
        product_name=product.product_name,
        generic_name=product.generic_name,
        brand_name=product.brand_name,
        category=product.category,
        subcategory=product.subcategory,
        sku=product.sku,
        barcode=product.barcode,
        manufacturer=product.manufacturer,
        supplier_id=str(product.supplier_id) if product.supplier_id else None,
        purchase_price=float(product.purchase_price or 0),
        selling_price=float(product.selling_price or 0),
        mrp=float(product.mrp or 0),
        tax_percentage=float(product.tax_percentage or 0),
        unit_type=product.unit_type,
        pack_size=product.pack_size,
        min_stock_level=product.min_stock_level,
        max_stock_level=product.max_stock_level,
        reorder_level=product.reorder_level,
        storage_conditions=product.storage_conditions,
        shelf_life_days=product.shelf_life_days,
        requires_refrigeration=product.requires_refrigeration,
        is_hazardous=product.is_hazardous,
        is_narcotic=product.is_narcotic,
        requires_prescription=product.requires_prescription,
        is_active=product.is_active,
        is_deleted=product.is_deleted,
        created_by_name=product.creator.first_name + " " + product.creator.last_name if product.creator else None,
        updated_by_name=product.updater.first_name + " " + product.updater.last_name if product.updater else None,
        created_at=product.created_at,
        updated_at=product.updated_at,
        total_stock=stock_summary.total_stock if stock_summary else 0,
        available_stock=stock_summary.available_stock if stock_summary else 0,
        reserved_stock=stock_summary.reserved_stock if stock_summary else 0,
        total_value=float(stock_summary.total_value) if stock_summary else 0,
        is_low_stock=stock_summary.is_low_stock if stock_summary else False,
        is_expiring_soon=stock_summary.is_expiring_soon if stock_summary else False,
        earliest_expiry=stock_summary.earliest_expiry if stock_summary else None,
    )
    return response


@products_router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Create a new product in the catalog."""
    try:
        product = svc.create_product(db, payload, current_user.hospital_id, current_user.id)
        return ProductResponse.model_validate(product)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@products_router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Update product details."""
    product = svc.update_product(db, product_id, payload, current_user.id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductResponse.model_validate(product)


@products_router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Soft delete a product (deactivate)."""
    if not svc.delete_product(db, product_id):
        raise HTTPException(status_code=404, detail="Product not found")


# ═══════════════════════════════════════════════════════════════════════════
#  STOCK OVERVIEW
# ═══════════════════════════════════════════════════════════════════════════

@stock_router.get("/dashboard")
async def get_stock_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Get stock overview dashboard with key metrics."""
    return svc.get_stock_dashboard(db, current_user.hospital_id)


@stock_router.get("/overview", response_model=PaginatedResponse)
async def get_stock_overview(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    search: Optional[str] = None,
    low_stock_only: bool = False,
    expiring_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Get comprehensive stock overview with filters."""
    result = svc.get_stock_overview(
        db, current_user.hospital_id, page, limit,
        category=category, search=search,
        low_stock_only=low_stock_only, expiring_only=expiring_only,
    )
    return result


@stock_router.get("/low-stock", response_model=list[LowStockItemResponse])
async def get_low_stock(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Get items with low stock levels (below reorder level)."""
    return svc.get_low_stock_items(db, current_user.hospital_id, limit)


@stock_router.get("/expiring", response_model=list[ExpiringItemResponse])
async def get_expiring_items(
    days: int = Query(90, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Get items expiring within specified days."""
    return svc.get_expiring_items(db, current_user.hospital_id, days, limit)


@stock_router.post("/sync")
async def sync_stock_summary(
    product_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """
    Synchronize stock summary with actual movements.
    Optionally sync a specific product.
    """
    svc.sync_stock_summary(db, current_user.hospital_id, product_id)
    return {"status": "success", "message": "Stock summary synchronized"}


# ═══════════════════════════════════════════════════════════════════════════
#  STOCK ALERTS
# ═══════════════════════════════════════════════════════════════════════════

@alerts_router.get("", response_model=PaginatedResponse)
async def list_alerts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    alert_type: Optional[str] = None,
    severity: Optional[str] = None,
    unresolved_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """List stock alerts with filters."""
    result = svc.list_stock_alerts(
        db, current_user.hospital_id, page, limit,
        alert_type=alert_type, severity=severity,
        unresolved_only=unresolved_only,
    )
    return result


@alerts_router.post("", response_model=StockAlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(
    payload: StockAlertCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Create a manual stock alert."""
    alert = svc.create_stock_alert(db, payload, current_user.hospital_id)
    return StockAlertResponse.model_validate(alert)


@alerts_router.put("/{alert_id}/resolve", response_model=StockAlertResponse)
async def resolve_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Mark an alert as resolved."""
    alert = svc.resolve_alert(db, alert_id, current_user.id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return StockAlertResponse.model_validate(alert)


@alerts_router.put("/{alert_id}/acknowledge", response_model=StockAlertResponse)
async def acknowledge_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Acknowledge an alert."""
    alert = svc.acknowledge_alert(db, alert_id, current_user.id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return StockAlertResponse.model_validate(alert)
