"""
Pharmacy service — business logic for medicines, batches, suppliers,
purchase orders, sales, and stock adjustments.
"""
import uuid
import logging
from decimal import Decimal
from math import ceil
from datetime import date, timedelta, datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_, case
from sqlalchemy.exc import IntegrityError

from ..models.prescription import Medicine
from ..models.pharmacy import (
    MedicineBatch, Supplier,
    PurchaseOrder, PurchaseOrderItem,
    PharmacySale, PharmacySaleItem,
    StockAdjustment,
)
from ..models.user import Hospital
from ..core.tenant_security import is_eye_hospital_feature_enabled
from ..core.hospital_time import hospital_today_by_id

logger = logging.getLogger(__name__)


def _filter_model_data(model, data: dict) -> dict:
    # Use the mapped Python attribute names (e.g. "mfg_date", "quantity"), not the
    # underlying DB column names (e.g. "manufactured_date", "current_quantity") —
    # several columns are declared as Column("db_name", ...) with a different
    # attribute name, and model.__mapper__.columns is keyed by the DB name, which
    # silently dropped those fields (mfg_date, quantity) from every payload.
    valid_keys = {prop.key for prop in model.__mapper__.column_attrs}
    return {k: v for k, v in data.items() if k in valid_keys and v is not None}


def _normalize_medicine_payload(data: dict) -> dict:
    """Map API payload aliases to actual Medicine model columns."""
    normalized = dict(data)

    # Frontend sends `unit`; DB column is `unit_of_measure`.
    if normalized.get("unit") and not normalized.get("unit_of_measure"):
        normalized["unit_of_measure"] = normalized.get("unit")

    # Frontend sends `storage_conditions`; DB column is `storage_instructions`.
    if normalized.get("storage_conditions") and not normalized.get("storage_instructions"):
        normalized["storage_instructions"] = normalized.get("storage_conditions")

    # Optional compatibility mapping for free-text description.
    if normalized.get("description") and not normalized.get("composition"):
        normalized["composition"] = normalized.get("description")

    return normalized


# ══════════════════════════════════════════════════
# Medicine CRUD
# ══════════════════════════════════════════════════

# Medicine category -> single-letter type code used in the generated medicine
# code (see generate_medicine_code). Keep in sync with MedicineForm.tsx's
# CATEGORIES list — an unrecognised/missing category falls back to "X".
MEDICINE_TYPE_CODES: dict[str, str] = {
    "tablet": "T",
    "capsule": "C",
    "syrup": "S",
    "injection": "I",
    "cream": "R",
    "ointment": "O",
    "drops": "D",
    "eye drops": "E",
    "eye ointment": "Y",
    "inhaler": "H",
    "powder": "P",
    "other": "X",
}


def generate_medicine_code(db: Session, hospital_id: uuid.UUID, category: Optional[str]) -> str:
    """Auto-generate the next sequential medicine code for this hospital+type:
    "{HOSPITAL_CODE}MD{TYPE_LETTER}_001", "_002", ... (e.g. "QXMDT_001" for
    the first tablet at hospital "QX"). The sequence is scoped per
    hospital+type, so each medicine type gets its own 001, 002, ... run."""
    hospital = db.query(Hospital.code).filter(Hospital.id == hospital_id).first()
    hospital_code = (hospital[0] if hospital and hospital[0] else "").upper()
    type_letter = MEDICINE_TYPE_CODES.get((category or "").strip().lower(), "X")
    prefix = f"{hospital_code}MD{type_letter}_"

    existing = db.query(Medicine.sku).filter(
        Medicine.hospital_id == hospital_id,
        Medicine.sku.like(f"{prefix}%"),
    ).all()
    max_seq = 0
    for (sku,) in existing:
        suffix = sku[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))

    code = f"{prefix}{max_seq + 1:03d}"
    # Collision guard (e.g. two medicines of the same type created back-to-back).
    while db.query(Medicine.id).filter(Medicine.hospital_id == hospital_id, Medicine.sku == code).first():
        max_seq += 1
        code = f"{prefix}{max_seq + 1:03d}"
    return code


def create_medicine(db: Session, hospital_id: uuid.UUID, data: dict, user_id: uuid.UUID) -> Medicine:
    payload = _filter_model_data(Medicine, _normalize_medicine_payload(data))
    if not payload.get("generic_name"):
        payload["generic_name"] = payload.get("name", "")
    if not payload.get("unit_of_measure"):
        payload["unit_of_measure"] = "Nos"

    # generate_medicine_code's own collision guard only re-checks the DB at
    # the moment it's called — under genuinely concurrent requests (the bulk
    # Excel upload fires every row's create in parallel), two requests can
    # both read the same "next" code before either has committed, and both
    # then try to insert it. Retry on the resulting uniqueness violation,
    # regenerating the code fresh each time so the retry sees the other
    # request's now-committed row — same pattern as create_lab_order's
    # order-number retry loop.
    last_error: Exception | None = None
    for _ in range(5):
        # Medicine code is always server-generated — never trust/keep a
        # client-supplied sku, so codes stay unique and in the QXMDT_001 format.
        payload["sku"] = generate_medicine_code(db, hospital_id, payload.get("category"))
        med = Medicine(hospital_id=hospital_id, **payload)
        db.add(med)
        try:
            db.commit()
        except IntegrityError as e:
            db.rollback()
            last_error = e
            continue
        db.refresh(med)
        return med

    raise last_error


def get_medicine_by_id(
    db: Session,
    medicine_id: str | uuid.UUID,
    hospital_id: Optional[uuid.UUID] = None,
) -> Optional[Medicine]:
    if isinstance(medicine_id, str):
        try:
            medicine_id = uuid.UUID(medicine_id)
        except ValueError:
            return None
    q = db.query(Medicine).filter(Medicine.id == medicine_id)
    if hospital_id is not None:
        q = q.filter(Medicine.hospital_id == hospital_id)
    return q.first()


def list_medicines(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True,
) -> dict:
    query = db.query(Medicine).filter(Medicine.hospital_id == hospital_id)
    if active_only:
        query = query.filter(Medicine.is_active == True)
    if category:
        query = query.filter(Medicine.category == category)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Medicine.name.ilike(s),
                Medicine.generic_name.ilike(s),
                Medicine.sku.ilike(s),
                Medicine.barcode.ilike(s),
            )
        )
    total = query.count()
    # Soonest-to-expire stock surfaces first — a pharmacist scanning this list
    # needs to see what's about to expire (and still has stock to act on)
    # before anything else, ahead of plain recency. Medicines with no
    # in-stock batches (nothing urgent to flag) sort last.
    earliest_expiry = (
        db.query(func.min(MedicineBatch.expiry_date))
        .filter(
            MedicineBatch.medicine_id == Medicine.id,
            MedicineBatch.quantity > 0,
            MedicineBatch.is_active == True,
        )
        .correlate(Medicine)
        .scalar_subquery()
    )
    items = query.order_by(earliest_expiry.asc().nulls_last(), Medicine.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    # Enrich with total stock. "Today" is resolved once for the whole page in
    # this hospital's own timezone (all medicines here share hospital_id).
    today = hospital_today_by_id(db, hospital_id)
    med_ids = [m.id for m in items]
    stock_map: dict[uuid.UUID, int] = {}
    batch_map: dict[uuid.UUID, dict] = {}
    if med_ids:
        # total_stock feeds the "In Stock / Low Stock / Out of Stock" badge and
        # filter on the Medicine List page — expired batches are excluded so a
        # medicine whose only remaining stock has expired shows as out of
        # stock here too, matching what the Dispensing screen already refuses
        # to dispense (it never counted expired batches as available).
        stock_rows = (
            db.query(MedicineBatch.medicine_id, func.coalesce(func.sum(MedicineBatch.quantity), 0))
            .filter(
                MedicineBatch.medicine_id.in_(med_ids),
                MedicineBatch.is_active == True,
                MedicineBatch.expiry_date >= today,
            )
            .group_by(MedicineBatch.medicine_id)
            .all()
        )
        stock_map = {row[0]: int(row[1]) for row in stock_rows}

        # Earliest-expiring in-stock batch per medicine — the batch the
        # pharmacy will actually dispense from next (FEFO), so its batch
        # number / MFG / EXP / MRP are what the inventory list shows (BUG-32).
        batch_rows = (
            db.query(MedicineBatch)
            .filter(
                MedicineBatch.medicine_id.in_(med_ids),
                MedicineBatch.is_active == True,
                MedicineBatch.quantity > 0,
                MedicineBatch.expiry_date >= today,
            )
            .order_by(MedicineBatch.medicine_id, MedicineBatch.expiry_date.asc())
            .all()
        )
        for b in batch_rows:
            if b.medicine_id not in batch_map:
                batch_map[b.medicine_id] = {
                    "batch_number": b.batch_number,
                    "mfg_date": str(b.mfg_date) if b.mfg_date else None,
                    "expiry_date": str(b.expiry_date) if b.expiry_date else None,
                    "mrp": float(b.mrp) if b.mrp is not None else (float(b.selling_price) if b.selling_price is not None else None),
                }

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": ceil(total / limit) if limit else 1,
        "data": items,
        "stock_map": stock_map,
        "batch_map": batch_map,
    }


def update_medicine(db: Session, medicine_id: str | uuid.UUID, data: dict) -> Optional[Medicine]:
    med = get_medicine_by_id(db, medicine_id)
    if not med:
        return None
    normalized_data = _normalize_medicine_payload(data)
    for key, value in normalized_data.items():
        if hasattr(med, key) and value is not None:
            setattr(med, key, value)
    db.commit()
    db.refresh(med)
    return med


def delete_medicine(db: Session, medicine_id: str | uuid.UUID) -> bool:
    med = get_medicine_by_id(db, medicine_id)
    if not med:
        return False
    med.is_active = False
    db.commit()
    return True


# ══════════════════════════════════════════════════
# Batch CRUD
# ══════════════════════════════════════════════════

def create_batch(db: Session, data: dict) -> MedicineBatch:
    # Convert string UUIDs
    for fk in ("medicine_id", "grn_id", "supplier_id"):
        if data.get(fk):
            data[fk] = uuid.UUID(data[fk])

    payload = _filter_model_data(MedicineBatch, data)
    if "quantity" in payload and "initial_quantity" not in payload:
        payload["initial_quantity"] = payload["quantity"]
    # MRP is optional on the create form — default it to selling_price
    # rather than leaving it blank, same as the migration's one-time
    # backfill for pre-existing batches.
    payload.setdefault("mrp", payload.get("selling_price"))

    batch = MedicineBatch(**payload)
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def list_batches(
    db: Session,
    medicine_id: str | uuid.UUID,
    active_only: bool = True,
) -> list[MedicineBatch]:
    if isinstance(medicine_id, str):
        medicine_id = uuid.UUID(medicine_id)
    query = (
        db.query(MedicineBatch)
        .options(joinedload(MedicineBatch.supplier))
        .filter(MedicineBatch.medicine_id == medicine_id)
    )
    if active_only:
        query = query.filter(MedicineBatch.is_active == True)
    return query.order_by(MedicineBatch.expiry_date).all()


def update_batch(
    db: Session,
    batch_id: str | uuid.UUID,
    data: dict,
    hospital_id: Optional[uuid.UUID] = None,
    performed_by: Optional[uuid.UUID] = None,
) -> Optional[MedicineBatch]:
    """Update a batch. When `quantity` changes, this is a direct stock edit (e.g.
    the "Open Stock" field on the Medicine edit form) — log a StockMovement for
    it just like every other stock-changing path (GRN, adjustments, dispensing),
    otherwise stock can silently change here with zero audit trail."""
    from ..models.inventory import StockMovement

    if isinstance(batch_id, str):
        batch_id = uuid.UUID(batch_id)
    batch = db.query(MedicineBatch).filter(MedicineBatch.id == batch_id).first()
    if not batch:
        return None

    old_qty = batch.quantity or 0
    qty_delta = None
    if "quantity" in data and data["quantity"] is not None and int(data["quantity"]) != old_qty:
        new_qty = int(data["quantity"])
        if new_qty < 0:
            raise ValueError("Stock quantity cannot be negative")
        qty_delta = new_qty - old_qty

    for key, value in data.items():
        if hasattr(batch, key) and value is not None:
            setattr(batch, key, value)

    if qty_delta is not None:
        if qty_delta > 0:
            batch.initial_quantity = (batch.initial_quantity or 0) + qty_delta
        db.flush()
        balance_after = int(
            db.query(func.coalesce(func.sum(MedicineBatch.quantity), 0)).filter(
                MedicineBatch.medicine_id == batch.medicine_id,
                MedicineBatch.is_active == True,
            ).scalar() or 0
        )
        db.add(StockMovement(
            hospital_id=hospital_id or batch.medicine.hospital_id,
            item_type="medicine",
            item_id=batch.medicine_id,
            batch_id=batch.id,
            movement_type="adjustment",
            reference_type="manual_edit",
            quantity=qty_delta,
            balance_after=balance_after,
            notes=f"Stock manually edited on batch {batch.batch_number}: {old_qty} -> {batch.quantity}",
            performed_by=performed_by,
        ))

    db.commit()
    db.refresh(batch)
    return batch


# ══════════════════════════════════════════════════
# Supplier CRUD
# ══════════════════════════════════════════════════

def create_supplier(db: Session, hospital_id: uuid.UUID, data: dict) -> Supplier:
    payload = _filter_model_data(Supplier, data)
    if not payload.get("code"):
        # MAX(existing seq)+1, not COUNT(*)+1 — a deleted supplier leaves a
        # numbering gap that COUNT(*) doesn't account for, causing collisions.
        last = (
            db.query(Supplier.code)
            .filter(Supplier.hospital_id == hospital_id)
            .order_by(Supplier.code.desc())
            .limit(1)
            .scalar()
        )
        try:
            seq = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
        except ValueError:
            seq = 1
        payload["code"] = f"SUP-{seq:04d}"
    sup = Supplier(hospital_id=hospital_id, **payload)
    db.add(sup)
    db.commit()
    db.refresh(sup)
    return sup


def list_suppliers(db: Session, hospital_id: uuid.UUID, active_only: bool = True) -> list[Supplier]:
    query = db.query(Supplier).filter(Supplier.hospital_id == hospital_id)
    if active_only:
        query = query.filter(Supplier.is_active == True)
    return query.order_by(Supplier.name).all()


def get_supplier_by_id(db: Session, supplier_id: str | uuid.UUID) -> Optional[Supplier]:
    if isinstance(supplier_id, str):
        try:
            supplier_id = uuid.UUID(supplier_id)
        except ValueError:
            return None
    return db.query(Supplier).filter(Supplier.id == supplier_id).first()


def update_supplier(db: Session, supplier_id: str | uuid.UUID, data: dict) -> Optional[Supplier]:
    sup = get_supplier_by_id(db, supplier_id)
    if not sup:
        return None
    for key, value in data.items():
        if hasattr(sup, key) and value is not None:
            setattr(sup, key, value)
    db.commit()
    db.refresh(sup)
    return sup


def delete_supplier(db: Session, supplier_id: str | uuid.UUID) -> bool:
    sup = get_supplier_by_id(db, supplier_id)
    if not sup:
        return False
    sup.is_active = False
    db.commit()
    return True


# ══════════════════════════════════════════════════
# Purchase Order
# ══════════════════════════════════════════════════

def _generate_po_number(db: Session, hospital_id: uuid.UUID) -> str:
    """Generate next PO number like PO-2026-0001."""
    # MAX(existing seq)+1, not COUNT(*)+1 — a deleted/voided PO leaves a
    # numbering gap that COUNT(*) doesn't account for, causing collisions.
    from datetime import date
    year = date.today().strftime("%y")
    last = (
        db.query(PurchaseOrder.po_number)
        .filter(PurchaseOrder.hospital_id == hospital_id)
        .order_by(PurchaseOrder.po_number.desc())
        .limit(1)
        .scalar()
    )
    try:
        seq = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
    except ValueError:
        seq = 1
    return f"PO-{year}-{seq:04d}"


def create_purchase_order(
    db: Session, hospital_id: uuid.UUID, data: dict, user_id: uuid.UUID
) -> PurchaseOrder:
    """Create a new purchase order in DRAFT status."""
    from datetime import date

    items_data = data.pop("items", [])
    supplier_id = uuid.UUID(data.pop("supplier_id"))

    # Handle expected_delivery - convert empty string to None
    expected_delivery = data.get("expected_delivery")
    if expected_delivery == "" or expected_delivery is None:
        expected_delivery = None

    po = PurchaseOrder(
        hospital_id=hospital_id,
        supplier_id=supplier_id,
        po_number=_generate_po_number(db, hospital_id),  # ✅ Fixed: use po_number (model field)
        order_date=date.today(),  # Set order date to today
        expected_delivery_date=expected_delivery,  # Model field name
        notes=data.get("notes"),
        status="draft",
        created_by=user_id,
    )
    db.add(po)
    db.flush()

    total = Decimal("0")
    for item_data in items_data:
        line_total = Decimal(str(item_data["unit_price"])) * item_data["quantity_ordered"]
        poi = PurchaseOrderItem(
            purchase_order_id=po.id,
            item_type="medicine",
            item_id=uuid.UUID(item_data["medicine_id"]),  # Model field name
            quantity_ordered=item_data["quantity_ordered"],
            unit_price=item_data["unit_price"],
            total_price=line_total,
        )
        db.add(poi)
        total += line_total

    po.total_amount = total
    db.commit()
    db.refresh(po)
    logger.info(f"Purchase order created: {po.po_number} with {len(items_data)} items")
    return po


def submit_purchase_order(db: Session, po_id: str | uuid.UUID, user_id: uuid.UUID) -> Optional[PurchaseOrder]:
    """Submit PO for approval (DRAFT → SUBMITTED)."""
    po = get_purchase_order(db, po_id)
    if not po:
        return None
    if po.status != "draft":
        raise ValueError("Only draft POs can be submitted")
    po.status = "submitted"
    db.commit()
    db.refresh(po)
    return po


def approve_purchase_order(db: Session, po_id: str | uuid.UUID, user_id: uuid.UUID, comments: str = None) -> Optional[PurchaseOrder]:
    """Approve PO (SUBMITTED → APPROVED)."""
    po = get_purchase_order(db, po_id)
    if not po:
        return None
    if po.status != "submitted":
        raise ValueError("Only submitted POs can be approved")
    po.status = "approved"
    po.approved_by = user_id
    db.commit()
    db.refresh(po)
    return po


def place_purchase_order(db: Session, po_id: str | uuid.UUID, user_id: uuid.UUID) -> Optional[PurchaseOrder]:
    """Send PO to supplier (APPROVED → ORDERED)."""
    po = get_purchase_order(db, po_id)
    if not po:
        return None
    if po.status not in ["approved", "submitted"]:
        raise ValueError("PO must be approved before placing order")
    po.status = "ordered"
    db.commit()
    db.refresh(po)
    return po


def get_purchase_order(db: Session, po_id: str | uuid.UUID) -> Optional[PurchaseOrder]:
    if isinstance(po_id, str):
        po_id = uuid.UUID(po_id)
    return db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()


def list_purchase_orders(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 20,
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> dict:
    """List POs with filters."""
    query = db.query(PurchaseOrder).filter(PurchaseOrder.hospital_id == hospital_id)
    
    if status:
        query = query.filter(PurchaseOrder.status == status)
    
    if supplier_id:
        query = query.filter(PurchaseOrder.supplier_id == uuid.UUID(supplier_id))
    
    if date_from:
        query = query.filter(PurchaseOrder.order_date >= date_from)
    
    if date_to:
        query = query.filter(PurchaseOrder.order_date <= date_to)
    
    total = query.count()
    items = query.order_by(PurchaseOrder.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": ceil(total / limit) if limit else 1,
        "data": items,
    }


def receive_purchase_order(
    db: Session, po_id: str | uuid.UUID, user_id: uuid.UUID, receive_data: Optional[dict] = None
) -> Optional[PurchaseOrder]:
    """Receive PO quantities and create/update medicine batches + stock movements from provided input."""
    po = get_purchase_order(db, po_id)
    if not po or po.status != "ordered":
        return None

    from ..models.inventory import StockMovement

    items = db.query(PurchaseOrderItem).filter(PurchaseOrderItem.purchase_order_id == po.id).all()

    payload_map: dict[uuid.UUID, dict] = {}
    if receive_data and receive_data.get("items"):
      for raw in receive_data["items"]:
          item_id = raw.get("purchase_order_item_id")
          if not item_id:
              continue
          try:
              payload_map[uuid.UUID(item_id)] = raw
          except ValueError:
              raise ValueError(f"Invalid purchase_order_item_id: {item_id}")

    for item in items:
        input_item = payload_map.get(item.id)

        if input_item:
            received_qty = int(input_item.get("quantity_received", 0))
        else:
            received_qty = max(item.quantity_ordered - (item.quantity_received or 0), 0)

        if received_qty < 0:
            raise ValueError("Received quantity cannot be negative")

        remaining_qty = max(item.quantity_ordered - (item.quantity_received or 0), 0)
        if received_qty > remaining_qty:
            raise ValueError(
                f"Received quantity for item {item.id} cannot exceed remaining ordered quantity ({remaining_qty})"
            )

        if received_qty == 0:
            continue

        item.quantity_received = (item.quantity_received or 0) + received_qty

        batch_number = (
            (input_item.get("batch_number") if input_item else None)
            or f"PO-{po.po_number}-{item.id.hex[:6]}"
        )[:50]

        mfg_date = input_item.get("manufactured_date") if input_item else None
        expiry_date = (input_item.get("expiry_date") if input_item else None) or (date.today() + timedelta(days=365))
        purchase_price = Decimal(str(input_item.get("unit_price"))) if input_item and input_item.get("unit_price") is not None else item.unit_price
        selling_price = Decimal(str(input_item.get("selling_price"))) if input_item and input_item.get("selling_price") is not None else purchase_price

        existing = db.query(MedicineBatch).filter(
            MedicineBatch.medicine_id == item.item_id,
            MedicineBatch.batch_number == batch_number,
        ).first()
        if existing:
            existing.quantity += received_qty
            existing.initial_quantity += received_qty
            existing.purchase_price = purchase_price
            existing.selling_price = selling_price
            if mfg_date:
                existing.mfg_date = mfg_date
            if expiry_date:
                existing.expiry_date = expiry_date
        else:
            batch = MedicineBatch(
                medicine_id=item.item_id,
                batch_number=batch_number,
                mfg_date=mfg_date,
                expiry_date=expiry_date,
                initial_quantity=received_qty,
                quantity=received_qty,
                purchase_price=purchase_price,
                selling_price=selling_price,
            )
            db.add(batch)

        # balance_after must reflect the real post-update batch total, not a
        # shadow running total off the last movement's own balance_after —
        # that shadow figure can silently drift from what batches actually
        # hold (mirrors the same fix applied to GRN receipt processing).
        db.flush()
        balance_after = int(
            db.query(func.coalesce(func.sum(MedicineBatch.quantity), 0)).filter(
                MedicineBatch.medicine_id == item.item_id,
                MedicineBatch.is_active == True,
            ).scalar() or 0
        )

        movement = StockMovement(
            hospital_id=po.hospital_id,
            item_type="medicine",
            item_id=item.item_id,
            movement_type="stock_in",
            reference_type="purchase_order",
            reference_id=po.id,
            quantity=received_qty,
            balance_after=balance_after,
            unit_cost=float(purchase_price),
            notes=f"PO receipt: {po.po_number}",
            performed_by=user_id,
        )
        db.add(movement)

    all_received = all((it.quantity_received or 0) >= it.quantity_ordered for it in items)
    any_received = any((it.quantity_received or 0) > 0 for it in items)
    if all_received:
        po.status = "received"
    elif any_received:
        po.status = "partially_received"

    if receive_data and receive_data.get("notes"):
        po.notes = f"{(po.notes or '').strip()}\nReceipt notes: {receive_data['notes']}".strip()

    db.commit()
    db.refresh(po)
    return po


# ══════════════════════════════════════════════════
# Sale / Dispensing
# ══════════════════════════════════════════════════

def _generate_invoice_number(db: Session, hospital_id: uuid.UUID) -> str:
    # MAX(existing seq)+1, not COUNT(*)+1 — a deleted sale leaves a numbering
    # gap that COUNT(*) doesn't account for, causing collisions.
    last = (
        db.query(PharmacySale.invoice_number)
        .filter(PharmacySale.hospital_id == hospital_id)
        .order_by(PharmacySale.invoice_number.desc())
        .limit(1)
        .scalar()
    )
    try:
        seq = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
    except ValueError:
        seq = 1
    return f"INV-{seq:06d}"


def create_sale(
    db: Session, hospital_id: uuid.UUID, data: dict, user_id: uuid.UUID
) -> PharmacySale:
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    eye_features = is_eye_hospital_feature_enabled(hospital)

    items_data = data.pop("items", [])
    patient_id = data.get("patient_id")
    if patient_id:
        patient_id = uuid.UUID(patient_id)
        # Scoped to this hospital — an unchecked patient_id would let this
        # sale (and its enrichment, which surfaces the patient's name)
        # reference a patient from a different hospital entirely. A pure
        # walk-in counter sale with no patient at all remains allowed above.
        from ..models.patient import Patient
        patient_check = db.query(Patient).filter(Patient.id == patient_id, Patient.hospital_id == hospital_id).first()
        if not patient_check:
            raise ValueError("Patient not found")

    # Eye-hospital feature pack: if this patient has an open Pharmacy Queue
    # entry (auto-enqueued at prescription finalize, or manually added — see
    # billing_queue_service.py), link this counter sale to it so the queue
    # token shows on the bill and the queue entry advances to Collected.
    queue_entry = None
    if eye_features and patient_id:
        from .billing_queue_service import find_open_pharmacy_queue_entry_for_patient
        queue_entry = find_open_pharmacy_queue_entry_for_patient(db, hospital_id, patient_id)

    # A queue_entry's own queue_token is already the patient's shared visit
    # token (assigned via get_or_assign_visit_token when it was enqueued) —
    # reuse it as-is. With no queue entry (pure walk-in counter sale, no
    # prescription/queue involved), still draw from the same hospital-wide
    # sequence instead of leaving the sale with no token at all.
    from .billing_queue_service import get_or_assign_visit_token
    sale_appointment_id = queue_entry.appointment_id if queue_entry else None
    sale_queue_token = (
        queue_entry.queue_token if queue_entry
        else get_or_assign_visit_token(db, hospital_id, appointment_id=None)
    )

    sale = PharmacySale(
        hospital_id=hospital_id,
        invoice_number=_generate_invoice_number(db, hospital_id),
        patient_id=patient_id,
        appointment_id=sale_appointment_id,
        sale_type="counter_sale",
        status="dispensed",
        sale_date=datetime.now(timezone.utc),
        discount_amount=data.get("discount_amount", Decimal("0")),
        notes=data.get("notes"),
        created_by=user_id,
        payment_method=data.get("payment_method", "cash"),
        amount_tendered=Decimal(str(data.get("amount_tendered", 0))),
        consultation_fee=Decimal(str(data.get("consultation_fee", 0))) if eye_features else Decimal("0"),
        queue_token=sale_queue_token,
        queue_status="collected" if queue_entry else None,
    )
    db.add(sale)
    db.flush()

    subtotal = Decimal("0")
    tax_total = Decimal("0")
    line_discount_total = Decimal("0")

    for item_data in items_data:
        # Scoped to this hospital — without it, any medicine_id from another
        # tenant would still resolve here and (via the batch_id branch below,
        # or the auto-select branch matching on medicine_id alone) let this
        # sale decrement a different hospital's stock while billing this one.
        med = get_medicine_by_id(db, item_data["medicine_id"], hospital_id=hospital_id)
        if not med:
            raise ValueError("Medicine not found")
        qty = item_data["quantity"]
        unit_price = Decimal(str(item_data["unit_price"]))
        disc_pct = Decimal(str(item_data.get("discount_percent", 0)))
        tax_pct = Decimal(str(item_data.get("tax_percent", 0)))

        line_subtotal = unit_price * qty
        line_discount = line_subtotal * disc_pct / 100
        line_after_disc = line_subtotal - line_discount
        line_tax = line_after_disc * tax_pct / 100
        line_total = line_after_disc + line_tax

        batch = None
        batch_id = item_data.get("batch_id")
        if batch_id:
            batch_id_uuid = uuid.UUID(batch_id)
            # Must belong to the medicine this line claims to sell — otherwise
            # a client-supplied batch_id for an unrelated medicine (any
            # hospital, since MedicineBatch carries no hospital_id of its own)
            # would silently decrement the wrong item's stock.
            batch = db.query(MedicineBatch).filter(
                MedicineBatch.id == batch_id_uuid,
                MedicineBatch.medicine_id == uuid.UUID(item_data["medicine_id"]),
                MedicineBatch.is_active == True,
            ).first()
        else:
            # Expiry compared against the hospital's own local date, not the
            # server's (date.today() reads the server process's own
            # timezone — wrong the moment the server isn't physically in the
            # hospital's timezone, silently including/excluding batches
            # whose expiry date falls on today per one clock but not the
            # other). This is the same class of bug fixed elsewhere via
            # hospital_today_by_id — see core/hospital_time.py.
            today = hospital_today_by_id(db, hospital_id)
            batch = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == uuid.UUID(item_data["medicine_id"]),
                MedicineBatch.is_active == True,
                MedicineBatch.quantity >= qty,
                MedicineBatch.expiry_date > today,  # block expired batches
            ).order_by(MedicineBatch.expiry_date.asc()).first()
            batch_id_uuid = batch.id if batch else None

        if not batch or batch.quantity < qty:
            # Check if expired batches exist and provide a helpful error message
            today = hospital_today_by_id(db, hospital_id)
            expired_batch = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == uuid.UUID(item_data["medicine_id"]),
                MedicineBatch.expiry_date <= today,
                MedicineBatch.quantity > 0,
            ).first()
            
            if expired_batch:
                raise ValueError(
                    f"All available batches of {med.name if med else 'this medicine'} are expired. "
                    f"Cannot dispense expired medicine (Batch: {expired_batch.batch_number}, "
                    f"Expiry: {expired_batch.expiry_date}). Please remove from inventory."
                )
            
            raise ValueError(f"Insufficient stock in batch for {med.name if med else 'unknown'}")

        batch.quantity -= qty

        # Create stock movement record for pharmacy sale
        from ..models.inventory import StockMovement

        # balance_after reflects the real post-deduction batch total, not a
        # shadow running total off the last movement's own balance_after (see
        # the matching fix in receive_purchase_order / _process_grn_acceptance).
        db.flush()
        balance_after = int(
            db.query(func.coalesce(func.sum(MedicineBatch.quantity), 0)).filter(
                MedicineBatch.medicine_id == uuid.UUID(item_data["medicine_id"]),
                MedicineBatch.is_active == True,
            ).scalar() or 0
        )

        movement = StockMovement(
            hospital_id=hospital_id,
            item_type="medicine",
            item_id=uuid.UUID(item_data["medicine_id"]),
            batch_id=batch_id_uuid,
            movement_type="sale",
            reference_type="dispensing",
            reference_id=sale.id,
            quantity=-qty,
            balance_after=balance_after,
            unit_cost=float(unit_price),
            notes=f"Pharmacy sale: {sale.invoice_number}",
            performed_by=user_id,
        )
        db.add(movement)

        si = PharmacySaleItem(
            sale_id=sale.id,
            medicine_id=uuid.UUID(item_data["medicine_id"]),
            batch_id=batch_id_uuid,
            medicine_name=med.name if med else "Unknown",
            quantity=qty,
            unit_price=unit_price,
            discount_percent=disc_pct,
            tax_percent=line_tax,
            total_price=line_total,
        )
        db.add(si)
        subtotal += line_subtotal
        tax_total += line_tax
        line_discount_total += line_discount

    sale.subtotal = subtotal
    sale.tax_amount = tax_total
    # subtotal is the raw pre-discount sum (matches invoice_service convention); both
    # per-line discounts and the flat header discount must be subtracted to get the
    # real total, otherwise a per-line discount% is silently dropped and the patient
    # is overcharged by that amount.
    sale.total_amount = subtotal - line_discount_total - sale.discount_amount + tax_total + sale.consultation_fee

    # Always derive real payment status from what was actually tendered — this
    # used to be hardcoded to "paid" for non-eye-hospital tenants regardless of
    # amount received, hiding unpaid/partially-paid counter sales from cashiers
    # and giving them no way to later collect the outstanding balance.
    from .billing_queue_service import compute_payment_breakdown
    breakdown = compute_payment_breakdown(sale.total_amount, amount_tendered=sale.amount_tendered)
    sale.paid_amount = breakdown["paid_amount"]
    sale.balance_amount = breakdown["balance_amount"]
    sale.payment_status = breakdown["payment_status"]

    if queue_entry:
        queue_entry.sale_id = sale.id
        queue_entry.status = "collected"
        if not queue_entry.queue_called_at:
            queue_entry.queue_called_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(sale)
    return sale


def get_sale(db: Session, sale_id: str | uuid.UUID) -> Optional[PharmacySale]:
    if isinstance(sale_id, str):
        sale_id = uuid.UUID(sale_id)
    return db.query(PharmacySale).filter(PharmacySale.id == sale_id).first()


def get_sale_items(db: Session, sale_id: uuid.UUID) -> list[PharmacySaleItem]:
    return db.query(PharmacySaleItem).filter(PharmacySaleItem.sale_id == sale_id).all()


# ══════════════════════════════════════════════════
# Post-finalization corrections
#
# Once a sale is fully dispensed there was previously no way to fix a
# miskeyed dispensed quantity or amount tendered — DispensingScreen.tsx goes
# fully read-only the moment prescription.status == 'dispensed'. These two
# functions open a narrow, audited correction path for pharmacist/admin,
# mirroring the pattern already used for GRN corrections after acceptance
# (inventory_service.update_grn_item_batch / _reconcile_grn_item_stock_
# correction): snapshot the old posted quantity before mutating, compute the
# delta after, and post ONE compensating StockMovement for the net change —
# raising ValueError instead of ever letting a batch go negative.
# ══════════════════════════════════════════════════

# Statuses a sale must be in to be eligible for a post-finalization
# correction. SalesList.tsx's filter dropdown already surfaces 'cancelled'
# and 'returned' as sale-status values (no backend code currently sets
# them, but the vocabulary exists) — a void/refund should freeze the sale's
# figures, not let a quantity correction silently resurrect stock movements
# against it.
_CORRECTABLE_SALE_STATUSES = {"dispensed"}


def _recompute_sale_item_aggregates(db: Session, sale: PharmacySale) -> None:
    """Recompute PharmacySale.subtotal/tax_amount/total_amount by summing
    across its current item rows — the same formula create_sale uses to
    build these from scratch, so a corrected sale stays internally
    consistent with how every other sale's totals were derived. Does not
    touch payment fields — see _resync_sale_balance_after_total_change.
    """
    items = db.query(PharmacySaleItem).filter(PharmacySaleItem.sale_id == sale.id).all()
    subtotal = Decimal("0")
    line_discount_total = Decimal("0")
    tax_total = Decimal("0")
    for it in items:
        line_subtotal = it.unit_price * it.quantity
        line_discount = line_subtotal * (it.discount_percent or Decimal("0")) / 100
        subtotal += line_subtotal
        tax_total += (it.tax_percent or Decimal("0"))
        line_discount_total += line_discount

    sale.subtotal = subtotal
    sale.tax_amount = tax_total
    sale.total_amount = (
        subtotal - line_discount_total - (sale.discount_amount or Decimal("0"))
        + tax_total + (sale.consultation_fee or Decimal("0"))
    )


def _resync_sale_balance_after_total_change(sale: PharmacySale) -> None:
    """Keep balance_amount/payment_status consistent with the new
    total_amount after a quantity correction — WITHOUT touching paid_amount.

    paid_amount's source of truth differs by sale_type: for a counter_sale
    it's derived from amount_tendered via compute_payment_breakdown, but for
    a prescription-linked sale it's set directly by mark_dispensing_paid
    once its (separate) Invoice/Payment is settled — amount_tendered is
    never populated on that path at all. Recomputing paid_amount here from
    amount_tendered would silently wipe out real payment history recorded
    through that other path, so only balance/status are re-derived from
    whatever paid_amount already holds.
    """
    paid_amount = sale.paid_amount or Decimal("0")
    sale.balance_amount = sale.total_amount - paid_amount
    if paid_amount <= 0:
        sale.payment_status = "pending"
    elif sale.balance_amount > 0:
        sale.payment_status = "partially_paid"
    else:
        sale.payment_status = "paid"


def update_dispensed_item_quantity(
    db: Session,
    hospital_id: uuid.UUID,
    sale_id: str | uuid.UUID,
    item_id: str | uuid.UUID,
    new_quantity: int,
    current_user=None,
) -> PharmacySaleItem:
    """Correct the dispensed quantity on one line item of an already-
    finalized sale. Increasing it decrements the original batch further
    (rejecting if that would take the batch negative — e.g. some of it was
    already re-dispensed/sold elsewhere since); decreasing it credits the
    difference back to the batch. unit_price/discount_percent/tax_percent
    are left as-is; only quantity and the derived total_price change.
    """
    if isinstance(sale_id, str):
        sale_id = uuid.UUID(sale_id)
    if isinstance(item_id, str):
        item_id = uuid.UUID(item_id)
    if new_quantity <= 0:
        raise ValueError("Quantity must be greater than zero")

    sale = db.query(PharmacySale).filter(
        PharmacySale.id == sale_id,
        PharmacySale.hospital_id == hospital_id,
    ).first()
    if not sale:
        raise ValueError("Sale not found")
    if sale.status not in _CORRECTABLE_SALE_STATUSES:
        raise ValueError(f"Cannot correct a sale with status '{sale.status}'")

    item = db.query(PharmacySaleItem).filter(
        PharmacySaleItem.id == item_id,
        PharmacySaleItem.sale_id == sale_id,
    ).first()
    if not item:
        raise ValueError("Sale item not found")

    old_quantity = item.quantity
    delta = new_quantity - old_quantity
    if delta == 0:
        return item

    batch = db.query(MedicineBatch).filter(
        MedicineBatch.id == item.batch_id,
        MedicineBatch.medicine_id == item.medicine_id,
    ).with_for_update().first()
    if not batch:
        raise ValueError("Original batch for this line item no longer exists")

    new_batch_qty = (batch.quantity or 0) - delta
    if new_batch_qty < 0:
        raise ValueError(
            f"Cannot increase dispensed quantity by {delta} — only {batch.quantity} unit(s) of "
            f"batch '{batch.batch_number}' remain in stock."
        )
    batch.quantity = new_batch_qty

    # total_price is re-derived using create_sale's own per-line formula.
    # tax_percent here is an absolute per-line tax AMOUNT computed off the
    # OLD quantity (see the field's real DB column name "tax_amount") — with
    # no stored tax rate to scale it by, it's left unchanged, same as
    # discount_percent/unit_price. In practice every prescription-dispensed
    # item (the live DispensingScreen.tsx flow) has discount_percent=0 and
    # tax_percent=0, so this reduces to plain unit_price * new_quantity.
    line_subtotal = item.unit_price * new_quantity
    line_discount = line_subtotal * (item.discount_percent or Decimal("0")) / 100
    item.total_price = line_subtotal - line_discount + (item.tax_percent or Decimal("0"))
    item.quantity = new_quantity

    db.flush()

    from ..models.inventory import StockMovement
    balance_after = int(
        db.query(func.coalesce(func.sum(MedicineBatch.quantity), 0)).filter(
            MedicineBatch.medicine_id == item.medicine_id,
            MedicineBatch.is_active == True,
        ).scalar() or 0
    )
    db.add(StockMovement(
        hospital_id=hospital_id,
        item_type="medicine",
        item_id=item.medicine_id,
        batch_id=batch.id,
        movement_type="adjustment",
        reference_type="dispensing",
        reference_id=sale.id,
        quantity=-delta,
        balance_after=balance_after,
        unit_cost=float(item.unit_price),
        notes=f"Dispensed quantity corrected on {sale.invoice_number} ({old_quantity} -> {new_quantity})",
        performed_by=current_user.id if current_user else None,
    ))

    # Keep the originating prescription line's dispensed_quantity in step —
    # otherwise "remaining to dispense" for that prescription silently
    # desyncs from what was actually corrected here.
    if item.prescription_item_id:
        from ..models.prescription import PrescriptionItem
        rx_item = db.query(PrescriptionItem).filter(
            PrescriptionItem.id == item.prescription_item_id
        ).first()
        if rx_item:
            rx_item.dispensed_quantity = max(0, (rx_item.dispensed_quantity or 0) + delta)

    _recompute_sale_item_aggregates(db, sale)
    _resync_sale_balance_after_total_change(sale)

    db.commit()
    db.refresh(item)

    if current_user:
        from ..core.audit_logger import AuditLogger, AuditAction
        AuditLogger.log(
            action=AuditAction.INVENTORY_ADJUST,
            user=current_user,
            tenant=None,
            resource_type="pharmacy_sale_item",
            resource_id=item.id,
            old_values={"quantity": str(old_quantity)},
            new_values={"quantity": str(new_quantity)},
            metadata={
                "sale_id": str(sale.id),
                "invoice_number": sale.invoice_number,
                "corrected_after_finalization": True,
            },
        )

    return item


def update_sale_amount_tendered(
    db: Session,
    hospital_id: uuid.UUID,
    sale_id: str | uuid.UUID,
    new_amount_tendered,
    current_user=None,
) -> PharmacySale:
    """Correct the amount tendered on an already-finalized sale and
    recompute paid_amount/balance_amount/payment_status via the same
    compute_payment_breakdown() used at sale-creation time.
    """
    if isinstance(sale_id, str):
        sale_id = uuid.UUID(sale_id)
    new_amount_tendered = Decimal(str(new_amount_tendered))
    if new_amount_tendered < 0:
        raise ValueError("Amount tendered cannot be negative")

    sale = db.query(PharmacySale).filter(
        PharmacySale.id == sale_id,
        PharmacySale.hospital_id == hospital_id,
    ).first()
    if not sale:
        raise ValueError("Sale not found")
    if sale.status not in _CORRECTABLE_SALE_STATUSES:
        raise ValueError(f"Cannot correct a sale with status '{sale.status}'")

    old_values = {
        "amount_tendered": str(sale.amount_tendered),
        "paid_amount": str(sale.paid_amount),
        "balance_amount": str(sale.balance_amount),
        "payment_status": sale.payment_status,
    }

    sale.amount_tendered = new_amount_tendered

    from .billing_queue_service import compute_payment_breakdown
    breakdown = compute_payment_breakdown(
        sale.total_amount,
        advance_amount=sale.advance_amount or Decimal("0"),
        amount_tendered=new_amount_tendered,
    )
    sale.paid_amount = breakdown["paid_amount"]
    sale.balance_amount = breakdown["balance_amount"]
    sale.payment_status = breakdown["payment_status"]

    db.commit()
    db.refresh(sale)

    if current_user:
        from ..core.audit_logger import AuditLogger, AuditAction
        AuditLogger.log(
            action=AuditAction.PAYMENT_PROCESS,
            user=current_user,
            tenant=None,
            resource_type="pharmacy_sale",
            resource_id=sale.id,
            old_values=old_values,
            new_values={
                "amount_tendered": str(sale.amount_tendered),
                "paid_amount": str(sale.paid_amount),
                "balance_amount": str(sale.balance_amount),
                "payment_status": sale.payment_status,
            },
            metadata={"invoice_number": sale.invoice_number, "corrected_after_finalization": True},
        )

    return sale


def list_sales(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 20,
    search: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sale_status: Optional[str] = None,
    patient_type: Optional[str] = None,
    sort_by: str = "sale_date",
    sort_order: str = "desc",
) -> dict:
    query = db.query(PharmacySale).filter(PharmacySale.hospital_id == hospital_id)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            PharmacySale.invoice_number.ilike(s)
        )
    if date_from:
        query = query.filter(func.date(PharmacySale.sale_date) >= date_from)
    if date_to:
        query = query.filter(func.date(PharmacySale.sale_date) <= date_to)
    if sale_status:
        query = query.filter(PharmacySale.status == sale_status)
    if patient_type == "walk_in":
        query = query.filter(PharmacySale.patient_id.is_(None))
    elif patient_type == "registered":
        query = query.filter(PharmacySale.patient_id.is_not(None))

    effective_sale_date = case(
        (func.extract("year", PharmacySale.sale_date) <= 1971, PharmacySale.created_at),
        else_=PharmacySale.sale_date,
    )

    sort_column_map = {
        "sale_date": effective_sale_date,
        "total_amount": PharmacySale.total_amount,
        "invoice_number": PharmacySale.invoice_number,
        "created_at": PharmacySale.created_at,
    }
    sort_column = sort_column_map.get(sort_by, PharmacySale.sale_date)
    order_clause = sort_column.asc() if str(sort_order).lower() == "asc" else sort_column.desc()
    tie_breaker_clause = PharmacySale.created_at.asc() if str(sort_order).lower() == "asc" else PharmacySale.created_at.desc()

    total = query.count()

    # Build paginated base sales first, then enrich with live item counts.
    base_items = query.order_by(order_clause, tie_breaker_clause).offset((page - 1) * limit).limit(limit).all()
    sale_ids = [s.id for s in base_items]

    item_count_map: dict[uuid.UUID, int] = {}
    if sale_ids:
        count_rows = (
            db.query(PharmacySaleItem.sale_id, func.count(PharmacySaleItem.id))
            .filter(PharmacySaleItem.sale_id.in_(sale_ids))
            .group_by(PharmacySaleItem.sale_id)
            .all()
        )
        item_count_map = {row[0]: int(row[1]) for row in count_rows}

    items: list[dict] = []
    for sale in base_items:
        # Normalize bad epoch-like dates to created_at for safer UI display.
        normalized_sale_date = sale.sale_date
        if normalized_sale_date and normalized_sale_date.year <= 1971 and sale.created_at:
            normalized_sale_date = sale.created_at

        items.append({
            "id": str(sale.id),
            "hospital_id": str(sale.hospital_id),
            "invoice_number": sale.invoice_number,
            "sale_date": normalized_sale_date,
            "patient_id": str(sale.patient_id) if sale.patient_id else None,
            "patient_name": sale.patient.full_name if getattr(sale, "patient", None) else None,
            "doctor_name": None,
            "prescription_number": None,
            "prescription_date": None,
            "subtotal": sale.subtotal,
            "discount_amount": sale.discount_amount,
            "tax_amount": sale.tax_amount,
            "total_amount": sale.total_amount,
            "payment_method": getattr(sale, "payment_method", "cash"),
            "payment_status": getattr(sale, "payment_status", "pending"),
            "amount_tendered": sale.amount_tendered,
            "advance_amount": sale.advance_amount,
            "paid_amount": sale.paid_amount,
            "balance_amount": sale.balance_amount,
            "consultation_fee": sale.consultation_fee,
            "queue_token": sale.queue_token,
            "queue_status": sale.queue_status,
            "status": sale.status,
            "notes": sale.notes,
            "created_at": sale.created_at,
            "updated_at": sale.updated_at,
            "item_count": item_count_map.get(sale.id, 0),
            "items": [],
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": ceil(total / limit) if limit else 1,
        "data": items,
    }


# ══════════════════════════════════════════════════
# Stock Adjustment
# ══════════════════════════════════════════════════

def create_stock_adjustment(
    db: Session, hospital_id: uuid.UUID, data: dict, user_id: uuid.UUID
) -> StockAdjustment:
    """Create pharmacy stock adjustment using inventory StockAdjustment model."""
    from ..models.inventory import StockMovement

    medicine_id = uuid.UUID(data["medicine_id"])
    batch_id = uuid.UUID(data["batch_id"]) if data.get("batch_id") else None
    qty = data["quantity"]
    adj_type = data["adjustment_type"]
    
    # Determine quantity direction based on adjustment type
    # damage/expired = negative (stock out), correction/return = can be +/-
    if adj_type in ["damage", "expired"]:
        qty = -abs(qty)  # Always negative
    elif adj_type == "return":
        qty = abs(qty)   # Always positive
    # correction keeps the sign as provided

    movement_batch_id = batch_id

    # Apply stock delta to batches (single source of truth).
    if batch_id:
        batch = db.query(MedicineBatch).filter(
            MedicineBatch.id == batch_id,
            MedicineBatch.medicine_id == medicine_id,
            MedicineBatch.is_active == True,
        ).first()
        if not batch:
            raise ValueError("Batch not found")
        new_qty = (batch.quantity or 0) + qty
        if new_qty < 0:
            raise ValueError("Adjustment would result in negative stock")
        if qty > 0:
            batch.initial_quantity = (batch.initial_quantity or 0) + qty
        batch.quantity = new_qty
    elif qty > 0:
        # No batch specified for stock-in adjustment: write into system adjustment batch.
        system_batch_number = f"SYS-ADJ-{datetime.now(timezone.utc).strftime('%Y%m%d')}"
        batch = db.query(MedicineBatch).filter(
            MedicineBatch.medicine_id == medicine_id,
            MedicineBatch.batch_number == system_batch_number,
        ).first()
        if batch:
            batch.quantity = (batch.quantity or 0) + qty
            batch.initial_quantity = (batch.initial_quantity or 0) + qty
            batch.is_active = True
        else:
            batch = MedicineBatch(
                medicine_id=medicine_id,
                batch_number=system_batch_number,
                mfg_date=date.today(),
                expiry_date=date.today() + timedelta(days=3650),
                initial_quantity=qty,
                quantity=qty,
                purchase_price=0,
                selling_price=0,
                is_active=True,
            )
            db.add(batch)
            db.flush()
        movement_batch_id = batch.id
    elif qty < 0:
        # No batch specified for stock-out adjustment: consume FEFO across active batches.
        remaining = -qty
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
        movement_batch_id = None

    # Create adjustment record using inventory model (auto-approved for pharmacy)
    adj = StockAdjustment(
        hospital_id=hospital_id,
        adjustment_number=f"ADJ-PHARM-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        item_type="medicine",
        item_id=medicine_id,  # Use item_id (inventory model field)
        batch_id=batch_id,
        adjustment_type=adj_type,
        quantity=qty,
        reason=data.get("reason", "Pharmacy stock adjustment"),
        status="approved",  # Auto-approved for pharmacy operations
        approved_by=user_id,
        created_by=user_id,
    )
    db.add(adj)
    db.flush()

    balance_after = int(
        db.query(func.coalesce(func.sum(MedicineBatch.quantity), 0)).filter(
            MedicineBatch.medicine_id == medicine_id,
            MedicineBatch.is_active == True,
        ).scalar() or 0
    )

    movement_type = "adjustment"
    if adj_type == "damage":
        movement_type = "damaged"
    elif adj_type == "expired":
        movement_type = "expired"

    movement = StockMovement(
        hospital_id=hospital_id,
        item_type="medicine",
        item_id=medicine_id,
        batch_id=movement_batch_id,
        movement_type=movement_type,
        reference_type="adjustment",
        reference_id=adj.id,
        quantity=qty,
        balance_after=balance_after,
        notes=f"Pharmacy adjustment {adj.adjustment_number}: {adj.reason}",
        performed_by=user_id,
    )
    db.add(movement)

    db.commit()
    db.refresh(adj)
    return adj


def list_stock_adjustments(
    db: Session, hospital_id: uuid.UUID,
    medicine_id: Optional[str] = None,
) -> list:
    """List pharmacy stock adjustments with medicine names."""
    from sqlalchemy.orm import joinedload
    
    query = db.query(StockAdjustment).filter(
        StockAdjustment.hospital_id == hospital_id,
        StockAdjustment.item_type == 'medicine'
    )
    
    if medicine_id:
        query = query.filter(StockAdjustment.item_id == uuid.UUID(medicine_id))
    
    adjustments = query.order_by(StockAdjustment.created_at.desc()).limit(100).all()
    
    # Add medicine names for display
    result = []
    for adj in adjustments:
        adj_dict = {
            'id': str(adj.id),
            'hospital_id': str(adj.hospital_id),
            'item_id': str(adj.item_id),
            'batch_id': str(adj.batch_id) if adj.batch_id else None,
            'adjustment_type': adj.adjustment_type,
            'quantity': adj.quantity,
            'reason': adj.reason,
            'status': adj.status,
            'approved_by': str(adj.approved_by) if adj.approved_by else None,
            'created_by': str(adj.created_by) if adj.created_by else None,
            'created_at': adj.created_at,
            'medicine_name': None,
        }
        
        # Get medicine name
        med = db.query(Medicine).filter(Medicine.id == adj.item_id).first()
        if med:
            adj_dict['medicine_name'] = med.name
        
        result.append(adj_dict)
    
    return result


# ══════════════════════════════════════════════════
# Dashboard Stats
# ══════════════════════════════════════════════════

def get_pharmacy_dashboard(db: Session, hospital_id: uuid.UUID) -> dict:
    today = hospital_today_by_id(db, hospital_id)
    thirty_days = today + timedelta(days=30)

    medicines = db.query(
        Medicine.id, Medicine.reorder_level, Medicine.name, Medicine.generic_name, Medicine.strength,
    ).filter(
        Medicine.hospital_id == hospital_id, Medicine.is_active == True
    ).all()
    total_medicines = len(medicines)

    # Low stock: total on-hand quantity (summed across all of a medicine's batches)
    # at or below that medicine's own reorder_level — not a hardcoded "<10" that
    # ignored the per-medicine reorder level set on the medicine form, and not a
    # per-batch check that miscounted medicines split across several batches.
    # Expired batches are excluded from that on-hand total: they're already
    # counted below in expired_count, and leaving them in the stock sum let a
    # medicine whose only stock had expired look adequately stocked here.
    med_ids = [m.id for m in medicines]
    stock_map: dict[uuid.UUID, int] = {}
    if med_ids:
        stock_rows = (
            db.query(MedicineBatch.medicine_id, func.coalesce(func.sum(MedicineBatch.quantity), 0))
            .filter(
                MedicineBatch.medicine_id.in_(med_ids),
                MedicineBatch.is_active == True,
                MedicineBatch.expiry_date >= today,
            )
            .group_by(MedicineBatch.medicine_id)
            .all()
        )
        stock_map = {row[0]: int(row[1]) for row in stock_rows}

    low_stock = sum(
        1 for m in medicines
        if 0 < stock_map.get(m.id, 0) <= (m.reorder_level or 10)
    )

    # True out-of-stock total across the WHOLE catalog — deliberately its own
    # count, not folded into low_stock above (which only counts "some stock
    # but under reorder" so the two dashboard cards never double-count the
    # same medicine). Previously there was no backend field for this at all;
    # the frontend faked it by fetching page 1/limit 100 of the medicine list
    # and filtering client-side, which silently missed anything past the
    # 100th medicine in a larger catalog. Computed here from the same
    # stock_map already built above — no extra query.
    out_of_stock_medicines = [m for m in medicines if stock_map.get(m.id, 0) == 0]
    out_of_stock_count = len(out_of_stock_medicines)
    out_of_stock_preview = [
        {
            "id": str(m.id), "name": m.name, "generic_name": m.generic_name,
            "strength": m.strength, "reorder_level": m.reorder_level,
        }
        for m in sorted(out_of_stock_medicines, key=lambda m: m.name or "")[:10]
    ]

    # Expiring within 30 days
    expiring = db.query(func.count(MedicineBatch.id)).join(
        Medicine, Medicine.id == MedicineBatch.medicine_id
    ).filter(
        Medicine.hospital_id == hospital_id,
        MedicineBatch.is_active == True,
        MedicineBatch.expiry_date <= thirty_days,
        MedicineBatch.expiry_date > today,
        MedicineBatch.quantity > 0,
    ).scalar() or 0

    # Already expired
    expired = db.query(func.count(MedicineBatch.id)).join(
        Medicine, Medicine.id == MedicineBatch.medicine_id
    ).filter(
        Medicine.hospital_id == hospital_id,
        MedicineBatch.is_active == True,
        MedicineBatch.expiry_date <= today,
        MedicineBatch.quantity > 0,
    ).scalar() or 0

    # Today's sales
    today_sales = db.query(
        func.count(PharmacySale.id),
        func.coalesce(func.sum(PharmacySale.paid_amount), 0),
    ).filter(
        PharmacySale.hospital_id == hospital_id,
        func.date(PharmacySale.created_at) == today,
    ).first()

    pending_orders = db.query(func.count(PurchaseOrder.id)).filter(
        PurchaseOrder.hospital_id == hospital_id,
        PurchaseOrder.status.in_(["draft", "submitted"]),
    ).scalar() or 0

    return {
        "total_medicines": total_medicines,
        "low_stock_count": low_stock,
        "out_of_stock_count": out_of_stock_count,
        "out_of_stock_items": out_of_stock_preview,
        "expiring_soon_count": expiring,
        "expired_count": expired,
        "today_sales_count": today_sales[0] if today_sales else 0,
        "today_sales_amount": today_sales[1] if today_sales else Decimal("0"),
        "pending_orders": pending_orders,
    }


def get_pharmacy_sales_trend(
    db: Session, hospital_id: uuid.UUID, days: int = 30
) -> list[dict]:
    """Get pharmacy sales trend for the last N days."""
    from ..models.pharmacy import PharmacySale

    today = hospital_today_by_id(db, hospital_id)
    start_date = today - timedelta(days=days - 1)
    
    # Query daily sales
    results = db.query(
        func.date(PharmacySale.created_at).label("sale_date"),
        func.coalesce(func.sum(PharmacySale.paid_amount), 0).label("total_sales"),
        func.count(PharmacySale.id).label("prescriptions_count"),
    ).filter(
        PharmacySale.hospital_id == hospital_id,
        func.date(PharmacySale.created_at) >= start_date,
        func.date(PharmacySale.created_at) <= today,
    ).group_by(
        func.date(PharmacySale.created_at)
    ).order_by(
        func.date(PharmacySale.created_at)
    ).all()
    
    # Build a map of date -> sales data
    sales_map = {
        str(r.sale_date): {
            "date": str(r.sale_date),
            "sales": float(r.total_sales) if r.total_sales else 0,
            "prescriptions_filled": r.prescriptions_count or 0,
        }
        for r in results
    }
    
    # Fill in missing dates with zero values
    trend_data = []
    for i in range(days):
        current_date = start_date + timedelta(days=i)
        date_str = str(current_date)
        if date_str in sales_map:
            trend_data.append(sales_map[date_str])
        else:
            trend_data.append({
                "date": date_str,
                "sales": 0,
                "prescriptions_filled": 0,
            })
    
    return trend_data


def get_pharmacy_top_medicines(
    db: Session, hospital_id: uuid.UUID, days: int = 30, limit: int = 10
) -> list[dict]:
    """Get top selling medicines by quantity and revenue."""
    from ..models.pharmacy import PharmacySale, PharmacySaleItem

    today = hospital_today_by_id(db, hospital_id)
    start_date = today - timedelta(days=days - 1)
    
    # Query top medicines by quantity sold
    results = db.query(
        Medicine.id,
        Medicine.name,
        Medicine.category,
        func.sum(PharmacySaleItem.quantity).label("total_quantity"),
        func.sum(PharmacySaleItem.total_price).label("total_revenue"),
    ).join(
        PharmacySaleItem, PharmacySaleItem.medicine_id == Medicine.id
    ).join(
        PharmacySale, PharmacySale.id == PharmacySaleItem.sale_id
    ).filter(
        Medicine.hospital_id == hospital_id,
        Medicine.is_active == True,
        func.date(PharmacySale.created_at) >= start_date,
        func.date(PharmacySale.created_at) <= today,
    ).group_by(
        Medicine.id, Medicine.name, Medicine.category
    ).order_by(
        func.sum(PharmacySaleItem.quantity).desc()
    ).limit(limit).all()
    
    return [
        {
            "name": r.name,
            "medicine_id": str(r.id),
            "quantity_sold": r.total_quantity or 0,
            "revenue": float(r.total_revenue) if r.total_revenue else 0,
            "category": r.category,
        }
        for r in results
    ]
