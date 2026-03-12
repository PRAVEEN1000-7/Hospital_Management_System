"""
Invoices router — /api/v1/invoices
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..dependencies import get_current_active_user
from ..models.user import User
from ..schemas.invoice import (
    InvoiceCreate, InvoiceUpdate, InvoiceResponse,
    PaginatedInvoiceResponse, InvoiceItemCreate, InvoiceItemResponse,
)
from ..services.invoice_service import (
    create_invoice, get_invoice_by_id, list_invoices,
    update_invoice, issue_invoice, void_invoice,
    add_invoice_item, remove_invoice_item,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["Billing — Invoices"])

BILLING_ADMIN_ROLES = {"super_admin", "admin"}
BILLING_STAFF_ROLES = {"super_admin", "admin", "cashier", "pharmacist"}
BILLING_VIEW_ROLES  = {"super_admin", "admin", "cashier", "pharmacist", "doctor"}


def _require_billing_staff(current_user: User) -> None:
    role = current_user.roles[0] if current_user.roles else ""
    if role not in BILLING_STAFF_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Billing staff access required")


def _require_billing_view(current_user: User) -> None:
    role = current_user.roles[0] if current_user.roles else ""
    if role not in BILLING_VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied")


def _require_billing_admin(current_user: User) -> None:
    role = current_user.roles[0] if current_user.roles else ""
    if role not in BILLING_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Admin or Super Admin role required")


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_new_invoice(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new draft invoice with optional line items."""
    _require_billing_staff(current_user)
    try:
        invoice = create_invoice(db, data, current_user.id, current_user.hospital_id)
        return InvoiceResponse.model_validate(invoice)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating invoice: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create invoice")


@router.get("", response_model=PaginatedInvoiceResponse)
async def list_all_invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    invoice_type: Optional[str] = None,
    patient_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List invoices with filters and pagination."""
    _require_billing_view(current_user)
    try:
        return list_invoices(
            db, current_user.hospital_id, page, limit,
            search=search, status=status,
            invoice_type=invoice_type, patient_id=patient_id,
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
    _require_billing_view(current_user)
    try:
        return list_invoices(db, current_user.hospital_id, page, limit, patient_id=patient_id)
    except Exception as e:
        logger.error(f"Error listing patient invoices: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve patient invoices")


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get full invoice details including line items and payments."""
    _require_billing_view(current_user)
    invoice = get_invoice_by_id(db, invoice_id)
    if not invoice or str(invoice.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Invoice not found")
    return InvoiceResponse.model_validate(invoice)


@router.put("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice_header(
    invoice_id: str,
    data: InvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update draft invoice header fields."""
    _require_billing_staff(current_user)
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
    _require_billing_staff(current_user)
    invoice = get_invoice_by_id(db, invoice_id)
    if not invoice or str(invoice.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Invoice not found")
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
    _require_billing_staff(current_user)
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
    _require_billing_staff(current_user)
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
