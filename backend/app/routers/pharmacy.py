"""
Pharmacy router — medicines, batches, sales, stock adjustments, dashboard.
Suppliers and Purchase Orders are managed in the Inventory module.
"""
import logging
from datetime import date
from decimal import Decimal
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
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
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
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
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
# Sales sub-router
# ──────────────────────────────────────────────────
sales_router = APIRouter(prefix="/sales", tags=["Pharmacy – Sales"])


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


# ──────────────────────────────────────────────────
# Include sub-routers
# ──────────────────────────────────────────────────
router.include_router(sales_router)
