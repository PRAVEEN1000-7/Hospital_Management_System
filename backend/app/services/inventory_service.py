"""
Inventory service — business logic for suppliers, POs, GRNs,
stock movements, adjustments, and cycle counts.
"""
import logging
import math
import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..models.inventory import (
    Supplier, PurchaseOrder, PurchaseOrderItem,
    GoodsReceiptNote, GRNItem, StockMovement,
    StockAdjustment, CycleCount, CycleCountItem,
)
from ..models.prescription import Medicine
from ..models.optical import OpticalProduct
from ..models.notification import Notification
from ..models.pharmacy import MedicineBatch
from ..models.user import User, Role, UserRole
from ..schemas.inventory import (
    SupplierCreate, SupplierUpdate,
    PurchaseOrderCreate, PurchaseOrderUpdate,
    GRNCreate, GRNUpdate,
    StockAdjustmentCreate, StockAdjustmentUpdate,
    CycleCountCreate, CycleCountUpdate,
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


def _resolve_item_id(db: Session, item_type: str, item_id: str, item_name: Optional[str] = None) -> uuid.UUID:
    """Prefer a valid catalog item id; fall back to name lookup when needed."""
    parsed_id = uuid.UUID(item_id)

    if item_type == "medicine":
        exists = db.query(Medicine.id).filter(Medicine.id == parsed_id).first()
        if exists:
            return parsed_id
        if item_name:
            match = db.query(Medicine.id).filter(func.lower(Medicine.name) == item_name.strip().lower()).first()
            if match:
                return match[0]

    if item_type == "optical_product":
        exists = db.query(OpticalProduct.id).filter(OpticalProduct.id == parsed_id).first()
        if exists:
            return parsed_id
        if item_name:
            match = db.query(OpticalProduct.id).filter(func.lower(OpticalProduct.name) == item_name.strip().lower()).first()
            if match:
                return match[0]

    return parsed_id


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
    """Create in-app notifications for selected active users in the same hospital."""
    q = db.query(User.id).filter(
        User.hospital_id == hospital_id,
        User.is_active == True,
        User.is_deleted == False,
    )
    if role_names:
        q = q.join(UserRole, UserRole.user_id == User.id).join(Role, Role.id == UserRole.role_id).filter(
            Role.name.in_(role_names),
            Role.is_active == True,
        )

    recipient_ids = {row[0] for row in q.distinct().all()}
    if extra_user_ids:
        recipient_ids.update(extra_user_ids)
    if exclude_user_ids:
        recipient_ids.difference_update(exclude_user_ids)

    if not recipient_ids:
        return

    for user_id in recipient_ids:
        db.add(Notification(
            hospital_id=hospital_id,
            user_id=user_id,
            title=title,
            message=message,
            type=notification_type,
            priority=priority,
            reference_type=reference_type,
            reference_id=reference_id,
        ))
    db.commit()


# ═══════════════════════════════════════════════════════════════════════════
#  SUPPLIERS
# ═══════════════════════════════════════════════════════════════════════════

def create_supplier(db: Session, data: SupplierCreate, hospital_id: uuid.UUID) -> Supplier:
    supplier = Supplier(
        hospital_id=hospital_id,
        name=data.name,
        code=data.code,
        contact_person=data.contact_person,
        phone=data.phone,
        email=data.email,
        address=data.address,
        tax_id=data.tax_id,
        payment_terms=data.payment_terms,
        lead_time_days=data.lead_time_days,
        rating=data.rating,
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
    suppliers = q.order_by(Supplier.name).offset((page - 1) * limit).limit(limit).all()
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
            item_id=_resolve_item_id(db, item.item_type, item.item_id, getattr(item, "item_name", None)),
            quantity_ordered=item.quantity_ordered,
            unit_price=item.unit_price,
            total_price=item.total_price,
        )
        db.add(po_item)

    db.commit()
    db.refresh(po)
    _notify_hospital_users(
        db,
        hospital_id,
        title="Purchase Order Created",
        message=f"{po.po_number} was created with total {float(po.total_amount or 0):.2f}",
        reference_type="purchase_order",
        reference_id=po.id,
        role_names=["super_admin", "admin", "inventory_manager"],
        extra_user_ids=[user_id],
    )
    logger.info("Purchase order created: %s (total=%.2f)", po.po_number, total)
    return po


def list_purchase_orders(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 10,
    status: Optional[str] = None, supplier_id: Optional[str] = None,
    search: Optional[str] = None,
) -> dict:
    q = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier), joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.hospital_id == hospital_id)
    )
    if status:
        q = q.filter(PurchaseOrder.status == status)
    if supplier_id:
        q = q.filter(PurchaseOrder.supplier_id == uuid.UUID(supplier_id))
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            PurchaseOrder.po_number.ilike(term),
        ))
    total = q.count()
    orders = q.order_by(PurchaseOrder.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
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


def _format_po_response(po: PurchaseOrder, db: Session) -> dict:
    """Build a PurchaseOrderResponse-compatible dict."""
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
        "items": items,
        "created_by_name": _user_name(po.creator) if hasattr(po, "creator") else None,
        "approved_by_name": _user_name(po.approver) if hasattr(po, "approver") else None,
        "created_at": po.created_at,
        "updated_at": po.updated_at,
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
            item_id=_resolve_item_id(db, item.item_type, item.item_id, getattr(item, "item_name", None)),
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
    _notify_hospital_users(
        db,
        hospital_id,
        title="Goods Receipt Created",
        message=f"{grn.grn_number} was created and is pending review",
        reference_type="grn",
        reference_id=grn.id,
        role_names=["super_admin", "admin", "inventory_manager", "pharmacist"],
        extra_user_ids=[user_id],
    )
    logger.info("GRN created: %s (total=%.2f)", grn.grn_number, total)
    return grn


def list_grns(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 10,
    status: Optional[str] = None, supplier_id: Optional[str] = None,
    search: Optional[str] = None,
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
    db.commit()
    db.refresh(grn)
    logger.info("GRN updated: %s → %s", grn.grn_number, grn.status)

    # When GRN is accepted, create stock-in movements and update PO received quantities
    if grn.status == "accepted":
        _process_grn_acceptance(db, grn)

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

    return grn


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

        # Calculate current balance
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
        current_balance = last_movement.balance_after if last_movement else 0

        movement = StockMovement(
            hospital_id=grn.hospital_id,
            item_type=item.item_type,
            item_id=item.item_id,
            movement_type="stock_in",
            reference_type="grn",
            reference_id=grn.id,
            quantity=accepted,
            balance_after=current_balance + accepted,
            unit_cost=float(item.unit_price),
            notes=f"GRN {grn.grn_number} accepted",
            performed_by=grn.verified_by,
        )
        db.add(movement)

        # ✅ FIX BUG #3: Create or update MedicineBatch for pharmacy dispensing
        if item.item_type == "medicine":
            from ..models.pharmacy import MedicineBatch
            
            batch = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == item.item_id,
                MedicineBatch.batch_number == item.batch_number,
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

    db.commit()

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
    db.commit()


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
) -> dict:
    q = db.query(StockMovement).filter(StockMovement.hospital_id == hospital_id)
    if item_type:
        q = q.filter(StockMovement.item_type == item_type)
    if item_id:
        q = q.filter(StockMovement.item_id == uuid.UUID(item_id))
    if movement_type:
        q = q.filter(StockMovement.movement_type == movement_type)
    total = q.count()
    movements = (
        q.options(joinedload(StockMovement.performer))
        .order_by(StockMovement.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {**_paginate(total, page, limit), "data": movements}


def _format_movement_response(m: StockMovement, db: Session) -> dict:
    return {
        "id": str(m.id),
        "item_type": m.item_type,
        "item_id": str(m.item_id),
        "item_name": _resolve_item_name(db, m.item_type, m.item_id),
        "batch_id": str(m.batch_id) if m.batch_id else None,
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
    """Get current stock balance. Medicines use batch totals as source of truth."""
    if item_type == "medicine":
        return _get_medicine_batch_stock(db, item_id)

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
            })

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
    _notify_hospital_users(
        db,
        hospital_id,
        title="Stock Adjustment Raised",
        message=f"{adj.adjustment_number} is pending approval",
        reference_type="stock_adjustment",
        reference_id=adj.id,
        role_names=["super_admin", "admin", "inventory_manager"],
        extra_user_ids=[user_id],
    )
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

    _notify_hospital_users(
        db,
        adj.hospital_id,
        title="Stock Adjustment Updated",
        message=f"{adj.adjustment_number} was {adj.status}",
        reference_type="stock_adjustment",
        reference_id=adj.id,
        role_names=["super_admin", "admin", "inventory_manager"],
        extra_user_ids=[adj.created_by, approver_id],
    )

    return adj


def _format_adjustment_response(adj: StockAdjustment, db: Session) -> dict:
    return {
        "id": str(adj.id),
        "adjustment_number": adj.adjustment_number,
        "item_type": adj.item_type,
        "item_id": str(adj.item_id),
        "item_name": _resolve_item_name(db, adj.item_type, adj.item_id),
        "batch_id": str(adj.batch_id) if adj.batch_id else None,
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
    _notify_hospital_users(
        db,
        hospital_id,
        title="Cycle Count Created",
        message=f"{cc.count_number} was created with {len(data.items)} items",
        reference_type="cycle_count",
        reference_id=cc.id,
        role_names=["super_admin", "admin", "inventory_manager"],
        extra_user_ids=[user_id],
    )
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
    _notify_hospital_users(
        db,
        cc.hospital_id,
        title="Cycle Count Updated",
        message=f"{cc.count_number} status changed to {cc.status}",
        reference_type="cycle_count",
        reference_id=cc.id,
        role_names=["super_admin", "admin", "inventory_manager"],
        extra_user_ids=[cc.counted_by, verifier_id] if verifier_id else [cc.counted_by],
    )
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
