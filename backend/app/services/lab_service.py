"""
Laboratory service — business logic for the test catalog, doctor-authored
orders, the lab queue, billing headers, and result entry.

Mirrors optical_service.py: create_lab_order uses the same retry-on-
IntegrityError loop as create_optical_prescription for order-number
generation, and enqueue_lab_queue_entry reuses the shared
get_or_assign_visit_token so a lab order inherits the patient's existing
visit token instead of minting a fresh daily counter.
"""
import uuid
import logging
from decimal import Decimal
from math import ceil
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from .pharmacy_service import _filter_model_data
from .notification_service import notify_hospital_users
from ..core.hospital_time import hospital_today_by_id, hospital_today_utc_range_by_id
from ..models.lab import LabTest, LabOrder, LabOrderItem, LabSale

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════
# Lab Test catalog CRUD
# ══════════════════════════════════════════════════

def create_lab_test(db: Session, hospital_id: uuid.UUID, data: dict) -> LabTest:
    payload = _filter_model_data(LabTest, data)
    test = LabTest(hospital_id=hospital_id, **payload)
    db.add(test)
    db.commit()
    db.refresh(test)
    return test


def get_lab_test_by_id(
    db: Session, test_id: str | uuid.UUID, hospital_id: Optional[uuid.UUID] = None,
) -> Optional[LabTest]:
    if isinstance(test_id, str):
        try:
            test_id = uuid.UUID(test_id)
        except ValueError:
            return None
    q = db.query(LabTest).filter(LabTest.id == test_id)
    if hospital_id is not None:
        q = q.filter(LabTest.hospital_id == hospital_id)
    return q.first()


def list_lab_tests(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True,
) -> dict:
    query = db.query(LabTest).filter(LabTest.hospital_id == hospital_id)
    if active_only:
        query = query.filter(LabTest.is_active == True)
    if category:
        query = query.filter(LabTest.category == category)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(or_(LabTest.name.ilike(s), LabTest.code.ilike(s)))
    total = query.count()
    items = query.order_by(LabTest.name.asc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": ceil(total / limit) if limit else 1,
        "data": items,
    }


def update_lab_test(db: Session, test_id: str | uuid.UUID, data: dict) -> Optional[LabTest]:
    test = get_lab_test_by_id(db, test_id)
    if not test:
        return None
    for key, value in data.items():
        if hasattr(test, key) and value is not None:
            setattr(test, key, value)
    db.commit()
    db.refresh(test)
    return test


def deactivate_lab_test(db: Session, test_id: str | uuid.UUID) -> bool:
    test = get_lab_test_by_id(db, test_id)
    if not test:
        return False
    test.is_active = False
    db.commit()
    return True


# ══════════════════════════════════════════════════
# Lab Order
# ══════════════════════════════════════════════════

def _generate_order_number(db: Session, hospital_id: uuid.UUID) -> str:
    # order_number carries a database-wide UNIQUE constraint (not scoped to
    # hospital_id), so the running count must be global too — see the same
    # reasoning in optical_service._generate_prescription_number.
    year = datetime.now(timezone.utc).strftime("%y")
    count = db.query(func.count(LabOrder.id)).scalar() or 0
    return f"LAB-{year}-{count + 1:04d}"


def create_lab_order(
    db: Session,
    hospital_id: uuid.UUID,
    data: dict,
    created_by: Optional[uuid.UUID] = None,
) -> LabOrder:
    from ..models.appointment import Doctor
    from ..models.patient import Patient
    from sqlalchemy.exc import IntegrityError

    patient_id = uuid.UUID(data["patient_id"])
    appointment_id = uuid.UUID(data["appointment_id"]) if data.get("appointment_id") else None
    prescription_id = uuid.UUID(data["prescription_id"]) if data.get("prescription_id") else None
    test_ids = data.get("test_ids") or []
    notes = data.get("notes")

    # Resolve doctor: explicit doctor_id, else fall back to logged-in doctor
    # (matches create_optical_prescription).
    if data.get("doctor_id"):
        doctor = db.query(Doctor).filter(Doctor.id == uuid.UUID(data["doctor_id"])).first()
        if not doctor:
            raise ValueError("Doctor not found")
    else:
        if not created_by:
            raise ValueError("No doctor_id provided and no logged-in doctor to fall back to")
        doctor = db.query(Doctor).filter(Doctor.user_id == created_by).first()
        if not doctor:
            raise ValueError("No doctor_id provided and current user is not a doctor")

    # Snapshot each ordered test (name + price) at order time — scoped to this
    # hospital so a test_id from another tenant can't be ordered here.
    tests = (
        db.query(LabTest)
        .filter(LabTest.id.in_([uuid.UUID(t) for t in test_ids]), LabTest.hospital_id == hospital_id)
        .all()
    )
    if not tests:
        raise ValueError("No valid lab tests selected")

    last_error: Exception | None = None
    for _ in range(5):
        order = LabOrder(
            hospital_id=hospital_id,
            order_number=_generate_order_number(db, hospital_id),
            patient_id=patient_id,
            doctor_id=doctor.id,
            appointment_id=appointment_id,
            prescription_id=prescription_id,
            notes=notes,
        )
        db.add(order)
        try:
            db.flush()
        except IntegrityError as e:
            db.rollback()
            last_error = e
            continue

        for t in tests:
            db.add(LabOrderItem(
                lab_order_id=order.id,
                lab_test_id=t.id,
                test_name=t.name,
                price=t.price or Decimal("0"),
            ))
        db.commit()
        db.refresh(order)

        # Notify lab staff that a new order is ready (matches optical timing).
        try:
            patient = db.query(Patient).filter(Patient.id == patient_id).first()
            patient_name = f"{patient.first_name} {patient.last_name}".strip() if patient else "a patient"
            notify_hospital_users(
                db=db,
                hospital_id=hospital_id,
                title="New Lab Order",
                message=f"Lab order {order.order_number} for {patient_name} is ready.",
                notification_type="lab",
                priority="normal",
                reference_type="lab_order",
                reference_id=order.id,
                role_names=["lab_technician", "admin"],
                exclude_user_ids=[created_by] if created_by else None,
            )
        except Exception:
            logger.warning("Failed to send lab order notification", exc_info=True)

        return order
    raise last_error


def get_lab_order_by_id(
    db: Session, order_id: str | uuid.UUID, hospital_id: Optional[uuid.UUID] = None,
) -> Optional[LabOrder]:
    if isinstance(order_id, str):
        try:
            order_id = uuid.UUID(order_id)
        except ValueError:
            return None
    q = db.query(LabOrder).filter(LabOrder.id == order_id)
    if hospital_id is not None:
        q = q.filter(LabOrder.hospital_id == hospital_id)
    return q.first()


def enqueue_lab_queue_entry(db: Session, lab_order: LabOrder) -> None:
    """Assign the lab order its queue token and mark it waiting — called from
    finalize_prescription, not order creation (an order isn't queued until the
    clinical Rx it's attached to is finalized). Reuses the shared visit token
    so the patient keeps one token across every department."""
    from .billing_queue_service import get_or_assign_visit_token

    if lab_order.queue_token:
        return
    lab_order.queue_token = get_or_assign_visit_token(
        db, lab_order.hospital_id, lab_order.appointment_id
    )
    lab_order.queue_status = "waiting"
    db.flush()


def _enrich_order(db: Session, order: LabOrder) -> dict:
    """Serialize an order with items + billing summary for the response."""
    from ..schemas.lab import LabOrderResponse, LabOrderItemResponse

    resp = LabOrderResponse.model_validate(order)
    resp.patient_name = order.patient.full_name if getattr(order, "patient", None) else None
    resp.doctor_name = (
        f"Dr. {order.doctor.user.full_name}" if getattr(order, "doctor", None) and order.doctor.user else None
    )
    items = order.items or []
    resp.items = [LabOrderItemResponse.model_validate(i) for i in items]
    resp.total_amount = sum((i.price or Decimal("0")) for i in items)

    sale = db.query(LabSale).filter(LabSale.lab_order_id == order.id).first()
    if sale:
        resp.sale_id = str(sale.id)
        resp.payment_status = sale.payment_status
    else:
        resp.payment_status = "pending"
    return resp


def list_lab_queue(db: Session, hospital_id: uuid.UUID) -> list[dict]:
    """Today's finalized lab orders ordered by queue token — mirrors
    list_pharmacy_queue_entries."""
    day_start, day_end = hospital_today_utc_range_by_id(db, hospital_id)
    orders = (
        db.query(LabOrder)
        .filter(
            LabOrder.hospital_id == hospital_id,
            LabOrder.is_finalized == True,
            LabOrder.created_at >= day_start,
            LabOrder.created_at < day_end,
        )
        .order_by(LabOrder.queue_token.asc())
        .all()
    )
    result = []
    for o in orders:
        total = sum((i.price or Decimal("0")) for i in (o.items or []))
        sale = db.query(LabSale).filter(LabSale.lab_order_id == o.id).first()
        result.append({
            "id": str(o.id),
            "order_number": o.order_number,
            "patient_name": o.patient.full_name if getattr(o, "patient", None) else None,
            "queue_token": o.queue_token,
            "queue_status": o.queue_status or "waiting",
            "status": o.status,
            "total_amount": total,
            "payment_status": sale.payment_status if sale else "pending",
            "created_at": o.created_at,
            "queue_called_at": o.queue_called_at,
        })
    return result


LAB_QUEUE_STATUSES = ("waiting", "being_served", "collected")


def advance_lab_queue_status(db: Session, order_id: str | uuid.UUID, new_status: str) -> Optional[LabOrder]:
    if new_status not in LAB_QUEUE_STATUSES:
        raise ValueError(
            f"Invalid queue status '{new_status}'. Must be one of: {', '.join(LAB_QUEUE_STATUSES)}"
        )
    order = get_lab_order_by_id(db, order_id)
    if not order:
        return None
    order.queue_status = new_status
    if new_status == "being_served" and not order.queue_called_at:
        order.queue_called_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    return order


# ══════════════════════════════════════════════════
# Lab Sale (billing header)
# ══════════════════════════════════════════════════

def _generate_sale_number(db: Session, hospital_id: uuid.UUID) -> str:
    # sale_number is database-wide UNIQUE — count globally, same as order_number.
    count = db.query(func.count(LabSale.id)).scalar() or 0
    return f"LAB-S-{count + 1:06d}"


def get_or_create_lab_sale(db: Session, order: LabOrder) -> LabSale:
    """Get-or-create the billing header for an order; total is computed from
    the order's item snapshots."""
    from sqlalchemy.exc import IntegrityError

    existing = db.query(LabSale).filter(LabSale.lab_order_id == order.id).first()
    if existing:
        return existing

    total = sum((i.price or Decimal("0")) for i in (order.items or []))

    last_error: Exception | None = None
    for _ in range(5):
        sale = LabSale(
            hospital_id=order.hospital_id,
            sale_number=_generate_sale_number(db, order.hospital_id),
            lab_order_id=order.id,
            patient_id=order.patient_id,
            subtotal=total,
            total_amount=total,
            balance_amount=total,
            payment_status="pending",
            status="pending",
        )
        db.add(sale)
        try:
            db.commit()
        except IntegrityError as e:
            db.rollback()
            last_error = e
            continue
        db.refresh(sale)
        return sale
    raise last_error


def sync_lab_sale_payment_status(
    db: Session,
    order_id: str | uuid.UUID,
    hospital_id: uuid.UUID,
    amount_paid: Decimal,
    payment_method: Optional[str] = None,
) -> Optional[LabSale]:
    """Non-authoritative post-payment sync — mirrors dispensing_service
    .mark_dispensing_paid. The real money is collected through the generic
    Invoice/Payment path; this just keeps the lab sale's denormalized status
    in step for the worklist view."""
    order = get_lab_order_by_id(db, order_id, hospital_id=hospital_id)
    if not order:
        return None
    sale = get_or_create_lab_sale(db, order)

    total = sale.total_amount or Decimal("0")
    sale.paid_amount = amount_paid
    sale.balance_amount = max(Decimal("0"), total - amount_paid)
    sale.payment_status = "paid" if amount_paid >= total else ("partial" if amount_paid > 0 else "pending")
    if sale.payment_status == "paid":
        sale.status = "completed"
    if payment_method:
        sale.payment_method = payment_method

    db.commit()
    db.refresh(sale)
    return sale


# ══════════════════════════════════════════════════
# Results
# ══════════════════════════════════════════════════

def record_lab_result(
    db: Session,
    order_item_id: str | uuid.UUID,
    hospital_id: uuid.UUID,
    result: dict,
    resulted_by: Optional[uuid.UUID] = None,
) -> Optional[LabOrderItem]:
    if isinstance(order_item_id, str):
        try:
            order_item_id = uuid.UUID(order_item_id)
        except ValueError:
            return None

    item = (
        db.query(LabOrderItem)
        .join(LabOrder, LabOrder.id == LabOrderItem.lab_order_id)
        .filter(LabOrderItem.id == order_item_id, LabOrder.hospital_id == hospital_id)
        .first()
    )
    if not item:
        return None

    item.result_value = result.get("result_value")
    item.result_unit = result.get("result_unit")
    if result.get("reference_range"):
        item.reference_range = result.get("reference_range")
    item.result_flag = result.get("result_flag")
    item.result_notes = result.get("result_notes")
    item.status = "completed"
    item.resulted_at = datetime.now(timezone.utc)
    item.resulted_by = resulted_by

    # If every item on the order is now completed, flip the order's overall
    # status too.
    order = db.query(LabOrder).filter(LabOrder.id == item.lab_order_id).first()
    if order:
        siblings = db.query(LabOrderItem).filter(LabOrderItem.lab_order_id == order.id).all()
        if siblings and all(s.status == "completed" for s in siblings):
            order.status = "completed"
        elif order.status == "ordered":
            order.status = "in_progress"

    db.commit()
    db.refresh(item)
    return item


def get_patient_lab_results(db: Session, patient_id: str | uuid.UUID, hospital_id: uuid.UUID) -> list[dict]:
    """Finalized orders + their items for a patient — for PatientDetail.tsx."""
    if isinstance(patient_id, str):
        try:
            patient_id = uuid.UUID(patient_id)
        except ValueError:
            return []

    orders = (
        db.query(LabOrder)
        .filter(
            LabOrder.hospital_id == hospital_id,
            LabOrder.patient_id == patient_id,
            LabOrder.is_finalized == True,
        )
        .order_by(LabOrder.created_at.desc())
        .all()
    )
    result = []
    for o in orders:
        result.append({
            "id": str(o.id),
            "order_number": o.order_number,
            "status": o.status,
            "created_at": o.created_at,
            "doctor_name": f"Dr. {o.doctor.user.full_name}" if getattr(o, "doctor", None) and o.doctor.user else None,
            "items": [
                {
                    "id": str(i.id),
                    "test_name": i.test_name,
                    "status": i.status,
                    "result_value": i.result_value,
                    "result_unit": i.result_unit,
                    "reference_range": i.reference_range,
                    "result_flag": i.result_flag,
                    "result_notes": i.result_notes,
                    "resulted_at": i.resulted_at,
                }
                for i in (o.items or [])
            ],
        })
    return result


# ══════════════════════════════════════════════════
# Dashboard
# ══════════════════════════════════════════════════

def get_lab_dashboard(db: Session, hospital_id: uuid.UUID) -> dict:
    today = hospital_today_by_id(db, hospital_id)
    day_start, day_end = hospital_today_utc_range_by_id(db, hospital_id)

    total_tests = db.query(func.count(LabTest.id)).filter(
        LabTest.hospital_id == hospital_id, LabTest.is_active == True
    ).scalar() or 0

    today_orders = db.query(func.count(LabOrder.id)).filter(
        LabOrder.hospital_id == hospital_id,
        LabOrder.is_finalized == True,
        LabOrder.created_at >= day_start,
        LabOrder.created_at < day_end,
    ).scalar() or 0

    waiting = db.query(func.count(LabOrder.id)).filter(
        LabOrder.hospital_id == hospital_id,
        LabOrder.is_finalized == True,
        LabOrder.queue_status == "waiting",
        LabOrder.created_at >= day_start,
        LabOrder.created_at < day_end,
    ).scalar() or 0

    # Pending results = finalized orders not yet fully completed.
    pending_results = db.query(func.count(LabOrder.id)).filter(
        LabOrder.hospital_id == hospital_id,
        LabOrder.is_finalized == True,
        LabOrder.status != "completed",
    ).scalar() or 0

    today_revenue = db.query(func.coalesce(func.sum(LabSale.paid_amount), 0)).filter(
        LabSale.hospital_id == hospital_id,
        func.date(LabSale.created_at) == today,
    ).scalar() or Decimal("0")

    return {
        "total_tests": total_tests,
        "today_orders_count": today_orders,
        "waiting_count": waiting,
        "pending_results_count": pending_results,
        "today_revenue": today_revenue,
    }
