"""
Pharmacy router — medicines, batches, suppliers, purchase orders, sales, stock adjustments, dashboard.
"""
import logging
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.pharmacy import (
    # Medicine
    MedicineCreate, MedicineUpdate, MedicineResponse, MedicineListResponse,
    # Batch
    BatchCreate, BatchUpdate, BatchResponse,
    # Supplier
    SupplierCreate, SupplierUpdate, SupplierResponse, SupplierListResponse,
    # Purchase Order
    PurchaseOrderCreate, PurchaseOrderResponse, PurchaseOrderListResponse, PurchaseOrderItemResponse,
    # Sale
    SaleCreate, SaleResponse, SaleListResponse, SaleItemResponse,
    # Stock Adjustment
    StockAdjustmentCreate, StockAdjustmentResponse,
    # Dashboard
    PharmacyDashboard,
)
from ..services import pharmacy_service as svc

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────
# Main pharmacy router (medicines)
# ──────────────────────────────────────────────────
router = APIRouter(prefix="/pharmacy", tags=["Pharmacy"])


# ═══ Dashboard ═══
@router.get("/dashboard", response_model=PharmacyDashboard)
async def pharmacy_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get pharmacy dashboard statistics."""
    return svc.get_pharmacy_dashboard(db, current_user.hospital_id)


# ═══ Medicines ═══
@router.get("/medicines", response_model=MedicineListResponse)
async def list_medicines(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = svc.list_medicines(db, current_user.hospital_id, page, limit, search, category, active_only)
    stock_map = result.pop("stock_map", {})
    data = []
    for med in result["data"]:
        resp = MedicineResponse.model_validate(med)
        resp.total_stock = stock_map.get(med.id, 0)
        data.append(resp)
    result["data"] = data
    return result


@router.get("/medicines/{medicine_id}", response_model=MedicineResponse)
async def get_medicine(
    medicine_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    med = svc.get_medicine_by_id(db, medicine_id)
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found")
    return MedicineResponse.model_validate(med)


@router.post("/medicines", response_model=MedicineResponse, status_code=status.HTTP_201_CREATED)
async def create_medicine(
    data: MedicineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        med = svc.create_medicine(db, current_user.hospital_id, data.model_dump(), current_user.id)
        return MedicineResponse.model_validate(med)
    except Exception as e:
        logger.error(f"Error creating medicine: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create medicine")


@router.put("/medicines/{medicine_id}", response_model=MedicineResponse)
async def update_medicine(
    medicine_id: str,
    data: MedicineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        med = svc.update_medicine(db, medicine_id, data.model_dump(exclude_unset=True))
        if not med:
            raise HTTPException(status_code=404, detail="Medicine not found")
        return MedicineResponse.model_validate(med)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating medicine: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update medicine")


@router.delete("/medicines/{medicine_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_medicine(
    medicine_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not svc.delete_medicine(db, medicine_id):
        raise HTTPException(status_code=404, detail="Medicine not found")


# ═══ Batches ═══
@router.get("/medicines/{medicine_id}/batches", response_model=list[BatchResponse])
async def list_batches(
    medicine_id: str,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    batches = svc.list_batches(db, medicine_id, active_only)
    return [BatchResponse.model_validate(b) for b in batches]


@router.post("/batches", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def create_batch(
    data: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        batch = svc.create_batch(db, data.model_dump())
        return BatchResponse.model_validate(batch)
    except Exception as e:
        logger.error(f"Error creating batch: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create batch")


@router.put("/batches/{batch_id}", response_model=BatchResponse)
async def update_batch(
    batch_id: str,
    data: BatchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        batch = svc.update_batch(db, batch_id, data.model_dump(exclude_unset=True))
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        return BatchResponse.model_validate(batch)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating batch: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update batch")


# ──────────────────────────────────────────────────
# Suppliers sub-router
# ──────────────────────────────────────────────────
suppliers_router = APIRouter(prefix="/pharmacy/suppliers", tags=["Pharmacy – Suppliers"])


@suppliers_router.get("", response_model=SupplierListResponse)
async def list_suppliers(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    sups = svc.list_suppliers(db, current_user.hospital_id, active_only)
    return SupplierListResponse(total=len(sups), data=[SupplierResponse.model_validate(s) for s in sups])


@suppliers_router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(
    supplier_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    sup = svc.get_supplier_by_id(db, supplier_id)
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return SupplierResponse.model_validate(sup)


@suppliers_router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    data: SupplierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        sup = svc.create_supplier(db, current_user.hospital_id, data.model_dump())
        return SupplierResponse.model_validate(sup)
    except Exception as e:
        logger.error(f"Error creating supplier: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create supplier")


@suppliers_router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: str,
    data: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        sup = svc.update_supplier(db, supplier_id, data.model_dump(exclude_unset=True))
        if not sup:
            raise HTTPException(status_code=404, detail="Supplier not found")
        return SupplierResponse.model_validate(sup)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating supplier: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update supplier")


@suppliers_router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_supplier(
    supplier_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not svc.delete_supplier(db, supplier_id):
        raise HTTPException(status_code=404, detail="Supplier not found")


# ──────────────────────────────────────────────────
# Purchase Orders sub-router
# ──────────────────────────────────────────────────
purchase_orders_router = APIRouter(prefix="/pharmacy/purchase-orders", tags=["Pharmacy – Purchase Orders"])


@purchase_orders_router.get("", response_model=PurchaseOrderListResponse)
async def list_purchase_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    order_status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = svc.list_purchase_orders(db, current_user.hospital_id, page, limit, order_status)
    data = [PurchaseOrderResponse.model_validate(po) for po in result["data"]]
    result["data"] = data
    return result


@purchase_orders_router.get("/{po_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(
    po_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    po = svc.get_purchase_order(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return PurchaseOrderResponse.model_validate(po)


@purchase_orders_router.post("", response_model=PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase_order(
    data: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        po = svc.create_purchase_order(db, current_user.hospital_id, data.model_dump(), current_user.id)
        return PurchaseOrderResponse.model_validate(po)
    except Exception as e:
        logger.error(f"Error creating PO: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create purchase order")


@purchase_orders_router.post("/{po_id}/receive", response_model=PurchaseOrderResponse)
async def receive_purchase_order(
    po_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        po = svc.receive_purchase_order(db, po_id, current_user.id)
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found or already received")
        return PurchaseOrderResponse.model_validate(po)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error receiving PO: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to receive purchase order")


# ──────────────────────────────────────────────────
# Sales sub-router
# ──────────────────────────────────────────────────
sales_router = APIRouter(prefix="/pharmacy/sales", tags=["Pharmacy – Sales"])


@sales_router.get("", response_model=SaleListResponse)
async def list_sales(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = svc.list_sales(db, current_user.hospital_id, page, limit, search, date_from, date_to)
    data = [SaleResponse.model_validate(s) for s in result["data"]]
    result["data"] = data
    return result


@sales_router.get("/{sale_id}", response_model=SaleResponse)
async def get_sale(
    sale_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    sale = svc.get_sale(db, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    resp = SaleResponse.model_validate(sale)
    items = svc.get_sale_items(db, sale.id)
    resp.items = [SaleItemResponse.model_validate(i) for i in items]
    return resp


@sales_router.post("", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
async def create_sale(
    data: SaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        sale = svc.create_sale(db, current_user.hospital_id, data.model_dump(), current_user.id)
        resp = SaleResponse.model_validate(sale)
        items = svc.get_sale_items(db, sale.id)
        resp.items = [SaleItemResponse.model_validate(i) for i in items]
        return resp
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating sale: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create sale")


# ──────────────────────────────────────────────────
# Stock Adjustments
# ──────────────────────────────────────────────────
@router.get("/stock-adjustments", response_model=list[StockAdjustmentResponse])
async def list_stock_adjustments(
    medicine_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    adjs = svc.list_stock_adjustments(db, current_user.hospital_id, medicine_id)
    return [StockAdjustmentResponse.model_validate(a) for a in adjs]


@router.post("/stock-adjustments", response_model=StockAdjustmentResponse, status_code=status.HTTP_201_CREATED)
async def create_stock_adjustment(
    data: StockAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        adj = svc.create_stock_adjustment(db, current_user.hospital_id, data.model_dump(), current_user.id)
        return StockAdjustmentResponse.model_validate(adj)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating stock adjustment: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create stock adjustment")
