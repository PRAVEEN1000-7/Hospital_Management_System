"""
Pharmacy router — medicines, batches, sales, stock adjustments, dashboard.
Suppliers and Purchase Orders are managed in the Inventory module.
"""
import logging
import uuid as uuid_mod
from datetime import date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.prescription import Medicine as MedicineModel
from ..models.pharmacy import MedicineBatch
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..core.tenant_security import is_eye_hospital_feature_enabled
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
    # Analytics
    PharmacySalesAnalytics, TopSellingMedicineAnalytics,
    # Queue
    PharmacyQueueEntryResponse, PharmacyQueueStatusUpdate, PharmacyQueueManualAdd,
)
from ..services import pharmacy_service as svc
from ..services import billing_queue_service as queue_svc

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


# ═══ Analytics ═══
@router.get("/analytics/sales-trend", response_model=list[PharmacySalesAnalytics])
async def pharmacy_sales_trend(
    days: int = Query(30, ge=1, le=90, description="Number of days to retrieve"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get pharmacy sales trend for the last N days."""
    return svc.get_pharmacy_sales_trend(db, current_user.hospital_id, days)


@router.get("/analytics/top-medicines", response_model=list[TopSellingMedicineAnalytics])
async def pharmacy_top_medicines(
    days: int = Query(30, ge=1, le=90, description="Number of days to analyze"),
    limit: int = Query(10, ge=1, le=50, description="Number of top medicines to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get top selling medicines by quantity and revenue."""
    return svc.get_pharmacy_top_medicines(db, current_user.hospital_id, days, limit)


# ═══ Medicines ═══
@router.get("/medicines", response_model=MedicineListResponse)
async def list_medicines(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    search: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = svc.list_medicines(db, current_user.hospital_id, page, limit, search, category, active_only)
    stock_map = result.pop("stock_map", {})
    batch_map = result.pop("batch_map", {})
    data = []
    for med in result["data"]:
        resp = MedicineResponse.model_validate(med)
        resp.total_stock = stock_map.get(med.id, 0)
        earliest = batch_map.get(med.id)
        if earliest:
            resp.earliest_batch_number = earliest["batch_number"]
            resp.earliest_mfg_date = earliest["mfg_date"]
            resp.earliest_expiry_date = earliest["expiry_date"]
            resp.earliest_mrp = earliest["mrp"]
        data.append(resp)
    result["data"] = data
    return result


@router.get("/medicines/{medicine_id}", response_model=MedicineResponse)
async def get_medicine(
    medicine_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    med = svc.get_medicine_by_id(db, medicine_id, hospital_id=current_user.hospital_id)
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
        try:
            med_uuid = uuid_mod.UUID(medicine_id)
        except ValueError:
            raise HTTPException(status_code=404, detail="Medicine not found")
        med_check = db.query(MedicineModel).filter(
            MedicineModel.id == med_uuid,
            MedicineModel.hospital_id == current_user.hospital_id,
        ).first()
        if not med_check:
            raise HTTPException(status_code=404, detail="Medicine not found")
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
    try:
        med_uuid = uuid_mod.UUID(medicine_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Medicine not found")
    med_check = db.query(MedicineModel).filter(
        MedicineModel.id == med_uuid,
        MedicineModel.hospital_id == current_user.hospital_id,
    ).first()
    if not med_check:
        raise HTTPException(status_code=404, detail="Medicine not found")
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
    try:
        med_uuid = uuid_mod.UUID(medicine_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Medicine not found")
    med_check = db.query(MedicineModel).filter(
        MedicineModel.id == med_uuid,
        MedicineModel.hospital_id == current_user.hospital_id,
    ).first()
    if not med_check:
        raise HTTPException(status_code=404, detail="Medicine not found")
    batches = svc.list_batches(db, medicine_id, active_only)
    return [BatchResponse.model_validate(b) for b in batches]


@router.post("/batches", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def create_batch(
    data: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        try:
            med_uuid = uuid_mod.UUID(str(data.medicine_id))
        except ValueError:
            raise HTTPException(status_code=404, detail="Medicine not found")
        med_check = db.query(MedicineModel).filter(
            MedicineModel.id == med_uuid,
            MedicineModel.hospital_id == current_user.hospital_id,
        ).first()
        if not med_check:
            raise HTTPException(status_code=404, detail="Medicine not found")
        batch = svc.create_batch(db, data.model_dump())
        return BatchResponse.model_validate(batch)
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batch number '{data.batch_number}' already exists for this medicine. Use a different batch number.",
        )
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
        try:
            batch_uuid = uuid_mod.UUID(batch_id)
        except ValueError:
            raise HTTPException(status_code=404, detail="Batch not found")
        batch_check = (
            db.query(MedicineBatch)
            .join(MedicineModel, MedicineBatch.medicine_id == MedicineModel.id)
            .filter(MedicineBatch.id == batch_uuid, MedicineModel.hospital_id == current_user.hospital_id)
            .first()
        )
        if not batch_check:
            raise HTTPException(status_code=404, detail="Batch not found")
        batch = svc.update_batch(db, batch_id, data.model_dump(exclude_unset=True))
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        return BatchResponse.model_validate(batch)
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Another batch with this batch number already exists for this medicine.",
        )
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
    sale_status: Optional[str] = Query(None, description="Filter by sale status"),
    patient_type: Optional[str] = Query(None, description="Filter by patient type: walk_in or registered"),
    sort_by: str = Query("sale_date", pattern="^(sale_date|total_amount|invoice_number|created_at)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = svc.list_sales(
        db,
        current_user.hospital_id,
        page,
        limit,
        search,
        date_from,
        date_to,
        sale_status,
        patient_type,
        sort_by,
        sort_order,
    )
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
    if str(sale.hospital_id) != str(current_user.hospital_id):
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
# Pharmacy Queue (BRD v1.1 PQ-01..06) — eye-hospital feature pack only.
# Token assigned at prescription finalize (or manual walk-in add), decoupled
# from billing. See billing_queue_service.py.
# ──────────────────────────────────────────────────
def _require_eye_hospital_queue(current_user: User) -> None:
    if not is_eye_hospital_feature_enabled(current_user.hospital):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The Pharmacy Queue is only available to hospitals classified as an eye hospital or multi-specialty hospital.",
        )


@router.get("/queue", response_model=list[PharmacyQueueEntryResponse])
async def get_pharmacy_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_eye_hospital_queue(current_user)
    return queue_svc.list_pharmacy_queue_entries(db, current_user.hospital_id)


@router.post("/queue", response_model=PharmacyQueueEntryResponse, status_code=status.HTTP_201_CREATED)
async def add_manual_pharmacy_queue_entry(
    data: PharmacyQueueManualAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Manually add a walk-in pharmacy patient to the queue (BRD PQ-03)."""
    _require_eye_hospital_queue(current_user)
    patient_id = None
    if data.patient_id:
        from ..services.patient_service import get_patient_by_id
        patient = get_patient_by_id(db, data.patient_id, hospital_id=current_user.hospital_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        patient_id = patient.id
    entry = queue_svc.enqueue_pharmacy_queue_entry(
        db,
        hospital_id=current_user.hospital_id,
        patient_id=patient_id,
        patient_name=data.patient_name,
        doctor_name=data.doctor_name,
    )
    db.commit()
    return queue_svc.serialize_pharmacy_queue_entry(entry)


@router.put("/queue/{entry_id}/status", response_model=PharmacyQueueEntryResponse)
async def update_pharmacy_queue_status(
    entry_id: str,
    data: PharmacyQueueStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_eye_hospital_queue(current_user)
    try:
        result = queue_svc.advance_pharmacy_queue_entry_status(db, entry_id, data.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Queue entry not found")
    return result


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
        # adj's UUID columns (id/hospital_id/item_id/batch_id/approved_by/created_by) are
        # uuid.UUID instances, but the response schema types them as str — Pydantic v2
        # rejects a UUID for a str field outright, so model_validate(adj) raised a
        # ValidationError here on every call (caught below as if creation had failed,
        # even though the adjustment + stock change had already committed).
        return StockAdjustmentResponse.model_validate({
            "id": str(adj.id),
            "hospital_id": str(adj.hospital_id),
            "item_id": str(adj.item_id),
            "batch_id": str(adj.batch_id) if adj.batch_id else None,
            "adjustment_type": adj.adjustment_type,
            "quantity": adj.quantity,
            "reason": adj.reason,
            "status": adj.status,
            "approved_by": str(adj.approved_by) if adj.approved_by else None,
            "created_by": str(adj.created_by) if adj.created_by else None,
            "created_at": adj.created_at,
        })
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
