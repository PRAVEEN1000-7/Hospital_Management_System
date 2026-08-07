"""
Invoices router — /api/v1/invoices
"""
import logging
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
import uuid

from ..database import get_db
from ..dependencies import get_current_active_user
from ..core.module_roles import check_permission
from ..core.hospital_time import hospital_today_by_id
from ..models.user import User
from ..models.appointment import Appointment
from ..schemas.invoice import (
    InvoiceCreate, InvoiceUpdate, InvoiceResponse,
    PaginatedInvoiceResponse, InvoiceItemCreate, InvoiceItemResponse,
    INVOICE_TYPE_ITEM_MAPPING, PaymentStatusSummaryResponse,
)
from ..services.invoice_service import (
    create_invoice, get_invoice_by_id, list_invoices,
    update_invoice, issue_invoice, void_invoice,
    add_invoice_item, remove_invoice_item, get_or_create_consultation_invoice_for_appointment,
    get_payment_status_summary,
    get_revenue_summary, get_revenue_trend, get_revenue_by_module,
    get_collections_by_mode, get_outstanding_aging, get_tax_summary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["Billing — Invoices"])

# Driven by the shared "billing" permission matrix — per the client's
# spreadsheet, only Admin and Cashier have any billing access at all (doctor/
# pharmacist/receptionist are "No access"). See the flagged conflict in
# docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md before assuming this
# matches what other billing-adjacent features (e.g. consultation fee
# "Collected By") expect.
BILLING_ADMIN_ROLES = {"super_admin", "admin"}


def _has_any_role(current_user: User, allowed_roles: set[str]) -> bool:
    roles = {str(r).strip().lower() for r in (current_user.roles or [])}
    return bool(roles & {r.lower() for r in allowed_roles})


def _require_billing_staff(db: Session, current_user: User) -> None:
    if not check_permission(db, current_user, "billing", "edit"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Billing staff access required")


def _require_billing_view(db: Session, current_user: User) -> None:
    if not check_permission(db, current_user, "billing", "view"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied")


def _require_billing_admin(current_user: User) -> None:
    if not _has_any_role(current_user, BILLING_ADMIN_ROLES):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Admin or Super Admin role required")


# Narrow, single-endpoint carve-out: a receptionist can collect the
# consultation fee for an appointment they're front-desking, without gaining
# the general "billing" module permission (invoice creation/listing,
# refunds, settlements, tax config stay admin/cashier-only per the client's
# matrix). Safe to allow unconditionally here because this endpoint only
# ever creates/returns a consultation invoice for one appointment — it can't
# be used to touch any other invoice. Use ONLY on
# get_or_create_consultation_invoice; every other endpoint in this router
# must keep using _require_billing_staff/_require_billing_view as-is.
def _require_billing_staff_or_receptionist(db: Session, current_user: User) -> None:
    if _has_any_role(current_user, {"receptionist"}):
        return
    _require_billing_staff(db, current_user)


# Narrow carve-out for lab staff "Collect Fee": LabOrderDetail.tsx bills a
# lab order through this same generic invoice path DispensingBilling.tsx
# uses (create → issue → record payment), but POST /invoices and PATCH
# /invoices/{id}/issue are otherwise gated to billing staff (admin/cashier)
# only — a lab_technician has no "billing" module permission at all, so
# every call in that flow 403'd and the fee could never actually be
# collected even though the UI showed the button. Scoped strictly to
# invoice_type == "lab" so a lab_technician still can't touch/create any
# other invoice type; cashier/admin/anyone who already passes
# _require_billing_staff is unaffected.
def _require_billing_staff_or_lab_invoice(db: Session, current_user: User, invoice_type: Optional[str]) -> None:
    if check_permission(db, current_user, "billing", "edit"):
        return
    if _has_any_role(current_user, {"lab_technician"}) and invoice_type == "lab":
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Billing staff access required")


@router.get("/config/item-type-mapping", tags=["Billing — Invoices"])
async def get_invoice_item_mapping(
    current_user: User = Depends(get_current_active_user),
):
    """Get mapping of invoice types to allowed line item types for UI filtering."""
    return INVOICE_TYPE_ITEM_MAPPING


@router.get("/medicines/{medicine_id}", tags=["Billing — Invoices"])
async def get_medicine_lookup(
    medicine_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    STEP 1: Lookup medicine details from inventory for invoice line items.
    
    Returns:
    - Medicine master data (name, price, tax config)
    - Current stock level across all non-expired batches
    - Available batches with FEFO ordering for selection
    
    Only accessible to billing staff.
    """
    _require_billing_staff(db, current_user)
    
    from ..services.inventory_service import get_medicine_for_invoice
    
    try:
        import uuid
        medicine_uuid = uuid.UUID(medicine_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid medicine ID format"
        )
    
    try:
        medicine_data = get_medicine_for_invoice(db, medicine_uuid, current_user.hospital_id)
        if not medicine_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Medicine not found or inactive"
            )
        return medicine_data
    except Exception as e:
        logger.error(f"Error fetching medicine {medicine_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch medicine details"
        )


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_new_invoice(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new draft invoice with optional line items."""
    _require_billing_staff_or_lab_invoice(db, current_user, data.invoice_type)
    try:
        invoice = create_invoice(db, data, current_user.id, current_user.hospital_id)
        return InvoiceResponse.model_validate(invoice)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating invoice: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create invoice")


@router.post("/appointments/{appointment_id}/consultation-invoice", response_model=InvoiceResponse)
async def get_or_create_consultation_invoice(
    appointment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create (or return existing) issued consultation invoice for an appointment."""
    _require_billing_staff_or_receptionist(db, current_user)
    try:
        appointment_uuid = uuid.UUID(appointment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid appointment ID")

    appt = (
        db.query(Appointment)
        .filter(
            Appointment.id == appointment_uuid,
            Appointment.hospital_id == current_user.hospital_id,
            Appointment.is_deleted == False,
        )
        .first()
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    try:
        invoice = get_or_create_consultation_invoice_for_appointment(
            db,
            hospital_id=current_user.hospital_id,
            user_id=current_user.id,
            appointment_id=appointment_uuid,
            patient_id=appt.patient_id,
        )
        if not invoice:
            raise HTTPException(status_code=400, detail="Consultation fee is not configured for this appointment")
        return InvoiceResponse.model_validate(invoice)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating consultation invoice for appointment {appointment_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to prepare consultation invoice")


@router.get("", response_model=PaginatedInvoiceResponse)
async def list_all_invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    payment_status: Optional[str] = None,
    invoice_type: Optional[str] = None,
    patient_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List invoices with filters and pagination."""
    _require_billing_view(db, current_user)
    try:
        return list_invoices(
            db, current_user.hospital_id, page, limit,
            search=search, status=status, payment_status=payment_status,
            invoice_type=invoice_type, patient_id=patient_id,
            date_from=date_from, date_to=date_to,
        )
    except Exception as e:
        logger.error(f"Error listing invoices: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve invoices")


@router.get("/patient/{patient_id}", response_model=PaginatedInvoiceResponse)
async def list_patient_invoices(
    patient_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get all invoices for a specific patient."""
    _require_billing_view(db, current_user)
    try:
        return list_invoices(db, current_user.hospital_id, page, limit, patient_id=patient_id)
    except Exception as e:
        logger.error(f"Error listing patient invoices: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve patient invoices")


@router.get("/stats/payment-status-summary", response_model=PaymentStatusSummaryResponse)
async def payment_status_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """BRD-001 — counts + totals per payment-status bucket, for the Reports/
    Analytics dashboard's Financial panel."""
    _require_billing_view(db, current_user)
    return get_payment_status_summary(db, current_user.hospital_id)


# ── Analytics: Revenue / Financial (Reports & Analytics dashboard) ─────────
# Every endpoint below defaults to the trailing 30 days when no range is
# given, matching the dashboard's default period pill.

@router.get("/stats/revenue-summary")
async def revenue_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Total revenue collected + current outstanding dues, for KPIStrip."""
    _require_billing_view(db, current_user)
    today = hospital_today_by_id(db, current_user.hospital_id)
    d_to = date_to or today
    d_from = date_from or (d_to - timedelta(days=29))
    return get_revenue_summary(db, current_user.hospital_id, d_from, d_to)


@router.get("/stats/revenue-trend")
async def revenue_trend(
    granularity: str = Query("daily", pattern="^(daily|monthly)$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Revenue collected per day/month, by module — RevenuePanel's Daily/Monthly tabs."""
    _require_billing_view(db, current_user)
    today = hospital_today_by_id(db, current_user.hospital_id)
    d_to = date_to or today
    d_from = date_from or (d_to - timedelta(days=29 if granularity == "daily" else 364))
    return get_revenue_trend(db, current_user.hospital_id, granularity, d_from, d_to)


@router.get("/stats/revenue-by-module")
async def revenue_by_module(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Revenue totals by module for the period — RevenuePanel's By Module pie chart."""
    _require_billing_view(db, current_user)
    today = hospital_today_by_id(db, current_user.hospital_id)
    d_to = date_to or today
    d_from = date_from or (d_to - timedelta(days=29))
    return get_revenue_by_module(db, current_user.hospital_id, d_from, d_to)


@router.get("/stats/collections-by-mode")
async def collections_by_mode(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Collected amount by payment mode — FinancialPanel's Collections chart."""
    _require_billing_view(db, current_user)
    today = hospital_today_by_id(db, current_user.hospital_id)
    d_to = date_to or today
    d_from = date_from or (d_to - timedelta(days=29))
    return get_collections_by_mode(db, current_user.hospital_id, d_from, d_to)


@router.get("/stats/outstanding-aging")
async def outstanding_aging(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Unpaid invoice balances bucketed by age — FinancialPanel's Outstanding Dues chart.
    A running snapshot, not scoped to the dashboard's period filter (see
    get_outstanding_aging's docstring)."""
    _require_billing_view(db, current_user)
    return get_outstanding_aging(db, current_user.hospital_id)


@router.get("/stats/tax-summary")
async def tax_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Taxable/tax/total for the period — FinancialPanel's Tax Summary."""
    _require_billing_view(db, current_user)
    today = hospital_today_by_id(db, current_user.hospital_id)
    d_to = date_to or today
    d_from = date_from or (d_to - timedelta(days=29))
    return get_tax_summary(db, current_user.hospital_id, d_from, d_to)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get full invoice details including line items and payments."""
    _require_billing_view(db, current_user)
    invoice = get_invoice_by_id(db, invoice_id)
    if not invoice or str(invoice.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Invoice not found")
    return InvoiceResponse.model_validate(invoice)


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate a downloadable/printable HTML document for this invoice.

    Mirrors the appointment/prescription print templates — a fully
    self-contained HTML document (inline <style>, escaped values) so it
    renders identically whether opened for printing or converted to PDF
    client-side via htmlStringToPdf.
    """
    import html as _html_mod
    from datetime import datetime
    from ..models.user import Hospital

    _require_billing_view(db, current_user)
    invoice = get_invoice_by_id(db, invoice_id)
    if not invoice or str(invoice.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Invoice not found")

    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
    patient = invoice.patient

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

    item_type_labels = {
        "consultation": "Consultation", "medicine": "Medicine",
        "optical_product": "Optical Product", "service": "Service",
        "procedure": "Procedure", "registration": "Registration",
    }

    rows = "".join(
        f"""<tr>
            <td>{_esc(item.description)}<br><span class="muted">{_esc(item_type_labels.get(item.item_type, item.item_type))}{f' · Batch {_esc(item.batch_number)}' if item.batch_number else ''}</span></td>
            <td class="right">{float(item.quantity or 0):g}</td>
            <td class="right">₹{fmt_money(item.unit_price)}</td>
            <td class="right">{float(item.discount_percent or 0):g}%</td>
            <td class="right">₹{fmt_money(item.tax_amount)}</td>
            <td class="right"><strong>₹{fmt_money(item.total_price)}</strong></td>
        </tr>"""
        for item in invoice.items
    )

    html = f"""<!DOCTYPE html>
<html>
<head>
<title>Invoice - {_esc(invoice.invoice_number)}</title>
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
.status-issued {{ background: #dbeafe; color: #1e40af; }}
.status-partially_paid {{ background: #fef3c7; color: #92400e; }}
.status-draft {{ background: #f1f5f9; color: #475569; }}
.status-overdue, .status-cancelled, .status-void {{ background: #fee2e2; color: #991b1b; }}
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
<div class="invoice-number">Invoice #{_esc(invoice.invoice_number)}</div>
<div class="meta">
    <span>Date: {fmt_date(invoice.invoice_date)}</span>
    <span class="status status-{invoice.status}">{_esc(invoice.status.replace('_', ' '))}</span>
</div>
<p class="section-title">Bill To</p>
<table>
    <tr><th style="width:160px;">Patient</th><td>{_esc(patient.full_name) if patient else '—'}</td></tr>
    <tr><th>PRN</th><td>{_esc(patient.patient_reference_number) if patient else '—'}</td></tr>
</table>
<p class="section-title">Line Items</p>
<table>
    <thead>
        <tr><th>Description</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Disc.</th><th class="right">Tax</th><th class="right">Total</th></tr>
    </thead>
    <tbody>{rows}</tbody>
</table>
<div class="summary">
    <div class="summary-row"><span>Subtotal</span><span>₹{fmt_money(invoice.subtotal)}</span></div>
    {f'<div class="summary-row"><span>Discount</span><span>-₹{fmt_money(invoice.discount_amount)}</span></div>' if invoice.discount_amount else ''}
    <div class="summary-row"><span>Tax</span><span>₹{fmt_money(invoice.tax_amount)}</span></div>
    <div class="summary-row summary-total"><span>Total</span><span>₹{fmt_money(invoice.total_amount)}</span></div>
    <div class="summary-row"><span>Paid</span><span>₹{fmt_money(invoice.paid_amount)}</span></div>
    <div class="summary-row"><span>Balance Due</span><span>₹{fmt_money(invoice.balance_amount)}</span></div>
</div>
{f'<p class="section-title">Notes</p><p style="font-size:13px;">{_esc(invoice.notes)}</p>' if invoice.notes else ''}
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
        headers={"Content-Disposition": f'inline; filename="invoice_{invoice.invoice_number}.html"'},
    )


@router.put("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice_header(
    invoice_id: str,
    data: InvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update draft invoice header fields."""
    _require_billing_staff(db, current_user)
    invoice = get_invoice_by_id(db, invoice_id)
    if not invoice or str(invoice.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Invoice not found")
    try:
        invoice = update_invoice(db, invoice, data)
        return InvoiceResponse.model_validate(invoice)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating invoice {invoice_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update invoice")


@router.patch("/{invoice_id}/issue", response_model=InvoiceResponse)
async def issue_invoice_endpoint(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Issue a draft invoice (makes it payable)."""
    invoice = get_invoice_by_id(db, invoice_id)
    if not invoice or str(invoice.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Invoice not found")
    # Checked against the invoice's own type (not the request body — this
    # endpoint takes none) so a lab_technician can only issue the lab bill
    # they just created, same carve-out as create_new_invoice above.
    _require_billing_staff_or_lab_invoice(db, current_user, invoice.invoice_type)
    try:
        invoice = issue_invoice(db, invoice)
        return InvoiceResponse.model_validate(invoice)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error issuing invoice {invoice_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to issue invoice")


@router.patch("/{invoice_id}/void", response_model=InvoiceResponse)
async def void_invoice_endpoint(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Void an invoice (admin / super_admin only)."""
    _require_billing_admin(current_user)
    invoice = get_invoice_by_id(db, invoice_id)
    if not invoice or str(invoice.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Invoice not found")
    try:
        invoice = void_invoice(db, invoice)
        return InvoiceResponse.model_validate(invoice)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error voiding invoice {invoice_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to void invoice")


@router.post("/{invoice_id}/items", response_model=InvoiceItemResponse, status_code=status.HTTP_201_CREATED)
async def add_line_item(
    invoice_id: str,
    data: InvoiceItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Add a line item to a draft invoice."""
    _require_billing_staff(db, current_user)
    invoice = get_invoice_by_id(db, invoice_id)
    if not invoice or str(invoice.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Invoice not found")
    try:
        item = add_invoice_item(db, invoice, data)
        return InvoiceItemResponse.model_validate(item)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error adding item to invoice {invoice_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to add line item")


@router.delete("/{invoice_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_line_item(
    invoice_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Remove a line item from a draft invoice."""
    _require_billing_staff(db, current_user)
    invoice = get_invoice_by_id(db, invoice_id)
    if not invoice or str(invoice.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Invoice not found")
    try:
        remove_invoice_item(db, invoice, item_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error removing item from invoice {invoice_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to remove line item")
