"""
Inventory service — business logic for suppliers, POs, GRNs,
stock movements, adjustments, and cycle counts.
Integrated with Products table for centralized catalog management.
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
from ..models.products import Product, StockSummary, StockAlert
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
    """Look up a medicine / optical product / product name for display."""
    if item_type == "medicine":
        # First try to get from Medicine table
        med = db.query(Medicine.name).filter(Medicine.id == item_id).first()
        if med:
            return med[0]
        # Fallback: try Products table (for product-based medicines)
        product = db.query(Product.product_name).filter(Product.id == item_id).first()
        return product[0] if product else None
    
    if item_type == "optical_product":
        # First try OpticalProduct table
        optical = db.query(OpticalProduct.name).filter(OpticalProduct.id == item_id).first()
        if optical:
            return optical[0]
        # Fallback: try Products table
        product = db.query(Product.product_name).filter(Product.id == item_id).first()
        return product[0] if product else None
    
    if item_type == "product":
        # Direct product lookup
        product = db.query(Product.product_name).filter(Product.id == item_id).first()
        return product[0] if product else None
    
    return None


def _resolve_item_name_with_fallback(
    db: Session,
    item_type: str,
    item_id: uuid.UUID,
    hospital_id: Optional[uuid.UUID] = None,
    unit_price: Optional[float] = None,
) -> Optional[str]:
    """Resolve item name by id first, then by unique hospital price match for legacy rows."""
    # Try direct lookup first
    by_id = _resolve_item_name(db, item_type, item_id)
    if by_id:
        return by_id
    
    # For product type, also try matching by name or price
    if item_type == "product" and hospital_id:
        # Try matching by unit_price if provided
        if unit_price is not None:
            by_price = db.query(Product.product_name).filter(
                Product.hospital_id == hospital_id,
                Product.is_active == True,
                Product.is_deleted == False,
                Product.purchase_price == unit_price,
            ).limit(2).all()
            if len(by_price) == 1:
                return by_price[0][0]
    
    if hospital_id is None or unit_price is None:
        return None

    # Legacy medicine lookup by price
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

    # Legacy optical product lookup by price
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
    # Try to parse as UUID first
    parsed_id = None
    if item_id and item_id.strip():
        try:
            parsed_id = uuid.UUID(item_id)
        except (ValueError, AttributeError):
            # Not a valid UUID, treat item_id as a name
            pass

    if item_type == "medicine":
        # If we have a valid UUID, check if it exists in Medicine table
        if parsed_id:
            exists = db.query(Medicine.id).filter(Medicine.id == parsed_id).first()
            if exists:
                return parsed_id
            # Also check Products table (for product-based medicines)
            product_exists = db.query(Product.id).filter(Product.id == parsed_id).first()
            if product_exists:
                return parsed_id
        # Fall back to name lookup in Medicine table
        lookup_name = item_name or item_id
        if lookup_name and lookup_name.strip():
            match = db.query(Medicine.id).filter(func.lower(Medicine.name) == lookup_name.strip().lower()).first()
            if match:
                return match[0]
        # If UUID was provided but not found, return it anyway
        if parsed_id:
            return parsed_id

    if item_type == "optical_product":
        # If we have a valid UUID, check if it exists in OpticalProduct table
        if parsed_id:
            exists = db.query(OpticalProduct.id).filter(OpticalProduct.id == parsed_id).first()
            if exists:
                return parsed_id
            # Also check Products table
            product_exists = db.query(Product.id).filter(Product.id == parsed_id).first()
            if product_exists:
                return parsed_id
        # Fall back to name lookup
        lookup_name = item_name or item_id
        if lookup_name and lookup_name.strip():
            match = db.query(OpticalProduct.id).filter(func.lower(OpticalProduct.name) == lookup_name.strip().lower()).first()
            if match:
                return match[0]
        # If UUID was provided but not found, return it anyway
        if parsed_id:
            return parsed_id

    if item_type == "product":
        # Direct product lookup
        if parsed_id:
            exists = db.query(Product.id).filter(Product.id == parsed_id).first()
            if exists:
                return parsed_id
        # Fall back to name lookup
        lookup_name = item_name or item_id
        if lookup_name and lookup_name.strip():
            match = db.query(Product.id).filter(
                func.lower(Product.product_name) == lookup_name.strip().lower()
            ).first()
            if match:
                return match[0]
        # If UUID was provided but not found, return it anyway
        if parsed_id:
            return parsed_id

    # Return the parsed_id if we have one
    if parsed_id:
        return parsed_id

    # For other item types or when item_id is empty but item_name is provided,
    # return a placeholder UUID (the system will store it as-is for generic items)
    if item_name and item_name.strip():
        # For non-medicine/optical items, we allow creation with just a name
        # Generate a deterministic UUID based on the item name for consistency
        import hashlib
        hash_bytes = hashlib.md5(f"{item_type}:{item_name}".encode()).digest()
        return uuid.UUID(bytes=hash_bytes)

    raise ValueError(f"Could not resolve item_id for type {item_type}: item_id={item_id}, item_name={item_name}")


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
        # Resolve item_id if provided, otherwise use None for manual entries
        resolved_item_id = None
        resolved_product_id = None
        
        if item.item_id and item.item_id.strip():
            try:
                resolved_item_id = _resolve_item_id(db, item.item_type, item.item_id, getattr(item, "item_name", None))
                
                # If item_type is 'medicine' or 'optical_product', also resolve product_id
                # This establishes the proper FK relationship to the products table
                if item.item_type in ('medicine', 'optical_product'):
                    from ..models.products import Product
                    product = db.query(Product).filter(
                        Product.id == resolved_item_id,
                        Product.hospital_id == hospital_id,
                        Product.is_deleted == False
                    ).first()
                    if product:
                        resolved_product_id = product.id
                        logger.debug(f"Resolved product_id {resolved_product_id} for item {item.item_name}")
                        
            except ValueError:
                # If resolution fails, use None (manual entry)
                logger.warning(f"Failed to resolve item_id for {item.item_name}")
                pass

        po_item = PurchaseOrderItem(
            purchase_order_id=po.id,
            item_type=item.item_type,
            item_id=resolved_item_id,
            product_id=resolved_product_id,  # Proper FK to products table
            item_name=item.item_name or "Unknown Item",
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
        # Use stored item_name, fallback to resolving from database if needed
        item_name = it.item_name
        
        # Try to resolve from products table first (if product_id exists)
        if not item_name and hasattr(it, 'product_id') and it.product_id:
            try:
                product = db.query(Product.product_name).filter(
                    Product.id == it.product_id
                ).first()
                if product:
                    item_name = product[0]
            except Exception:
                pass
        
        # Fallback to medicine/optical lookup
        if not item_name and it.item_id:
            try:
                item_name = _resolve_item_name_with_fallback(
                    db,
                    it.item_type,
                    it.item_id if isinstance(it.item_id, uuid.UUID) else uuid.UUID(it.item_id),
                    po.hospital_id,
                    float(it.unit_price),
                )
            except (ValueError, AttributeError):
                item_name = "Unknown Item"

        items.append({
            "id": str(it.id),
            "item_type": it.item_type,
            "item_id": str(it.item_id) if it.item_id else "",
            "product_id": str(it.product_id) if hasattr(it, 'product_id') and it.product_id else None,
            "item_name": item_name or "Unknown Item",
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
        # Resolve item_id if provided, otherwise use None for manual entries
        resolved_item_id = None
        resolved_product_id = None
        
        if item.item_id and item.item_id.strip():
            try:
                resolved_item_id = _resolve_item_id(db, item.item_type, item.item_id, getattr(item, "item_name", None))
                
                # If item_type is 'medicine' or 'optical_product', also resolve product_id
                if item.item_type in ('medicine', 'optical_product'):
                    from ..models.products import Product
                    product = db.query(Product).filter(
                        Product.id == resolved_item_id,
                        Product.hospital_id == hospital_id,
                        Product.is_deleted == False
                    ).first()
                    if product:
                        resolved_product_id = product.id
                        logger.debug(f"Resolved product_id {resolved_product_id} for GRN item {item.item_name}")
                        
            except ValueError:
                # If resolution fails, use None (manual entry)
                logger.warning(f"Failed to resolve item_id for GRN item {item.item_name}")
                pass

        grn_item = GRNItem(
            grn_id=grn.id,
            item_type=item.item_type,
            item_id=resolved_item_id,
            product_id=resolved_product_id,  # Proper FK to products table
            item_name=item.item_name or "Unknown Item",
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
    
    # Store previous status to detect transitions
    previous_status = grn.status
    
    update_data = data.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] in ("verified", "accepted") and verifier_id:
        grn.verified_by = verifier_id
    for k, v in update_data.items():
        setattr(grn, k, v)
    db.commit()
    db.refresh(grn)
    logger.info("GRN updated: %s → %s (previous: %s)", grn.grn_number, grn.status, previous_status)

    # When GRN transitions to "accepted", create stock-in movements and update PO received quantities
    # Only process if transitioning FROM a non-accepted status TO accepted
    if grn.status == "accepted" and previous_status != "accepted":
        _process_grn_acceptance(db, grn)
    elif grn.status == "accepted" and previous_status == "accepted":
        logger.warning("GRN %s is already accepted - skipping duplicate stock update", grn.grn_number)

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
    """
    On GRN acceptance, record stock_in movements, update PO item received qty, and update stock summary.
    
    This function is called when a GRN status transitions to 'accepted'.
    It performs the following operations:
    1. Creates stock movement records for audit trail
    2. Updates StockSummary.available_stock for product-based items
    3. Updates/creates MedicineBatch for legacy medicine items
    4. Updates PO received quantities if linked to a PO
    """
    grn_with_items = (
        db.query(GoodsReceiptNote)
        .options(joinedload(GoodsReceiptNote.items))
        .filter(GoodsReceiptNote.id == grn.id)
        .first()
    )
    if not grn_with_items:
        logger.error("GRN %s not found with items", grn.id)
        return

    items_processed = 0
    items_skipped = 0
    
    for item in grn_with_items.items:
        accepted = item.quantity_accepted if item.quantity_accepted is not None else item.quantity_received
        if accepted <= 0:
            logger.debug(f"Skipping item with zero/negative accepted quantity: {item.item_name}")
            items_skipped += 1
            continue

        # Skip items without item_id (manual entries without catalog mapping)
        if not item.item_id:
            logger.warning(f"Skipping GRN item without item_id (manual entry): {item.item_name}")
            items_skipped += 1
            continue

        try:
            # Calculate current balance from last movement
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
            new_balance = current_balance + accepted

            # Create stock movement record
            movement = StockMovement(
                hospital_id=grn.hospital_id,
                item_type=item.item_type,
                item_id=item.item_id,
                movement_type="stock_in",
                reference_type="grn",
                reference_id=grn.id,
                quantity=accepted,
                balance_after=new_balance,
                unit_cost=float(item.unit_price),
                notes=f"GRN {grn.grn_number} accepted",
                performed_by=grn.verified_by,
            )
            db.add(movement)

            # Update stock_summary for product-based items
            # Check if this item_id corresponds to a Product
            product = db.query(Product).filter(
                Product.id == item.item_id,
                Product.hospital_id == grn.hospital_id,
                Product.is_deleted == False,
            ).first()

            if product:
                # Get or create stock_summary for this product
                summary = db.query(StockSummary).filter(
                    StockSummary.product_id == item.item_id,
                    StockSummary.hospital_id == grn.hospital_id,
                ).first()

                if not summary:
                    # Create new stock_summary
                    logger.info(f"Creating new StockSummary for product {product.product_name}")
                    summary = StockSummary(
                        id=uuid.uuid4(),
                        hospital_id=grn.hospital_id,
                        product_id=item.item_id,
                        total_stock=0,
                        available_stock=0,
                        reserved_stock=0,
                        damaged_stock=0,
                        expired_stock=0,
                        total_batches=0,
                        avg_cost_price=0,
                        total_value=0,
                    )
                    db.add(summary)
                    db.flush()  # Get the ID

                # Store old values for logging
                old_available_stock = summary.available_stock or 0
                
                # Update stock_summary with new stock
                summary.total_stock = (summary.total_stock or 0) + accepted
                summary.available_stock = old_available_stock + accepted

                # Update total_value based on purchase price
                if product.purchase_price:
                    summary.total_value = summary.available_stock * float(product.purchase_price)
                else:
                    # Fallback to GRN item price if product has no purchase price
                    summary.total_value = summary.available_stock * float(item.unit_price)

                # Update avg_cost_price (weighted average if there was existing stock)
                if old_available_stock > 0 and summary.avg_cost_price:
                    # Weighted average: ((old_stock * old_price) + (new_stock * new_price)) / total_stock
                    old_value = old_available_stock * float(summary.avg_cost_price)
                    new_value = accepted * float(item.unit_price)
                    summary.avg_cost_price = (old_value + new_value) / summary.total_stock
                else:
                    summary.avg_cost_price = float(item.unit_price)

                # Check if low stock
                summary.is_low_stock = summary.available_stock <= (product.reorder_level or 0)
                
                # Update batch count if batch_number is provided
                if item.batch_number:
                    summary.total_batches = (summary.total_batches or 0) + 1
                
                # Update earliest expiry if expiry_date is provided
                if item.expiry_date:
                    if not summary.earliest_expiry or item.expiry_date < summary.earliest_expiry:
                        summary.earliest_expiry = item.expiry_date

                # Update timestamps
                summary.updated_at = func.now()
                summary.last_movement_at = func.now()

                logger.info(
                    "Stock summary updated for product %s (%s): %d + %d = %d units | Value: %.2f",
                    product.product_name, product.id, old_available_stock, accepted, 
                    summary.available_stock, summary.total_value
                )
                items_processed += 1

            # Create or update MedicineBatch for legacy medicine items (not mapped to Products)
            if item.item_type == "medicine" and not product:
                from ..models.pharmacy import MedicineBatch

                batch = db.query(MedicineBatch).filter(
                    MedicineBatch.medicine_id == item.item_id,
                    MedicineBatch.batch_number == item.batch_number,
                ).first()

                if batch:
                    # Update existing batch
                    batch.quantity += accepted
                    batch.initial_quantity += accepted
                    logger.debug(f"Updated existing batch {batch.batch_number}: +{accepted} units")
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
                    logger.debug(f"Created new batch {batch.batch_number} with {accepted} units")

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
                    logger.debug(f"Updated PO item received quantity: +{accepted}")
                    
        except Exception as e:
            logger.error(
                f"Error processing GRN item {item.item_name} ({item.item_id}): {str(e)}",
                exc_info=True
            )
            # Continue processing other items instead of failing the entire GRN
            items_skipped += 1
            continue

    # Commit all changes (movements, stock summaries, batches, PO updates)
    db.commit()
    
    logger.info(
        "GRN %s acceptance processed: %d items processed, %d items skipped",
        grn.grn_number, items_processed, items_skipped
    )

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
        # Use stored item_name, fallback to resolving from database if needed
        item_name = it.item_name
        
        # Try to resolve from products table first (if product_id exists)
        if not item_name and hasattr(it, 'product_id') and it.product_id:
            try:
                product = db.query(Product.product_name).filter(
                    Product.id == it.product_id
                ).first()
                if product:
                    item_name = product[0]
            except Exception:
                pass
        
        # Fallback to medicine/optical lookup
        if not item_name and it.item_id:
            try:
                item_name = _resolve_item_name_with_fallback(
                    db,
                    it.item_type,
                    it.item_id if isinstance(it.item_id, uuid.UUID) else uuid.UUID(it.item_id),
                    grn.hospital_id,
                    float(it.unit_price),
                )
            except (ValueError, AttributeError):
                item_name = "Unknown Item"

        items.append({
            "id": str(it.id),
            "item_type": it.item_type,
            "item_id": str(it.item_id) if it.item_id else "",
            "product_id": str(it.product_id) if hasattr(it, 'product_id') and it.product_id else None,
            "item_name": item_name or "Unknown Item",
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
    """Return products and medicines below reorder level using stock_summary (centralized product catalog)."""
    # First, get low stock from products/stock_summary (centralized)
    low_stock_products = (
        db.query(Product, StockSummary)
        .join(StockSummary, Product.id == StockSummary.product_id)
        .filter(
            Product.hospital_id == hospital_id,
            Product.is_active == True,
            Product.is_deleted == False,
            StockSummary.is_low_stock == True,
        )
        .order_by(StockSummary.available_stock.asc(), Product.product_name.asc())
        .limit(limit)
        .all()
    )
    
    results = []
    for product, stock_summary in low_stock_products:
        results.append({
            "product_id": str(product.id),
            "item_id": str(product.id),
            "item_type": "product",
            "product_name": product.product_name,
            "item_name": product.product_name,
            "generic_name": product.generic_name,
            "category": product.category,
            "sku": product.sku,
            "current_stock": stock_summary.available_stock,
            "reorder_level": product.reorder_level,
            "min_stock_level": product.min_stock_level,
            "max_stock_level": product.max_stock_level,
            "purchase_price": float(product.purchase_price or 0),
            "supplier_name": None,  # Will be populated if needed
        })
    
    # Also include medicines that don't have product entries yet (legacy support)
    if len(results) < limit:
        medicines = (
            db.query(Medicine.id, Medicine.name, Medicine.generic_name, Medicine.reorder_level, Medicine.purchase_price)
            .filter(
                Medicine.hospital_id == hospital_id, 
                Medicine.is_active == True,
            )
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

        for med in medicines:
            current = stock_map.get(med.id, 0)
            reorder = med.reorder_level or 10
            if current <= reorder:
                # Check if this medicine already exists in results via product
                if not any(r.get("item_id") == str(med.id) for r in results):
                    results.append({
                        "item_id": str(med.id),
                        "item_type": "medicine",
                        "item_name": med.name,
                        "generic_name": med.generic_name,
                        "current_stock": current,
                        "reorder_level": reorder,
                        "purchase_price": float(med.purchase_price or 0),
                    })
    
    results.sort(key=lambda x: (x.get("current_stock", 0), x.get("item_name") or ""))
    return results[:limit]


def get_expiring_items(db: Session, hospital_id: uuid.UUID, days: int = 90) -> list:
    """Return products and batches expiring within the given number of days."""
    from datetime import timedelta
    cutoff = date.today() + timedelta(days=days)
    
    # Get expiring products from stock_summary (centralized)
    expiring_products = (
        db.query(Product, StockSummary)
        .join(StockSummary, Product.id == StockSummary.product_id)
        .filter(
            Product.hospital_id == hospital_id,
            Product.is_active == True,
            Product.is_deleted == False,
            StockSummary.is_expiring_soon == True,
            StockSummary.earliest_expiry != None,
            StockSummary.earliest_expiry <= cutoff,
        )
        .order_by(StockSummary.earliest_expiry.asc())
        .limit(50)
        .all()
    )
    
    results = []
    for product, stock_summary in expiring_products:
        days_until = (stock_summary.earliest_expiry - date.today()).days if stock_summary.earliest_expiry else None
        results.append({
            "product_id": str(product.id),
            "item_id": str(product.id),
            "item_type": "product",
            "product_name": product.product_name,
            "item_name": product.product_name,
            "generic_name": product.generic_name,
            "category": product.category,
            "batch_number": None,  # Aggregated from multiple batches
            "expiry_date": str(stock_summary.earliest_expiry) if stock_summary.earliest_expiry else None,
            "days_until_expiry": days_until,
            "quantity": stock_summary.available_stock,
            "unit_price": float(product.purchase_price or 0),
        })
    
    # Also include medicine batches that don't have product entries yet (legacy support)
    if len(results) < 50:
        expiring_batches = (
            db.query(MedicineBatch, Medicine)
            .join(Medicine, MedicineBatch.medicine_id == Medicine.id)
            .filter(
                Medicine.hospital_id == hospital_id,
                Medicine.is_active == True,
                MedicineBatch.is_active == True,
                MedicineBatch.expiry_date != None,
                MedicineBatch.expiry_date <= cutoff,
            )
            .order_by(MedicineBatch.expiry_date.asc())
            .limit(50 - len(results))
            .all()
        )
        
        for batch, med in expiring_batches:
            days_until = (batch.expiry_date - date.today()).days if batch.expiry_date else None
            results.append({
                "item_id": str(med.id),
                "item_type": "medicine",
                "item_name": med.name,
                "batch_number": batch.batch_number,
                "expiry_date": str(batch.expiry_date),
                "days_until_expiry": days_until,
                "quantity": batch.quantity,
                "unit_price": float(batch.purchase_price or 0),
            })
    
    results.sort(key=lambda x: x.get("expiry_date") or "")
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
        balance_after = 0
        
        # Check if this is a product-based item (new system)
        product = db.query(Product).filter(
            Product.id == adj.item_id,
            Product.hospital_id == adj.hospital_id,
            Product.is_deleted == False,
        ).first()
        
        if product:
            # It's a product - use stock_summary and stock_movements (no medicine_batches)
            # First, ensure stock_summary exists for this product
            summary = db.query(StockSummary).filter(
                StockSummary.product_id == adj.item_id,
                StockSummary.hospital_id == adj.hospital_id,
            ).first()
            
            if not summary:
                # Create stock_summary if it doesn't exist
                summary = StockSummary(
                    id=uuid.uuid4(),
                    hospital_id=adj.hospital_id,
                    product_id=adj.item_id,
                    total_stock=0,
                    available_stock=0,
                    reserved_stock=0,
                    damaged_stock=0,
                    expired_stock=0,
                    total_batches=0,
                    avg_cost_price=0,
                    total_value=0,
                )
                db.add(summary)
                db.flush()
            
            # Calculate new balance
            current_balance = summary.available_stock or 0
            balance_after = current_balance + qty
            
            # Validate we don't go negative
            if balance_after < 0:
                db.rollback()
                raise ValueError(f"Insufficient stock for adjustment. Current: {current_balance}, Requested: {abs(qty)}")
            
            # Update stock_summary
            if adj.adjustment_type == "increase":
                summary.total_stock = (summary.total_stock or 0) + qty
                summary.available_stock = balance_after
            elif adj.adjustment_type == "decrease":
                summary.total_stock = max(0, (summary.total_stock or 0) + qty)
                summary.available_stock = balance_after
            elif adj.adjustment_type == "write_off":
                summary.damaged_stock = (summary.damaged_stock or 0) + abs(qty)
                summary.available_stock = balance_after
            
            # Update total_value based on purchase price
            if product.purchase_price:
                summary.total_value = summary.available_stock * float(product.purchase_price)
            
            movement_batch_id = None  # Products don't use batches for adjustments
            
        elif adj.item_type == "medicine":
            # Legacy medicine table (not product-based)
            try:
                movement_batch_id = _apply_medicine_batch_delta(db, adj.item_id, qty, adj.batch_id)
                balance_after = _get_medicine_batch_stock(db, adj.item_id)
            except ValueError as e:
                db.rollback()
                raise ValueError(f"Stock adjustment failed: {str(e)}")
        else:
            # Other legacy item types
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

        logger.info("Stock adjustment approved: %s (qty=%d, balance_after=%d)", adj.adjustment_number, qty, balance_after)

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
    """Aggregate stats for the inventory dashboard - integrated with products catalog."""
    # Supplier stats
    total_suppliers = db.query(func.count(Supplier.id)).filter(
        Supplier.hospital_id == hospital_id, Supplier.is_active == True
    ).scalar() or 0

    # Purchase Order stats
    active_pos = db.query(func.count(PurchaseOrder.id)).filter(
        PurchaseOrder.hospital_id == hospital_id,
        PurchaseOrder.status.in_(["draft", "submitted", "approved", "partially_received"]),
    ).scalar() or 0

    # GRN stats
    pending_grns = db.query(func.count(GoodsReceiptNote.id)).filter(
        GoodsReceiptNote.hospital_id == hospital_id,
        GoodsReceiptNote.status == "pending",
    ).scalar() or 0

    # Adjustment stats
    pending_adjustments = db.query(func.count(StockAdjustment.id)).filter(
        StockAdjustment.hospital_id == hospital_id,
        StockAdjustment.status == "pending",
    ).scalar() or 0

    # Product catalog stats (centralized)
    total_products = db.query(func.count(Product.id)).filter(
        Product.hospital_id == hospital_id,
        Product.is_active == True,
        Product.is_deleted == False,
    ).scalar() or 0
    
    total_medicines = db.query(func.count(Product.id)).filter(
        Product.hospital_id == hospital_id,
        Product.category == "medicine",
        Product.is_active == True,
        Product.is_deleted == False,
    ).scalar() or 0
    
    total_optical = db.query(func.count(Product.id)).filter(
        Product.hospital_id == hospital_id,
        Product.category == "optical",
        Product.is_active == True,
        Product.is_deleted == False,
    ).scalar() or 0

    # Stock summary stats
    total_stock_value = db.query(func.coalesce(func.sum(StockSummary.total_value), 0)).filter(
        StockSummary.hospital_id == hospital_id,
    ).scalar() or 0
    
    low_stock_count = db.query(func.count(StockSummary.id)).filter(
        StockSummary.hospital_id == hospital_id,
        StockSummary.is_low_stock == True,
    ).scalar() or 0
    
    expiring_soon_count = db.query(func.count(StockSummary.id)).filter(
        StockSummary.hospital_id == hospital_id,
        StockSummary.is_expiring_soon == True,
    ).scalar() or 0
    
    # Stock alerts
    total_alerts = db.query(func.count(StockAlert.id)).filter(
        StockAlert.hospital_id == hospital_id,
        StockAlert.is_resolved == False,
    ).scalar() or 0
    
    critical_alerts = db.query(func.count(StockAlert.id)).filter(
        StockAlert.hospital_id == hospital_id,
        StockAlert.is_resolved == False,
        StockAlert.severity == "critical",
    ).scalar() or 0

    # Get detailed low stock and expiring items
    low_stock = get_low_stock_items(db, hospital_id, limit=5)
    expiring = get_expiring_items(db, hospital_id, days=90)

    return {
        # Legacy fields for backward compatibility
        "total_suppliers": total_suppliers,
        "active_purchase_orders": active_pos,
        "pending_grns": pending_grns,
        "pending_adjustments": pending_adjustments,
        "low_stock_items": low_stock,
        "expiring_items": expiring[:5],
        "low_stock_count": len(low_stock),
        "expiring_count": len(expiring),
        
        # New product-centric fields
        "total_products": total_products,
        "total_medicines": total_medicines,
        "total_optical": total_optical,
        "total_stock_value": float(total_stock_value),
        "low_stock_products": low_stock_count,
        "expiring_soon_products": expiring_soon_count,
        "total_alerts": total_alerts,
        "critical_alerts": critical_alerts,
    }
