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
from ..dependencies import get_current_active_user, require_admin_or_super_admin, require_any_role
from ..core.module_roles import require_permission, check_permission
from ..core.tenant_security import is_eye_hospital_feature_enabled
from ..schemas.pharmacy import (
    # Medicine
    MedicineCreate, MedicineUpdate, MedicineResponse, MedicineListResponse,
    # Batch
    BatchCreate, BatchUpdate, BatchResponse,
    # Sale
    SaleCreate, SaleResponse, SaleListResponse, SaleItemResponse,
    SaleItemQuantityUpdate, SaleAmountTenderedUpdate,
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

pharmacy_view_guard = require_permission("pharmacy", "view")
pharmacy_edit_guard = require_permission("pharmacy", "edit")


# Narrow carve-out for the read-only dashboard/analytics endpoints only — a
# doctor gets the same aggregate stats an admin sees on the Reports &
# Analytics dashboard (KPIStrip/PharmacyPanel), without gaining the general
# "pharmacy" permission (medicine catalog, batches, sales, stock adjustments
# all keep using pharmacy_view_guard/pharmacy_edit_guard as-is).
def pharmacy_analytics_view_guard(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> User:
    if {"doctor", "report_viewer"} & {str(r).strip().lower() for r in (current_user.roles or [])}:
        return current_user
    if not check_permission(db, current_user, "pharmacy", "view"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return current_user


# ═══ Dashboard ═══
@router.get("/dashboard", response_model=PharmacyDashboard)
async def pharmacy_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(pharmacy_analytics_view_guard),
):
    """Get pharmacy dashboard statistics."""
    return svc.get_pharmacy_dashboard(db, current_user.hospital_id)


# ═══ Analytics ═══
@router.get("/analytics/sales-trend", response_model=list[PharmacySalesAnalytics])
async def pharmacy_sales_trend(
    days: int = Query(30, ge=1, le=90, description="Number of days to retrieve"),
    db: Session = Depends(get_db),
    current_user: User = Depends(pharmacy_analytics_view_guard),
):
    """Get pharmacy sales trend for the last N days."""
    return svc.get_pharmacy_sales_trend(db, current_user.hospital_id, days)


@router.get("/analytics/top-medicines", response_model=list[TopSellingMedicineAnalytics])
async def pharmacy_top_medicines(
    days: int = Query(30, ge=1, le=90, description="Number of days to analyze"),
    limit: int = Query(10, ge=1, le=50, description="Number of top medicines to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(pharmacy_analytics_view_guard),
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
    current_user: User = Depends(pharmacy_view_guard),
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
    current_user: User = Depends(pharmacy_view_guard),
):
    med = svc.get_medicine_by_id(db, medicine_id, hospital_id=current_user.hospital_id)
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found")
    return MedicineResponse.model_validate(med)


@router.post("/medicines", response_model=MedicineResponse, status_code=status.HTTP_201_CREATED)
async def create_medicine(
    data: MedicineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(pharmacy_edit_guard),
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
    current_user: User = Depends(pharmacy_edit_guard),
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
    current_user: User = Depends(pharmacy_edit_guard),
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
    current_user: User = Depends(pharmacy_view_guard),
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
    responses = []
    for b in batches:
        resp = BatchResponse.model_validate(b)
        resp.supplier_name = b.supplier.name if b.supplier else None
        responses.append(resp)
    return responses


@router.post("/batches", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def create_batch(
    data: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(pharmacy_edit_guard),
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
        resp = BatchResponse.model_validate(batch)
        resp.supplier_name = batch.supplier.name if batch.supplier else None
        return resp
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
    current_user: User = Depends(pharmacy_edit_guard),
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
        batch = svc.update_batch(
            db, batch_id, data.model_dump(exclude_unset=True),
            hospital_id=current_user.hospital_id, performed_by=current_user.id,
        )
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        resp = BatchResponse.model_validate(batch)
        resp.supplier_name = batch.supplier.name if batch.supplier else None
        return resp
    except HTTPException:
        raise
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
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
    current_user: User = Depends(pharmacy_view_guard),
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
    current_user: User = Depends(pharmacy_view_guard),
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


@sales_router.get("/{sale_id}/pdf")
async def get_sale_pdf(
    sale_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(pharmacy_view_guard),
):
    """Generate a downloadable/printable HTML invoice for a pharmacy sale.

    Covers both counter sales (New Sale) and prescription-driven dispenses —
    same PharmacySale/pharmacy_dispensing row either way. Mirrors the
    self-contained-HTML-rendered-to-PDF-client-side pattern used by
    get_invoice_pdf (routers/invoices.py) and get_lab_order_pdf (routers/lab.py).
    """
    import html as _html_mod
    from datetime import datetime
    from ..models.user import Hospital

    sale = svc.get_sale(db, sale_id)
    if not sale or str(sale.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Sale not found")
    items = svc.get_sale_items(db, sale.id)

    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
    patient = sale.patient

    def _esc(value) -> str:
        if value is None or value == "":
            return ""
        return _html_mod.escape(str(value), quote=True)

    def fmt_money(v) -> str:
        return f"{float(v or 0):,.2f}"

    def fmt_date(d) -> str:
        return d.strftime("%B %d, %Y %I:%M %p") if d else "—"

    hosp_name = _esc((hospital.name if hospital else "") or "Hospital")
    hosp_address = _esc(hospital.address_line_1 if hospital else "")
    hosp_city = _esc(hospital.city if hospital else "")
    hosp_state = _esc(hospital.state_province if hospital else "")
    hosp_phone = _esc(hospital.phone if hospital else "")
    hosp_email = _esc(hospital.email if hospital else "")

    def _item_batch_number(item) -> Optional[str]:
        return item.batch.batch_number if item.batch else None

    rows = "".join(
        f"""<tr>
            <td>{_esc(item.medicine_name)}{f'<br><span class="muted">Batch {_esc(_item_batch_number(item))}</span>' if _item_batch_number(item) else ''}</td>
            <td class="right">{int(item.quantity or 0)}</td>
            <td class="right">₹{fmt_money(item.unit_price)}</td>
            <td class="right"><strong>₹{fmt_money(item.total_price)}</strong></td>
        </tr>"""
        for item in items
    )

    sale_date = sale.sale_date
    if sale_date and sale_date.year <= 1971 and sale.created_at:
        sale_date = sale.created_at

    status_label = (sale.payment_status or "pending").replace("_", " ")

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Invoice - {_esc(sale.invoice_number)}</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #1e293b; }}
.header {{ text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #0284c7; }}
.header h1 {{ margin: 0; color: #0284c7; font-size: 28px; }}
.header p {{ margin: 4px 0 0; color: #64748b; font-size: 14px; }}
.invoice-number {{ font-size: 20px; font-weight: bold; color: #0284c7; text-align: center; margin: 20px 0; padding: 12px; background: #f0f9ff; border-radius: 8px; }}
.meta {{ display: flex; justify-content: space-between; margin: 16px 0; font-size: 13px; color: #64748b; }}
table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
th, td {{ text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }}
th {{ color: #64748b; font-weight: 600; font-size: 12px; background: #f8fafc; }}
.right {{ text-align: right; }}
.muted {{ color: #94a3b8; font-size: 11px; }}
.section-title {{ font-size: 16px; font-weight: bold; color: #0284c7; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; }}
.status {{ display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; }}
.status-paid {{ background: #dcfce7; color: #166534; }}
.status-pending {{ background: #fef3c7; color: #92400e; }}
.status-partially_paid {{ background: #fef3c7; color: #92400e; }}
.status-cancelled, .status-returned {{ background: #fee2e2; color: #991b1b; }}
.summary {{ width: 280px; margin-left: auto; margin-top: 16px; }}
.summary-row {{ display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }}
.summary-total {{ font-size: 16px; font-weight: bold; border-top: 2px solid #e2e8f0; padding-top: 8px; margin-top: 8px; }}
.footer {{ margin-top: 40px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
@media print {{ body {{ padding: 20px; }} }}
</style>
</head>
<body>
<div class="header">
    <h1>{hosp_name}</h1>
    <p>{', '.join(p for p in (hosp_address, hosp_city, hosp_state) if p)}</p>
    {f'<p>Phone: {hosp_phone} | Email: {hosp_email}</p>' if hosp_phone or hosp_email else ''}
</div>
<div class="invoice-number">Invoice #{_esc(sale.invoice_number)}</div>
<div class="meta">
    <span>Date: {fmt_date(sale_date)}</span>
    <span class="status status-{sale.payment_status}">{_esc(status_label)}</span>
</div>
<p class="section-title">Bill To</p>
<table>
    <tr><th style="width:160px;">Patient</th><td>{_esc(patient.full_name) if patient else 'Walk-in'}</td></tr>
    {f'<tr><th>PRN</th><td>{_esc(patient.patient_reference_number)}</td></tr>' if patient and patient.patient_reference_number else ''}
</table>
<p class="section-title">Items</p>
<table>
    <thead>
        <tr><th>Medicine</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Total</th></tr>
    </thead>
    <tbody>{rows or '<tr><td colspan="4" class="muted">No items</td></tr>'}</tbody>
</table>
<div class="summary">
    <div class="summary-row"><span>Subtotal</span><span>₹{fmt_money(sale.subtotal)}</span></div>
    {f'<div class="summary-row"><span>Discount</span><span>-₹{fmt_money(sale.discount_amount)}</span></div>' if sale.discount_amount else ''}
    <div class="summary-row"><span>Tax</span><span>₹{fmt_money(sale.tax_amount)}</span></div>
    <div class="summary-row summary-total"><span>Total</span><span>₹{fmt_money(sale.total_amount)}</span></div>
    <div class="summary-row"><span>Paid</span><span>₹{fmt_money(sale.paid_amount)}</span></div>
    <div class="summary-row"><span>Balance Due</span><span>₹{fmt_money(sale.balance_amount)}</span></div>
</div>
{f'<p class="section-title">Notes</p><p style="font-size:13px;">{_esc(sale.notes)}</p>' if sale.notes else ''}
<div class="footer">
    <p>Generated on {datetime.now().strftime("%B %d, %Y at %I:%M %p")} | {hosp_name}</p>
    <p>This is a computer-generated document. No signature required.</p>
</div>
</body>
</html>"""

    from fastapi.responses import HTMLResponse
    return HTMLResponse(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": f'inline; filename="sale_{sale.invoice_number}.html"'},
    )


@sales_router.post("", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
async def create_sale(
    data: SaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(pharmacy_edit_guard),
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


@sales_router.put("/{sale_id}/items/{item_id}", response_model=SaleItemResponse)
async def update_sale_item_quantity(
    sale_id: str,
    item_id: str,
    data: SaleItemQuantityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(pharmacy_edit_guard),
):
    """Correct the dispensed quantity on a line item of an already-finalized
    sale (pharmacist/admin only). Reconciles the originating batch's stock
    and posts a compensating stock movement for the delta — see
    pharmacy_service.update_dispensed_item_quantity."""
    try:
        item = svc.update_dispensed_item_quantity(
            db, current_user.hospital_id, sale_id, item_id, data.quantity, current_user,
        )
        return SaleItemResponse.model_validate(item)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating sale item quantity: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update item quantity")


@sales_router.put("/{sale_id}/payment", response_model=SaleResponse)
async def update_sale_payment(
    sale_id: str,
    data: SaleAmountTenderedUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(pharmacy_edit_guard),
):
    """Correct the amount tendered on an already-finalized sale
    (pharmacist/admin only); payment_status/paid/balance are recomputed."""
    try:
        sale = svc.update_sale_amount_tendered(
            db, current_user.hospital_id, sale_id, data.amount_tendered, current_user,
        )
        resp = SaleResponse.model_validate(sale)
        items = svc.get_sale_items(db, sale.id)
        resp.items = [SaleItemResponse.model_validate(i) for i in items]
        return resp
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating sale payment: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update payment")


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
    current_user: User = Depends(pharmacy_view_guard),
):
    _require_eye_hospital_queue(current_user)
    return queue_svc.list_pharmacy_queue_entries(db, current_user.hospital_id)


@router.post("/queue", response_model=PharmacyQueueEntryResponse, status_code=status.HTTP_201_CREATED)
async def add_manual_pharmacy_queue_entry(
    data: PharmacyQueueManualAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(pharmacy_edit_guard),
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
    current_user: User = Depends(pharmacy_edit_guard),
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
    current_user: User = Depends(pharmacy_view_guard),
):
    adjs = svc.list_stock_adjustments(db, current_user.hospital_id, medicine_id)
    return [StockAdjustmentResponse.model_validate(a) for a in adjs]


@router.post("/stock-adjustments", response_model=StockAdjustmentResponse, status_code=status.HTTP_201_CREATED)
async def create_stock_adjustment(
    data: StockAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(pharmacy_edit_guard),
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
