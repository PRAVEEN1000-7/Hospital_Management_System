"""
Laboratory router — test catalog, doctor-authored orders, the lab queue,
billing headers, and result entry.

Role guards are deliberately tighter than Pharmacy's dispense/mark-paid
endpoints (which have no role check at all): LAB_STAFF_ROLES for anything that
mutates lab state, LAB_VIEW_ROLES for read paths a doctor also needs.
"""
import logging
import uuid as uuid_mod
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user
from ..schemas.lab import (
    LabTestCreate, LabTestUpdate, LabTestResponse, LabTestListResponse,
    LabOrderCreate, LabOrderResponse, LabResultEntry,
    LabQueueEntryResponse, LabQueueStatusUpdate,
    LabSaleResponse, LabMarkPaidRequest,
    LabDashboard,
)
from ..services import lab_service as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lab", tags=["Laboratory"])

LAB_STAFF_ROLES = {"super_admin", "admin", "lab_technician"}
LAB_VIEW_ROLES = {"super_admin", "admin", "lab_technician", "doctor"}
LAB_ORDER_ROLES = {"super_admin", "admin", "doctor"}


def _require(current_user: User, allowed: set) -> None:
    if not any(r in allowed for r in (current_user.roles or [])):
        raise HTTPException(status_code=403, detail="Not authorized for this action")


# ═══ Dashboard ═══
@router.get("/dashboard", response_model=LabDashboard)
async def lab_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    return svc.get_lab_dashboard(db, current_user.hospital_id)


# ═══ Test catalog ═══
@router.get("/tests", response_model=LabTestListResponse)
async def list_lab_tests(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Doctors need to read the catalog to order tests from the builder.
    _require(current_user, LAB_VIEW_ROLES)
    result = svc.list_lab_tests(db, current_user.hospital_id, page, limit, search, category, active_only)
    result["data"] = [LabTestResponse.model_validate(t) for t in result["data"]]
    return result


@router.post("/tests", response_model=LabTestResponse, status_code=status.HTTP_201_CREATED)
async def create_lab_test(
    data: LabTestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    try:
        test = svc.create_lab_test(db, current_user.hospital_id, data.model_dump())
        return LabTestResponse.model_validate(test)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating lab test: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Could not create test (code '{data.code}' may already exist)")


@router.put("/tests/{test_id}", response_model=LabTestResponse)
async def update_lab_test(
    test_id: str,
    data: LabTestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    existing = svc.get_lab_test_by_id(db, test_id, hospital_id=current_user.hospital_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Lab test not found")
    test = svc.update_lab_test(db, test_id, data.model_dump(exclude_unset=True))
    return LabTestResponse.model_validate(test)


@router.delete("/tests/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_lab_test(
    test_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    existing = svc.get_lab_test_by_id(db, test_id, hospital_id=current_user.hospital_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Lab test not found")
    svc.deactivate_lab_test(db, test_id)


# ═══ Orders ═══
@router.post("/orders", response_model=LabOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_lab_order(
    data: LabOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_ORDER_ROLES)
    try:
        order = svc.create_lab_order(db, current_user.hospital_id, data.model_dump(), created_by=current_user.id)
        return svc._enrich_order(db, order)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating lab order: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create lab order")


@router.get("/orders/{order_id}", response_model=LabOrderResponse)
async def get_lab_order(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_VIEW_ROLES)
    order = svc.get_lab_order_by_id(db, order_id, hospital_id=current_user.hospital_id)
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    return svc._enrich_order(db, order)


@router.put("/orders/{order_id}/queue-status", response_model=LabQueueEntryResponse)
async def update_lab_queue_status(
    order_id: str,
    data: LabQueueStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    order = svc.get_lab_order_by_id(db, order_id, hospital_id=current_user.hospital_id)
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    try:
        order = svc.advance_lab_queue_status(db, order_id, data.queue_status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    total = sum((i.price or Decimal("0")) for i in (order.items or []))
    return {
        "id": str(order.id),
        "order_number": order.order_number,
        "patient_name": order.patient.full_name if getattr(order, "patient", None) else None,
        "queue_token": order.queue_token,
        "queue_status": order.queue_status or "waiting",
        "status": order.status,
        "total_amount": total,
        "payment_status": "pending",
        "created_at": order.created_at,
        "queue_called_at": order.queue_called_at,
    }


@router.post("/orders/{order_id}/sale", response_model=LabSaleResponse)
async def get_or_create_lab_sale(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    order = svc.get_lab_order_by_id(db, order_id, hospital_id=current_user.hospital_id)
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    sale = svc.get_or_create_lab_sale(db, order)
    return LabSaleResponse.model_validate(sale)


@router.put("/sales/{order_id}/mark-paid", response_model=LabSaleResponse)
async def mark_lab_sale_paid(
    order_id: str,
    data: LabMarkPaidRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Post-payment sync — the real money is collected via the generic
    Invoice/Payment path; this keeps the lab sale's status in step."""
    _require(current_user, LAB_STAFF_ROLES)
    sale = svc.sync_lab_sale_payment_status(
        db, order_id, current_user.hospital_id, data.amount_paid, data.payment_method,
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Lab order not found")
    return LabSaleResponse.model_validate(sale)


@router.put("/orders/{order_id}/items/{item_id}/result", response_model=LabOrderResponse)
async def record_lab_result(
    order_id: str,
    item_id: str,
    data: LabResultEntry,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    order = svc.get_lab_order_by_id(db, order_id, hospital_id=current_user.hospital_id)
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    item = svc.record_lab_result(
        db, item_id, current_user.hospital_id, data.model_dump(), resulted_by=current_user.id,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Lab order item not found")
    db.refresh(order)
    return svc._enrich_order(db, order)


# ═══ Queue ═══
@router.get("/queue", response_model=list[LabQueueEntryResponse])
async def get_lab_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    return svc.list_lab_queue(db, current_user.hospital_id)


# ═══ Patient results ═══
@router.get("/results/patient/{patient_id}")
async def get_patient_lab_results(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_VIEW_ROLES)
    return svc.get_patient_lab_results(db, patient_id, current_user.hospital_id)
