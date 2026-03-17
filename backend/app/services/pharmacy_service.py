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
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_

from ..models.prescription import Medicine
from ..models.pharmacy import (
    MedicineBatch, Supplier,
    PurchaseOrder, PurchaseOrderItem,
    PharmacySale, PharmacySaleItem,
    StockAdjustment,
)

logger = logging.getLogger(__name__)


def _filter_model_data(model, data: dict) -> dict:
    valid_keys = {col.key for col in model.__mapper__.columns}
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

def create_medicine(db: Session, hospital_id: uuid.UUID, data: dict, user_id: uuid.UUID) -> Medicine:
    payload = _filter_model_data(Medicine, _normalize_medicine_payload(data))
    if not payload.get("generic_name"):
        payload["generic_name"] = payload.get("name", "")
    if not payload.get("unit_of_measure"):
        payload["unit_of_measure"] = "Nos"
    med = Medicine(hospital_id=hospital_id, **payload)
    db.add(med)
    db.commit()
    db.refresh(med)
    return med


def get_medicine_by_id(db: Session, medicine_id: str | uuid.UUID) -> Optional[Medicine]:
    if isinstance(medicine_id, str):
        try:
            medicine_id = uuid.UUID(medicine_id)
        except ValueError:
            return None
    return db.query(Medicine).filter(Medicine.id == medicine_id).first()


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
    items = query.order_by(Medicine.name).offset((page - 1) * limit).limit(limit).all()

    # Enrich with total stock
    med_ids = [m.id for m in items]
    stock_map: dict[uuid.UUID, int] = {}
    if med_ids:
        stock_rows = (
            db.query(MedicineBatch.medicine_id, func.coalesce(func.sum(MedicineBatch.quantity), 0))
            .filter(MedicineBatch.medicine_id.in_(med_ids), MedicineBatch.is_active == True)
            .group_by(MedicineBatch.medicine_id)
            .all()
        )
        stock_map = {row[0]: int(row[1]) for row in stock_rows}

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": ceil(total / limit) if limit else 1,
        "data": items,
        "stock_map": stock_map,
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
    for fk in ("medicine_id", "grn_id"):
        if data.get(fk):
            data[fk] = uuid.UUID(data[fk])

    payload = _filter_model_data(MedicineBatch, data)
    if "quantity" in payload and "initial_quantity" not in payload:
        payload["initial_quantity"] = payload["quantity"]

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
    query = db.query(MedicineBatch).filter(MedicineBatch.medicine_id == medicine_id)
    if active_only:
        query = query.filter(MedicineBatch.is_active == True)
    return query.order_by(MedicineBatch.expiry_date).all()


def update_batch(db: Session, batch_id: str | uuid.UUID, data: dict) -> Optional[MedicineBatch]:
    if isinstance(batch_id, str):
        batch_id = uuid.UUID(batch_id)
    batch = db.query(MedicineBatch).filter(MedicineBatch.id == batch_id).first()
    if not batch:
        return None
    for key, value in data.items():
        if hasattr(batch, key) and value is not None:
            setattr(batch, key, value)
    db.commit()
    db.refresh(batch)
    return batch


# ══════════════════════════════════════════════════
# Supplier CRUD
# ══════════════════════════════════════════════════

def create_supplier(db: Session, hospital_id: uuid.UUID, data: dict) -> Supplier:
    payload = _filter_model_data(Supplier, data)
    if not payload.get("code"):
        count = db.query(func.count(Supplier.id)).filter(Supplier.hospital_id == hospital_id).scalar() or 0
        payload["code"] = f"SUP-{count + 1:04d}"
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
    from datetime import date
    year = date.today().strftime("%y")
    count = db.query(func.count(PurchaseOrder.id)).filter(
        PurchaseOrder.hospital_id == hospital_id
    ).scalar() or 0
    return f"PO-{year}-{count + 1:04d}"


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

        last_movement = (
            db.query(StockMovement)
            .filter(
                StockMovement.hospital_id == po.hospital_id,
                StockMovement.item_type == "medicine",
                StockMovement.item_id == item.item_id,
            )
            .order_by(StockMovement.created_at.desc())
            .first()
        )
        current_balance = last_movement.balance_after if last_movement else 0

        movement = StockMovement(
            hospital_id=po.hospital_id,
            item_type="medicine",
            item_id=item.item_id,
            movement_type="stock_in",
            reference_type="purchase_order",
            reference_id=po.id,
            quantity=received_qty,
            balance_after=current_balance + received_qty,
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
    count = db.query(func.count(PharmacySale.id)).filter(
        PharmacySale.hospital_id == hospital_id
    ).scalar() or 0
    return f"INV-{count + 1:06d}"


def create_sale(
    db: Session, hospital_id: uuid.UUID, data: dict, user_id: uuid.UUID
) -> PharmacySale:
    items_data = data.pop("items", [])
    patient_id = data.get("patient_id")
    if patient_id:
        patient_id = uuid.UUID(patient_id)

    sale = PharmacySale(
        hospital_id=hospital_id,
        invoice_number=_generate_invoice_number(db, hospital_id),
        patient_id=patient_id,
        sale_type="counter_sale",
        status="dispensed",
        sale_date=datetime.now(timezone.utc),
        discount_amount=data.get("discount_amount", Decimal("0")),
        notes=data.get("notes"),
        created_by=user_id,
    )
    db.add(sale)
    db.flush()

    subtotal = Decimal("0")
    tax_total = Decimal("0")

    for item_data in items_data:
        med = get_medicine_by_id(db, item_data["medicine_id"])
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
            batch = db.query(MedicineBatch).filter(MedicineBatch.id == batch_id_uuid).first()
        else:
            # ✅ FIX BUG #7: Add expiry date validation - block expired batches
            batch = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == uuid.UUID(item_data["medicine_id"]),
                MedicineBatch.is_active == True,
                MedicineBatch.quantity >= qty,
                MedicineBatch.expiry_date > date.today(),  # ✅ BLOCK EXPIRED BATCHES
            ).order_by(MedicineBatch.expiry_date.asc()).first()
            batch_id_uuid = batch.id if batch else None

        if not batch or batch.quantity < qty:
            # ✅ Check if expired batches exist and provide helpful error message
            expired_batch = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == uuid.UUID(item_data["medicine_id"]),
                MedicineBatch.expiry_date <= date.today(),
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

        # ✅ FIX BUG #2: Create stock movement record for pharmacy sale
        from ..models.inventory import StockMovement

        # Get current balance from last movement
        last_movement = (
            db.query(StockMovement)
            .filter(
                StockMovement.hospital_id == hospital_id,
                StockMovement.item_type == "medicine",
                StockMovement.item_id == uuid.UUID(item_data["medicine_id"]),
            )
            .order_by(StockMovement.created_at.desc())
            .first()
        )
        current_balance = last_movement.balance_after if last_movement else 0
        
        movement = StockMovement(
            hospital_id=hospital_id,
            item_type="medicine",
            item_id=uuid.UUID(item_data["medicine_id"]),
            batch_id=batch_id_uuid,
            movement_type="sale",
            reference_type="dispensing",
            reference_id=sale.id,
            quantity=-qty,
            balance_after=current_balance - qty,
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

    sale.subtotal = subtotal
    sale.tax_amount = tax_total
    sale.total_amount = subtotal - sale.discount_amount + tax_total
    db.commit()
    db.refresh(sale)
    return sale


def get_sale(db: Session, sale_id: str | uuid.UUID) -> Optional[PharmacySale]:
    if isinstance(sale_id, str):
        sale_id = uuid.UUID(sale_id)
    return db.query(PharmacySale).filter(PharmacySale.id == sale_id).first()


def get_sale_items(db: Session, sale_id: uuid.UUID) -> list[PharmacySaleItem]:
    return db.query(PharmacySaleItem).filter(PharmacySaleItem.sale_id == sale_id).all()


def list_sales(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 20,
    search: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
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

    total = query.count()
    items = query.order_by(PharmacySale.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
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
    
    # Update batch stock if batch specified
    if batch_id:
        batch = db.query(MedicineBatch).filter(MedicineBatch.id == batch_id).first()
        if not batch:
            raise ValueError("Batch not found")
        new_qty = batch.quantity + qty
        if new_qty < 0:
            raise ValueError("Adjustment would result in negative stock")
        batch.quantity = new_qty

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
    today = date.today()
    thirty_days = today + timedelta(days=30)

    total_medicines = db.query(func.count(Medicine.id)).filter(
        Medicine.hospital_id == hospital_id, Medicine.is_active == True
    ).scalar() or 0

    # Low stock: batches with qty > 0 and < 10
    low_stock = db.query(func.count(func.distinct(MedicineBatch.medicine_id))).join(
        Medicine, Medicine.id == MedicineBatch.medicine_id
    ).filter(
        Medicine.hospital_id == hospital_id,
        MedicineBatch.is_active == True,
        MedicineBatch.quantity > 0,
        MedicineBatch.quantity < 10,
    ).scalar() or 0

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
        func.coalesce(func.sum(PharmacySale.total_amount), 0),
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
        "expiring_soon_count": expiring,
        "expired_count": expired,
        "today_sales_count": today_sales[0] if today_sales else 0,
        "today_sales_amount": today_sales[1] if today_sales else Decimal("0"),
        "pending_orders": pending_orders,
    }
