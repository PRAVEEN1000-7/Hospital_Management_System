"""
Laboratory router — test catalog, doctor-authored orders, the lab queue,
billing headers, and result entry.

Role guards are deliberately tighter than Pharmacy's dispense/mark-paid
endpoints (which have no role check at all): LAB_STAFF_ROLES for anything that
mutates lab state, LAB_VIEW_ROLES for read paths a doctor also needs.
"""
import logging
import uuid as uuid_mod
from datetime import date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user
from ..core.audit_logger import AuditLogger, AuditAction
from ..schemas.lab import (
    LabTestCreate, LabTestUpdate, LabTestResponse, LabTestListResponse,
    LabTestPanelCreate, LabTestPanelUpdate, LabTestPanelResponse, LabTestPanelListResponse,
    LabOrderCreate, LabOrderResponse, LabResultEntry, LabOrderItemTestUpdate,
    LabOrderItemBillingUpdate,
    LabQueueEntryResponse, LabQueueStatusUpdate,
    LabSaleResponse, LabMarkPaidRequest,
    LabBillingItemResponse, LabBillingListResponse,
    LabReferralCreate, LabReferralResponse,
    LabDashboard,
)
from ..services import lab_service as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lab", tags=["Laboratory"])

LAB_STAFF_ROLES = {"super_admin", "admin", "lab_technician"}
LAB_VIEW_ROLES = {"super_admin", "admin", "lab_technician", "doctor"}
LAB_ORDER_ROLES = {"super_admin", "admin", "doctor", "lab_technician"}


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
    test = svc.update_lab_test(db, test_id, data.model_dump(exclude_unset=True), hospital_id=current_user.hospital_id)
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
    svc.deactivate_lab_test(db, test_id, hospital_id=current_user.hospital_id)


@router.delete("/tests/{test_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lab_test_permanently(
    test_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Completely remove a catalog entry — distinct from the deactivate
    endpoint above, which just hides it from new orders. Blocked with a 409
    (not a raw FK error) if any lab order has ever used this test; the
    correct action there is to deactivate it instead."""
    _require(current_user, LAB_STAFF_ROLES)
    existing = svc.get_lab_test_by_id(db, test_id, hospital_id=current_user.hospital_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Lab test not found")
    if svc.is_lab_test_in_use(db, existing.id):
        raise HTTPException(
            status_code=409,
            detail="This test has been used in one or more lab orders and cannot be deleted. Deactivate it instead.",
        )

    test_name, test_code = existing.name, existing.code
    svc.delete_lab_test(db, existing)

    AuditLogger.log(
        action=AuditAction.LAB_TEST_DELETE,
        user=current_user,
        tenant=None,
        resource_type="lab_test",
        resource_id=test_id,
        old_values={"name": test_name, "code": test_code},
    )


# ═══ Test packages (named bundles, e.g. "MHC — Master Health Checkup") ═══
@router.get("/panels", response_model=LabTestPanelListResponse)
async def list_lab_panels(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Doctors need to read this to pick a package from the Prescription
    # Builder — same view tier as the test catalog itself.
    _require(current_user, LAB_VIEW_ROLES)
    panels = svc.list_lab_panels(db, current_user.hospital_id, active_only)
    return {"data": [svc._enrich_panel(db, p) for p in panels]}


@router.post("/panels", response_model=LabTestPanelResponse, status_code=status.HTTP_201_CREATED)
async def create_lab_panel(
    data: LabTestPanelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    try:
        panel = svc.create_lab_panel(db, current_user.hospital_id, data.model_dump())
        return svc._enrich_panel(db, panel)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating lab panel: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Could not create package (code '{data.code}' may already exist)")


@router.put("/panels/{panel_id}", response_model=LabTestPanelResponse)
async def update_lab_panel(
    panel_id: str,
    data: LabTestPanelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    existing = svc.get_lab_panel_by_id(db, panel_id, hospital_id=current_user.hospital_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Package not found")
    panel = svc.update_lab_panel(db, panel_id, data.model_dump(exclude_unset=True), hospital_id=current_user.hospital_id)
    return svc._enrich_panel(db, panel)


@router.delete("/panels/{panel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_lab_panel(
    panel_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    existing = svc.get_lab_panel_by_id(db, panel_id, hospital_id=current_user.hospital_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Package not found")
    svc.deactivate_lab_panel(db, panel_id, hospital_id=current_user.hospital_id)


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


@router.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lab_order(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Tighter than order creation (LAB_ORDER_ROLES includes doctor) — deleting
    # a report is a lab-staff/admin action, same tier as the test-catalog delete.
    _require(current_user, LAB_STAFF_ROLES)
    order = svc.get_lab_order_by_id(db, order_id, hospital_id=current_user.hospital_id)
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    if svc.is_lab_order_billed(db, order.id):
        raise HTTPException(status_code=409, detail="This order has already been billed and cannot be deleted")

    order_number = order.order_number
    patient_id = order.patient_id
    svc.delete_lab_order(db, order)

    AuditLogger.log(
        action=AuditAction.LAB_ORDER_DELETE,
        user=current_user,
        tenant=None,
        resource_type="lab_order",
        resource_id=order_id,
        old_values={"order_number": order_number, "patient_id": str(patient_id)},
    )


@router.get("/orders/{order_id}/pdf")
async def get_lab_order_pdf(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate a downloadable/printable HTML document for this lab report.

    Mirrors the prescription PDF pattern (backend/app/routers/prescriptions.py
    get_prescription_pdf) — real embedded hospital logo/watermark, forced
    light rendering, and the same letterhead/patient-box/signature layout —
    so the lab report reads as the same family of document, not a
    differently-styled one-off. Rendered identically whether opened in the
    Print window or converted to PDF client-side via htmlStringToPdf.
    """
    import html as _html_mod
    from datetime import datetime
    from ..models.user import Hospital
    from ..models.appointment import Doctor

    _require(current_user, LAB_VIEW_ROLES)
    order = svc.get_lab_order_by_id(db, order_id, hospital_id=current_user.hospital_id)
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    resp = svc._enrich_order(db, order)

    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
    patient = order.patient
    doctor = db.query(Doctor).filter(Doctor.id == order.doctor_id).first()

    def _esc(value) -> str:
        if value is None or value == "":
            return ""
        return _html_mod.escape(str(value), quote=True)

    def fmt_date(d) -> str:
        return d.strftime("%B %d, %Y %I:%M %p") if d else "—"

    hosp_name = _esc((hospital.name if hospital else "") or "Hospital")
    hosp_address = _esc(hospital.address_line_1 if hospital else "")
    hosp_city = _esc(hospital.city if hospital else "")
    hosp_phone = _esc(hospital.phone if hospital else "")
    hosp_email = _esc(hospital.email if hospital else "")
    addr_line = ", ".join(p for p in (hosp_address, hosp_city) if p)
    contact_bits = []
    if hosp_phone:
        contact_bits.append(f"Phone: {hosp_phone}")
    if hosp_email:
        contact_bits.append(f"Email: {hosp_email}")
    contact_line = " | ".join(contact_bits)

    # Hospital logo → embedded as a base64 data URI (same helper/rationale as
    # get_prescription_pdf) so it renders in both the print window and the
    # html2canvas PDF download — relative /uploads paths don't resolve there.
    def _logo_data_uri(logo_url: str) -> str:
        if not logo_url:
            return ""
        if logo_url.startswith("http://") or logo_url.startswith("https://"):
            return logo_url
        import os as _os, base64 as _b64, mimetypes as _mt
        backend_root = _os.path.dirname(_os.path.dirname(_os.path.dirname(__file__)))
        fpath = _os.path.join(backend_root, logo_url.lstrip("/").replace("/", _os.sep))
        if not _os.path.exists(fpath):
            return ""
        mime = _mt.guess_type(fpath)[0] or "image/png"
        try:
            with open(fpath, "rb") as fh:
                data = _b64.b64encode(fh.read()).decode("ascii")
            return f"data:{mime};base64,{data}"
        except Exception:
            return ""
    logo_uri = _logo_data_uri(hospital.logo_url if hospital else "")

    doctor_name = _esc((doctor.user.full_name if doctor and doctor.user else "") or resp.doctor_name or "")
    doctor_display = doctor_name if (not doctor_name or doctor_name.startswith("Dr.")) else f"Dr. {doctor_name}"
    doctor_display = doctor_display or "No doctor assigned"

    def _item_rows(item) -> str:
        params = item.parameters or []
        if not params:
            return f"""<tr><td colspan="4" class="muted">No result entered yet</td></tr>"""
        rows = []
        last_section = None
        for p in params:
            if p.section and p.section != last_section:
                rows.append(f'<tr><td colspan="4" class="section-row">{_esc(p.section)}</td></tr>')
                last_section = p.section
            flag_class = f"flag-{p.flag}" if p.flag and p.flag != "normal" else ""
            rows.append(f"""<tr>
                <td>{_esc(p.name)}</td>
                <td class="right {flag_class}">{_esc(p.value)}</td>
                <td>{_esc(p.unit)}</td>
                <td>{_esc(p.reference_range)}</td>
            </tr>""")
        return "".join(rows)

    tests_html = "".join(
        f"""<p class="section-title">{_esc(item.test_name)}</p>
        <table>
            <thead><tr><th>Parameter</th><th class="right">Result</th><th>Unit</th><th>Reference Range</th></tr></thead>
            <tbody>{_item_rows(item)}</tbody>
        </table>"""
        for item in resp.items
    )

    status_label = resp.report_status.replace("_", " ").title()

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="color-scheme" content="light only">
<title>Lab Report - {_esc(resp.order_number)}</title>
<style>
:root {{ color-scheme: light only; }}
html {{ background:#ffffff; }}
body {{ font-family: 'Noto Sans', Arial, sans-serif; margin:0; padding:28px; color:#1e293b; background:#ffffff; position:relative; }}
.watermark {{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:55%; max-width:420px; opacity:0.06; z-index:0; pointer-events:none; }}
.content {{ position:relative; z-index:1; }}
.header {{ text-align:center; margin-bottom:18px; padding-bottom:14px; border-bottom:3px solid #0284c7; }}
.header-logo {{ height:60px; max-width:220px; object-fit:contain; margin-bottom:6px; }}
.header h1 {{ margin:0; color:#0284c7; font-size:24px; }}
.header p {{ margin:4px 0; color:#64748b; font-size:13px; }}
.report-info {{ display:flex; justify-content:space-between; margin-bottom:14px; font-size:13px; }}
.patient-box {{ background:#f1f5f9; padding:14px 16px; border-radius:8px; margin-bottom:14px; }}
.patient-box p {{ margin:4px 0; font-size:13px; }}
table {{ width:100%; border-collapse:collapse; margin:8px 0 20px; }}
th, td {{ text-align:left; padding:8px 12px; border-bottom:1px solid #e2e8f0; font-size:13px; }}
th {{ color:#64748b; font-weight:600; font-size:12px; }}
.right {{ text-align:right; }}
.muted {{ color:#94a3b8; font-size:12px; font-style:italic; }}
.section-row {{ font-weight:700; color:#0284c7; font-size:12px; border-top:1px solid #e2e8f0; }}
.flag-high, .flag-low {{ color:#b45309; font-weight:700; }}
.flag-abnormal {{ color:#b91c1c; font-weight:700; }}
.section-title {{ font-size:16px; font-weight:bold; color:#0284c7; margin:24px 0 4px; padding-bottom:4px; border-bottom:2px solid #e2e8f0; }}
.status {{ font-size:12px; font-weight:bold; text-transform:uppercase; }}
.status-finalized {{ color:#166534; }}
.status-completed {{ color:#92400e; }}
.status-pending {{ color:#475569; }}
.footer {{ margin-top:24px; text-align:right; page-break-inside:avoid; }}
.no-signature {{ font-size:13px; font-style:italic; color:#64748b; margin:0; }}
.generated-note {{ text-align:center; margin-top:24px; font-size:11px; color:#94a3b8; }}
@page {{ size: A4; margin: 12mm; }}
@media print {{
  html, body {{ margin:0; padding:0; height:auto; background:#ffffff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  .footer {{ margin-top:20px; }}
  table, tr, td, th {{ page-break-inside:avoid; }}
  .patient-box {{ page-break-inside:avoid; }}
}}
</style>
</head>
<body>
{f'<img class="watermark" src="{logo_uri}" alt="" />' if logo_uri else ''}
<div class="content">
<div class="header">
    {f'<img class="header-logo" src="{logo_uri}" alt="{hosp_name}" />' if logo_uri else ''}
    <h1>{hosp_name}</h1>
    {f'<p>{addr_line}</p>' if addr_line else ''}
    {f'<p style="white-space:nowrap;">{contact_line}</p>' if contact_line else ''}
</div>

<div class="report-info">
    <div><strong>Report #:</strong> {_esc(resp.order_number)}<br/><strong>Date:</strong> {fmt_date(order.created_at)}<br/><strong>Ordered by:</strong> {doctor_display}</div>
    <div style="text-align:right;"><strong>Status:</strong> <span class="status status-{resp.report_status}">{_esc(status_label)}</span></div>
</div>

<div class="patient-box">
    <p><strong>Patient:</strong> {_esc(patient.full_name) if patient else '—'}</p>
    {f'<p><strong>PRN:</strong> {_esc(patient.patient_reference_number)}</p>' if patient and patient.patient_reference_number else ''}
</div>

{tests_html}

{f'<p class="generated-note">Finalized by {_esc(resp.finalized_by_name)} on {fmt_date(resp.finalized_at)}</p>' if resp.finalized_by_name else ''}

<div class="footer">
    <p class="no-signature">Signature not required</p>
</div>

<p class="generated-note">Generated on {datetime.now().strftime("%B %d, %Y at %I:%M %p")} | This is a computer-generated document.</p>
</div>
</body>
</html>"""

    from fastapi.responses import HTMLResponse
    return HTMLResponse(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": f'inline; filename="lab_report_{resp.order_number}.html"'},
    )


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
        order = svc.advance_lab_queue_status(db, order_id, data.queue_status, hospital_id=current_user.hospital_id)
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
    """Collect a partial or full payment against a lab order's bill — called
    from the standalone Lab Billing page (LabBilling.tsx), any number of
    times per order. Reuses one Invoice per order and records the real
    payment through the generic Invoice/Payment path (see
    lab_service.collect_lab_sale_payment), which already handles
    accumulating multiple payments and rejects overpayment."""
    _require(current_user, LAB_STAFF_ROLES)
    try:
        sale = svc.collect_lab_sale_payment(
            db, order_id, current_user.hospital_id, data.amount_paid, data.payment_method, current_user.id,
            payment_reference=data.payment_reference,
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    if not sale:
        raise HTTPException(status_code=404, detail="Lab order not found")
    return LabSaleResponse.model_validate(sale)


@router.get("/billing", response_model=LabBillingListResponse)
async def list_lab_billing(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    payment_status: Optional[str] = Query(None, description="pending | partial | paid"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Billing worklist for the standalone Lab Billing page — every lab
    order with its payment status, filterable so staff can find unpaid /
    partially-paid orders to collect against."""
    _require(current_user, LAB_STAFF_ROLES)
    result = svc.list_lab_billing(
        db, current_user.hospital_id, page, limit, search, payment_status, date_from, date_to,
    )
    result["data"] = [LabBillingItemResponse.model_validate(r) for r in result["data"]]
    return result


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
    try:
        item = svc.record_lab_result(
            db, item_id, current_user.hospital_id, data.model_dump(), resulted_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not item:
        raise HTTPException(status_code=404, detail="Lab order item not found")
    db.refresh(order)
    return svc._enrich_order(db, order)


@router.put("/orders/{order_id}/items/{item_id}/test", response_model=LabOrderResponse)
async def update_lab_order_item_test(
    order_id: str,
    item_id: str,
    data: LabOrderItemTestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Swap which catalog test an order item bills for — reached from the
    fee-collection screen (LabCollectPayment.tsx) when staff picked the
    wrong test at order time. Pre-payment only: blocked with a 409 once the
    report is finalized or once any payment has been collected against the
    order — see lab_service.update_lab_order_item_test for the full
    reasoning behind that boundary."""
    _require(current_user, LAB_STAFF_ROLES)
    order = svc.get_lab_order_by_id(db, order_id, hospital_id=current_user.hospital_id)
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    try:
        item = svc.update_lab_order_item_test(
            db, order, item_id, data.lab_test_id, hospital_id=current_user.hospital_id,
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    if not item:
        raise HTTPException(status_code=404, detail="Lab order item or lab test not found")
    db.refresh(order)
    return svc._enrich_order(db, order)


@router.put("/orders/{order_id}/items/{item_id}/billing", response_model=LabOrderResponse)
async def update_lab_order_item_billing(
    order_id: str,
    item_id: str,
    data: LabOrderItemBillingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Set the actual billed amount (and optional billing-only display name)
    for one order item, from the fee-collection screen (LabCollectPayment.tsx).
    Catalog test price is always ₹0, so this is the only place a lab order's
    price is ever set — see lab_service.update_lab_order_item_billing. Same
    409 edit-boundary as the /test swap endpoint above."""
    _require(current_user, LAB_STAFF_ROLES)
    order = svc.get_lab_order_by_id(db, order_id, hospital_id=current_user.hospital_id)
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    try:
        item = svc.update_lab_order_item_billing(
            db, order, item_id, data.price, data.billed_name, hospital_id=current_user.hospital_id,
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    if not item:
        raise HTTPException(status_code=404, detail="Lab order item not found")
    db.refresh(order)
    return svc._enrich_order(db, order)


@router.post("/orders/{order_id}/finalize", response_model=LabOrderResponse)
async def finalize_lab_report(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Lock the report and make it visible to the doctor on the patient page
    — requires every item resulted and payment collected."""
    _require(current_user, LAB_STAFF_ROLES)
    order = svc.get_lab_order_by_id(db, order_id, hospital_id=current_user.hospital_id)
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    try:
        order = svc.finalize_lab_report(db, order_id, current_user.hospital_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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


# ═══ Referrals ═══
@router.post("/referrals", response_model=LabReferralResponse, status_code=status.HTTP_201_CREATED)
async def create_lab_referral(
    data: LabReferralCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    try:
        referral = svc.create_lab_referral(db, current_user.hospital_id, data.model_dump(), created_by=current_user.id)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating lab referral: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail="Could not create referral")
    return svc._enrich_referral(db, referral)


@router.get("/referrals/patient/{patient_id}", response_model=list[LabReferralResponse])
async def list_patient_lab_referrals(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    referrals = svc.get_patient_lab_referrals(db, patient_id, current_user.hospital_id)
    return [svc._enrich_referral(db, r) for r in referrals]


@router.get("/referrals/{referral_id}", response_model=LabReferralResponse)
async def get_lab_referral(
    referral_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require(current_user, LAB_STAFF_ROLES)
    referral = svc.get_lab_referral_by_id(db, referral_id, hospital_id=current_user.hospital_id)
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")
    return svc._enrich_referral(db, referral)
