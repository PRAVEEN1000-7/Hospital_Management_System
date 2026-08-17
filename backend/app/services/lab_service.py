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
from ..models.lab import LabTest, LabTestPanel, LabOrder, LabOrderItem, LabSale, LabReferral

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


def update_lab_test(
    db: Session, test_id: str | uuid.UUID, data: dict, hospital_id: Optional[uuid.UUID] = None,
) -> Optional[LabTest]:
    test = get_lab_test_by_id(db, test_id, hospital_id=hospital_id)
    if not test:
        return None
    for key, value in data.items():
        if hasattr(test, key) and value is not None:
            setattr(test, key, value)
    db.commit()
    db.refresh(test)
    return test


def deactivate_lab_test(db: Session, test_id: str | uuid.UUID, hospital_id: Optional[uuid.UUID] = None) -> bool:
    test = get_lab_test_by_id(db, test_id, hospital_id=hospital_id)
    if not test:
        return False
    test.is_active = False
    db.commit()
    return True


def is_lab_test_in_use(db: Session, test_id: str | uuid.UUID) -> bool:
    """LabOrderItem.lab_test_id has no ON DELETE clause, so the DB itself
    would already reject deleting a test that's been ordered at least
    once — checked explicitly by the router first so it can return a clear
    409 instead of a raw FK violation (same reasoning as
    is_lab_order_billed)."""
    return db.query(LabOrderItem).filter(LabOrderItem.lab_test_id == test_id).first() is not None


def delete_lab_test(db: Session, test: LabTest) -> None:
    """Hard-deletes a catalog entry. Unlike deactivate_lab_test (which just
    hides it from new orders while every past LabOrderItem snapshot still
    resolves its name/price independently), this permanently removes the
    row — only safe once is_lab_test_in_use has confirmed nothing still
    references it."""
    db.delete(test)
    db.commit()


# ══════════════════════════════════════════════════
# Lab Test Package CRUD — named bundles of catalog tests
# ══════════════════════════════════════════════════

def _coerce_test_ids(data: dict) -> dict:
    """test_ids arrives as a list[str] from the Pydantic schema — the ARRAY
    column needs real uuid.UUID elements, same explicit-parse convention
    used everywhere else IDs cross the API boundary in this module."""
    if "test_ids" in data and data["test_ids"] is not None:
        data = {**data, "test_ids": [uuid.UUID(t) for t in data["test_ids"]]}
    return data


def create_lab_panel(db: Session, hospital_id: uuid.UUID, data: dict) -> LabTestPanel:
    payload = _filter_model_data(LabTestPanel, _coerce_test_ids(data))
    panel = LabTestPanel(hospital_id=hospital_id, **payload)
    db.add(panel)
    db.commit()
    db.refresh(panel)
    return panel


def get_lab_panel_by_id(
    db: Session, panel_id: str | uuid.UUID, hospital_id: Optional[uuid.UUID] = None,
) -> Optional[LabTestPanel]:
    if isinstance(panel_id, str):
        try:
            panel_id = uuid.UUID(panel_id)
        except ValueError:
            return None
    q = db.query(LabTestPanel).filter(LabTestPanel.id == panel_id)
    if hospital_id is not None:
        q = q.filter(LabTestPanel.hospital_id == hospital_id)
    return q.first()


def list_lab_panels(db: Session, hospital_id: uuid.UUID, active_only: bool = True) -> list[LabTestPanel]:
    query = db.query(LabTestPanel).filter(LabTestPanel.hospital_id == hospital_id)
    if active_only:
        query = query.filter(LabTestPanel.is_active == True)
    return query.order_by(LabTestPanel.name).all()


def update_lab_panel(
    db: Session, panel_id: str | uuid.UUID, data: dict, hospital_id: Optional[uuid.UUID] = None,
) -> Optional[LabTestPanel]:
    panel = get_lab_panel_by_id(db, panel_id, hospital_id=hospital_id)
    if not panel:
        return None
    for key, value in _coerce_test_ids(data).items():
        if hasattr(panel, key) and value is not None:
            setattr(panel, key, value)
    db.commit()
    db.refresh(panel)
    return panel


def deactivate_lab_panel(db: Session, panel_id: str | uuid.UUID, hospital_id: Optional[uuid.UUID] = None) -> bool:
    panel = get_lab_panel_by_id(db, panel_id, hospital_id=hospital_id)
    if not panel:
        return False
    panel.is_active = False
    db.commit()
    return True


def _enrich_panel(db: Session, panel: LabTestPanel) -> dict:
    """Attach the resolved member tests for the response — the frontend
    never has to cross-reference test_ids against the catalog itself."""
    from ..schemas.lab import LabTestPanelResponse, LabTestResponse

    resp = LabTestPanelResponse.model_validate(panel)
    if panel.test_ids:
        tests = db.query(LabTest).filter(LabTest.id.in_(panel.test_ids)).all()
        by_id = {str(t.id): t for t in tests}
        # Preserve panel.test_ids order rather than the query's arbitrary
        # order, and silently skip any id that no longer resolves (e.g. a
        # catalog test hard-deleted after the panel was created).
        resp.tests = [LabTestResponse.model_validate(by_id[tid]) for tid in resp.test_ids if tid in by_id]
    return resp


def is_lab_order_billed(db: Session, order_id: str | uuid.UUID) -> bool:
    """LabSale.lab_order_id has no ON DELETE clause, so the DB itself would
    already reject deleting a billed order — checked explicitly by the
    router first so it can return a clear 409 instead of a raw FK
    violation."""
    return db.query(LabSale).filter(LabSale.lab_order_id == order_id).first() is not None


def delete_lab_order(db: Session, order: LabOrder) -> None:
    """Hard-deletes a lab order and its items (LabOrderItem cascades via the
    ORM relationship). Unlike deactivate_lab_test (a catalog entry, kept for
    historical order references), an order has nothing else pointing at it
    once billing hasn't started (see is_lab_order_billed)."""
    db.delete(order)
    db.commit()


# ══════════════════════════════════════════════════
# Lab Order
# ══════════════════════════════════════════════════

def _generate_order_number(db: Session, hospital_id: uuid.UUID) -> str:
    # order_number carries a database-wide UNIQUE constraint (not scoped to
    # hospital_id), so the running count must be global too — see the same
    # reasoning in optical_service._generate_prescription_number.
    #
    # MAX(existing seq)+1, not COUNT(*)+1 — a hard-deleted order (e.g. via
    # the lab-order-deletion feature) leaves a numbering gap, so COUNT(*) of
    # surviving rows no longer matches the highest number already issued and
    # collides with a still-existing row (every retry then regenerates the
    # same colliding value, since the surviving count never changes).
    year = datetime.now(timezone.utc).strftime("%y")
    last = db.query(LabOrder.order_number).order_by(LabOrder.order_number.desc()).limit(1).scalar()
    try:
        seq = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
    except ValueError:
        seq = 1
    return f"LAB-{year}-{seq:04d}"


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

    # Scoped to this hospital — an unchecked patient_id would let this order
    # (and its enrichment, which surfaces the patient's name) reference a
    # patient from a different hospital entirely.
    patient_check = db.query(Patient).filter(Patient.id == patient_id, Patient.hospital_id == hospital_id).first()
    if not patient_check:
        raise ValueError("Patient not found")

    # Resolve doctor: explicit doctor_id, else fall back to logged-in doctor
    # (matches create_optical_prescription). If neither is available (e.g. a
    # lab_technician ordering tests for a walk-in with no consultation),
    # doctor_id is left as None — doctor_id is nullable precisely for this
    # case, so this is not an error condition.
    doctor = None
    if data.get("doctor_id"):
        doctor = db.query(Doctor).filter(Doctor.id == uuid.UUID(data["doctor_id"]), Doctor.hospital_id == hospital_id).first()
        if not doctor:
            raise ValueError("Doctor not found")
    elif created_by:
        doctor = db.query(Doctor).filter(Doctor.user_id == created_by).first()

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
            doctor_id=doctor.id if doctor else None,
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

        # Standalone order — no prescription_id, meaning it wasn't created
        # from the doctor's Prescription Builder (which always passes one;
        # see PrescriptionBuilder.tsx's labService.createOrder call). That's
        # the case for a lab_technician (or admin) ordering tests directly
        # for a walk-in who hasn't seen a doctor: there is no later
        # finalize_prescription call to finalize+queue it (see that
        # function's "finalize the linked lab order" step), so without this
        # it would sit with is_finalized=False and no queue_token forever —
        # invisible to list_lab_queue, which only shows finalized orders.
        # Finalize it immediately instead so it enters today's lab queue
        # right away, same as any other walk-in service.
        if not prescription_id:
            order.is_finalized = True
            enqueue_lab_queue_entry(db, order)
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
    from ..models.user import User
    from ..schemas.lab import LabOrderResponse, LabOrderItemResponse

    resp = LabOrderResponse.model_validate(order)
    resp.patient_name = order.patient.full_name if getattr(order, "patient", None) else None
    resp.doctor_name = (
        f"Dr. {order.doctor.user.full_name}" if getattr(order, "doctor", None) and order.doctor.user else None
    )
    if order.finalized_by:
        finalizer = db.query(User).filter(User.id == order.finalized_by).first()
        resp.finalized_by_name = finalizer.full_name if finalizer else None

    items = order.items or []
    item_resps = []
    for i in items:
        item_resp = LabOrderItemResponse.model_validate(i)
        item_resp.report_template = (i.test.report_template or []) if getattr(i, "test", None) else []
        item_resps.append(item_resp)
    resp.items = item_resps
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


def advance_lab_queue_status(
    db: Session, order_id: str | uuid.UUID, new_status: str, hospital_id: Optional[uuid.UUID] = None,
) -> Optional[LabOrder]:
    if new_status not in LAB_QUEUE_STATUSES:
        raise ValueError(
            f"Invalid queue status '{new_status}'. Must be one of: {', '.join(LAB_QUEUE_STATUSES)}"
        )
    order = get_lab_order_by_id(db, order_id, hospital_id=hospital_id)
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
    # MAX(existing seq)+1, not COUNT(*)+1 — see _generate_order_number above.
    last = db.query(LabSale.sale_number).order_by(LabSale.sale_number.desc()).limit(1).scalar()
    try:
        seq = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
    except ValueError:
        seq = 1
    return f"LAB-S-{seq:06d}"


def get_or_create_lab_sale(db: Session, order: LabOrder) -> LabSale:
    """Get-or-create the billing header for an order; total is computed live
    from the order's item prices (see LabOrderItem.price / billed_name —
    entered by billing staff via update_lab_order_item_billing, never
    derived from the catalog) so an already-existing-but-unpaid sale's total
    doesn't stay stuck at whatever it was when first created."""
    from sqlalchemy.exc import IntegrityError

    total = sum((i.price or Decimal("0")) for i in (order.items or []))

    existing = db.query(LabSale).filter(LabSale.lab_order_id == order.id).first()
    if existing:
        if existing.payment_status != "paid" and existing.total_amount != total:
            existing.subtotal = total
            existing.total_amount = total
            existing.balance_amount = max(Decimal("0"), total - (existing.paid_amount or Decimal("0")))
            db.commit()
            db.refresh(existing)
        return existing

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


def get_or_create_lab_invoice(
    db: Session, order: LabOrder, sale: LabSale, user_id: uuid.UUID,
) -> "Invoice":  # noqa: F821 — typing only, imported below to avoid a cycle
    """Get-or-create the generic Invoice a lab order's payments are recorded
    against, reused across every partial-payment collection instead of
    minting a fresh one each call (that was the original bug in
    LabOrderDetail.tsx's handleCollectPayment — every click created a brand
    new invoice). Mirrors
    invoice_service.get_or_create_consultation_invoice_for_appointment, but
    keyed off LabSale.invoice_id since a lab order has no direct FK slot on
    Invoice the way an OPD appointment does."""
    from ..models.invoice import Invoice
    from .invoice_service import create_invoice, issue_invoice
    from ..schemas.invoice import InvoiceCreate, InvoiceItemCreate

    if sale.invoice_id:
        existing = (
            db.query(Invoice)
            .filter(
                Invoice.id == sale.invoice_id,
                Invoice.hospital_id == order.hospital_id,
                Invoice.is_deleted == False,
                Invoice.status.notin_(["void", "cancelled"]),
            )
            .first()
        )
        if existing:
            return existing

    items = [
        InvoiceItemCreate(
            item_type="lab_test",
            reference_id=str(item.lab_test_id),
            # Billing name, when staff entered one at collection time, takes
            # over the invoice line — the doctor's own views always show
            # item.test_name instead and are untouched by this.
            description=item.billed_name or item.test_name,
            quantity=Decimal("1"),
            unit_price=item.price or Decimal("0"),
            display_order=idx,
        )
        for idx, item in enumerate(order.items or [])
    ]
    invoice = create_invoice(
        db,
        InvoiceCreate(
            patient_id=str(order.patient_id),
            invoice_type="lab",
            notes=f"Lab order {order.order_number}",
            items=items,
        ),
        user_id=user_id,
        hospital_id=order.hospital_id,
    )
    invoice = issue_invoice(db, invoice)
    sale.invoice_id = invoice.id
    db.commit()
    db.refresh(sale)
    return invoice


def collect_lab_sale_payment(
    db: Session,
    order_id: str | uuid.UUID,
    hospital_id: uuid.UUID,
    amount: Decimal,
    payment_method: Optional[str],
    user_id: uuid.UUID,
    payment_reference: Optional[str] = None,
) -> Optional[LabSale]:
    """Collect a partial or full payment against a lab order's bill — the
    real-money counterpart the old sync_lab_sale_payment_status only
    pretended to be. Reuses one Invoice per order (get_or_create_lab_invoice)
    and records the payment through the generic Invoice/Payment path
    (payment_service.record_payment), which already correctly accumulates
    multiple payments against one invoice and rejects overpayment — then
    re-syncs the LabSale's denormalized totals from the invoice so the
    billing worklist / lab dashboard revenue figure stay in step.

    Raises ValueError (surfaced by the router as 400) if the amount would
    overpay the balance, or the underlying invoice can't accept payment —
    see payment_service.record_payment.
    """
    from .payment_service import record_payment
    from ..schemas.payment import PaymentCreate

    order = get_lab_order_by_id(db, order_id, hospital_id=hospital_id)
    if not order:
        return None
    sale = get_or_create_lab_sale(db, order)
    invoice = get_or_create_lab_invoice(db, order, sale, user_id)

    record_payment(
        db,
        PaymentCreate(
            invoice_id=str(invoice.id),
            patient_id=str(order.patient_id),
            amount=amount,
            payment_mode=payment_method or "cash",
            payment_reference=payment_reference,
        ),
        user_id=user_id,
        hospital_id=hospital_id,
    )
    db.refresh(invoice)

    total = sale.total_amount or Decimal("0")
    sale.paid_amount = invoice.paid_amount or Decimal("0")
    sale.balance_amount = max(Decimal("0"), total - sale.paid_amount)
    sale.payment_status = "paid" if sale.paid_amount >= total else ("partial" if sale.paid_amount > 0 else "pending")
    if sale.payment_status == "paid":
        sale.status = "completed"
    if payment_method:
        sale.payment_method = payment_method

    db.commit()
    db.refresh(sale)
    return sale


def list_lab_billing(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    payment_status: Optional[str] = None,
    date_from=None,
    date_to=None,
) -> dict:
    """Billing worklist for the standalone Lab Billing page (LabBilling.tsx)
    — every lab order with its payment status, independent of queue/report
    state. Sourced from LabOrder (not LabSale) since a LabSale doesn't exist
    until the first payment is collected — see get_or_create_lab_sale — so
    an unbilled order still needs to show up here as "pending"."""
    from ..models.patient import Patient

    query = (
        db.query(LabOrder, LabSale)
        .outerjoin(LabSale, LabSale.lab_order_id == LabOrder.id)
        .filter(LabOrder.hospital_id == hospital_id)
    )
    if search:
        s = f"%{search.strip()}%"
        query = query.join(Patient, LabOrder.patient_id == Patient.id).filter(
            or_(
                LabOrder.order_number.ilike(s),
                Patient.first_name.ilike(s),
                Patient.last_name.ilike(s),
                func.concat(Patient.first_name, " ", Patient.last_name).ilike(s),
            )
        )
    if date_from:
        query = query.filter(func.date(LabOrder.created_at) >= date_from)
    if date_to:
        query = query.filter(func.date(LabOrder.created_at) <= date_to)
    if payment_status:
        if payment_status == "pending":
            query = query.filter(or_(LabSale.payment_status == "pending", LabSale.id.is_(None)))
        else:
            query = query.filter(LabSale.payment_status == payment_status)

    total = query.count()
    rows = (
        query.order_by(LabOrder.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    data = []
    for order, sale in rows:
        order_total = sum((i.price or Decimal("0")) for i in (order.items or []))
        data.append({
            "id": str(order.id),
            "order_number": order.order_number,
            "patient_id": str(order.patient_id),
            "patient_name": order.patient.full_name if getattr(order, "patient", None) else None,
            "total_amount": order_total,
            "paid_amount": sale.paid_amount if sale else Decimal("0"),
            "balance_amount": sale.balance_amount if sale else order_total,
            "payment_status": sale.payment_status if sale else "pending",
            "report_status": order.report_status,
            "created_at": order.created_at,
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": ceil(total / limit) if limit else 1,
        "data": data,
    }


# ══════════════════════════════════════════════════
# Results
# ══════════════════════════════════════════════════

# Severity order used to roll a per-parameter flag list up into a single
# item-level badge (worst flag wins) without the caller having to parse JSON.
_FLAG_SEVERITY = {"abnormal": 3, "high": 2, "low": 2, "normal": 1}


def _aggregate_flag(parameters: list[dict]) -> Optional[str]:
    best = None
    best_score = -1
    for p in parameters:
        flag = (p or {}).get("flag")
        score = _FLAG_SEVERITY.get(flag, 0)
        if score > best_score:
            best_score = score
            best = flag
    return best


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

    order = db.query(LabOrder).filter(LabOrder.id == item.lab_order_id).first()
    if order and order.report_status == "finalized":
        raise ValueError("Report already finalized; results are locked")

    parameters = list(result.get("parameters") or [])
    item.parameters = parameters
    item.result_notes = result.get("result_notes")
    item.result_flag = _aggregate_flag(parameters)
    item.status = "completed"
    item.resulted_at = datetime.now(timezone.utc)
    item.resulted_by = resulted_by

    # If every item on the order is now completed, flip the order's overall
    # status (and report_status, unless already finalized) too.
    if order:
        siblings = db.query(LabOrderItem).filter(LabOrderItem.lab_order_id == order.id).all()
        if siblings and all(s.status == "completed" for s in siblings):
            order.status = "completed"
            if order.report_status == "pending":
                order.report_status = "completed"
        elif order.status == "ordered":
            order.status = "in_progress"

    db.commit()
    db.refresh(item)
    return item


def update_lab_order_item_test(
    db: Session,
    order: LabOrder,
    item_id: str | uuid.UUID,
    lab_test_id: str,
    hospital_id: uuid.UUID,
) -> Optional[LabOrderItem]:
    """Swap an order item to a different catalog test — for the fee-collection
    screen (LabCollectPayment.tsx), when staff picked the wrong test at order
    time and need to correct it before payment is collected.

    Safe editing boundary (raises ValueError, which the router turns into a
    409 — distinct from the 404s below, which mean "doesn't exist"):

    - Blocked once order.report_status == 'finalized': that's a locked
      clinical record, same rule record_lab_result already enforces for
      result entry (see above).
    - Blocked once ANY payment has been collected against the order
      (sale.paid_amount > 0), including partial. Swapping *which* test an
      item bills for after money has changed hands means the patient's
      payment receipt would no longer describe what was actually paid for —
      a real audit-trail problem, not just an arithmetic one — so
      this function refuses outright rather than trying to recompute its way
      around it.

    Returns None if the item or the target test doesn't exist (scoped to
    this hospital/order) — the router turns that into a 404.
    """
    if isinstance(item_id, str):
        try:
            item_id = uuid.UUID(item_id)
        except ValueError:
            return None

    item = (
        db.query(LabOrderItem)
        .filter(LabOrderItem.id == item_id, LabOrderItem.lab_order_id == order.id)
        .first()
    )
    if not item:
        return None

    if order.report_status == "finalized":
        raise ValueError("Report already finalized; items are locked")

    sale = db.query(LabSale).filter(LabSale.lab_order_id == order.id).first()
    if sale and (sale.paid_amount or Decimal("0")) > 0:
        raise ValueError("Cannot change items after payment has been collected against this order")

    try:
        test_uuid = uuid.UUID(lab_test_id)
    except ValueError:
        return None
    test = (
        db.query(LabTest)
        .filter(LabTest.id == test_uuid, LabTest.hospital_id == hospital_id)
        .first()
    )
    if not test:
        return None

    item.lab_test_id = test.id
    item.test_name = test.name
    item.price = test.price or Decimal("0")
    # A custom billing name entered for the old test no longer describes
    # what this line now bills for — clear it so the invoice falls back to
    # the new test_name rather than silently keeping the stale label.
    item.billed_name = None
    db.commit()
    db.refresh(item)
    db.refresh(order)

    # get_or_create_lab_sale already self-heals a sale's totals from current
    # LabOrderItem rows on its next call (see there), which is enough for
    # the fee-collection screen's own re-fetch — but syncing here too means
    # any other reader of LabSale sees the corrected total immediately, not
    # only after that explicit re-fetch.
    if sale:
        total = sum((i.price or Decimal("0")) for i in (order.items or []))
        if sale.total_amount != total:
            sale.subtotal = total
            sale.total_amount = total
            sale.balance_amount = max(Decimal("0"), total - (sale.paid_amount or Decimal("0")))
            db.commit()

    return item


def update_lab_order_item_billing(
    db: Session,
    order: LabOrder,
    item_id: str | uuid.UUID,
    price: Decimal,
    billed_name: Optional[str],
    hospital_id: uuid.UUID,
) -> Optional[LabOrderItem]:
    """Set the actual billed amount (and, optionally, a billing-only display
    name) for one order item — reached from the fee-collection screen
    (LabCollectPayment.tsx). This is now the ONLY way an item's price is
    ever set: LabTest.price (the catalog) is always ₹0 — see
    LabTestCreate/LabTestUpdate, which no longer accept a price at all — so
    every order starts at ₹0 and billing staff enters the real amount here,
    per line, at collection time.

    billed_name is independent of test_name: test_name stays the catalog
    snapshot forever and is what the doctor's report and PrescriptionBuilder
    always display (see LabOrderDetail.tsx / the Lab Results panel) — this
    field, when set, is what the invoice and billing worklist show instead.
    Passing None/blank clears it, falling back to test_name on the invoice.

    Same edit boundary as update_lab_order_item_test (see its docstring for
    the full reasoning): blocked once order.report_status == 'finalized',
    or once any payment has been collected against the order.
    """
    if isinstance(item_id, str):
        try:
            item_id = uuid.UUID(item_id)
        except ValueError:
            return None

    item = (
        db.query(LabOrderItem)
        .filter(LabOrderItem.id == item_id, LabOrderItem.lab_order_id == order.id)
        .first()
    )
    if not item:
        return None

    if order.report_status == "finalized":
        raise ValueError("Report already finalized; items are locked")

    sale = db.query(LabSale).filter(LabSale.lab_order_id == order.id).first()
    if sale and (sale.paid_amount or Decimal("0")) > 0:
        raise ValueError("Cannot change items after payment has been collected against this order")

    item.price = price
    item.billed_name = (billed_name or "").strip() or None
    db.commit()
    db.refresh(item)
    db.refresh(order)

    if sale:
        total = sum((i.price or Decimal("0")) for i in (order.items or []))
        if sale.total_amount != total:
            sale.subtotal = total
            sale.total_amount = total
            sale.balance_amount = max(Decimal("0"), total - (sale.paid_amount or Decimal("0")))
            db.commit()

    return item


def finalize_lab_report(
    db: Session,
    order_id: str | uuid.UUID,
    hospital_id: uuid.UUID,
    user_id: uuid.UUID,
) -> LabOrder:
    """Lock the report and make it visible on the patient page. Requires
    every item to be resulted and payment to be collected — see
    LabOrderDetail.tsx / PatientDetail.tsx for how report_status gates
    doctor visibility."""
    order = get_lab_order_by_id(db, order_id, hospital_id=hospital_id)
    if not order:
        raise ValueError("Lab order not found")
    if order.report_status == "finalized":
        raise ValueError("Report is already finalized")

    items = order.items or []
    if not items or any(i.status != "completed" for i in items):
        raise ValueError("All test results must be entered before finalizing")

    sale = db.query(LabSale).filter(LabSale.lab_order_id == order.id).first()
    if not sale or sale.payment_status != "paid":
        raise ValueError("Collect payment before finalizing the report")

    order.report_status = "finalized"
    order.status = "completed"
    order.finalized_at = datetime.now(timezone.utc)
    order.finalized_by = user_id
    db.commit()
    db.refresh(order)
    return order


def get_patient_lab_results(db: Session, patient_id: str | uuid.UUID, hospital_id: uuid.UUID) -> list[dict]:
    """Finalized reports + their items for a patient — for PatientDetail.tsx.
    Gated on report_status (the lab explicitly finalizing the report), not
    is_finalized (which only means the doctor finalized the prescription)."""
    from ..models.user import User

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
            LabOrder.report_status == "finalized",
        )
        .order_by(LabOrder.created_at.desc())
        .all()
    )
    result = []
    for o in orders:
        finalizer_name = None
        if o.finalized_by:
            finalizer = db.query(User).filter(User.id == o.finalized_by).first()
            finalizer_name = finalizer.full_name if finalizer else None

        items = []
        for i in (o.items or []):
            parameters = i.parameters or []
            if not parameters and i.result_value:
                # Fallback for rows entered before structured parameters
                # existed — render the legacy single value as one row.
                parameters = [{
                    "name": i.test_name,
                    "value": i.result_value,
                    "unit": i.result_unit,
                    "reference_range": i.reference_range,
                    "flag": i.result_flag,
                }]
            items.append({
                "id": str(i.id),
                "test_name": i.test_name,
                "status": i.status,
                "parameters": parameters,
                "result_notes": i.result_notes,
                "resulted_at": i.resulted_at,
            })

        result.append({
            "id": str(o.id),
            "order_number": o.order_number,
            "status": o.status,
            "created_at": o.created_at,
            "doctor_name": f"Dr. {o.doctor.user.full_name}" if getattr(o, "doctor", None) and o.doctor.user else None,
            "finalized_at": o.finalized_at,
            "finalized_by_name": finalizer_name,
            "items": items,
        })
    return result


# ══════════════════════════════════════════════════
# Lab Referral (external referral letter)
# ══════════════════════════════════════════════════

def _generate_referral_number(db: Session, hospital_id: uuid.UUID) -> str:
    # referral_number is database-wide UNIQUE — count globally, same reasoning
    # as _generate_order_number/_generate_sale_number above.
    # MAX(existing seq)+1, not COUNT(*)+1 — see _generate_order_number above.
    year = datetime.now(timezone.utc).strftime("%y")
    last = db.query(LabReferral.referral_number).order_by(LabReferral.referral_number.desc()).limit(1).scalar()
    try:
        seq = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
    except ValueError:
        seq = 1
    return f"LAB-REF-{year}-{seq:04d}"


def create_lab_referral(
    db: Session,
    hospital_id: uuid.UUID,
    data: dict,
    created_by: Optional[uuid.UUID] = None,
) -> LabReferral:
    from sqlalchemy.exc import IntegrityError
    from ..models.patient import Patient

    patient_id = uuid.UUID(data["patient_id"])

    # Scoped to this hospital — an unchecked patient_id would let this
    # referral (and its enrichment, which surfaces the patient's name)
    # reference a patient from a different hospital entirely.
    patient_check = db.query(Patient).filter(Patient.id == patient_id, Patient.hospital_id == hospital_id).first()
    if not patient_check:
        raise ValueError("Patient not found")

    last_error: Exception | None = None
    for _ in range(5):
        referral = LabReferral(
            hospital_id=hospital_id,
            referral_number=_generate_referral_number(db, hospital_id),
            patient_id=patient_id,
            recipient_title=data["recipient_title"],
            recipient_location=data.get("recipient_location"),
            case_details=data.get("case_details"),
            investigation=data["investigation"],
            remarks=data.get("remarks"),
            referring_doctor_name=data["referring_doctor_name"],
            created_by=created_by,
        )
        db.add(referral)
        try:
            db.commit()
        except IntegrityError as e:
            db.rollback()
            last_error = e
            continue
        db.refresh(referral)
        return referral
    raise last_error


def get_lab_referral_by_id(
    db: Session, referral_id: str | uuid.UUID, hospital_id: Optional[uuid.UUID] = None,
) -> Optional[LabReferral]:
    if isinstance(referral_id, str):
        try:
            referral_id = uuid.UUID(referral_id)
        except ValueError:
            return None
    q = db.query(LabReferral).filter(LabReferral.id == referral_id)
    if hospital_id is not None:
        q = q.filter(LabReferral.hospital_id == hospital_id)
    return q.first()


def get_patient_lab_referrals(
    db: Session, patient_id: str | uuid.UUID, hospital_id: uuid.UUID,
) -> list[LabReferral]:
    if isinstance(patient_id, str):
        try:
            patient_id = uuid.UUID(patient_id)
        except ValueError:
            return []
    return (
        db.query(LabReferral)
        .filter(LabReferral.hospital_id == hospital_id, LabReferral.patient_id == patient_id)
        .order_by(LabReferral.created_at.desc())
        .all()
    )


def _enrich_referral(db: Session, referral: LabReferral) -> dict:
    from ..schemas.lab import LabReferralResponse

    resp = LabReferralResponse.model_validate(referral)
    resp.patient_name = referral.patient.full_name if getattr(referral, "patient", None) else None
    return resp


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
