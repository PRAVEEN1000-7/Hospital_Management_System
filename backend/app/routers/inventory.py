"""
Inventory API routes — Suppliers, Purchase Orders, GRNs,
Stock Movements, Adjustments, Cycle Counts, Dashboard.
"""
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_active_user, require_any_role
from ..models.user import User
from ..schemas.inventory import (
    SupplierCreate, SupplierUpdate, SupplierResponse,
    PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderResponse,
    GRNCreate, GRNUpdate, GRNResponse,
    StockMovementResponse,
    StockAdjustmentCreate, StockAdjustmentUpdate, StockAdjustmentResponse,
    CycleCountCreate, CycleCountUpdate, CycleCountResponse,
)
from ..services import inventory_service as svc

logger = logging.getLogger(__name__)

# ─── Routers ────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/inventory", tags=["Inventory"])
suppliers_router = APIRouter(prefix="/inventory/suppliers", tags=["Inventory – Suppliers"])
po_router = APIRouter(prefix="/inventory/purchase-orders", tags=["Inventory – Purchase Orders"])
grn_router = APIRouter(prefix="/inventory/grns", tags=["Inventory – GRNs"])
movements_router = APIRouter(prefix="/inventory/stock-movements", tags=["Inventory – Stock Movements"])
adjustments_router = APIRouter(prefix="/inventory/adjustments", tags=["Inventory – Adjustments"])
cycle_counts_router = APIRouter(prefix="/inventory/cycle-counts", tags=["Inventory – Cycle Counts"])

inventory_view_roles = require_any_role("super_admin", "admin", "inventory_manager", "pharmacist")
inventory_manage_roles = require_any_role("super_admin", "admin", "inventory_manager")
grn_verify_roles = require_any_role("super_admin", "admin", "inventory_manager", "pharmacist")


# ═════════════════════════════════════════════════════════════════════════════
#  DASHBOARD
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard")
async def inventory_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Inventory dashboard statistics."""
    return svc.get_inventory_dashboard(db, current_user.hospital_id)


@router.get("/low-stock")
async def low_stock_items(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Items below their reorder level."""
    return svc.get_low_stock_items(db, current_user.hospital_id, limit=limit)


@router.get("/expiring")
async def expiring_items(
    days: int = Query(90, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Items expiring within the given number of days."""
    return svc.get_expiring_items(db, current_user.hospital_id, days=days)


# ═════════════════════════════════════════════════════════════════════════════
#  SUPPLIERS
# ═════════════════════════════════════════════════════════════════════════════

@suppliers_router.get("")
async def list_suppliers(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """List suppliers with pagination and search."""
    result = svc.list_suppliers(db, current_user.hospital_id, page, limit, search, is_active)
    data = [SupplierResponse.model_validate(s) for s in result["data"]]
    return {**result, "data": data}


@suppliers_router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Create a new supplier."""
    try:
        supplier = svc.create_supplier(db, payload, current_user.hospital_id)
        return SupplierResponse.model_validate(supplier)
    except Exception as e:
        if "uq_supplier_code_hospital" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(status_code=400, detail="A supplier with this code already exists")
        raise


@suppliers_router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(
    supplier_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Get supplier by ID."""
    supplier = svc.get_supplier(db, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return SupplierResponse.model_validate(supplier)


@suppliers_router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: uuid.UUID,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Update a supplier."""
    supplier = svc.update_supplier(db, supplier_id, payload)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return SupplierResponse.model_validate(supplier)


@suppliers_router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(
    supplier_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Deactivate a supplier (soft delete)."""
    if not svc.delete_supplier(db, supplier_id):
        raise HTTPException(status_code=404, detail="Supplier not found")


# ═════════════════════════════════════════════════════════════════════════════
#  PURCHASE ORDERS
# ═════════════════════════════════════════════════════════════════════════════

@po_router.get("")
async def list_purchase_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    supplier_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """List purchase orders with pagination."""
    result = svc.list_purchase_orders(
        db, current_user.hospital_id, page, limit,
        status=status_filter, supplier_id=supplier_id, search=search,
    )
    data = [svc._format_po_response(po, db) for po in result["data"]]
    return {**result, "data": data}


@po_router.post("", status_code=status.HTTP_201_CREATED)
async def create_purchase_order(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Create a new purchase order."""
    po = svc.create_purchase_order(db, payload, current_user.hospital_id, current_user.id)
    full_po = svc.get_purchase_order(db, po.id)
    return svc._format_po_response(full_po, db)


@po_router.get("/{po_id}")
async def get_purchase_order(
    po_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Get purchase order by ID."""
    po = svc.get_purchase_order(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return svc._format_po_response(po, db)


@po_router.put("/{po_id}")
async def update_purchase_order(
    po_id: uuid.UUID,
    payload: PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Update a purchase order (status, notes, etc.)."""
    po = svc.update_purchase_order(db, po_id, payload, approver_id=current_user.id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    full_po = svc.get_purchase_order(db, po.id)
    return svc._format_po_response(full_po, db)


# ═════════════════════════════════════════════════════════════════════════════
#  GOODS RECEIPT NOTES
# ═════════════════════════════════════════════════════════════════════════════

@grn_router.get("")
async def list_grns(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    supplier_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """List GRNs with pagination."""
    result = svc.list_grns(
        db, current_user.hospital_id, page, limit,
        status=status_filter, supplier_id=supplier_id, search=search,
    )
    data = [svc._format_grn_response(g, db) for g in result["data"]]
    return {**result, "data": data}


@grn_router.post("", status_code=status.HTTP_201_CREATED)
async def create_grn(
    payload: GRNCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Create a new goods receipt note."""
    grn = svc.create_grn(db, payload, current_user.hospital_id, current_user.id)
    full_grn = svc.get_grn(db, grn.id)
    return svc._format_grn_response(full_grn, db)


@grn_router.get("/{grn_id}")
async def get_grn(
    grn_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Get GRN by ID."""
    grn = svc.get_grn(db, grn_id)
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    return svc._format_grn_response(grn, db)


@grn_router.put("/{grn_id}")
async def update_grn(
    grn_id: uuid.UUID,
    payload: GRNUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(grn_verify_roles),
):
    """Update GRN status (verify / accept / reject)."""
    grn = svc.update_grn(db, grn_id, payload, verifier_id=current_user.id)
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    full_grn = svc.get_grn(db, grn.id)
    return svc._format_grn_response(full_grn, db)


# ═════════════════════════════════════════════════════════════════════════════
#  STOCK MOVEMENTS
# ═════════════════════════════════════════════════════════════════════════════

@movements_router.get("")
async def list_stock_movements(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    item_type: Optional[str] = None,
    item_id: Optional[str] = None,
    movement_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """List stock movements with pagination and filters."""
    result = svc.list_stock_movements(
        db, current_user.hospital_id, page, limit,
        item_type=item_type, item_id=item_id, movement_type=movement_type,
    )
    data = [svc._format_movement_response(m, db) for m in result["data"]]
    return {**result, "data": data}


# ═════════════════════════════════════════════════════════════════════════════
#  STOCK ADJUSTMENTS
# ═════════════════════════════════════════════════════════════════════════════

@adjustments_router.get("")
async def list_adjustments(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """List stock adjustments."""
    result = svc.list_stock_adjustments(
        db, current_user.hospital_id, page, limit, status=status_filter,
    )
    data = [svc._format_adjustment_response(a, db) for a in result["data"]]
    return {**result, "data": data}


@adjustments_router.post("", status_code=status.HTTP_201_CREATED)
async def create_adjustment(
    payload: StockAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Create a stock adjustment request."""
    adj = svc.create_stock_adjustment(db, payload, current_user.hospital_id, current_user.id)
    return svc._format_adjustment_response(adj, db)


@adjustments_router.put("/{adjustment_id}/approve")
async def approve_adjustment(
    adjustment_id: uuid.UUID,
    payload: StockAdjustmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("super_admin", "admin")),
):
    """Approve or reject a stock adjustment (Admin/Super Admin only)."""
    adj = svc.approve_stock_adjustment(db, adjustment_id, payload, current_user.id)
    if not adj:
        raise HTTPException(status_code=404, detail="Adjustment not found or already processed")
    return svc._format_adjustment_response(adj, db)


# ═════════════════════════════════════════════════════════════════════════════
#  CYCLE COUNTS
# ═════════════════════════════════════════════════════════════════════════════

@cycle_counts_router.get("")
async def list_cycle_counts(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """List cycle counts."""
    result = svc.list_cycle_counts(
        db, current_user.hospital_id, page, limit, status=status_filter,
    )
    data = [svc._format_cycle_count_response(cc, db) for cc in result["data"]]
    return {**result, "data": data}


@cycle_counts_router.post("", status_code=status.HTTP_201_CREATED)
async def create_cycle_count(
    payload: CycleCountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Create a new cycle count."""
    cc = svc.create_cycle_count(db, payload, current_user.hospital_id, current_user.id)
    full_cc = svc.get_cycle_count(db, cc.id)
    return svc._format_cycle_count_response(full_cc, db)


@cycle_counts_router.get("/{cc_id}")
async def get_cycle_count(
    cc_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Get cycle count by ID."""
    cc = svc.get_cycle_count(db, cc_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cycle count not found")
    return svc._format_cycle_count_response(cc, db)


@cycle_counts_router.put("/{cc_id}")
async def update_cycle_count(
    cc_id: uuid.UUID,
    payload: CycleCountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Update cycle count status (complete / verify)."""
    cc = svc.update_cycle_count(db, cc_id, payload, verifier_id=current_user.id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cycle count not found")
    full_cc = svc.get_cycle_count(db, cc.id)
    return svc._format_cycle_count_response(full_cc, db)
