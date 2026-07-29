"""
Inventory API routes — Suppliers, Purchase Orders, GRNs,
Stock Movements, Adjustments, Cycle Counts, Dashboard.
"""
import logging
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_active_user, require_any_role
from ..core.module_roles import require_permission
from ..models.user import User
from ..schemas.inventory import (
    SupplierCreate, SupplierUpdate, SupplierResponse,
    PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderResponse,
    GRNCreate, GRNUpdate, GRNResponse, GRNItemBatchUpdate, GRNItemResponse,
    StockMovementResponse,
    StockAdjustmentCreate, StockAdjustmentUpdate, StockAdjustmentResponse,
    CycleCountCreate, CycleCountUpdate, CycleCountResponse,
    # Analytics
    StockStatusAnalytics, InventoryAgingAnalytics,
    # PO Payments
    PaymentModeCreate, PurchaseOrderPaymentCreate,
)
from ..services import inventory_service as svc
from ..services.notification_service import notify_hospital_users

logger = logging.getLogger(__name__)

# ─── Routers ────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/inventory", tags=["Inventory"])
suppliers_router = APIRouter(prefix="/inventory/suppliers", tags=["Inventory – Suppliers"])
po_router = APIRouter(prefix="/inventory/purchase-orders", tags=["Inventory – Purchase Orders"])
grn_router = APIRouter(prefix="/inventory/grns", tags=["Inventory – GRNs"])
movements_router = APIRouter(prefix="/inventory/stock-movements", tags=["Inventory – Stock Movements"])
adjustments_router = APIRouter(prefix="/inventory/adjustments", tags=["Inventory – Adjustments"])
cycle_counts_router = APIRouter(prefix="/inventory/cycle-counts", tags=["Inventory – Cycle Counts"])

# Driven by the shared "inventory" permission matrix — per the client's
# spreadsheet, pharmacist has view-only access here (they get full edit
# rights on their own Pharmacy module instead); only inventory_manager/admin
# can create/edit POs, GRNs, suppliers, and adjustments.
inventory_view_roles = require_permission("inventory", "view")
inventory_manage_roles = require_permission("inventory", "edit")
grn_verify_roles = require_permission("inventory", "edit")
# PO vendor-payment submodule is admin-only by design — recording that the
# hospital paid a supplier is a financial control action, distinct from the
# inventory_manager/pharmacist roles that can merely raise/receive POs.
po_payment_roles = require_any_role("super_admin", "admin")


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


@router.get("/stock-level")
async def stock_level(
    item_type: str = Query(..., pattern=r"^(medicine|optical_product)$"),
    item_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Live current stock for one item, fetched fresh from batch quantities.

    Used by Cycle Counts / Adjustments to populate "System Qty" / "Current
    stock" at the moment an item is selected — the medicine/optical product
    lists these pages preload on mount are a one-time snapshot and go stale
    the instant any sale, dispensing, or other GRN/adjustment changes stock.
    """
    return {
        "item_type": item_type,
        "item_id": str(item_id),
        "current_stock": svc.get_stock_level(db, current_user.hospital_id, item_type, item_id),
    }


# ═══════════════════════════════════════════════════════════════════════════
#  ANALYTICS ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/analytics/stock-status", response_model=list[StockStatusAnalytics])
async def stock_status(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Get stock status for all items for analytics dashboard."""
    return svc.get_stock_status_analytics(db, current_user.hospital_id, limit)


@router.get("/analytics/aging", response_model=list[InventoryAgingAnalytics])
async def inventory_aging(
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Get inventory aging report for analytics dashboard."""
    return svc.get_inventory_aging_analytics(db, current_user.hospital_id)


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
    current_user: User = Depends(inventory_view_roles),
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
    current_user: User = Depends(inventory_view_roles),
):
    """Get supplier by ID."""
    supplier = svc.get_supplier(db, supplier_id)
    if not supplier or str(supplier.hospital_id) != str(current_user.hospital_id):
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
    existing = svc.get_supplier(db, supplier_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Supplier not found")
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
    existing = svc.get_supplier(db, supplier_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Supplier not found")
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
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    payment_status: Optional[str] = Query(None, description="completed | incomplete | partial"),
    sort_by: Optional[str] = Query(None, description="created_at | order_date | total_amount | payment_status"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """List purchase orders with pagination."""
    result = svc.list_purchase_orders(
        db, current_user.hospital_id, page, limit,
        status=status_filter, supplier_id=supplier_id, search=search,
        date_from=date_from, date_to=date_to,
        payment_status=payment_status, sort_by=sort_by, sort_order=sort_order,
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
    # Notification is sent inside create_purchase_order() itself — a second
    # call here duplicated "Purchase Order Created" for admin/inventory_manager.
    return svc._format_po_response(full_po, db)


@po_router.get("/{po_id}")
async def get_purchase_order(
    po_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Get purchase order by ID."""
    po = svc.get_purchase_order(db, po_id)
    if not po or str(po.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return svc._format_po_response(po, db)


@po_router.get("/{po_id}/pdf")
async def get_purchase_order_pdf(
    po_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Generate a downloadable/printable HTML document for this PO (BRD 5.4).

    Mirrors invoices.py's get_invoice_pdf — a fully self-contained HTML
    document (inline <style>, escaped values) so it renders identically
    whether opened for printing or converted to PDF client-side via
    htmlStringToPdf.
    """
    import html as _html_mod
    from datetime import datetime
    from ..models.user import Hospital

    po = svc.get_purchase_order(db, po_id)
    if not po or str(po.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Purchase order not found")

    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
    supplier = po.supplier

    def _esc(value) -> str:
        if value is None or value == "":
            return ""
        return _html_mod.escape(str(value), quote=True)

    def fmt_money(v) -> str:
        return f"{float(v or 0):,.2f}"

    def fmt_date(d) -> str:
        return d.strftime("%B %d, %Y") if d else "—"

    hosp_name = _esc((hospital.name if hospital else "") or "Hospital")
    hosp_address = _esc(hospital.address_line_1 if hospital else "")
    hosp_city = _esc(hospital.city if hospital else "")
    hosp_state = _esc(hospital.state_province if hospital else "")
    hosp_phone = _esc(hospital.phone if hospital else "")
    hosp_email = _esc(hospital.email if hospital else "")

    subtotal = sum(float(it.total_price or 0) for it in po.items)

    rows = "".join(
        f"""<tr>
            <td>{_esc(svc._resolve_item_name_with_fallback(db, it.item_type, it.item_id, po.hospital_id, float(it.unit_price)))}
                <br><span class="muted">{_esc((it.item_type or '').replace('_', ' ').title())}</span></td>
            <td class="right">{it.quantity_ordered}</td>
            <td class="right">{it.quantity_received or 0}</td>
            <td class="right">₹{fmt_money(it.unit_price)}</td>
            <td class="right"><strong>₹{fmt_money(it.total_price)}</strong></td>
        </tr>"""
        for it in po.items
    )

    html = f"""<!DOCTYPE html>
<html>
<head>
<title>Purchase Order - {_esc(po.po_number)}</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #1e293b; }}
.header {{ text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #0284c7; }}
.header h1 {{ margin: 0; color: #0284c7; font-size: 28px; }}
.header p {{ margin: 4px 0 0; color: #64748b; font-size: 14px; }}
.po-number {{ font-size: 20px; font-weight: bold; color: #0284c7; text-align: center; margin: 20px 0; padding: 12px; background: #f0f9ff; border-radius: 8px; }}
.meta {{ display: flex; justify-content: space-between; margin: 16px 0; font-size: 13px; color: #64748b; }}
table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
th, td {{ text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }}
th {{ color: #64748b; font-weight: 600; font-size: 12px; background: #f8fafc; }}
.right {{ text-align: right; }}
.muted {{ color: #94a3b8; font-size: 11px; }}
.section-title {{ font-size: 16px; font-weight: bold; color: #0284c7; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; }}
.status {{ display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; }}
.status-received {{ background: #dcfce7; color: #166534; }}
.status-approved, .status-submitted {{ background: #dbeafe; color: #1e40af; }}
.status-partially_received {{ background: #fef3c7; color: #92400e; }}
.status-draft {{ background: #f1f5f9; color: #475569; }}
.status-cancelled {{ background: #fee2e2; color: #991b1b; }}
.summary {{ width: 280px; margin-left: auto; margin-top: 16px; }}
.summary-row {{ display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }}
.summary-total {{ font-size: 16px; font-weight: bold; border-top: 2px solid #e2e8f0; padding-top: 8px; margin-top: 8px; }}
.signature {{ margin-top: 60px; display: flex; justify-content: flex-end; }}
.signature-box {{ text-align: center; width: 220px; border-top: 1px solid #1e293b; padding-top: 8px; font-size: 12px; color: #64748b; }}
.footer {{ margin-top: 40px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
@media print {{ body {{ padding: 20px; }} }}
</style>
</head>
<body>
<div class="header">
    <h1>{hosp_name}</h1>
    <p>{hosp_address}, {hosp_city}, {hosp_state}</p>
    <p>Phone: {hosp_phone} | Email: {hosp_email}</p>
</div>
<div class="po-number">Purchase Order #{_esc(po.po_number)}</div>
<div class="meta">
    <span>Order Date: {fmt_date(po.order_date)}</span>
    <span>Expected Delivery: {fmt_date(po.expected_delivery_date)}</span>
    <span class="status status-{po.status}">{_esc((po.status or '').replace('_', ' '))}</span>
</div>
<p class="section-title">Vendor</p>
<table>
    <tr><th style="width:160px;">Supplier</th><td>{_esc(supplier.name) if supplier else '—'}</td></tr>
    <tr><th>Contact</th><td>{_esc(supplier.contact_person) if supplier else '—'} {f'· {_esc(supplier.phone)}' if supplier and supplier.phone else ''}</td></tr>
    <tr><th>Address</th><td>{_esc(supplier.address) if supplier else '—'}</td></tr>
</table>
<p class="section-title">Items</p>
<table>
    <thead>
        <tr><th>Item</th><th class="right">Qty Ordered</th><th class="right">Qty Received</th><th class="right">Unit Price</th><th class="right">Total</th></tr>
    </thead>
    <tbody>{rows}</tbody>
</table>
<div class="summary">
    <div class="summary-row"><span>Subtotal</span><span>₹{fmt_money(subtotal)}</span></div>
    <div class="summary-row"><span>Tax</span><span>₹{fmt_money(po.tax_amount)}</span></div>
    <div class="summary-row summary-total"><span>Total</span><span>₹{fmt_money(po.total_amount)}</span></div>
</div>
{f'<p class="section-title">Notes</p><p style="font-size:13px;">{_esc(po.notes)}</p>' if po.notes else ''}
<div class="signature">
    <div class="signature-box">Authorized Signatory{f' — {_esc(po.approver.full_name)}' if getattr(po, 'approver', None) else ''}</div>
</div>
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
        headers={"Content-Disposition": f'inline; filename="po_{po.po_number}.html"'},
    )


@po_router.put("/{po_id}")
async def update_purchase_order(
    po_id: uuid.UUID,
    payload: PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_manage_roles),
):
    """Update a purchase order (status, notes, etc.)."""
    existing = svc.get_purchase_order(db, po_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Purchase order not found")
    po = svc.update_purchase_order(db, po_id, payload, approver_id=current_user.id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    full_po = svc.get_purchase_order(db, po.id)
    try:
        new_status = getattr(payload, "status", None)
        if new_status in ("approved", "sent", "received", "cancelled"):
            notify_hospital_users(
                db=db,
                hospital_id=current_user.hospital_id,
                title=f"Purchase Order {new_status.capitalize()}",
                message=f"Purchase Order {po.po_number} status changed to {new_status}.",
                notification_type="inventory",
                priority="high" if new_status in ("approved", "received") else "normal",
                reference_type="purchase_order",
                reference_id=po.id,
                role_names=["admin", "inventory_manager"],
                exclude_user_ids=[current_user.id],
            )
    except Exception:
        pass
    return svc._format_po_response(full_po, db)


# ═════════════════════════════════════════════════════════════════════════════
#  PURCHASE ORDER PAYMENTS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/payment-modes")
async def list_payment_modes(
    db: Session = Depends(get_db),
    current_user: User = Depends(po_payment_roles),
):
    """List the admin-managed directory of vendor payment transfer modes."""
    modes = svc.list_payment_modes(db, current_user.hospital_id)
    return [{"id": str(m.id), "name": m.name, "is_active": m.is_active} for m in modes]


@router.post("/payment-modes", status_code=status.HTTP_201_CREATED)
async def create_payment_mode(
    payload: PaymentModeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(po_payment_roles),
):
    """Add a new transfer mode to the directory (e.g. a supplier-specific wallet)."""
    mode = svc.create_payment_mode(db, current_user.hospital_id, payload.name)
    return {"id": str(mode.id), "name": mode.name, "is_active": mode.is_active}


@po_router.get("/{po_id}/payments")
async def list_po_payments(
    po_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(po_payment_roles),
):
    """List payments recorded against a purchase order, with running total/balance."""
    try:
        return svc.list_po_payments(db, po_id, current_user.hospital_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@po_router.post("/{po_id}/payments", status_code=status.HTTP_201_CREATED)
async def create_po_payment(
    po_id: uuid.UUID,
    payload: PurchaseOrderPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(po_payment_roles),
):
    """Record a vendor payment against a purchase order."""
    try:
        return svc.create_po_payment(db, po_id, current_user.hospital_id, payload, current_user.id)
    except ValueError as e:
        detail = str(e)
        status_code = 404 if detail == "Purchase order not found" else 400
        raise HTTPException(status_code=status_code, detail=detail)


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
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """List GRNs with pagination."""
    result = svc.list_grns(
        db, current_user.hospital_id, page, limit,
        status=status_filter, supplier_id=supplier_id, search=search,
        date_from=date_from, date_to=date_to,
    )
    data = [svc._format_grn_response(g, db) for g in result["data"]]
    return {**result, "data": data}


@grn_router.post("", status_code=status.HTTP_201_CREATED)
async def create_grn(
    payload: GRNCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(grn_verify_roles),
):
    """Create a new goods receipt note."""
    grn = svc.create_grn(db, payload, current_user.hospital_id, current_user.id)
    full_grn = svc.get_grn(db, grn.id)
    # Notification is sent inside create_grn() itself — a second call here
    # duplicated "Goods Receipt Note Created" for admin/inventory_manager.
    return svc._format_grn_response(full_grn, db)


@grn_router.get("/{grn_id}")
async def get_grn(
    grn_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Get GRN by ID."""
    grn = svc.get_grn(db, grn_id)
    if not grn or str(grn.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="GRN not found")
    return svc._format_grn_response(grn, db)


@grn_router.get("/{grn_id}/pdf")
async def get_grn_pdf(
    grn_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Generate a downloadable/printable HTML document for this GRN (BRD 5.5).

    Mirrors invoices.py's get_invoice_pdf / the PO pdf endpoint above.
    """
    import html as _html_mod
    from datetime import datetime
    from ..models.user import Hospital

    grn = svc.get_grn(db, grn_id)
    if not grn or str(grn.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="GRN not found")

    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
    supplier = grn.supplier

    def _esc(value) -> str:
        if value is None or value == "":
            return ""
        return _html_mod.escape(str(value), quote=True)

    def fmt_money(v) -> str:
        return f"{float(v or 0):,.2f}"

    def fmt_date(d) -> str:
        return d.strftime("%B %d, %Y") if d else "—"

    hosp_name = _esc((hospital.name if hospital else "") or "Hospital")
    hosp_address = _esc(hospital.address_line_1 if hospital else "")
    hosp_city = _esc(hospital.city if hospital else "")
    hosp_state = _esc(hospital.state_province if hospital else "")
    hosp_phone = _esc(hospital.phone if hospital else "")
    hosp_email = _esc(hospital.email if hospital else "")

    rows = "".join(
        f"""<tr>
            <td>{_esc(svc._resolve_item_name_with_fallback(db, it.item_type, it.item_id, grn.hospital_id, float(it.unit_price)))}
                {f'<br><span class="muted">{_esc(it.discrepancy_notes)}</span>' if it.discrepancy_notes else ''}</td>
            <td>{_esc(it.batch_number) or '—'}</td>
            <td>{fmt_date(it.expiry_date)}</td>
            <td class="right">{it.quantity_received}</td>
            <td class="right">₹{fmt_money(it.unit_price)}</td>
            <td class="right"><strong>₹{fmt_money(it.total_price)}</strong></td>
        </tr>"""
        for it in grn.items
    )

    html = f"""<!DOCTYPE html>
<html>
<head>
<title>Goods Receipt Note - {_esc(grn.grn_number)}</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #1e293b; }}
.header {{ text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #0284c7; }}
.header h1 {{ margin: 0; color: #0284c7; font-size: 28px; }}
.header p {{ margin: 4px 0 0; color: #64748b; font-size: 14px; }}
.grn-number {{ font-size: 20px; font-weight: bold; color: #0284c7; text-align: center; margin: 20px 0; padding: 12px; background: #f0f9ff; border-radius: 8px; }}
.meta {{ display: flex; justify-content: space-between; margin: 16px 0; font-size: 13px; color: #64748b; }}
table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
th, td {{ text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }}
th {{ color: #64748b; font-weight: 600; font-size: 12px; background: #f8fafc; }}
.right {{ text-align: right; }}
.muted {{ color: #94a3b8; font-size: 11px; }}
.section-title {{ font-size: 16px; font-weight: bold; color: #0284c7; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; }}
.status {{ display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; }}
.status-accepted {{ background: #dcfce7; color: #166534; }}
.status-verified {{ background: #dbeafe; color: #1e40af; }}
.status-pending {{ background: #fef3c7; color: #92400e; }}
.status-rejected {{ background: #fee2e2; color: #991b1b; }}
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
    <p>{hosp_address}, {hosp_city}, {hosp_state}</p>
    <p>Phone: {hosp_phone} | Email: {hosp_email}</p>
</div>
<div class="grn-number">Goods Receipt Note #{_esc(grn.grn_number)}</div>
<div class="meta">
    <span>Receipt Date: {fmt_date(grn.receipt_date)}</span>
    <span>PO Reference: {_esc(grn.purchase_order.po_number) if grn.purchase_order else '—'}</span>
    <span class="status status-{grn.status}">{_esc(grn.status)}</span>
</div>
<p class="section-title">Vendor</p>
<table>
    <tr><th style="width:160px;">Supplier</th><td>{_esc(supplier.name) if supplier else '—'}</td></tr>
    <tr><th>Invoice No.</th><td>{_esc(grn.invoice_number) or '—'}</td></tr>
    <tr><th>Received By</th><td>{_esc(grn.creator.full_name) if getattr(grn, 'creator', None) else '—'}</td></tr>
</table>
<p class="section-title">Items Received</p>
<table>
    <thead>
        <tr><th>Item</th><th>Batch</th><th>Expiry</th><th class="right">Qty Received</th><th class="right">Unit Price</th><th class="right">Total</th></tr>
    </thead>
    <tbody>{rows}</tbody>
</table>
<div class="summary">
    <div class="summary-row summary-total"><span>Total</span><span>₹{fmt_money(grn.total_amount)}</span></div>
</div>
{f'<p class="section-title">Notes</p><p style="font-size:13px;">{_esc(grn.notes)}</p>' if grn.notes else ''}
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
        headers={"Content-Disposition": f'inline; filename="grn_{grn.grn_number}.html"'},
    )


@grn_router.put("/{grn_id}")
async def update_grn(
    grn_id: uuid.UUID,
    payload: GRNUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(grn_verify_roles),
):
    """Update GRN status (verify / accept / reject)."""
    existing = svc.get_grn(db, grn_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="GRN not found")
    grn = svc.update_grn(db, grn_id, payload, verifier_id=current_user.id)
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    full_grn = svc.get_grn(db, grn.id)
    return svc._format_grn_response(full_grn, db)


@grn_router.put("/{grn_id}/items/{item_id}", response_model=GRNItemResponse)
async def update_grn_item_batch(
    grn_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: GRNItemBatchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(grn_verify_roles),
):
    """Correct batch_number/manufactured_date/expiry_date/quantity_received/
    discrepancy_notes on a received line item (BRD 5.5).

    Only permitted while the GRN is still 'pending' — see update_grn_item_batch
    in inventory_service.py for why this is locked once verified/accepted.
    """
    existing = svc.get_grn(db, grn_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="GRN not found")
    try:
        item = svc.update_grn_item_batch(db, grn_id, item_id, payload, current_user=current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return GRNItemResponse(
        id=str(item.id),
        item_type=item.item_type,
        item_id=str(item.item_id),
        item_name=svc._resolve_item_name_with_fallback(db, item.item_type, item.item_id, existing.hospital_id, float(item.unit_price)),
        batch_number=item.batch_number,
        manufactured_date=item.manufactured_date,
        expiry_date=item.expiry_date,
        quantity_received=item.quantity_received,
        quantity_accepted=item.quantity_accepted,
        quantity_rejected=item.quantity_rejected or 0,
        unit_price=float(item.unit_price),
        total_price=float(item.total_price),
        rejection_reason=item.rejection_reason,
    )


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
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """List stock movements with pagination and filters."""
    result = svc.list_stock_movements(
        db, current_user.hospital_id, page, limit,
        item_type=item_type, item_id=item_id, movement_type=movement_type,
        date_from=date_from, date_to=date_to,
    )
    data = [svc._format_movement_response(m, db) for m in result["data"]]
    return {**result, "data": data}


@movements_router.get("/summary")
async def stock_movement_summary(
    item_type: Optional[str] = None,
    item_id: Optional[str] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Stock in/out/net totals across ALL rows matching the filters (not just one page)."""
    return svc.get_stock_movement_summary(
        db, current_user.hospital_id,
        item_type=item_type, item_id=item_id, movement_type=movement_type,
        date_from=date_from, date_to=date_to,
    )


# ═════════════════════════════════════════════════════════════════════════════
#  STOCK ADJUSTMENTS
# ═════════════════════════════════════════════════════════════════════════════

@adjustments_router.get("")
async def list_adjustments(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
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
    current_user: User = Depends(inventory_manage_roles),
):
    """Approve or reject a stock adjustment."""
    existing = svc.get_stock_adjustment(db, adjustment_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Adjustment not found or already processed")
    adj = svc.approve_stock_adjustment(db, adjustment_id, payload, current_user.id)
    if not adj:
        raise HTTPException(status_code=404, detail="Adjustment not found or already processed")
    # Notification is sent inside approve_stock_adjustment() itself — a second
    # call here duplicated it for admin/inventory_manager, and also failed to
    # exclude the approver (self-notification) unlike the service-layer version.
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
    current_user: User = Depends(inventory_view_roles),
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
    current_user: User = Depends(inventory_view_roles),
):
    """Get cycle count by ID."""
    cc = svc.get_cycle_count(db, cc_id)
    if not cc or str(cc.hospital_id) != str(current_user.hospital_id):
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
    existing = svc.get_cycle_count(db, cc_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Cycle count not found")
    cc = svc.update_cycle_count(db, cc_id, payload, verifier_id=current_user.id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cycle count not found")
    full_cc = svc.get_cycle_count(db, cc.id)
    return svc._format_cycle_count_response(full_cc, db)
