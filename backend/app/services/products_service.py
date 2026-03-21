"""
Products and Stock Management Service.
Business logic for product catalog and stock tracking.
"""
import logging
import math
import uuid
from datetime import date, datetime, timedelta
from typing import Optional, List

from sqlalchemy import func, or_, and_, desc
from sqlalchemy.orm import Session, joinedload

from ..models.products import Product, StockSummary, StockAlert
from ..models.inventory import PurchaseOrderItem, GoodsReceiptNote, GRNItem, StockMovement
from ..models.pharmacy import MedicineBatch
from ..models.prescription import Medicine
from ..schemas.products import (
    ProductCreate, ProductUpdate,
    StockAlertCreate, StockAlertUpdate,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Product Management
# ─────────────────────────────────────────────────────────────────────────────

def create_product(db: Session, data: ProductCreate, hospital_id: str, user_id: str) -> Product:
    """Create a new product in the catalog."""
    product = Product(
        hospital_id=hospital_id,
        product_name=data.product_name,
        generic_name=data.generic_name,
        brand_name=data.brand_name,
        category=data.category,
        subcategory=data.subcategory,
        sku=data.sku,
        barcode=data.barcode,
        manufacturer=data.manufacturer,
        supplier_id=data.supplier_id,
        purchase_price=data.purchase_price,
        selling_price=data.selling_price,
        mrp=data.mrp,
        tax_percentage=data.tax_percentage,
        unit_type=data.unit_type,
        pack_size=data.pack_size,
        min_stock_level=data.min_stock_level,
        max_stock_level=data.max_stock_level,
        reorder_level=data.reorder_level,
        storage_conditions=data.storage_conditions,
        shelf_life_days=data.shelf_life_days,
        requires_refrigeration=data.requires_refrigeration,
        is_hazardous=data.is_hazardous,
        is_narcotic=data.is_narcotic,
        requires_prescription=data.requires_prescription,
        created_by=user_id,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    logger.info(f"Product created: {product.product_name} (id={product.id})")
    return product


def get_product(db: Session, product_id: str) -> Optional[Product]:
    """Get product by ID."""
    return db.query(Product).filter(
        Product.id == product_id,
        Product.is_deleted == False
    ).first()


def list_products(
    db: Session,
    hospital_id: str,
    page: int = 1,
    limit: int = 20,
    category: Optional[str] = None,
    search: Optional[str] = None,
    is_active: Optional[bool] = True,
) -> dict:
    """List products with pagination and filters."""
    query = db.query(Product).filter(
        Product.hospital_id == hospital_id,
        Product.is_deleted == False
    )
    
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)
    
    if category:
        query = query.filter(Product.category == category)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Product.product_name.ilike(search_term),
                Product.generic_name.ilike(search_term),
                Product.brand_name.ilike(search_term),
                Product.sku.ilike(search_term),
            )
        )
    
    total = query.count()
    products = query.order_by(Product.product_name).offset((page - 1) * limit).limit(limit).all()
    
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": max(1, math.ceil(total / limit)),
        "data": products,
    }


def update_product(db: Session, product_id: str, data: ProductUpdate, user_id: str) -> Optional[Product]:
    """Update product details."""
    product = get_product(db, product_id)
    if not product:
        return None
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(product, key, value)
    
    product.updated_by = user_id
    db.commit()
    db.refresh(product)
    logger.info(f"Product updated: {product.product_name}")
    return product


def delete_product(db: Session, product_id: str) -> bool:
    """Soft delete a product."""
    product = get_product(db, product_id)
    if not product:
        return False
    
    product.is_deleted = True
    product.is_active = False
    db.commit()
    logger.info(f"Product deleted: {product.product_name}")
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Stock Summary & Overview
# ─────────────────────────────────────────────────────────────────────────────

def get_stock_dashboard(db: Session, hospital_id: str) -> dict:
    """Get stock overview dashboard statistics."""
    # Total products
    total_products = db.query(Product).filter(
        Product.hospital_id == hospital_id,
        Product.is_deleted == False
    ).count()
    
    active_products = db.query(Product).filter(
        Product.hospital_id == hospital_id,
        Product.is_active == True,
        Product.is_deleted == False
    ).count()
    
    # Stock summary stats
    stock_stats = db.query(
        func.coalesce(func.sum(StockSummary.total_value), 0),
        func.count(func.case((StockSummary.is_low_stock == True, 1))),
        func.count(func.case((StockSummary.is_expiring_soon == True, 1))),
    ).filter(StockSummary.hospital_id == hospital_id).first()
    
    total_value = float(stock_stats[0]) if stock_stats else 0
    low_stock_count = stock_stats[1] if stock_stats else 0
    expiring_count = stock_stats[2] if stock_stats else 0
    
    # Alerts
    alert_stats = db.query(
        func.count(StockAlert.id),
        func.count(func.case((StockAlert.severity == 'critical', 1))),
    ).filter(
        StockAlert.hospital_id == hospital_id,
        StockAlert.is_resolved == False
    ).first()
    
    total_alerts = alert_stats[0] if alert_stats else 0
    critical_alerts = alert_stats[1] if alert_stats else 0
    
    return {
        "total_products": total_products,
        "active_products": active_products,
        "total_stock_value": total_value,
        "low_stock_count": low_stock_count,
        "expiring_soon_count": expiring_count,
        "expired_count": 0,  # Would need batch-level query
        "overstocked_count": 0,
        "total_alerts": total_alerts,
        "critical_alerts": critical_alerts,
    }


def get_low_stock_items(
    db: Session,
    hospital_id: str,
    limit: int = 50,
) -> List[dict]:
    """Get items with low stock levels."""
    results = db.query(
        Product,
        StockSummary.available_stock,
    ).join(
        StockSummary,
        Product.id == StockSummary.product_id,
        isouter=True
    ).filter(
        Product.hospital_id == hospital_id,
        Product.is_active == True,
        Product.is_deleted == False,
        or_(
            StockSummary.available_stock <= Product.reorder_level,
            and_(StockSummary.available_stock.is_(None), Product.min_stock_level > 0)
        )
    ).order_by(
        StockSummary.available_stock.nullsfirst()
    ).limit(limit).all()
    
    items = []
    for product, stock in results:
        items.append({
            "product_id": str(product.id),
            "product_name": product.product_name,
            "category": product.category,
            "sku": product.sku,
            "current_stock": stock or 0,
            "min_stock_level": product.min_stock_level,
            "reorder_level": product.reorder_level,
            "purchase_price": float(product.purchase_price or 0),
            "supplier_name": product.supplier.name if product.supplier else None,
        })
    
    return items


def get_expiring_items(
    db: Session,
    hospital_id: str,
    days: int = 90,
    limit: int = 50,
) -> List[dict]:
    """Get items expiring within specified days."""
    expiry_threshold = date.today() + timedelta(days=days)
    
    results = db.query(
        Product,
        StockSummary.earliest_expiry,
        StockSummary.total_stock,
        StockSummary.avg_cost_price,
    ).join(
        StockSummary,
        Product.id == StockSummary.product_id,
        isouter=True
    ).filter(
        Product.hospital_id == hospital_id,
        Product.is_active == True,
        Product.is_deleted == False,
        StockSummary.earliest_expiry <= expiry_threshold,
        StockSummary.earliest_expiry >= date.today()
    ).order_by(
        StockSummary.earliest_expiry
    ).limit(limit).all()
    
    items = []
    for product, expiry, stock, cost in results:
        days_until = (expiry - date.today()).days if expiry else None
        items.append({
            "product_id": str(product.id),
            "product_name": product.product_name,
            "category": product.category,
            "expiry_date": expiry,
            "days_until_expiry": days_until,
            "quantity": stock or 0,
            "unit_price": float(cost or 0),
        })
    
    return items


def search_products_for_typeahead(
    db: Session,
    hospital_id: uuid.UUID,
    query: str,
    category: Optional[str] = None,
    limit: int = 20,
) -> list:
    """
    Intelligent typeahead search for products.
    Returns simplified product suggestions for autocomplete dropdowns.
    
    Searches by:
    - Product name
    - Generic name
    - SKU
    - Barcode
    - Manufacturer
    """
    from ..models.products import Product
    
    search_term = f"%{query.strip()}%"
    
    # Build query
    q = db.query(Product).filter(
        Product.hospital_id == hospital_id,
        Product.is_active == True,
        Product.is_deleted == False,
    )
    
    # Search across multiple fields
    q = q.filter(
        or_(
            Product.product_name.ilike(search_term),
            Product.generic_name.ilike(search_term),
            Product.sku.ilike(search_term),
            Product.barcode.ilike(search_term),
            Product.manufacturer.ilike(search_term),
        )
    )
    
    # Filter by category if specified
    if category:
        q = q.filter(Product.category == category)
    
    # Order by relevance (name match first, then others)
    q = q.order_by(
        Product.product_name.ilike(f"{query.strip()}%").desc(),  # Starts with query first
        Product.product_name,
    )
    
    # Limit results
    products = q.limit(limit).all()
    
    # Format results for typeahead
    results = []
    for p in products:
        results.append({
            "id": str(p.id),
            "label": f"{p.product_name} ({p.generic_name or 'N/A'})",
            "sublabel": f"{p.manufacturer or ''} | SKU: {p.sku or 'N/A'} | ₹{float(p.selling_price or 0):.2f}",
            "metadata": {
                "id": str(p.id),
                "name": p.product_name,
                "generic_name": p.generic_name,
                "category": p.category,
                "subcategory": p.subcategory,
                "sku": p.sku,
                "barcode": p.barcode,
                "manufacturer": p.manufacturer,
                "purchase_price": float(p.purchase_price or 0),
                "selling_price": float(p.selling_price or 0),
                "mrp": float(p.mrp or 0),
                "unit_type": p.unit_type,
                "pack_size": p.pack_size or 1,
                "requires_prescription": p.requires_prescription,
            }
        })
    
    return results


def get_stock_overview(
    db: Session,
    hospital_id: str,
    page: int = 1,
    limit: int = 20,
    category: Optional[str] = None,
    search: Optional[str] = None,
    low_stock_only: bool = False,
    expiring_only: bool = False,
) -> dict:
    """Get comprehensive stock overview with filters."""
    query = db.query(Product, StockSummary).join(
        StockSummary,
        Product.id == StockSummary.product_id,
        isouter=True
    ).filter(
        Product.hospital_id == hospital_id,
        Product.is_deleted == False
    )
    
    if category:
        query = query.filter(Product.category == category)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Product.product_name.ilike(search_term),
                Product.sku.ilike(search_term),
            )
        )
    
    if low_stock_only:
        query = query.filter(
            or_(
                StockSummary.is_low_stock == True,
                StockSummary.available_stock <= Product.reorder_level
            )
        )
    
    if expiring_only:
        query = query.filter(StockSummary.is_expiring_soon == True)
    
    total = query.count()
    results = query.order_by(Product.product_name).offset((page - 1) * limit).limit(limit).all()
    
    data = []
    for product, summary in results:
        data.append({
            "id": str(product.id),
            "product_name": product.product_name,
            "category": product.category,
            "sku": product.sku,
            "unit_type": product.unit_type,
            "total_stock": summary.total_stock if summary else 0,
            "available_stock": summary.available_stock if summary else 0,
            "total_value": float(summary.total_value) if summary else 0,
            "is_low_stock": summary.is_low_stock if summary else False,
            "is_expiring_soon": summary.is_expiring_soon if summary else False,
            "earliest_expiry": summary.earliest_expiry if summary else None,
            "min_stock_level": product.min_stock_level,
            "reorder_level": product.reorder_level,
        })
    
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": max(1, math.ceil(total / limit)),
        "data": data,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Stock Alerts
# ─────────────────────────────────────────────────────────────────────────────

def create_stock_alert(db: Session, data: StockAlertCreate, hospital_id: str) -> StockAlert:
    """Create a new stock alert."""
    alert = StockAlert(
        hospital_id=hospital_id,
        product_id=data.product_id if hasattr(data, 'product_id') else None,
        alert_type=data.alert_type,
        severity=data.severity,
        title=data.title,
        message=data.message,
        current_stock=data.current_stock,
        threshold_stock=data.threshold_stock,
        expiry_date=data.expiry_date,
        days_until_expiry=data.days_until_expiry,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def list_stock_alerts(
    db: Session,
    hospital_id: str,
    page: int = 1,
    limit: int = 20,
    alert_type: Optional[str] = None,
    severity: Optional[str] = None,
    unresolved_only: bool = True,
) -> dict:
    """List stock alerts with filters."""
    query = db.query(StockAlert).filter(
        StockAlert.hospital_id == hospital_id
    )
    
    if unresolved_only:
        query = query.filter(StockAlert.is_resolved == False)
    
    if alert_type:
        query = query.filter(StockAlert.alert_type == alert_type)
    
    if severity:
        query = query.filter(StockAlert.severity == severity)
    
    total = query.count()
    alerts = query.order_by(
        desc(StockAlert.created_at)
    ).offset((page - 1) * limit).limit(limit).all()
    
    # Enrich with product names
    data = []
    for alert in alerts:
        data.append({
            "id": str(alert.id),
            "hospital_id": str(alert.hospital_id),
            "product_id": str(alert.product_id) if alert.product_id else None,
            "product_name": alert.product.product_name if alert.product else None,
            "alert_type": alert.alert_type,
            "severity": alert.severity,
            "title": alert.title,
            "message": alert.message,
            "current_stock": alert.current_stock,
            "threshold_stock": alert.threshold_stock,
            "expiry_date": alert.expiry_date,
            "days_until_expiry": alert.days_until_expiry,
            "is_resolved": alert.is_resolved,
            "resolved_at": alert.resolved_at,
            "acknowledged_at": alert.acknowledged_at,
            "created_at": alert.created_at,
        })
    
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": max(1, math.ceil(total / limit)),
        "data": data,
    }


def resolve_alert(db: Session, alert_id: str, user_id: str) -> Optional[StockAlert]:
    """Mark an alert as resolved."""
    alert = db.query(StockAlert).filter(StockAlert.id == alert_id).first()
    if not alert:
        return None
    
    alert.is_resolved = True
    alert.resolved_at = datetime.utcnow()
    alert.resolved_by = user_id
    db.commit()
    db.refresh(alert)
    return alert


def acknowledge_alert(db: Session, alert_id: str, user_id: str) -> Optional[StockAlert]:
    """Acknowledge an alert."""
    alert = db.query(StockAlert).filter(StockAlert.id == alert_id).first()
    if not alert:
        return None
    
    alert.acknowledged_at = datetime.utcnow()
    alert.acknowledged_by = user_id
    db.commit()
    db.refresh(alert)
    return alert


# ─────────────────────────────────────────────────────────────────────────────
# Stock Sync Utilities
# ─────────────────────────────────────────────────────────────────────────────

def sync_stock_summary(db: Session, hospital_id: str, product_id: Optional[str] = None) -> None:
    """
    Synchronize stock summary with actual stock movements and batches.
    Can sync all products or a specific product.
    """
    query = db.query(Product).filter(
        Product.hospital_id == hospital_id,
        Product.is_deleted == False
    )

    if product_id:
        query = query.filter(Product.id == product_id)

    products = query.all()

    for product in products:
        # Calculate stock from movements (using product_id)
        movements = db.query(StockMovement).filter(
            StockMovement.hospital_id == hospital_id,
            StockMovement.product_id == product.id
        ).all()

        # If no movements by product_id, try by item_id (legacy support)
        if not movements:
            movements = db.query(StockMovement).filter(
                StockMovement.hospital_id == hospital_id,
                StockMovement.item_type == 'medicine',
                StockMovement.item_id == product.id
            ).all()

        total_in = sum(m.quantity for m in movements if m.movement_type in ['stock_in', 'return'])
        total_out = sum(m.quantity for m in movements if m.movement_type in ['stock_out', 'sale', 'dispensing', 'expired', 'damaged'])

        available_stock = total_in - total_out

        # Get batch info from medicine_batches (using product_id)
        batches = db.query(MedicineBatch).filter(
            MedicineBatch.product_id == product.id,
            MedicineBatch.is_active == True
        ).all()

        # If no batches by product_id, try by medicine_id (legacy support)
        if not batches:
            batches = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == product.id,
                MedicineBatch.is_active == True
            ).all()

        total_batches = len(batches)
        earliest_expiry = min((b.expiry_date for b in batches), default=None) if batches else None

        # Calculate value from batches
        total_value = sum(b.quantity * (b.purchase_price or 0) for b in batches if b.quantity)

        # Calculate average cost price
        avg_cost = sum(b.purchase_price or 0 for b in batches) / len(batches) if batches else 0

        # Update or create stock summary
        summary = db.query(StockSummary).filter(
            StockSummary.hospital_id == hospital_id,
            StockSummary.product_id == product.id
        ).first()

        if summary:
            summary.available_stock = max(0, available_stock)  # Prevent negative stock
            summary.total_stock = max(0, total_in)
            summary.total_batches = total_batches
            summary.earliest_expiry = earliest_expiry
            summary.total_value = total_value
            summary.avg_cost_price = avg_cost
            summary.is_low_stock = available_stock <= product.reorder_level
            summary.is_expiring_soon = earliest_expiry and earliest_expiry <= date.today() + timedelta(days=90)
            summary.updated_at = func.now()
        else:
            summary = StockSummary(
                hospital_id=hospital_id,
                product_id=product.id,
                available_stock=max(0, available_stock),
                total_stock=max(0, total_in),
                total_batches=total_batches,
                earliest_expiry=earliest_expiry,
                total_value=total_value,
                avg_cost_price=avg_cost,
                is_low_stock=available_stock <= product.reorder_level,
                is_expiring_soon=earliest_expiry and earliest_expiry <= date.today() + timedelta(days=90),
            )
            db.add(summary)

    db.commit()
    logger.info(f"Stock summary synced for hospital {hospital_id}, product={product_id}")
