"""
Refunds router — /api/v1/refunds
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..dependencies import get_current_active_user
from ..core.module_roles import check_permission
from ..models.user import User
from ..schemas.refund import (
    RefundCreate, RefundResponse, PaginatedRefundResponse,
    RefundProcessRequest, RefundRejectRequest,
)
from ..services.refund_service import (
    request_refund, list_refunds, get_refund_by_id,
    approve_refund, reject_refund, process_refund,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/refunds", tags=["Billing — Refunds"])

# Driven by the shared "billing" permission matrix — see the flagged
# conflict in docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md.
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


@router.post("", response_model=RefundResponse, status_code=status.HTTP_201_CREATED)
async def request_new_refund(
    data: RefundCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Request a refund for a completed payment."""
    _require_billing_staff(db, current_user)
    try:
        refund = request_refund(db, data, current_user.id, current_user.hospital_id)
        db.refresh(refund)
        return RefundResponse.model_validate(refund)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error requesting refund: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to request refund")


@router.get("", response_model=PaginatedRefundResponse)
async def list_all_refunds(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    invoice_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all refunds with optional status, invoice, and patient filters."""
    _require_billing_view(db, current_user)
    try:
        return list_refunds(
            db, current_user.hospital_id, page, limit,
            status=status, invoice_id=invoice_id, patient_id=patient_id,
        )
    except Exception as e:
        logger.error(f"Error listing refunds: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve refunds")


@router.get("/{refund_id}", response_model=RefundResponse)
async def get_refund(
    refund_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get refund details."""
    _require_billing_view(db, current_user)
    refund = get_refund_by_id(db, refund_id)
    if not refund or str(refund.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Refund not found")
    return RefundResponse.model_validate(refund)


@router.get("/{refund_id}/pdf")
async def get_refund_pdf(
    refund_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Self-contained printable HTML refund receipt — mirrors the invoice PDF
    template so refunds finally have a document a patient can be handed,
    instead of only a row in the Refunds list."""
    import html as _html_mod
    from datetime import datetime
    from ..models.user import Hospital

    _require_billing_view(db, current_user)
    refund = get_refund_by_id(db, refund_id)
    if not refund or str(refund.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Refund not found")

    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
    patient = refund.patient
    invoice = refund.invoice
    payment = refund.payment

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

    reason_labels = {
        "duplicate_payment": "Duplicate Payment", "overcharge": "Overcharge",
        "service_not_rendered": "Service Not Rendered", "patient_request": "Patient Request",
        "billing_error": "Billing Error", "other": "Other",
    }

    html = f"""<!DOCTYPE html>
<html>
<head>
<title>Refund Receipt - {_esc(refund.refund_number)}</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #1e293b; }}
.header {{ text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #dc2626; }}
.header h1 {{ margin: 0; color: #dc2626; font-size: 28px; }}
.header p {{ margin: 4px 0 0; color: #64748b; font-size: 14px; }}
.refund-number {{ font-size: 20px; font-weight: bold; color: #dc2626; text-align: center; margin: 20px 0; padding: 12px; background: #fef2f2; border-radius: 8px; }}
.meta {{ display: flex; justify-content: space-between; margin: 16px 0; font-size: 13px; color: #64748b; }}
table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
th, td {{ text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }}
th {{ color: #64748b; font-weight: 600; font-size: 12px; background: #f8fafc; width: 200px; }}
.section-title {{ font-size: 16px; font-weight: bold; color: #dc2626; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; }}
.status {{ display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; }}
.status-processed {{ background: #dcfce7; color: #166534; }}
.status-approved {{ background: #dbeafe; color: #1e40af; }}
.status-pending {{ background: #fef3c7; color: #92400e; }}
.status-rejected {{ background: #fee2e2; color: #991b1b; }}
.amount {{ font-size: 22px; font-weight: bold; color: #dc2626; text-align: center; margin: 20px 0; }}
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
<div class="refund-number">Refund Receipt #{_esc(refund.refund_number)}</div>
<div class="meta">
    <span>Date: {fmt_date(refund.processed_at.date() if refund.processed_at else refund.created_at.date())}</span>
    <span class="status status-{refund.status}">{_esc(refund.status)}</span>
</div>
<div class="amount">₹{fmt_money(refund.amount)} Refunded</div>
<p class="section-title">Refund Details</p>
<table>
    <tr><th>Patient</th><td>{_esc(patient.full_name) if patient else '—'}</td></tr>
    <tr><th>PRN</th><td>{_esc(patient.patient_reference_number) if patient else '—'}</td></tr>
    <tr><th>Original Invoice</th><td>{_esc(invoice.invoice_number) if invoice else '—'}</td></tr>
    <tr><th>Original Payment</th><td>{_esc(payment.payment_number) if payment else '—'}</td></tr>
    <tr><th>Refund Mode</th><td>{_esc((refund.refund_mode or '').replace('_', ' ').title()) or '—'}</td></tr>
    <tr><th>Refund Reference</th><td>{_esc(refund.refund_reference) or '—'}</td></tr>
    <tr><th>Reason</th><td>{_esc(reason_labels.get(refund.reason_code, refund.reason_code))}{f' — {_esc(refund.reason_detail)}' if refund.reason_detail else ''}</td></tr>
    <tr><th>Requested By</th><td>{_esc(refund.requested_by_user.full_name) if refund.requested_by_user else '—'}</td></tr>
    <tr><th>Approved By</th><td>{_esc(refund.approved_by_user.full_name) if refund.approved_by_user else '—'}</td></tr>
</table>
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
        headers={"Content-Disposition": f'inline; filename="refund_{refund.refund_number}.html"'},
    )


@router.patch("/{refund_id}/approve", response_model=RefundResponse)
async def approve_refund_endpoint(
    refund_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Approve a pending refund request."""
    _require_billing_admin(current_user)
    refund = get_refund_by_id(db, refund_id)
    if not refund or str(refund.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Refund not found")
    try:
        refund = approve_refund(db, refund, current_user.id)
        return RefundResponse.model_validate(refund)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error approving refund {refund_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to approve refund")


@router.patch("/{refund_id}/reject", response_model=RefundResponse)
async def reject_refund_endpoint(
    refund_id: str,
    data: RefundRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Reject a pending refund request."""
    _require_billing_admin(current_user)
    refund = get_refund_by_id(db, refund_id)
    if not refund or str(refund.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Refund not found")
    try:
        refund = reject_refund(db, refund, current_user.id, data)
        return RefundResponse.model_validate(refund)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error rejecting refund {refund_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to reject refund")


@router.patch("/{refund_id}/process", response_model=RefundResponse)
async def process_refund_endpoint(
    refund_id: str,
    data: RefundProcessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Mark an approved refund as processed (money returned to patient)."""
    _require_billing_staff(db, current_user)
    refund = get_refund_by_id(db, refund_id)
    if not refund or str(refund.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Refund not found")
    try:
        refund = process_refund(db, refund, data, current_user.id)
        return RefundResponse.model_validate(refund)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing refund {refund_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to process refund")
