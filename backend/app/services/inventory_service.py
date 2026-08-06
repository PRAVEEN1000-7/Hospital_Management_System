"""
Inventory service — business logic for suppliers, POs, GRNs,
stock movements, adjustments, and cycle counts.
"""
import logging
import math
import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func, or_, case
from sqlalchemy.orm import Session, joinedload

from ..models.inventory import (
    Supplier, PurchaseOrder, PurchaseOrderItem,
    GoodsReceiptNote, GRNItem, StockMovement,
    StockAdjustment, CycleCount, CycleCountItem,
    PaymentMode, PurchaseOrderPayment,
)
from ..models.prescription import Medicine
from ..models.optical import OpticalProduct, OpticalBatch
from ..models.pharmacy import MedicineBatch
from ..models.user import User, Role, UserRole, Hospital
from .notification_service import notify_hospital_users as _notify_hospital_users_shared
from ..schemas.inventory import (
    SupplierCreate, SupplierUpdate,
    PurchaseOrderCreate, PurchaseOrderUpdate,
    GRNCreate, GRNUpdate, GRNItemBatchUpdate,
    StockAdjustmentCreate, StockAdjustmentUpdate,
    CycleCountCreate, CycleCountUpdate,
    PurchaseOrderPaymentCreate,
)

logger = logging.getLogger(__name__)


# ─── Helpers ────────────────────────────────────────────────────────────────

def _resolve_item_name(db: Session, item_type: str, item_id: uuid.UUID) -> Optional[str]:
    """Look up a medicine / optical product name for display."""
    if item_type == "medicine":
        med = db.query(Medicine.name).filter(Medicine.id == item_id).first()
        return med[0] if med else None
    if item_type == "optical_product":
        optical = db.query(OpticalProduct.name).filter(OpticalProduct.id == item_id).first()
        return optical[0] if optical else None
    return None


def _resolve_batch_number(db: Session, item_type: str, batch_id: Optional[uuid.UUID]) -> Optional[str]:
    """Look up a medicine/optical batch's human-readable batch_number for
    display — batch_id alone is a raw UUID, not useful shown directly (Bug #52/#53)."""
    if not batch_id:
        return None
    if item_type == "medicine":
        row = db.query(MedicineBatch.batch_number).filter(MedicineBatch.id == batch_id).first()
        return row[0] if row else None
    if item_type == "optical_product":
        row = db.query(OpticalBatch.batch_number).filter(OpticalBatch.id == batch_id).first()
        return row[0] if row else None
    return None


def _resolve_item_name_with_fallback(
    db: Session,
    item_type: str,
    item_id: uuid.UUID,
    hospital_id: Optional[uuid.UUID] = None,
    unit_price: Optional[float] = None,
) -> Optional[str]:
    """Resolve item name by id first, then by unique hospital price match for legacy rows."""
    by_id = _resolve_item_name(db, item_type, item_id)
    if by_id:
        return by_id
    if hospital_id is None or unit_price is None:
        return None

    if item_type == "medicine":
        by_purchase_price = db.query(Medicine.name).filter(
            Medicine.hospital_id == hospital_id,
            Medicine.is_active == True,
            Medicine.purchase_price == unit_price,
        ).limit(2).all()
        if len(by_purchase_price) == 1:
            return by_purchase_price[0][0]

        by_selling_price = db.query(Medicine.name).filter(
            Medicine.hospital_id == hospital_id,
            Medicine.is_active == True,
            Medicine.selling_price == unit_price,
        ).limit(2).all()
        if len(by_selling_price) == 1:
            return by_selling_price[0][0]

    if item_type == "optical_product":
        by_purchase_price = db.query(OpticalProduct.name).filter(
            OpticalProduct.hospital_id == hospital_id,
            OpticalProduct.is_active == True,
            OpticalProduct.purchase_price == unit_price,
        ).limit(2).all()
        if len(by_purchase_price) == 1:
            return by_purchase_price[0][0]

        by_selling_price = db.query(OpticalProduct.name).filter(
            OpticalProduct.hospital_id == hospital_id,
            OpticalProduct.is_active == True,
            OpticalProduct.selling_price == unit_price,
        ).limit(2).all()
        if len(by_selling_price) == 1:
            return by_selling_price[0][0]

    return None


def _resolve_item_id(
    db: Session,
    item_type: str,
    item_id: str,
    item_name: Optional[str] = None,
    hospital_id: Optional[uuid.UUID] = None,
    unit_price: float = 0.0,
) -> uuid.UUID:
    """Resolve or auto-create a catalog item. Returns an existing UUID or creates a new catalog entry."""
    # Try to parse as UUID first
    parsed_id = None
    if item_id and item_id.strip():
        try:
            parsed_id = uuid.UUID(item_id)
        except (ValueError, AttributeError):
            pass

    lookup_name = (item_name or item_id or '').strip()

    if item_type == "medicine":
        if parsed_id:
            exists = db.query(Medicine.id).filter(Medicine.id == parsed_id).first()
            if exists:
                return parsed_id
        if lookup_name:
            match = db.query(Medicine.id).filter(func.lower(Medicine.name) == lookup_name.lower()).first()
            if match:
                return match[0]
        if parsed_id:
            return parsed_id
        # Auto-create a minimal medicine record so the PO can be saved
        if not lookup_name:
            raise ValueError(f"Cannot create medicine without a name: item_id={item_id}")
        new_med = Medicine(
            hospital_id=hospital_id,
            name=lookup_name,
            generic_name=lookup_name,
            unit_of_measure='units',
            selling_price=unit_price or 0,
            purchase_price=unit_price or 0,
            is_active=True,
        )
        db.add(new_med)
        db.flush()
        logger.info("Auto-created medicine '%s' for PO item", lookup_name)
        return new_med.id

    if item_type == "optical_product":
        if parsed_id:
            exists = db.query(OpticalProduct.id).filter(OpticalProduct.id == parsed_id).first()
            if exists:
                return parsed_id
        if lookup_name:
            q = db.query(OpticalProduct.id).filter(func.lower(OpticalProduct.name) == lookup_name.lower())
            if hospital_id:
                q = q.filter(OpticalProduct.hospital_id == hospital_id)
            match = q.first()
            if match:
                return match[0]
        if parsed_id:
            return parsed_id
        # Auto-create a minimal optical product record so the PO can be saved
        if not lookup_name:
            raise ValueError(f"Cannot create optical product without a name: item_id={item_id}")
        if not hospital_id:
            raise ValueError(f"Cannot auto-create optical product '{lookup_name}' without a hospital_id")
        new_prod = OpticalProduct(
            hospital_id=hospital_id,
            name=lookup_name,
            category='accessory',
            selling_price=unit_price or 0,
            purchase_price=unit_price or 0,
            is_active=True,
        )
        db.add(new_prod)
        db.flush()
        logger.info("Auto-created optical product '%s' for PO item", lookup_name)
        return new_prod.id

    if parsed_id:
        return parsed_id
    raise ValueError(f"Unknown item type '{item_type}': item_id={item_id}, item_name={item_name}")


def _generate_number(db: Session, prefix: str, model_class, number_field: str) -> str:
    """Generate the next sequential number like PO-20260311-0001."""
    today = date.today().strftime("%Y%m%d")
    pattern = f"{prefix}-{today}-%"
    col = getattr(model_class, number_field)
    last = (
        db.query(col)
        .filter(col.like(pattern))
        .order_by(col.desc())
        .first()
    )
    if last:
        seq = int(last[0].split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}-{today}-{seq:04d}"


def _get_medicine_batch_stock(db: Session, medicine_id: uuid.UUID) -> int:
    """Single source of truth for medicine stock: sum of active batch quantities."""
    total = db.query(func.coalesce(func.sum(MedicineBatch.quantity), 0)).filter(
        MedicineBatch.medicine_id == medicine_id,
        MedicineBatch.is_active == True,
    ).scalar() or 0
    return int(total)


def _apply_medicine_batch_delta(
    db: Session,
    medicine_id: uuid.UUID,
    delta: int,
    batch_id: Optional[uuid.UUID] = None,
) -> Optional[uuid.UUID]:
    """Apply stock delta to medicine batches and return affected batch id when deterministic."""
    if delta == 0:
        return batch_id

    # Adjust against an explicit batch when provided.
    if batch_id:
        batch = db.query(MedicineBatch).filter(
            MedicineBatch.id == batch_id,
            MedicineBatch.medicine_id == medicine_id,
            MedicineBatch.is_active == True,
        ).first()
        if not batch:
            raise ValueError("Specified batch not found for medicine")

        new_qty = (batch.quantity or 0) + delta
        if new_qty < 0:
            raise ValueError("Adjustment would result in negative batch stock")

        if delta > 0:
            batch.initial_quantity = (batch.initial_quantity or 0) + delta
        batch.quantity = new_qty
        return batch.id

    # No batch specified: positive deltas go to a system-managed adjustment batch.
    if delta > 0:
        batch_number = f"SYS-ADJ-{date.today().strftime('%Y%m%d')}"
        batch = db.query(MedicineBatch).filter(
            MedicineBatch.medicine_id == medicine_id,
            MedicineBatch.batch_number == batch_number,
        ).first()
        if batch:
            batch.quantity = (batch.quantity or 0) + delta
            batch.initial_quantity = (batch.initial_quantity or 0) + delta
            batch.is_active = True
        else:
            batch = MedicineBatch(
                medicine_id=medicine_id,
                batch_number=batch_number,
                mfg_date=date.today(),
                expiry_date=date.today() + timedelta(days=3650),
                initial_quantity=delta,
                quantity=delta,
                purchase_price=0,
                selling_price=0,
                is_active=True,
            )
            db.add(batch)
            db.flush()
        return batch.id

    # No batch specified: negative deltas are consumed FEFO across active batches.
    remaining = -delta
    batches = db.query(MedicineBatch).filter(
        MedicineBatch.medicine_id == medicine_id,
        MedicineBatch.is_active == True,
        MedicineBatch.quantity > 0,
    ).order_by(MedicineBatch.expiry_date.asc(), MedicineBatch.created_at.asc()).all()

    available = sum(int(b.quantity or 0) for b in batches)
    if available < remaining:
        raise ValueError("Insufficient stock across batches for adjustment")

    for b in batches:
        if remaining <= 0:
            break
        take = min(int(b.quantity or 0), remaining)
        b.quantity = int(b.quantity or 0) - take
        remaining -= take

    return None


def _get_optical_batch_stock(db: Session, product_id: uuid.UUID) -> int:
    """Single source of truth for optical product stock: sum of active batch quantities.

    Mirrors _get_medicine_batch_stock — kept as the ground truth so
    get_stock_level(), adjustments, and cycle counts never drift from what
    optical sales actually deduct from (OpticalBatch.quantity).
    """
    total = db.query(func.coalesce(func.sum(OpticalBatch.quantity), 0)).filter(
        OpticalBatch.product_id == product_id,
        OpticalBatch.is_active == True,
    ).scalar() or 0
    return int(total)


def _apply_optical_batch_delta(
    db: Session,
    product_id: uuid.UUID,
    delta: int,
    batch_id: Optional[uuid.UUID] = None,
) -> Optional[uuid.UUID]:
    """Apply stock delta to optical batches and return affected batch id when deterministic.

    Mirrors _apply_medicine_batch_delta. Without this, stock adjustments and cycle
    count reconciliation only wrote a StockMovement row and never touched
    OpticalBatch.quantity — the real, sellable stock was left completely unchanged.
    """
    if delta == 0:
        return batch_id

    if batch_id:
        batch = db.query(OpticalBatch).filter(
            OpticalBatch.id == batch_id,
            OpticalBatch.product_id == product_id,
            OpticalBatch.is_active == True,
        ).first()
        if not batch:
            raise ValueError("Specified batch not found for optical product")

        new_qty = (batch.quantity or 0) + delta
        if new_qty < 0:
            raise ValueError("Adjustment would result in negative batch stock")

        if delta > 0:
            batch.initial_quantity = (batch.initial_quantity or 0) + delta
        batch.quantity = new_qty
        return batch.id

    if delta > 0:
        batch_number = f"SYS-ADJ-{date.today().strftime('%Y%m%d')}"
        batch = db.query(OpticalBatch).filter(
            OpticalBatch.product_id == product_id,
            OpticalBatch.batch_number == batch_number,
        ).first()
        if batch:
            batch.quantity = (batch.quantity or 0) + delta
            batch.initial_quantity = (batch.initial_quantity or 0) + delta
            batch.is_active = True
        else:
            batch = OpticalBatch(
                product_id=product_id,
                batch_number=batch_number,
                mfg_date=date.today(),
                initial_quantity=delta,
                quantity=delta,
                purchase_price=0,
                selling_price=0,
                is_active=True,
            )
            db.add(batch)
            db.flush()
        return batch.id

    # No batch specified: negative deltas are consumed FEFO — non-expiring
    # batches (expiry_date NULL) are consumed last, matching the sale logic
    # in optical_service.py so adjustments and sales agree on ordering.
    remaining = -delta
    batches = db.query(OpticalBatch).filter(
        OpticalBatch.product_id == product_id,
        OpticalBatch.is_active == True,
        OpticalBatch.quantity > 0,
    ).order_by(OpticalBatch.expiry_date.is_(None), OpticalBatch.expiry_date.asc()).all()

    available = sum(int(b.quantity or 0) for b in batches)
    if available < remaining:
        raise ValueError("Insufficient stock across batches for adjustment")

    for b in batches:
        if remaining <= 0:
            break
        take = min(int(b.quantity or 0), remaining)
        b.quantity = int(b.quantity or 0) - take
        remaining -= take

    return None


def _paginate(total: int, page: int, limit: int) -> dict:
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": max(1, math.ceil(total / limit)),
    }


def _user_name(user) -> Optional[str]:
    if user is None:
        return None
    first = getattr(user, "first_name", "") or ""
    last = getattr(user, "last_name", "") or ""
    return f"{first} {last}".strip() or None


def _notify_hospital_users(
    db: Session,
    hospital_id: uuid.UUID,
    title: str,
    message: str,
    notification_type: str = "inventory",
    priority: str = "normal",
    reference_type: Optional[str] = None,
    reference_id: Optional[uuid.UUID] = None,
    role_names: Optional[list[str]] = None,
    extra_user_ids: Optional[list[uuid.UUID]] = None,
    exclude_user_ids: Optional[list[uuid.UUID]] = None,
) -> None:
    _notify_hospital_users_shared(
        db=db,
        hospital_id=hospital_id,
        title=title,
        message=message,
        notification_type=notification_type,
        priority=priority,
        reference_type=reference_type,
        reference_id=reference_id,
        role_names=role_names,
        extra_user_ids=extra_user_ids,
        exclude_user_ids=exclude_user_ids,
    )


# ═══════════════════════════════════════════════════════════════════════════
#  SUPPLIERS
# ═══════════════════════════════════════════════════════════════════════════

def generate_supplier_code(db: Session, hospital_id: uuid.UUID) -> str:
    """Next sequential supplier code for this hospital: "{HOSPITAL_CODE}SUP-001",
    "{HOSPITAL_CODE}SUP-002", ... (e.g. hospital code "QX" -> "QXSUP-001").
    Supplier codes are only unique per-hospital (see Supplier.__table_args__),
    so the sequence is scoped per hospital and restarts at 001 for each one."""
    hospital = db.query(Hospital.code).filter(Hospital.id == hospital_id).first()
    hospital_code = (hospital[0] if hospital and hospital[0] else "").upper()
    prefix = f"{hospital_code}SUP-"

    existing = db.query(Supplier.code).filter(
        Supplier.hospital_id == hospital_id,
        Supplier.code.like(f"{prefix}%"),
    ).all()
    max_seq = 0
    for (code,) in existing:
        suffix = code[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))

    code = f"{prefix}{max_seq + 1:03d}"
    # Collision guard (e.g. two suppliers created back-to-back) — fall back to
    # incrementing further rather than failing outright on the rare race.
    while db.query(Supplier.id).filter(Supplier.hospital_id == hospital_id, Supplier.code == code).first():
        max_seq += 1
        code = f"{prefix}{max_seq + 1:03d}"
    return code


def create_supplier(db: Session, data: SupplierCreate, hospital_id: uuid.UUID) -> Supplier:
    supplier = Supplier(
        hospital_id=hospital_id,
        name=data.name,
        code=generate_supplier_code(db, hospital_id),
        contact_person=data.contact_person,
        phone=data.phone,
        email=data.email,
        address=data.address,
        tax_id=data.tax_id,
        payment_terms=data.payment_terms,
        lead_time_days=data.lead_time_days,
        rating=data.rating,
        product_categories=data.product_categories or [],
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    logger.info("Supplier created: %s (code=%s)", supplier.name, supplier.code)
    return supplier


def list_suppliers(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 10, search: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> dict:
    q = db.query(Supplier).filter(Supplier.hospital_id == hospital_id)
    if is_active is not None:
        q = q.filter(Supplier.is_active == is_active)
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            Supplier.name.ilike(term),
            Supplier.code.ilike(term),
            Supplier.contact_person.ilike(term),
        ))
    total = q.count()
    suppliers = q.order_by(Supplier.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {**_paginate(total, page, limit), "data": suppliers}


def get_supplier(db: Session, supplier_id: uuid.UUID) -> Optional[Supplier]:
    return db.query(Supplier).filter(Supplier.id == supplier_id).first()


def update_supplier(
    db: Session, supplier_id: uuid.UUID, data: SupplierUpdate,
) -> Optional[Supplier]:
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(supplier, k, v)
    db.commit()
    db.refresh(supplier)
    logger.info("Supplier updated: %s", supplier.name)
    return supplier


def delete_supplier(db: Session, supplier_id: uuid.UUID) -> bool:
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        return False
    supplier.is_active = False
    db.commit()
    logger.info("Supplier deactivated: %s", supplier.name)
    return True


# ═══════════════════════════════════════════════════════════════════════════
#  PURCHASE ORDERS
# ═══════════════════════════════════════════════════════════════════════════

def create_purchase_order(
    db: Session, data: PurchaseOrderCreate,
    hospital_id: uuid.UUID, user_id: uuid.UUID,
) -> PurchaseOrder:
    po_number = _generate_number(db, "PO", PurchaseOrder, "po_number")
    total = sum(item.total_price for item in data.items)

    po = PurchaseOrder(
        hospital_id=hospital_id,
        po_number=po_number,
        supplier_id=uuid.UUID(data.supplier_id),
        order_date=data.order_date,
        expected_delivery_date=data.expected_delivery_date,
        status=data.status or "draft",
        total_amount=total,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(po)
    db.flush()

    for item in data.items:
        po_item = PurchaseOrderItem(
            purchase_order_id=po.id,
            item_type=item.item_type,
            item_id=_resolve_item_id(
                db, item.item_type, item.item_id,
                getattr(item, "item_name", None),
                hospital_id=hospital_id,
                unit_price=float(item.unit_price),
            ),
            quantity_ordered=item.quantity_ordered,
            unit_price=item.unit_price,
            total_price=item.total_price,
        )
        db.add(po_item)

    db.commit()
    db.refresh(po)
    try:
        _notify_hospital_users(
            db,
            hospital_id,
            title="New Purchase Order Created",
            message=f"Purchase Order {po.po_number} has been created and is pending approval.",
            reference_type="purchase_order",
            reference_id=po.id,
            role_names=["super_admin", "admin", "inventory_manager"],
            exclude_user_ids=[user_id],
        )
    except Exception:
        logger.warning("Failed to send purchase order creation notification", exc_info=True)
    logger.info("Purchase order created: %s (total=%.2f)", po.po_number, total)
    return po


def list_purchase_orders(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 10,
    status: Optional[str] = None, supplier_id: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
    payment_status: Optional[str] = None,
    sort_by: Optional[str] = None, sort_order: str = "desc",
) -> dict:
    # payment_status (BRD 5.7) isn't a stored column — it's derived from
    # payments recorded against the PO (see _po_payment_status). A correlated
    # scalar subquery lets both the WHERE filter and ORDER BY operate at the
    # SQL level (unlike PrescriptionList's "Billed Tablets", which sorts only
    # within the current page — PO volumes are small enough per hospital that
    # full server-side filter/sort is the right call here).
    paid_subq = (
        db.query(func.coalesce(func.sum(PurchaseOrderPayment.amount), 0))
        .filter(PurchaseOrderPayment.purchase_order_id == PurchaseOrder.id)
        .correlate(PurchaseOrder)
        .scalar_subquery()
    )
    payment_status_expr = case(
        (paid_subq <= 0, "incomplete"),
        (paid_subq >= PurchaseOrder.total_amount, "completed"),
        else_="partial",
    )

    q = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier), joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.hospital_id == hospital_id)
    )
    if status:
        # Comma-separated statuses supported so the GRN form can list POs that
        # are 'approved' OR 'partially_received' — a partially received PO must
        # stay selectable for its balance GRN (BUG-31).
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if len(statuses) == 1:
            q = q.filter(PurchaseOrder.status == statuses[0])
        elif statuses:
            q = q.filter(PurchaseOrder.status.in_(statuses))
    if supplier_id:
        q = q.filter(PurchaseOrder.supplier_id == uuid.UUID(supplier_id))
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            PurchaseOrder.po_number.ilike(term),
        ))
    if date_from:
        q = q.filter(PurchaseOrder.order_date >= date_from)
    if date_to:
        q = q.filter(PurchaseOrder.order_date <= date_to)
    if payment_status:
        q = q.filter(payment_status_expr == payment_status)
    total = q.count()
    if sort_by == "payment_status":
        order_col = payment_status_expr
    elif sort_by == "total_amount":
        order_col = PurchaseOrder.total_amount
    elif sort_by == "order_date":
        order_col = PurchaseOrder.order_date
    else:
        order_col = PurchaseOrder.created_at
    q = q.order_by(order_col.asc() if sort_order == "asc" else order_col.desc())
    orders = q.offset((page - 1) * limit).limit(limit).all()
    return {**_paginate(total, page, limit), "data": orders}


def get_purchase_order(db: Session, po_id: uuid.UUID) -> Optional[PurchaseOrder]:
    return (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            joinedload(PurchaseOrder.items),
            joinedload(PurchaseOrder.creator),
            joinedload(PurchaseOrder.approver),
        )
        .filter(PurchaseOrder.id == po_id)
        .first()
    )


def update_purchase_order(
    db: Session, po_id: uuid.UUID, data: PurchaseOrderUpdate,
    approver_id: Optional[uuid.UUID] = None,
) -> Optional[PurchaseOrder]:
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        return None
    update_data = data.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] == "approved" and approver_id:
        po.approved_by = approver_id
    for k, v in update_data.items():
        setattr(po, k, v)
    db.commit()
    db.refresh(po)
    logger.info("Purchase order updated: %s → %s", po.po_number, po.status)
    return po


def _po_payment_status(total_paid: float, po_total: float) -> str:
    """Completed/Incomplete/Partial per BRD 5.7, mirroring create_po_payment's
    own "already_paid vs total_amount" comparison used elsewhere in this file."""
    if total_paid <= 0:
        return "incomplete"
    if total_paid >= po_total:
        return "completed"
    return "partial"


def _format_po_response(po: PurchaseOrder, db: Session) -> dict:
    """Build a PurchaseOrderResponse-compatible dict."""
    total_paid = float(db.query(func.coalesce(func.sum(PurchaseOrderPayment.amount), 0)).filter(
        PurchaseOrderPayment.purchase_order_id == po.id,
    ).scalar() or 0)
    items = []
    for it in po.items:
        items.append({
            "id": str(it.id),
            "item_type": it.item_type,
            "item_id": str(it.item_id),
            "item_name": _resolve_item_name_with_fallback(
                db,
                it.item_type,
                it.item_id,
                po.hospital_id,
                float(it.unit_price),
            ),
            "quantity_ordered": it.quantity_ordered,
            "quantity_received": it.quantity_received or 0,
            "unit_price": float(it.unit_price),
            "total_price": float(it.total_price),
        })
    return {
        "id": str(po.id),
        "po_number": po.po_number,
        "supplier_id": str(po.supplier_id),
        "supplier_name": po.supplier.name if po.supplier else None,
        "order_date": po.order_date,
        "expected_delivery_date": po.expected_delivery_date,
        "status": po.status,
        "total_amount": float(po.total_amount or 0),
        "tax_amount": float(po.tax_amount or 0),
        "notes": po.notes,
        "payment_status": _po_payment_status(total_paid, float(po.total_amount or 0)),
        "total_paid": total_paid,
        "items": items,
        "created_by_name": _user_name(po.creator) if hasattr(po, "creator") else None,
        "approved_by_name": _user_name(po.approver) if hasattr(po, "approver") else None,
        "created_at": po.created_at,
        "updated_at": po.updated_at,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  PURCHASE ORDER PAYMENTS
# ═══════════════════════════════════════════════════════════════════════════

def list_payment_modes(db: Session, hospital_id: uuid.UUID) -> list:
    return (
        db.query(PaymentMode)
        .filter(PaymentMode.hospital_id == hospital_id, PaymentMode.is_active == True)
        .order_by(PaymentMode.name)
        .all()
    )


def create_payment_mode(db: Session, hospital_id: uuid.UUID, name: str) -> PaymentMode:
    name = name.strip()
    existing = (
        db.query(PaymentMode)
        .filter(PaymentMode.hospital_id == hospital_id, func.lower(PaymentMode.name) == name.lower())
        .first()
    )
    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.commit()
            db.refresh(existing)
        return existing
    mode = PaymentMode(hospital_id=hospital_id, name=name)
    db.add(mode)
    db.commit()
    db.refresh(mode)
    return mode


def _format_po_payment_response(payment: PurchaseOrderPayment) -> dict:
    po = payment.purchase_order
    return {
        "id": str(payment.id),
        "purchase_order_id": str(payment.purchase_order_id),
        "po_number": po.po_number if po else None,
        "supplier_name": po.supplier.name if po and po.supplier else None,
        "payment_number": payment.payment_number,
        "invoice_number": payment.invoice_number,
        "amount": float(payment.amount or 0),
        "payment_mode_id": str(payment.payment_mode_id),
        "mode_name": payment.payment_mode.name if payment.payment_mode else None,
        "payment_date": payment.payment_date,
        "reference_note": payment.reference_note,
        "recorded_by_name": _user_name(payment.recorder),
        "created_at": payment.created_at,
    }


def create_po_payment(
    db: Session, po_id: uuid.UUID, hospital_id: uuid.UUID,
    data: PurchaseOrderPaymentCreate, user_id: uuid.UUID,
) -> dict:
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier))
        .filter(PurchaseOrder.id == po_id, PurchaseOrder.hospital_id == hospital_id)
        .first()
    )
    if not po:
        raise ValueError("Purchase order not found")

    mode = (
        db.query(PaymentMode)
        .filter(PaymentMode.id == uuid.UUID(data.payment_mode_id), PaymentMode.hospital_id == hospital_id)
        .first()
    )
    if not mode:
        raise ValueError("Invalid payment mode")

    already_paid = db.query(func.coalesce(func.sum(PurchaseOrderPayment.amount), 0)).filter(
        PurchaseOrderPayment.purchase_order_id == po_id,
    ).scalar() or 0
    if float(already_paid) + float(data.amount) > float(po.total_amount or 0) + 0.01:
        raise ValueError(
            f"Payment of ₹{data.amount} would exceed the PO total of ₹{float(po.total_amount or 0):.2f} "
            f"(already paid ₹{float(already_paid):.2f})"
        )

    payment_number = _generate_number(db, "POPAY", PurchaseOrderPayment, "payment_number")
    payment = PurchaseOrderPayment(
        hospital_id=hospital_id,
        purchase_order_id=po_id,
        payment_number=payment_number,
        invoice_number=data.invoice_number,
        amount=data.amount,
        payment_mode_id=mode.id,
        payment_date=data.payment_date or date.today(),
        reference_note=data.reference_note,
        recorded_by=user_id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    logger.info("PO payment recorded: %s against %s (amount=%.2f)", payment_number, po.po_number, float(data.amount))
    return _format_po_payment_response(payment)


def list_po_payments(db: Session, po_id: uuid.UUID, hospital_id: uuid.UUID) -> dict:
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == po_id, PurchaseOrder.hospital_id == hospital_id,
    ).first()
    if not po:
        raise ValueError("Purchase order not found")

    payments = (
        db.query(PurchaseOrderPayment)
        .options(joinedload(PurchaseOrderPayment.purchase_order).joinedload(PurchaseOrder.supplier),
                 joinedload(PurchaseOrderPayment.payment_mode),
                 joinedload(PurchaseOrderPayment.recorder))
        .filter(PurchaseOrderPayment.purchase_order_id == po_id)
        .order_by(PurchaseOrderPayment.created_at.desc())
        .all()
    )
    total_paid = sum(float(p.amount or 0) for p in payments)
    po_total = float(po.total_amount or 0)
    return {
        "po_total": po_total,
        "total_paid": total_paid,
        "balance": max(po_total - total_paid, 0),
        "payments": [_format_po_payment_response(p) for p in payments],
    }


# ═══════════════════════════════════════════════════════════════════════════
#  GOODS RECEIPT NOTES
# ═══════════════════════════════════════════════════════════════════════════

def create_grn(
    db: Session, data: GRNCreate,
    hospital_id: uuid.UUID, user_id: uuid.UUID,
) -> GoodsReceiptNote:
    grn_number = _generate_number(db, "GRN", GoodsReceiptNote, "grn_number")
    total = sum(item.total_price for item in data.items)

    grn = GoodsReceiptNote(
        hospital_id=hospital_id,
        grn_number=grn_number,
        purchase_order_id=uuid.UUID(data.purchase_order_id) if data.purchase_order_id else None,
        supplier_id=uuid.UUID(data.supplier_id),
        receipt_date=data.receipt_date,
        invoice_number=data.invoice_number,
        invoice_date=data.invoice_date,
        total_amount=total,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(grn)
    db.flush()

    for item in data.items:
        accepted = item.quantity_accepted if item.quantity_accepted is not None else item.quantity_received
        grn_item = GRNItem(
            grn_id=grn.id,
            item_type=item.item_type,
            item_id=_resolve_item_id(
                db, item.item_type, item.item_id,
                getattr(item, "item_name", None),
                hospital_id=hospital_id,
                unit_price=float(item.unit_price),
            ),
            batch_number=item.batch_number,
            manufactured_date=item.manufactured_date,
            expiry_date=item.expiry_date,
            quantity_received=item.quantity_received,
            quantity_accepted=accepted,
            quantity_rejected=item.quantity_rejected,
            unit_price=item.unit_price,
            total_price=item.total_price,
            rejection_reason=item.rejection_reason,
        )
        db.add(grn_item)

    db.commit()
    db.refresh(grn)
    try:
        _notify_hospital_users(
            db,
            hospital_id,
            title="Goods Receipt Note Created",
            message=f"GRN {grn.grn_number} has been recorded and is pending review.",
            reference_type="grn",
            reference_id=grn.id,
            role_names=["super_admin", "admin", "inventory_manager", "pharmacist"],
            exclude_user_ids=[user_id],
        )
    except Exception:
        logger.warning("Failed to send GRN creation notification", exc_info=True)
    logger.info("GRN created: %s (total=%.2f)", grn.grn_number, total)
    return grn


def list_grns(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 10,
    status: Optional[str] = None, supplier_id: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
) -> dict:
    q = (
        db.query(GoodsReceiptNote)
        .options(joinedload(GoodsReceiptNote.supplier), joinedload(GoodsReceiptNote.items))
        .filter(GoodsReceiptNote.hospital_id == hospital_id)
    )
    if status:
        q = q.filter(GoodsReceiptNote.status == status)
    if supplier_id:
        q = q.filter(GoodsReceiptNote.supplier_id == uuid.UUID(supplier_id))
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            GoodsReceiptNote.grn_number.ilike(term),
            GoodsReceiptNote.invoice_number.ilike(term),
        ))
    if date_from:
        q = q.filter(GoodsReceiptNote.receipt_date >= date_from)
    if date_to:
        q = q.filter(GoodsReceiptNote.receipt_date <= date_to)
    total = q.count()
    grns = q.order_by(GoodsReceiptNote.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {**_paginate(total, page, limit), "data": grns}


def get_grn(db: Session, grn_id: uuid.UUID) -> Optional[GoodsReceiptNote]:
    return (
        db.query(GoodsReceiptNote)
        .options(
            joinedload(GoodsReceiptNote.supplier),
            joinedload(GoodsReceiptNote.items),
            joinedload(GoodsReceiptNote.purchase_order),
            joinedload(GoodsReceiptNote.creator),
            joinedload(GoodsReceiptNote.verifier),
        )
        .filter(GoodsReceiptNote.id == grn_id)
        .first()
    )


def update_grn(
    db: Session, grn_id: uuid.UUID, data: GRNUpdate,
    verifier_id: Optional[uuid.UUID] = None,
) -> Optional[GoodsReceiptNote]:
    grn = db.query(GoodsReceiptNote).filter(GoodsReceiptNote.id == grn_id).first()
    if not grn:
        return None
    update_data = data.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] in ("verified", "accepted") and verifier_id:
        grn.verified_by = verifier_id
    for k, v in update_data.items():
        setattr(grn, k, v)

    # Stock mutation (and the PO receipt-status rollup it triggers) must commit
    # in the SAME transaction as the status flip to "accepted". Previously the
    # status change committed on its own first, so a failure inside stock
    # processing (e.g. a batch write violating a DB constraint) left the GRN
    # permanently stuck at status="accepted" with no stock actually received —
    # and no way to retry, since update_grn_item_batch only allows edits while
    # the GRN is still "pending". Letting an exception here propagate now rolls
    # back the status change too, instead of leaving a corrupted half-state.
    if grn.status == "accepted":
        _process_grn_acceptance(db, grn)

    db.commit()
    db.refresh(grn)
    logger.info("GRN updated: %s → %s", grn.grn_number, grn.status)

    try:
        _notify_hospital_users(
            db,
            grn.hospital_id,
            title="Goods Receipt Updated",
            message=f"{grn.grn_number} status changed to {grn.status}",
            reference_type="grn",
            reference_id=grn.id,
            role_names=["super_admin", "admin", "inventory_manager", "pharmacist"],
            extra_user_ids=[verifier_id] if verifier_id else None,
        )
    except Exception:
        logger.warning("Failed to send GRN status update notification", exc_info=True)

    return grn


def update_grn_item_batch(
    db: Session,
    grn_id: uuid.UUID,
    item_id: uuid.UUID,
    data: GRNItemBatchUpdate,
    current_user: Optional[User] = None,
) -> GRNItem:
    """Correct batch_number/manufactured_date/expiry_date/quantity_received/
    discrepancy_notes on a received line item.

    Editable regardless of GRN status (including after acceptance). While
    'pending'/'verified'/'rejected', no stock has been posted yet, so this is
    a plain field edit. Once 'accepted', _process_grn_acceptance has already
    created MedicineBatch/OpticalBatch and StockMovement rows from the item's
    original batch identity (batch_number/mfg_date/expiry_date) and quantity
    — _reconcile_grn_item_stock_correction() below applies the delta (moving
    quantity between batch identities and/or adjusting quantity) so the
    already-posted stock stays consistent with the corrected GRN record,
    instead of silently desyncing from it.
    """
    grn = db.query(GoodsReceiptNote).filter(GoodsReceiptNote.id == grn_id).first()
    if not grn:
        raise ValueError("GRN not found")

    item = db.query(GRNItem).filter(
        GRNItem.id == item_id,
        GRNItem.grn_id == grn_id,
    ).first()
    if not item:
        raise ValueError("GRN item not found")

    update_data = data.model_dump(exclude_unset=True)
    old_values = {k: (str(getattr(item, k)) if getattr(item, k) is not None else None) for k in update_data}

    # Snapshot the batch identity/quantity as posted to stock (only meaningful
    # if this GRN has already been accepted) BEFORE mutating the item.
    was_accepted = grn.status == "accepted"
    old_batch_number = item.batch_number
    old_mfg_date = item.manufactured_date
    old_expiry_date = item.expiry_date
    old_quantity_received = item.quantity_received or 0
    old_posted_qty = item.quantity_accepted if item.quantity_accepted is not None else old_quantity_received
    # This endpoint doesn't expose quantity_accepted directly — quantity_received
    # is what's being corrected. When nothing was ever separately rejected
    # (quantity_accepted == quantity_received, true for every GRN created via
    # the normal flow, which defaults quantity_accepted to quantity_received),
    # keep them in lockstep so a quantity_received correction actually changes
    # what's treated as posted. If quantity_accepted had genuinely diverged
    # (a deliberate partial-reject), leave it alone — the correction here is
    # about batch/received-qty bookkeeping, not re-litigating that decision.
    accepted_was_in_lockstep = old_posted_qty == old_quantity_received

    for k, v in update_data.items():
        setattr(item, k, v)

    if (
        was_accepted
        and accepted_was_in_lockstep
        and "quantity_received" in update_data
    ):
        item.quantity_accepted = item.quantity_received

    if was_accepted and item.item_type in ("medicine", "optical_product"):
        _reconcile_grn_item_stock_correction(
            db, grn, item,
            old_batch_number=old_batch_number,
            old_mfg_date=old_mfg_date,
            old_expiry_date=old_expiry_date,
            old_posted_qty=old_posted_qty,
        )

    db.commit()
    db.refresh(item)
    logger.info("GRN item batch details updated: %s (item=%s)", grn.grn_number, item_id)

    if current_user and update_data:
        from ..core.audit_logger import AuditLogger, AuditAction
        new_values = {k: (str(v) if v is not None else None) for k, v in update_data.items()}
        AuditLogger.log(
            action=AuditAction.INVENTORY_ADJUST,
            user=current_user,
            tenant=None,
            resource_type="grn_item",
            resource_id=item.id,
            old_values=old_values,
            new_values=new_values,
            metadata={"grn_number": grn.grn_number, "corrected_after_acceptance": was_accepted},
        )

    return item


def _reconcile_grn_item_stock_correction(
    db: Session,
    grn: GoodsReceiptNote,
    item: GRNItem,
    old_batch_number: Optional[str],
    old_mfg_date,
    old_expiry_date,
    old_posted_qty: int,
) -> None:
    """Keep MedicineBatch/OpticalBatch + the stock ledger in sync when a GRN
    item is edited AFTER acceptance (stock already posted for its original
    batch identity/quantity). Moves quantity from the old batch identity to
    the new one (a no-op if identity didn't change) and posts a single
    compensating StockMovement for the net item-level quantity change, if any.
    Raises ValueError instead of allowing a batch to go negative — a
    correction can't remove more than is still actually in stock (e.g. if
    some of it was already dispensed/sold since the original acceptance).
    """
    new_posted_qty = item.quantity_accepted if item.quantity_accepted is not None else (item.quantity_received or 0)
    identity_changed = (item.batch_number, item.manufactured_date, item.expiry_date) != (
        old_batch_number, old_mfg_date, old_expiry_date,
    )
    if not identity_changed and new_posted_qty == old_posted_qty:
        return  # nothing was actually posted differently

    is_medicine = item.item_type == "medicine"
    BatchModel = MedicineBatch if is_medicine else OpticalBatch
    key_field = "medicine_id" if is_medicine else "product_id"

    def _find_batch(batch_number, mfg_date, expiry_date):
        return db.query(BatchModel).filter(
            getattr(BatchModel, key_field) == item.item_id,
            BatchModel.batch_number == batch_number,
            BatchModel.mfg_date == mfg_date,
            BatchModel.expiry_date == expiry_date,
        ).first()

    if identity_changed:
        old_batch = _find_batch(old_batch_number, old_mfg_date, old_expiry_date)
        if old_batch and old_posted_qty:
            if old_batch.quantity - old_posted_qty < 0:
                raise ValueError(
                    f"Cannot correct this item's batch — only {old_batch.quantity} of batch "
                    f"'{old_batch_number}' remains in stock (some has already been dispensed/sold), "
                    f"less than the {old_posted_qty} this GRN originally contributed."
                )
            old_batch.quantity -= old_posted_qty
            old_batch.initial_quantity -= old_posted_qty

        new_batch = _find_batch(item.batch_number, item.manufactured_date, item.expiry_date)
        if new_batch:
            new_batch.quantity += new_posted_qty
            new_batch.initial_quantity += new_posted_qty
        elif new_posted_qty:
            new_batch = BatchModel(
                **{key_field: item.item_id},
                batch_number=item.batch_number or f"GRN-{grn.id.hex[:8]}",
                mfg_date=item.manufactured_date,
                expiry_date=item.expiry_date,
                initial_quantity=new_posted_qty,
                quantity=new_posted_qty,
                purchase_price=float(item.unit_price),
                selling_price=float(item.unit_price),
                is_active=True,
            )
            db.add(new_batch)
    else:
        # Same batch identity — just a quantity correction.
        batch = _find_batch(item.batch_number, item.manufactured_date, item.expiry_date)
        delta = new_posted_qty - old_posted_qty
        if batch:
            if batch.quantity + delta < 0:
                raise ValueError(
                    f"Cannot reduce quantity below what's already in stock — only {batch.quantity} of "
                    f"batch '{item.batch_number}' remains (some has already been dispensed/sold)."
                )
            batch.quantity += delta
            batch.initial_quantity += delta
        elif delta > 0:
            batch = BatchModel(
                **{key_field: item.item_id},
                batch_number=item.batch_number or f"GRN-{grn.id.hex[:8]}",
                mfg_date=item.manufactured_date,
                expiry_date=item.expiry_date,
                initial_quantity=delta,
                quantity=delta,
                purchase_price=float(item.unit_price),
                selling_price=float(item.unit_price),
                is_active=True,
            )
            db.add(batch)
    db.flush()

    net_delta = new_posted_qty - old_posted_qty
    if net_delta != 0:
        balance_after = (
            _get_medicine_batch_stock(db, item.item_id) if is_medicine
            else _get_optical_batch_stock(db, item.item_id)
        )
        db.add(StockMovement(
            hospital_id=grn.hospital_id,
            item_type=item.item_type,
            item_id=item.item_id,
            movement_type="adjustment",
            reference_type="grn",
            reference_id=grn.id,
            quantity=net_delta,
            balance_after=balance_after,
            unit_cost=float(item.unit_price),
            notes=f"GRN {grn.grn_number} corrected after acceptance",
            performed_by=grn.verified_by,
        ))

        # Keep the PO's received rollup / receipt status in step with the correction.
        if grn.purchase_order_id:
            po_item = (
                db.query(PurchaseOrderItem)
                .filter(
                    PurchaseOrderItem.purchase_order_id == grn.purchase_order_id,
                    PurchaseOrderItem.item_id == item.item_id,
                    PurchaseOrderItem.item_type == item.item_type,
                )
                .first()
            )
            if po_item:
                po_item.quantity_received = max(0, (po_item.quantity_received or 0) + net_delta)
            _update_po_receipt_status(db, grn.purchase_order_id)


def _process_grn_acceptance(db: Session, grn: GoodsReceiptNote):
    """On GRN acceptance, record stock_in movements, update PO item received qty, and create medicine batches."""
    grn_with_items = (
        db.query(GoodsReceiptNote)
        .options(joinedload(GoodsReceiptNote.items))
        .filter(GoodsReceiptNote.id == grn.id)
        .first()
    )
    if not grn_with_items:
        return

    for item in grn_with_items.items:
        accepted = item.quantity_accepted or item.quantity_received
        if accepted <= 0:
            continue

        # Create or update the batch FIRST, then compute balance_after from a fresh
        # sum of real batch quantities — mirrors dispensing_service.py's pattern.
        # The previous approach computed balance_after from the last StockMovement's
        # balance_after + accepted, a shadow running total that could silently drift
        # from the real batch-quantity total (the only number sales/dispensing/low-stock
        # actually read), permanently corrupting the audit trail once it diverged.
        if item.item_type == "medicine":
            from ..models.pharmacy import MedicineBatch

            batch = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == item.item_id,
                MedicineBatch.batch_number == item.batch_number,
                MedicineBatch.mfg_date == item.manufactured_date,
                MedicineBatch.expiry_date == item.expiry_date,
            ).first()

            if batch:
                # Update existing batch
                batch.quantity += accepted
                batch.initial_quantity += accepted
            else:
                # Create new batch
                batch = MedicineBatch(
                    medicine_id=item.item_id,
                    batch_number=item.batch_number or f"GRN-{grn.id.hex[:8]}",
                    mfg_date=item.manufactured_date,
                    expiry_date=item.expiry_date,
                    initial_quantity=accepted,
                    quantity=accepted,
                    purchase_price=float(item.unit_price),
                    selling_price=float(item.unit_price),
                    is_active=True,
                )
                db.add(batch)
            db.flush()
            balance_after = _get_medicine_batch_stock(db, item.item_id)
        elif item.item_type == "optical_product":
            batch = db.query(OpticalBatch).filter(
                OpticalBatch.product_id == item.item_id,
                OpticalBatch.batch_number == item.batch_number,
                OpticalBatch.mfg_date == item.manufactured_date,
                OpticalBatch.expiry_date == item.expiry_date,
            ).first()

            if batch:
                batch.quantity += accepted
                batch.initial_quantity += accepted
            else:
                # expiry_date is nullable on GRNItem already — passes through as
                # None for non-expiring categories (frames, solutions, accessories).
                batch = OpticalBatch(
                    product_id=item.item_id,
                    batch_number=item.batch_number or f"GRN-{grn.id.hex[:8]}",
                    mfg_date=item.manufactured_date,
                    expiry_date=item.expiry_date,
                    initial_quantity=accepted,
                    quantity=accepted,
                    purchase_price=float(item.unit_price),
                    selling_price=float(item.unit_price),
                    is_active=True,
                )
                db.add(batch)
            db.flush()
            balance_after = _get_optical_batch_stock(db, item.item_id)
        else:
            last_movement = (
                db.query(StockMovement)
                .filter(
                    StockMovement.hospital_id == grn.hospital_id,
                    StockMovement.item_type == item.item_type,
                    StockMovement.item_id == item.item_id,
                )
                .order_by(StockMovement.created_at.desc())
                .first()
            )
            balance_after = (last_movement.balance_after if last_movement else 0) + accepted

        movement = StockMovement(
            hospital_id=grn.hospital_id,
            item_type=item.item_type,
            item_id=item.item_id,
            movement_type="stock_in",
            reference_type="grn",
            reference_id=grn.id,
            quantity=accepted,
            balance_after=balance_after,
            unit_cost=float(item.unit_price),
            notes=f"GRN {grn.grn_number} accepted",
            performed_by=grn.verified_by,
        )
        db.add(movement)

        # Update PO item received quantity if this GRN links to a PO
        if grn.purchase_order_id:
            po_item = (
                db.query(PurchaseOrderItem)
                .filter(
                    PurchaseOrderItem.purchase_order_id == grn.purchase_order_id,
                    PurchaseOrderItem.item_id == item.item_id,
                    PurchaseOrderItem.item_type == item.item_type,
                )
                .first()
            )
            if po_item:
                po_item.quantity_received = (po_item.quantity_received or 0) + accepted

    db.flush()

    # Update PO status if all items received
    if grn.purchase_order_id:
        _update_po_receipt_status(db, grn.purchase_order_id)


def _update_po_receipt_status(db: Session, po_id: uuid.UUID):
    """Check all PO items and update PO status to received/partially_received."""
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po or po.status == "cancelled":
        return
    all_received = all(
        (it.quantity_received or 0) >= it.quantity_ordered for it in po.items
    )
    any_received = any((it.quantity_received or 0) > 0 for it in po.items)
    if all_received:
        po.status = "received"
    elif any_received:
        po.status = "partially_received"
    db.flush()


def _format_grn_response(grn: GoodsReceiptNote, db: Session) -> dict:
    items = []
    for it in grn.items:
        items.append({
            "id": str(it.id),
            "item_type": it.item_type,
            "item_id": str(it.item_id),
            "item_name": _resolve_item_name_with_fallback(
                db,
                it.item_type,
                it.item_id,
                grn.hospital_id,
                float(it.unit_price),
            ),
            "batch_number": it.batch_number,
            "manufactured_date": it.manufactured_date,
            "expiry_date": it.expiry_date,
            "quantity_received": it.quantity_received,
            "quantity_accepted": it.quantity_accepted,
            "quantity_rejected": it.quantity_rejected or 0,
            "unit_price": float(it.unit_price),
            "total_price": float(it.total_price),
            "rejection_reason": it.rejection_reason,
            "discrepancy_notes": it.discrepancy_notes,
        })
    return {
        "id": str(grn.id),
        "grn_number": grn.grn_number,
        "purchase_order_id": str(grn.purchase_order_id) if grn.purchase_order_id else None,
        "po_number": grn.purchase_order.po_number if grn.purchase_order else None,
        "supplier_id": str(grn.supplier_id),
        "supplier_name": grn.supplier.name if grn.supplier else None,
        "receipt_date": grn.receipt_date,
        "invoice_number": grn.invoice_number,
        "invoice_date": grn.invoice_date,
        "total_amount": float(grn.total_amount or 0),
        "status": grn.status,
        "notes": grn.notes,
        "items": items,
        "created_by_name": _user_name(grn.creator) if hasattr(grn, "creator") else None,
        "verified_by_name": _user_name(grn.verifier) if hasattr(grn, "verifier") else None,
        "created_at": grn.created_at,
        "updated_at": grn.updated_at,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  STOCK MOVEMENTS
# ═══════════════════════════════════════════════════════════════════════════

def list_stock_movements(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 10,
    item_type: Optional[str] = None, item_id: Optional[str] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
) -> dict:
    q = db.query(StockMovement).filter(StockMovement.hospital_id == hospital_id)
    if item_type:
        q = q.filter(StockMovement.item_type == item_type)
    if item_id:
        q = q.filter(StockMovement.item_id == uuid.UUID(item_id))
    if movement_type:
        q = q.filter(StockMovement.movement_type == movement_type)
    if date_from:
        q = q.filter(func.date(StockMovement.created_at) >= date_from)
    if date_to:
        q = q.filter(func.date(StockMovement.created_at) <= date_to)
    total = q.count()
    movements = (
        q.options(joinedload(StockMovement.performer))
        .order_by(StockMovement.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {**_paginate(total, page, limit), "data": movements}


def get_stock_movement_summary(
    db: Session, hospital_id: uuid.UUID,
    item_type: Optional[str] = None, item_id: Optional[str] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
) -> dict:
    """Aggregate stock-in / stock-out totals across ALL rows matching the given
    filters — not just the current page. The Stock Movements screen's summary
    cards previously summed only the 10-50 rows on the current page, which
    silently understated (or overstated, depending on sort) the true totals
    the moment there was more than one page of results.
    """
    q = db.query(
        func.coalesce(func.sum(case((StockMovement.quantity > 0, StockMovement.quantity), else_=0)), 0),
        func.coalesce(func.sum(case((StockMovement.quantity < 0, -StockMovement.quantity), else_=0)), 0),
        func.count(StockMovement.id),
    ).filter(StockMovement.hospital_id == hospital_id)
    if item_type:
        q = q.filter(StockMovement.item_type == item_type)
    if item_id:
        q = q.filter(StockMovement.item_id == uuid.UUID(item_id))
    if movement_type:
        q = q.filter(StockMovement.movement_type == movement_type)
    if date_from:
        q = q.filter(func.date(StockMovement.created_at) >= date_from)
    if date_to:
        q = q.filter(func.date(StockMovement.created_at) <= date_to)

    total_in, total_out, count = q.first()
    total_in = int(total_in or 0)
    total_out = int(total_out or 0)
    return {
        "total_in": total_in,
        "total_out": total_out,
        "net_balance": total_in - total_out,
        "total_movements": int(count or 0),
    }


def _format_movement_response(m: StockMovement, db: Session) -> dict:
    return {
        "id": str(m.id),
        "item_type": m.item_type,
        "item_id": str(m.item_id),
        "item_name": _resolve_item_name(db, m.item_type, m.item_id),
        "batch_id": str(m.batch_id) if m.batch_id else None,
        "batch_number": _resolve_batch_number(db, m.item_type, m.batch_id),
        "movement_type": m.movement_type,
        "reference_type": m.reference_type,
        "reference_id": str(m.reference_id) if m.reference_id else None,
        "quantity": m.quantity,
        "balance_after": m.balance_after,
        "unit_cost": float(m.unit_cost) if m.unit_cost else None,
        "notes": m.notes,
        "performed_by_name": _user_name(m.performer) if hasattr(m, "performer") and m.performer else None,
        "created_at": m.created_at,
    }


def get_stock_level(
    db: Session, hospital_id: uuid.UUID,
    item_type: str, item_id: uuid.UUID,
) -> int:
    """Get current stock balance. Medicines and optical products use batch totals as
    the source of truth — the same numbers sales/dispensing actually deduct from.
    Reading the StockMovement chain instead (as this used to for optical_product)
    silently drifted from real stock whenever a batch changed outside that chain."""
    if item_type == "medicine":
        return _get_medicine_batch_stock(db, item_id)
    if item_type == "optical_product":
        return _get_optical_batch_stock(db, item_id)

    last = (
        db.query(StockMovement.balance_after)
        .filter(
            StockMovement.hospital_id == hospital_id,
            StockMovement.item_type == item_type,
            StockMovement.item_id == item_id,
        )
        .order_by(StockMovement.created_at.desc())
        .first()
    )
    return last[0] if last else 0


def get_low_stock_items(db: Session, hospital_id: uuid.UUID, limit: int = 20) -> list:
    """Return medicines below reorder level using batch totals (same source as medicine inventory)."""
    medicines = (
        db.query(Medicine.id, Medicine.name, Medicine.reorder_level, Medicine.purchase_price)
        .filter(Medicine.hospital_id == hospital_id, Medicine.is_active == True)
        .all()
    )

    med_ids = [m.id for m in medicines]
    stock_map: dict[uuid.UUID, int] = {}
    batch_map: dict[uuid.UUID, list[str]] = {}
    if med_ids:
        rows = (
            db.query(MedicineBatch.medicine_id, func.coalesce(func.sum(MedicineBatch.quantity), 0))
            .filter(
                MedicineBatch.medicine_id.in_(med_ids),
                MedicineBatch.is_active == True,
            )
            .group_by(MedicineBatch.medicine_id)
            .all()
        )
        stock_map = {row[0]: int(row[1]) for row in rows}

        # Which physical batch(es) this remaining stock actually sits in — a
        # low-stock item can be low because its one batch is nearly empty, or
        # because several are, and staff need to know which to reference.
        batch_rows = (
            db.query(MedicineBatch.medicine_id, MedicineBatch.batch_number)
            .filter(
                MedicineBatch.medicine_id.in_(med_ids),
                MedicineBatch.is_active == True,
                MedicineBatch.quantity > 0,
            )
            .all()
        )
        for medicine_id, batch_number in batch_rows:
            batch_map.setdefault(medicine_id, []).append(batch_number)

    low_stock = []
    for med in medicines:
        current = stock_map.get(med.id, 0)
        reorder = med.reorder_level or 10
        if current <= reorder:
            low_stock.append({
                "item_id": str(med.id),
                "item_type": "medicine",
                "item_name": med.name,
                "current_stock": current,
                "reorder_level": reorder,
                "purchase_price": float(med.purchase_price or 0),
                "batch_numbers": batch_map.get(med.id, []),
            })

    # Optical products — wrapped in try/except so a missing optical_batches
    # table (schema not yet migrated on this env) doesn't break the dashboard.
    try:
        products = (
            db.query(OpticalProduct.id, OpticalProduct.name, OpticalProduct.reorder_level, OpticalProduct.purchase_price)
            .filter(OpticalProduct.hospital_id == hospital_id, OpticalProduct.is_active == True)
            .all()
        )
        product_ids = [p.id for p in products]
        optical_stock_map: dict[uuid.UUID, int] = {}
        optical_batch_map: dict[uuid.UUID, list[str]] = {}
        if product_ids:
            rows = (
                db.query(OpticalBatch.product_id, func.coalesce(func.sum(OpticalBatch.quantity), 0))
                .filter(OpticalBatch.product_id.in_(product_ids), OpticalBatch.is_active == True)
                .group_by(OpticalBatch.product_id)
                .all()
            )
            optical_stock_map = {row[0]: int(row[1]) for row in rows}

            batch_rows = (
                db.query(OpticalBatch.product_id, OpticalBatch.batch_number)
                .filter(
                    OpticalBatch.product_id.in_(product_ids),
                    OpticalBatch.is_active == True,
                    OpticalBatch.quantity > 0,
                )
                .all()
            )
            for product_id, batch_number in batch_rows:
                optical_batch_map.setdefault(product_id, []).append(batch_number)

        for product in products:
            current = optical_stock_map.get(product.id, 0)
            reorder = product.reorder_level or 5
            if current <= reorder:
                low_stock.append({
                    "item_id": str(product.id),
                    "item_type": "optical_product",
                    "item_name": product.name,
                    "current_stock": current,
                    "reorder_level": reorder,
                    "purchase_price": float(product.purchase_price or 0),
                    "batch_numbers": optical_batch_map.get(product.id, []),
                })
    except Exception as e:
        logger.warning("Could not fetch optical low-stock items (schema may need migration): %s", e)
        db.rollback()

    low_stock.sort(key=lambda x: (x["current_stock"], x["item_name"] or ""))
    return low_stock[:limit]


def get_expiring_items(db: Session, hospital_id: uuid.UUID, days: int = 90) -> list:
    """Return GRN items expiring within the given number of days."""
    from datetime import timedelta
    cutoff = date.today() + timedelta(days=days)
    items = (
        db.query(GRNItem)
        .join(GoodsReceiptNote)
        .filter(
            GoodsReceiptNote.hospital_id == hospital_id,
            GoodsReceiptNote.status == "accepted",
            GRNItem.expiry_date != None,
            GRNItem.expiry_date <= cutoff,
        )
        .order_by(GRNItem.expiry_date)
        .limit(50)
        .all()
    )
    results = []
    for it in items:
        results.append({
            "item_id": str(it.item_id),
            "item_type": it.item_type,
            "item_name": _resolve_item_name(db, it.item_type, it.item_id),
            "batch_number": it.batch_number,
            "expiry_date": it.expiry_date,
            "quantity": it.quantity_accepted or it.quantity_received,
        })
    return results


# ═══════════════════════════════════════════════════════════════════════════
#  STOCK ADJUSTMENTS
# ═══════════════════════════════════════════════════════════════════════════

def create_stock_adjustment(
    db: Session, data: StockAdjustmentCreate,
    hospital_id: uuid.UUID, user_id: uuid.UUID,
) -> StockAdjustment:
    adj_number = _generate_number(db, "ADJ", StockAdjustment, "adjustment_number")
    adj = StockAdjustment(
        hospital_id=hospital_id,
        adjustment_number=adj_number,
        item_type=data.item_type,
        item_id=uuid.UUID(data.item_id),
        batch_id=uuid.UUID(data.batch_id) if data.batch_id else None,
        adjustment_type=data.adjustment_type,
        quantity=data.quantity,
        reason=data.reason,
        created_by=user_id,
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)
    try:
        _notify_hospital_users(
            db,
            hospital_id,
            title="Stock Adjustment Raised",
            message=f"{adj.adjustment_number} is pending approval",
            reference_type="stock_adjustment",
            reference_id=adj.id,
            role_names=["super_admin", "admin", "inventory_manager"],
            exclude_user_ids=[user_id],
        )
    except Exception:
        logger.warning("Failed to send stock adjustment creation notification", exc_info=True)
    logger.info("Stock adjustment created: %s (%s %d)", adj.adjustment_number, adj.adjustment_type, adj.quantity)
    return adj


def list_stock_adjustments(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 10,
    status: Optional[str] = None,
) -> dict:
    q = db.query(StockAdjustment).filter(StockAdjustment.hospital_id == hospital_id)
    if status:
        q = q.filter(StockAdjustment.status == status)
    total = q.count()
    adjustments = (
        q.options(joinedload(StockAdjustment.creator), joinedload(StockAdjustment.approver))
        .order_by(StockAdjustment.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {**_paginate(total, page, limit), "data": adjustments}


def get_stock_adjustment(db: Session, adj_id: uuid.UUID) -> Optional[StockAdjustment]:
    return db.query(StockAdjustment).filter(StockAdjustment.id == adj_id).first()


def approve_stock_adjustment(
    db: Session, adj_id: uuid.UUID, data: StockAdjustmentUpdate,
    approver_id: uuid.UUID,
) -> Optional[StockAdjustment]:
    adj = db.query(StockAdjustment).filter(StockAdjustment.id == adj_id).first()
    if not adj or adj.status != "pending":
        return None
    adj.status = data.status
    adj.approved_by = approver_id

    # If approved, apply stock change and create stock movement in one flow
    if adj.status == "approved":
        qty = adj.quantity if adj.adjustment_type == "increase" else -adj.quantity

        movement_batch_id = adj.batch_id
        if adj.item_type == "medicine":
            movement_batch_id = _apply_medicine_batch_delta(db, adj.item_id, qty, adj.batch_id)
            balance_after = _get_medicine_batch_stock(db, adj.item_id)
        elif adj.item_type == "optical_product":
            # Previously this branch never touched OpticalBatch.quantity — an
            # "approved" adjustment recorded a new balance_after in the movement
            # ledger but left the real, sellable stock completely unchanged.
            movement_batch_id = _apply_optical_batch_delta(db, adj.item_id, qty, adj.batch_id)
            balance_after = _get_optical_batch_stock(db, adj.item_id)
        else:
            current_balance = get_stock_level(db, adj.hospital_id, adj.item_type, adj.item_id)
            balance_after = current_balance + qty

        movement = StockMovement(
            hospital_id=adj.hospital_id,
            item_type=adj.item_type,
            item_id=adj.item_id,
            batch_id=movement_batch_id,
            movement_type="adjustment",
            reference_type="adjustment",
            reference_id=adj.id,
            quantity=qty,
            balance_after=balance_after,
            notes=f"Adjustment {adj.adjustment_number}: {adj.reason}",
            performed_by=approver_id,
        )
        db.add(movement)

        logger.info("Stock adjustment approved: %s (qty=%d)", adj.adjustment_number, qty)

    db.commit()
    db.refresh(adj)

    try:
        approver = db.query(User).filter(User.id == approver_id).first()
        _notify_hospital_users(
            db,
            adj.hospital_id,
            title=f"Stock Adjustment {adj.status.capitalize()}",
            message=f"{adj.adjustment_number} was {adj.status} by {approver.username if approver else 'a user'}.",
            reference_type="stock_adjustment",
            reference_id=adj.id,
            role_names=["super_admin", "admin", "inventory_manager"],
            extra_user_ids=[adj.created_by],
            exclude_user_ids=[approver_id],
        )
    except Exception:
        logger.warning("Failed to send stock adjustment status notification", exc_info=True)

    return adj


def _format_adjustment_response(adj: StockAdjustment, db: Session) -> dict:
    return {
        "id": str(adj.id),
        "adjustment_number": adj.adjustment_number,
        "item_type": adj.item_type,
        "item_id": str(adj.item_id),
        "item_name": _resolve_item_name(db, adj.item_type, adj.item_id),
        "batch_id": str(adj.batch_id) if adj.batch_id else None,
        "batch_number": _resolve_batch_number(db, adj.item_type, adj.batch_id),
        "adjustment_type": adj.adjustment_type,
        "quantity": adj.quantity,
        "reason": adj.reason,
        "status": adj.status,
        "approved_by_name": _user_name(adj.approver) if hasattr(adj, "approver") and adj.approver else None,
        "created_by_name": _user_name(adj.creator) if hasattr(adj, "creator") and adj.creator else None,
        "created_at": adj.created_at,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  CYCLE COUNTS
# ═══════════════════════════════════════════════════════════════════════════

def create_cycle_count(
    db: Session, data: CycleCountCreate,
    hospital_id: uuid.UUID, user_id: uuid.UUID,
) -> CycleCount:
    count_number = _generate_number(db, "CC", CycleCount, "count_number")
    cc = CycleCount(
        hospital_id=hospital_id,
        count_number=count_number,
        count_date=data.count_date,
        notes=data.notes,
        counted_by=user_id,
    )
    db.add(cc)
    db.flush()

    for item in data.items:
        variance = item.counted_quantity - item.system_quantity
        cc_item = CycleCountItem(
            cycle_count_id=cc.id,
            item_type=item.item_type,
            item_id=uuid.UUID(item.item_id),
            batch_id=uuid.UUID(item.batch_id) if item.batch_id else None,
            system_quantity=item.system_quantity,
            counted_quantity=item.counted_quantity,
            variance=variance,
            variance_reason=item.variance_reason,
        )
        db.add(cc_item)

    db.commit()
    db.refresh(cc)
    try:
        _notify_hospital_users(
            db,
            hospital_id,
            title="Cycle Count Created",
            message=f"{cc.count_number} was created with {len(data.items)} items",
            reference_type="cycle_count",
            reference_id=cc.id,
            role_names=["super_admin", "admin", "inventory_manager"],
            exclude_user_ids=[user_id],
        )
    except Exception:
        logger.warning("Failed to send cycle count creation notification", exc_info=True)
    logger.info("Cycle count created: %s (%d items)", cc.count_number, len(data.items))
    return cc


def list_cycle_counts(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 10,
    status: Optional[str] = None,
) -> dict:
    q = db.query(CycleCount).filter(CycleCount.hospital_id == hospital_id)
    if status:
        q = q.filter(CycleCount.status == status)
    total = q.count()
    counts = (
        q.options(
            joinedload(CycleCount.items),
            joinedload(CycleCount.counter),
            joinedload(CycleCount.verifier),
        )
        .order_by(CycleCount.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {**_paginate(total, page, limit), "data": counts}


def get_cycle_count(db: Session, cc_id: uuid.UUID) -> Optional[CycleCount]:
    return (
        db.query(CycleCount)
        .options(
            joinedload(CycleCount.items),
            joinedload(CycleCount.counter),
            joinedload(CycleCount.verifier),
        )
        .filter(CycleCount.id == cc_id)
        .first()
    )


def update_cycle_count(
    db: Session, cc_id: uuid.UUID, data: CycleCountUpdate,
    verifier_id: Optional[uuid.UUID] = None,
) -> Optional[CycleCount]:
    cc = db.query(CycleCount).filter(CycleCount.id == cc_id).first()
    if not cc:
        return None
    previous_status = cc.status
    update_data = data.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] == "verified" and verifier_id:
        cc.verified_by = verifier_id
    for k, v in update_data.items():
        setattr(cc, k, v)

    # Reconcile variances exactly once when moving to verified.
    if previous_status != "verified" and cc.status == "verified":
        actor_id = verifier_id or cc.verified_by or cc.counted_by
        for it in cc.items:
            delta = int(it.variance or 0)
            if delta == 0:
                continue

            movement_batch_id = it.batch_id
            if it.item_type == "medicine":
                movement_batch_id = _apply_medicine_batch_delta(db, it.item_id, delta, it.batch_id)
                balance_after = _get_medicine_batch_stock(db, it.item_id)
            elif it.item_type == "optical_product":
                # Same fix as approve_stock_adjustment: without this the "verified"
                # count recorded a corrected balance in the ledger but never
                # touched OpticalBatch.quantity, so nothing was actually reconciled.
                movement_batch_id = _apply_optical_batch_delta(db, it.item_id, delta, it.batch_id)
                balance_after = _get_optical_batch_stock(db, it.item_id)
            else:
                current_balance = get_stock_level(db, cc.hospital_id, it.item_type, it.item_id)
                balance_after = current_balance + delta

            db.add(StockMovement(
                hospital_id=cc.hospital_id,
                item_type=it.item_type,
                item_id=it.item_id,
                batch_id=movement_batch_id,
                movement_type="adjustment",
                reference_type="cycle_count",
                reference_id=cc.id,
                quantity=delta,
                balance_after=balance_after,
                notes=f"Cycle count {cc.count_number} reconciliation",
                performed_by=actor_id,
            ))

    db.commit()
    db.refresh(cc)
    try:
        _notify_hospital_users(
            db,
            cc.hospital_id,
            title="Cycle Count Updated",
            message=f"{cc.count_number} status changed to {cc.status}",
            reference_type="cycle_count",
            reference_id=cc.id,
            role_names=["super_admin", "admin", "inventory_manager"],
            extra_user_ids=[cc.counted_by] if cc.counted_by else None,
            exclude_user_ids=[verifier_id] if verifier_id else None,
        )
    except Exception:
        logger.warning("Failed to send cycle count status notification", exc_info=True)
    logger.info("Cycle count updated: %s → %s", cc.count_number, cc.status)
    return cc


def _format_cycle_count_response(cc: CycleCount, db: Session) -> dict:
    items = []
    for it in cc.items:
        items.append({
            "id": str(it.id),
            "item_type": it.item_type,
            "item_id": str(it.item_id),
            "item_name": _resolve_item_name(db, it.item_type, it.item_id),
            "batch_id": str(it.batch_id) if it.batch_id else None,
            "system_quantity": it.system_quantity,
            "counted_quantity": it.counted_quantity,
            "variance": it.variance,
            "variance_reason": it.variance_reason,
        })
    return {
        "id": str(cc.id),
        "count_number": cc.count_number,
        "count_date": cc.count_date,
        "status": cc.status,
        "notes": cc.notes,
        "items": items,
        "counted_by_name": _user_name(cc.counter) if hasattr(cc, "counter") and cc.counter else None,
        "verified_by_name": _user_name(cc.verifier) if hasattr(cc, "verifier") and cc.verifier else None,
        "created_at": cc.created_at,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  DASHBOARD STATS
# ═══════════════════════════════════════════════════════════════════════════

def get_inventory_dashboard(db: Session, hospital_id: uuid.UUID) -> dict:
    """Aggregate stats for the inventory dashboard."""
    total_suppliers = db.query(func.count(Supplier.id)).filter(
        Supplier.hospital_id == hospital_id, Supplier.is_active == True
    ).scalar() or 0

    active_pos = db.query(func.count(PurchaseOrder.id)).filter(
        PurchaseOrder.hospital_id == hospital_id,
        PurchaseOrder.status.in_(["draft", "submitted", "approved", "partially_received"]),
    ).scalar() or 0

    pending_grns = db.query(func.count(GoodsReceiptNote.id)).filter(
        GoodsReceiptNote.hospital_id == hospital_id,
        GoodsReceiptNote.status == "pending",
    ).scalar() or 0

    pending_adjustments = db.query(func.count(StockAdjustment.id)).filter(
        StockAdjustment.hospital_id == hospital_id,
        StockAdjustment.status == "pending",
    ).scalar() or 0

    low_stock = get_low_stock_items(db, hospital_id, limit=5)
    expiring = get_expiring_items(db, hospital_id, days=90)

    return {
        "total_suppliers": total_suppliers,
        "active_purchase_orders": active_pos,
        "pending_grns": pending_grns,
        "pending_adjustments": pending_adjustments,
        "low_stock_items": low_stock,
        "expiring_items": expiring[:5],
        "low_stock_count": len(low_stock),
        "expiring_count": len(expiring),
    }


def get_stock_status_analytics(
    db: Session, hospital_id: uuid.UUID, limit: int = 50
) -> list[dict]:
    """Get stock status for analytics dashboard."""
    # Get all medicines with their stock levels
    medicines = db.query(Medicine).filter(
        Medicine.hospital_id == hospital_id,
        Medicine.is_active == True,
    ).limit(limit).all()
    
    results = []
    for med in medicines:
        # Calculate total stock from batches
        total_stock = db.query(
            func.coalesce(func.sum(MedicineBatch.quantity), 0)
        ).join(
            Medicine, Medicine.id == MedicineBatch.medicine_id
        ).filter(
            Medicine.id == med.id,
            MedicineBatch.is_active == True,
        ).scalar() or 0
        
        # Determine status
        if total_stock == 0:
            status = "critical"
        elif med.reorder_level is not None and total_stock < med.reorder_level:
            status = "low"
        elif med.max_stock_level and total_stock > med.max_stock_level:
            status = "overstock"
        else:
            status = "ok"
        
        # Get last restock date from latest GRN
        last_grn = db.query(GoodsReceiptNote.receipt_date).filter(
            GoodsReceiptNote.hospital_id == hospital_id,
            GoodsReceiptNote.status == "accepted",
        ).order_by(GoodsReceiptNote.receipt_date.desc()).first()

        results.append({
            "item_name": med.name,
            "item_id": str(med.id),
            "category": med.category or "General",
            "current_stock": total_stock,
            "min_stock": med.reorder_level or 0,
            "max_stock": med.max_stock_level or 0,
            "status": status,
            "last_restock_date": str(last_grn.receipt_date) if last_grn and last_grn.receipt_date else None,
        })
    
    return results


def get_inventory_aging_analytics(
    db: Session, hospital_id: uuid.UUID
) -> list[dict]:
    """Get inventory aging report based on days to expiry."""
    today = date.today()
    
    # Query batches grouped by days to expiry
    results = db.query(
        MedicineBatch.expiry_date,
        func.coalesce(func.sum(MedicineBatch.quantity), 0).label("total_qty"),
        func.coalesce(func.sum(MedicineBatch.quantity * MedicineBatch.purchase_price), 0).label("total_value"),
    ).join(
        Medicine, Medicine.id == MedicineBatch.medicine_id
    ).filter(
        Medicine.hospital_id == hospital_id,
        Medicine.is_active == True,
        MedicineBatch.is_active == True,
        MedicineBatch.quantity > 0,
    ).group_by(
        MedicineBatch.expiry_date
    ).all()
    
    # Initialize aging buckets
    aging_buckets = {
        "0-30 days": {"item_count": 0, "value": 0},
        "31-60 days": {"item_count": 0, "value": 0},
        "61-90 days": {"item_count": 0, "value": 0},
        "91-180 days": {"item_count": 0, "value": 0},
        "181-365 days": {"item_count": 0, "value": 0},
        "> 365 days": {"item_count": 0, "value": 0},
    }
    
    for r in results:
        if r.expiry_date:
            days_to_expiry = (r.expiry_date - today).days
            value = float(r.total_value) if r.total_value else 0
            
            if days_to_expiry <= 30:
                aging_buckets["0-30 days"]["item_count"] += 1
                aging_buckets["0-30 days"]["value"] += value
            elif days_to_expiry <= 60:
                aging_buckets["31-60 days"]["item_count"] += 1
                aging_buckets["31-60 days"]["value"] += value
            elif days_to_expiry <= 90:
                aging_buckets["61-90 days"]["item_count"] += 1
                aging_buckets["61-90 days"]["value"] += value
            elif days_to_expiry <= 180:
                aging_buckets["91-180 days"]["item_count"] += 1
                aging_buckets["91-180 days"]["value"] += value
            elif days_to_expiry <= 365:
                aging_buckets["181-365 days"]["item_count"] += 1
                aging_buckets["181-365 days"]["value"] += value
            else:
                aging_buckets["> 365 days"]["item_count"] += 1
                aging_buckets["> 365 days"]["value"] += value
    
    return [
        {"range": r, "item_count": d["item_count"], "value": d["value"]}
        for r, d in aging_buckets.items()
    ]


# ═══════════════════════════════════════════════════════════════════════════
#  INVOICE INTEGRATION — MEDICINE LOOKUP
# ═══════════════════════════════════════════════════════════════════════════

def get_medicine_for_invoice(
    db: Session, medicine_id: uuid.UUID, hospital_id: Optional[uuid.UUID] = None
) -> Optional[dict]:
    """STEP 1: Medicine lookup for invoice line items.

    Scoped to the caller's hospital (plus shared common/global medicines) so one
    tenant can never look up another tenant's medicine by ID.
    """
    query = db.query(Medicine).filter(
        Medicine.id == medicine_id,
        Medicine.is_active == True,
    )
    if hospital_id is not None:
        query = query.filter(
            or_(Medicine.hospital_id == hospital_id, Medicine.is_global == True)
        )
    medicine = query.first()
    if not medicine:
        logger.warning(f"Medicine lookup failed: ID {medicine_id} not found or inactive")
        return None
    
    total_stock = _get_medicine_batch_stock(db, medicine_id)
    
    batches = db.query(MedicineBatch).filter(
        MedicineBatch.medicine_id == medicine_id,
        MedicineBatch.is_active == True,
        MedicineBatch.is_expired == False,
    ).order_by(
        MedicineBatch.expiry_date.asc(),
        MedicineBatch.created_at.asc(),
    ).all()
    
    batch_list = []
    for batch in batches:
        if (batch.quantity or 0) > 0:
            batch_list.append({
                "id": str(batch.id),
                "batch_number": batch.batch_number,
                "quantity_available": int(batch.quantity or 0),
                "manufactured_date": batch.mfg_date,
                "expiry_date": batch.expiry_date,
                "days_to_expiry": (
                    (batch.expiry_date - date.today()).days if batch.expiry_date else None
                ),
                "is_expiring_soon": (
                    ((batch.expiry_date - date.today()).days <= 30)
                    if batch.expiry_date else False
                ),
                "selling_price": float(batch.selling_price or 0),
                "purchase_price": float(batch.purchase_price or 0),
            })
    
    tax_config = None
    if medicine.tax_config_id:
        from ..models.tax_config import TaxConfiguration
        tax = db.query(TaxConfiguration).filter(
            TaxConfiguration.id == medicine.tax_config_id,
            TaxConfiguration.is_active == True,
        ).first()
        if tax:
            tax_config = {
                "id": str(tax.id),
                "name": tax.name,
                "code": tax.code,
                "rate_percentage": float(tax.rate_percentage or 0),
            }
    
    return {
        "id": str(medicine.id),
        "name": medicine.name,
        "generic_name": medicine.generic_name,
        "category": medicine.category,
        "manufacturer": medicine.manufacturer,
        "strength": medicine.strength,
        "unit_of_measure": medicine.unit_of_measure,
        "hsn_code": medicine.hsn_code,
        "sku": medicine.sku,
        "barcode": medicine.barcode,
        "selling_price": float(medicine.selling_price or 0),
        "purchase_price": float(medicine.purchase_price or 0),
        "total_stock_available": total_stock,
        "batch_count": len(batch_list),
        "tax_config": tax_config,
        "available_batches": batch_list,
        "is_active": medicine.is_active,
    }
