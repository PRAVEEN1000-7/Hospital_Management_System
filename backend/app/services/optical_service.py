"""
Optical Store service — business logic for optical products, batches,
eye prescriptions, sales, and stock adjustments.
"""
import uuid
import logging
from decimal import Decimal
from math import ceil
from datetime import date, timedelta, datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, case

from .pharmacy_service import _filter_model_data
from .notification_service import notify_hospital_users
from ..core.hospital_time import hospital_today_by_id, hospital_today_utc_range_by_id
from ..models.optical import OpticalProduct, OpticalBatch, OpticalPrescription, OpticalSale, OpticalSaleItem

logger = logging.getLogger(__name__)

# Keywords matched case-insensitively against Doctor.specialization (free text,
# e.g. "Ophthalmology") to decide who may be assigned an eye prescription.
EYE_SPECIALIST_KEYWORDS = ("ophthalm", "optic", "optometr", "eye")


def is_eye_specialist(specialization: Optional[str]) -> bool:
    if not specialization:
        return False
    text = specialization.lower()
    return any(kw in text for kw in EYE_SPECIALIST_KEYWORDS)

# Categories that meaningfully expire — prescription required for sale, and the
# only categories whose batches realistically carry a real expiry_date.
RX_REQUIRED_CATEGORIES = {"lens", "contact_lens"}


# ══════════════════════════════════════════════════
# Optical Product CRUD
# ══════════════════════════════════════════════════

def create_optical_product(db: Session, hospital_id: uuid.UUID, data: dict) -> OpticalProduct:
    payload = _filter_model_data(OpticalProduct, data)
    if payload.get("tax_config_id"):
        payload["tax_config_id"] = uuid.UUID(payload["tax_config_id"])
    product = OpticalProduct(hospital_id=hospital_id, **payload)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def get_optical_product_by_id(
    db: Session,
    product_id: str | uuid.UUID,
    hospital_id: Optional[uuid.UUID] = None,
) -> Optional[OpticalProduct]:
    if isinstance(product_id, str):
        try:
            product_id = uuid.UUID(product_id)
        except ValueError:
            return None
    q = db.query(OpticalProduct).filter(OpticalProduct.id == product_id)
    if hospital_id is not None:
        q = q.filter(OpticalProduct.hospital_id == hospital_id)
    return q.first()


def list_optical_products(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True,
) -> dict:
    query = db.query(OpticalProduct).filter(OpticalProduct.hospital_id == hospital_id)
    if active_only:
        query = query.filter(OpticalProduct.is_active == True)
    if category:
        query = query.filter(OpticalProduct.category == category)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                OpticalProduct.name.ilike(s),
                OpticalProduct.brand.ilike(s),
                OpticalProduct.sku.ilike(s),
                OpticalProduct.barcode.ilike(s),
            )
        )
    total = query.count()
    items = query.order_by(OpticalProduct.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    # Enrich with total stock across active batches.
    product_ids = [p.id for p in items]
    stock_map: dict[uuid.UUID, int] = {}
    if product_ids:
        try:
            stock_rows = (
                db.query(OpticalBatch.product_id, func.coalesce(func.sum(OpticalBatch.quantity), 0))
                .filter(OpticalBatch.product_id.in_(product_ids), OpticalBatch.is_active == True)
                .group_by(OpticalBatch.product_id)
                .all()
            )
            stock_map = {row[0]: int(row[1]) for row in stock_rows}
        except Exception:
            db.rollback()
            logger.warning("optical_batches table may not exist yet; stock will show as 0")

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": ceil(total / limit) if limit else 1,
        "data": items,
        "stock_map": stock_map,
    }


def update_optical_product(db: Session, product_id: str | uuid.UUID, data: dict) -> Optional[OpticalProduct]:
    product = get_optical_product_by_id(db, product_id)
    if not product:
        return None
    for key, value in data.items():
        if hasattr(product, key) and value is not None:
            setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return product


def delete_optical_product(db: Session, product_id: str | uuid.UUID) -> bool:
    product = get_optical_product_by_id(db, product_id)
    if not product:
        return False
    product.is_active = False
    db.commit()
    return True


# ══════════════════════════════════════════════════
# Optical Batch CRUD
# ══════════════════════════════════════════════════

def create_optical_batch(db: Session, data: dict) -> OpticalBatch:
    for fk in ("product_id", "grn_id"):
        if data.get(fk):
            data[fk] = uuid.UUID(data[fk])

    payload = _filter_model_data(OpticalBatch, data)
    if "quantity" in payload and "initial_quantity" not in payload:
        payload["initial_quantity"] = payload["quantity"]

    batch = OpticalBatch(**payload)
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def list_optical_batches(
    db: Session,
    product_id: str | uuid.UUID,
    active_only: bool = True,
) -> list[OpticalBatch]:
    if isinstance(product_id, str):
        product_id = uuid.UUID(product_id)
    query = db.query(OpticalBatch).filter(OpticalBatch.product_id == product_id)
    if active_only:
        query = query.filter(OpticalBatch.is_active == True)
    # Batches with a real expiry date are consumed/shown before null-expiry
    # ones (frames/solutions never expire, so they're never "more urgent").
    return query.order_by(
        case((OpticalBatch.expiry_date.is_(None), 1), else_=0),
        OpticalBatch.expiry_date.asc(),
    ).all()


def update_optical_batch(db: Session, batch_id: str | uuid.UUID, data: dict) -> Optional[OpticalBatch]:
    if isinstance(batch_id, str):
        batch_id = uuid.UUID(batch_id)
    batch = db.query(OpticalBatch).filter(OpticalBatch.id == batch_id).first()
    if not batch:
        return None
    for key, value in data.items():
        if hasattr(batch, key) and value is not None:
            setattr(batch, key, value)
    db.commit()
    db.refresh(batch)
    return batch


# ══════════════════════════════════════════════════
# Optical Prescription CRUD
# ══════════════════════════════════════════════════

def _generate_prescription_number(db: Session, hospital_id: uuid.UUID) -> str:
    # prescription_number carries a database-wide UNIQUE constraint (not scoped to
    # hospital_id), so the running count must be global too — counting only this
    # hospital's rows let two different hospitals generate the same "next" number
    # and collide on insert.
    year = date.today().strftime("%y")
    count = db.query(func.count(OpticalPrescription.id)).scalar() or 0
    return f"OPT-RX-{year}-{count + 1:04d}"


def create_optical_prescription(
    db: Session,
    hospital_id: uuid.UUID,
    data: dict,
    created_by: Optional[uuid.UUID] = None,
) -> OpticalPrescription:
    payload = _filter_model_data(OpticalPrescription, data)
    for fk in ("patient_id", "doctor_id", "appointment_id"):
        if payload.get(fk):
            payload[fk] = uuid.UUID(payload[fk])

    from ..models.appointment import Doctor
    from ..models.patient import Patient

    # Scoped to this hospital — an unchecked patient_id would let this
    # prescription (and its enrichment, which surfaces the patient's name)
    # reference a patient from a different hospital entirely.
    if not payload.get("patient_id"):
        raise ValueError("patient_id is required")
    patient = db.query(Patient).filter(Patient.id == payload["patient_id"], Patient.hospital_id == hospital_id).first()
    if not patient:
        raise ValueError("Patient not found")

    # No doctor_id provided (e.g. the Prescription Builder's "also create
    # optical prescription" option) — resolve from the logged-in doctor,
    # matching prescription_service.create_prescription's fallback.
    if not payload.get("doctor_id"):
        if not created_by:
            raise ValueError("No doctor_id provided and no logged-in doctor to fall back to")
        doctor = db.query(Doctor).filter(Doctor.user_id == created_by).first()
        if not doctor:
            raise ValueError("No doctor_id provided and current user is not a doctor")
        payload["doctor_id"] = doctor.id
    else:
        doctor = db.query(Doctor).filter(Doctor.id == payload.get("doctor_id"), Doctor.hospital_id == hospital_id).first()
        if not doctor:
            raise ValueError("Doctor not found")
    # Any registered doctor in the hospital may write an optical prescription.
    # The module gate (tenant_security) already controls whether the hospital
    # has access to this feature; restricting further by specialization causes
    # general practitioners and surgeons to be blocked unnecessarily.

    # _generate_prescription_number reads the current count without a lock, so two
    # near-simultaneous submissions (double-click, duplicate request) can both compute
    # the same "next" number. Retry with a freshly-generated number on conflict instead
    # of failing the whole request.
    from sqlalchemy.exc import IntegrityError

    last_error: Exception | None = None
    for _ in range(5):
        rx = OpticalPrescription(
            hospital_id=hospital_id,
            prescription_number=_generate_prescription_number(db, hospital_id),
            **payload,
        )
        db.add(rx)
        try:
            db.commit()
        except IntegrityError as e:
            db.rollback()
            last_error = e
            continue
        db.refresh(rx)

        # Notify optical staff that a new eye prescription is ready.
        try:
            from ..models.patient import Patient
            patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()
            patient_name = f"{patient.first_name} {patient.last_name}".strip() if patient else "a patient"
            notify_hospital_users(
                db=db,
                hospital_id=hospital_id,
                title="New Optical Prescription",
                message=f"Optical prescription {rx.prescription_number} for {patient_name} is ready for dispensing.",
                notification_type="optical",
                priority="normal",
                reference_type="optical_prescription",
                reference_id=rx.id,
                role_names=["optical_staff", "admin"],
                exclude_user_ids=[created_by],
            )
        except Exception:
            logger.warning("Failed to send optical prescription notification", exc_info=True)

        try:
            from .ngram_service import index_note
            index_note(db, hospital_id, "optical_prescription_notes", rx.notes)
        except Exception:
            logger.warning("Failed to index optical prescription notes into ngram model", exc_info=True)

        return rx
    raise last_error


def get_optical_prescription_by_id(
    db: Session, prescription_id: str | uuid.UUID, hospital_id: Optional[uuid.UUID] = None,
) -> Optional[OpticalPrescription]:
    if isinstance(prescription_id, str):
        try:
            prescription_id = uuid.UUID(prescription_id)
        except ValueError:
            return None
    q = db.query(OpticalPrescription).filter(OpticalPrescription.id == prescription_id)
    if hospital_id is not None:
        q = q.filter(OpticalPrescription.hospital_id == hospital_id)
    return q.first()


def list_optical_prescriptions(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    patient_id: Optional[str] = None,
    doctor_id: Optional[str] = None,
) -> dict:
    query = db.query(OpticalPrescription).filter(OpticalPrescription.hospital_id == hospital_id)
    if patient_id:
        query = query.filter(OpticalPrescription.patient_id == uuid.UUID(patient_id))
    if doctor_id:
        query = query.filter(OpticalPrescription.doctor_id == uuid.UUID(doctor_id))
    total = query.count()
    items = query.order_by(OpticalPrescription.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": ceil(total / limit) if limit else 1,
        "data": items,
    }


def list_pending_optical_prescriptions(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
) -> dict:
    """Return finalized optical prescriptions with patient/doctor info, for the optical queue page."""
    from ..models.patient import Patient
    from ..models.appointment import Doctor as DoctorModel
    from ..models.user import User as UserModel

    # Base: only finalized prescriptions for this hospital
    query = db.query(OpticalPrescription).filter(
        OpticalPrescription.hospital_id == hospital_id,
        OpticalPrescription.is_finalized == True,
    )

    # Full-text search — Rx number or patient name
    if search:
        patient_ids_sub = (
            db.query(Patient.id)
            .filter(
                Patient.hospital_id == hospital_id,
                or_(
                    Patient.first_name.ilike(f"%{search}%"),
                    Patient.last_name.ilike(f"%{search}%"),
                ),
            )
            .subquery()
        )
        query = query.filter(
            or_(
                OpticalPrescription.prescription_number.ilike(f"%{search}%"),
                OpticalPrescription.patient_id.in_(patient_ids_sub),
            )
        )

    # Status filter
    dispensed_rx_sub = (
        db.query(OpticalSale.prescription_id)
        .filter(OpticalSale.hospital_id == hospital_id, OpticalSale.prescription_id.isnot(None))
        .subquery()
    )
    if status_filter == "pending":
        query = query.filter(~OpticalPrescription.id.in_(dispensed_rx_sub))
    elif status_filter == "dispensed":
        query = query.filter(OpticalPrescription.id.in_(dispensed_rx_sub))

    total = query.count()
    items = query.order_by(OpticalPrescription.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    # Collect IDs to check which prescriptions have a linked sale
    rx_ids = [rx.id for rx in items]
    sold_ids: set[uuid.UUID] = set()
    if rx_ids:
        sold_rows = (
            db.query(OpticalSale.prescription_id)
            .filter(OpticalSale.prescription_id.in_(rx_ids))
            .all()
        )
        sold_ids = {row[0] for row in sold_rows}

    result_data = []
    for rx in items:
        patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()
        doctor = db.query(DoctorModel).filter(DoctorModel.id == rx.doctor_id).first()

        patient_age = None
        if patient and getattr(patient, "date_of_birth", None):
            today = date.today()
            dob = patient.date_of_birth
            patient_age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        elif patient and getattr(patient, "age_years", None):
            patient_age = patient.age_years

        doctor_name = None
        doctor_spec = None
        if doctor:
            doctor_spec = getattr(doctor, "specialization", None)
            if doctor.user:
                fn = doctor.user.first_name or ""
                ln = doctor.user.last_name or ""
                doctor_name = f"Dr. {fn} {ln}".strip()

        result_data.append({
            "id": str(rx.id),
            "prescription_number": rx.prescription_number,
            "status": "dispensed" if rx.id in sold_ids else "finalized",
            "patient_name": patient.full_name if patient else "Unknown",
            "patient_reference_number": getattr(patient, "patient_reference_number", None) if patient else None,
            "patient_age": patient_age,
            "patient_gender": getattr(patient, "gender", None) if patient else None,
            "patient_phone": getattr(patient, "phone_number", None) if patient else None,
            "doctor_name": doctor_name or "Unknown",
            "doctor_specialization": doctor_spec,
            "finalized_at": rx.updated_at.isoformat() if rx.updated_at else rx.created_at.isoformat(),
            "created_at": rx.created_at.isoformat(),
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": ceil(total / limit) if limit else 1,
        "data": result_data,
    }


def update_optical_prescription(db: Session, prescription_id: str | uuid.UUID, data: dict) -> Optional[OpticalPrescription]:
    rx = get_optical_prescription_by_id(db, prescription_id)
    if not rx:
        return None
    for key, value in data.items():
        if hasattr(rx, key) and value is not None:
            setattr(rx, key, value)
    db.commit()
    db.refresh(rx)
    return rx


def finalize_optical_prescription(db: Session, prescription_id: str | uuid.UUID) -> Optional[OpticalPrescription]:
    rx = get_optical_prescription_by_id(db, prescription_id)
    if not rx:
        return None
    rx.is_finalized = True
    db.commit()
    db.refresh(rx)
    return rx


# ══════════════════════════════════════════════════
# Optical Sale
# ══════════════════════════════════════════════════

def _generate_order_number(db: Session, hospital_id: uuid.UUID) -> str:
    count = db.query(func.count(OpticalSale.id)).filter(
        OpticalSale.hospital_id == hospital_id
    ).scalar() or 0
    return f"OPT-{count + 1:06d}"


def create_sale(db: Session, hospital_id: uuid.UUID, data: dict, user_id: uuid.UUID) -> OpticalSale:
    from ..models.patient import Patient

    items_data = data.pop("items", [])
    prescription_id = data.get("prescription_id")

    # Scoped to this hospital — an unchecked patient_id would let this sale
    # (and its enrichment, which surfaces the patient's name) reference a
    # patient from a different hospital entirely.
    patient_check = db.query(Patient).filter(
        Patient.id == uuid.UUID(data["patient_id"]), Patient.hospital_id == hospital_id,
    ).first()
    if not patient_check:
        raise ValueError("Patient not found")

    # An eye prescription is required when any line item is a power lens or
    # contact lens — frames/solutions/accessories can be sold without one.
    if not prescription_id:
        for item_data in items_data:
            product = get_optical_product_by_id(db, item_data["product_id"])
            if product and product.category in RX_REQUIRED_CATEGORIES:
                raise ValueError(
                    f"An eye prescription is required to sell {product.name} ({product.category})"
                )

    # A prescription should only ever be dispensed once — nothing previously
    # checked this, so re-opening the same prescription (a second tab, a
    # stale "Dispense" link, revisiting the detail page) created a second
    # sale and decremented stock a second time.
    if prescription_id:
        existing_sale = db.query(OpticalSale).filter(
            OpticalSale.hospital_id == hospital_id,
            OpticalSale.prescription_id == uuid.UUID(prescription_id),
        ).first()
        if existing_sale:
            raise ValueError("This prescription has already been dispensed")

    from .billing_queue_service import get_or_assign_visit_token

    # A prescription-linked sale inherits that visit's shared token instead
    # of minting its own — a pure walk-in optical sale (no prescription)
    # still draws from the same hospital-wide sequence, just isn't tied to
    # any appointment.
    sale_appointment_id = None
    if prescription_id:
        rx = db.query(OpticalPrescription).filter(
            OpticalPrescription.id == uuid.UUID(prescription_id),
            OpticalPrescription.hospital_id == hospital_id,
        ).first()
        if not rx:
            raise ValueError("Prescription not found")
        sale_appointment_id = rx.appointment_id

    sale = OpticalSale(
        hospital_id=hospital_id,
        invoice_number=_generate_order_number(db, hospital_id),
        patient_id=uuid.UUID(data["patient_id"]),
        prescription_id=uuid.UUID(prescription_id) if prescription_id else None,
        appointment_id=sale_appointment_id,
        sale_type=data.get("sale_type", "new"),
        status="placed",
        frame_product_id=uuid.UUID(data["frame_product_id"]) if data.get("frame_product_id") else None,
        right_lens_product_id=uuid.UUID(data["right_lens_product_id"]) if data.get("right_lens_product_id") else None,
        left_lens_product_id=uuid.UUID(data["left_lens_product_id"]) if data.get("left_lens_product_id") else None,
        discount_amount=data.get("discount_amount", Decimal("0")),
        notes=data.get("notes"),
        payment_method=data.get("payment_method", "cash"),
        amount_tendered=Decimal(str(data.get("amount_tendered", 0))),
        advance_amount=Decimal(str(data.get("advance_amount", 0))),
        queue_token=get_or_assign_visit_token(db, hospital_id, sale_appointment_id),
        queue_status="waiting",
    )
    db.add(sale)
    db.flush()

    from ..models.inventory import StockMovement

    subtotal = Decimal("0")
    tax_total = Decimal("0")

    for item_data in items_data:
        # Scoped to this hospital — without it, a product_id from another
        # tenant would still resolve here and, via the batch_id branch below
        # or the auto-select branch matching on product_id alone, let this
        # sale decrement a different hospital's stock while billing this one.
        product = get_optical_product_by_id(db, item_data["product_id"], hospital_id=hospital_id)
        if not product:
            raise ValueError("Optical product not found")
        product_uuid = uuid.UUID(item_data["product_id"])
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
            # Must belong to the product this line claims to sell — otherwise a
            # client-supplied batch_id for an unrelated product (any hospital,
            # since OpticalBatch carries no hospital_id of its own) would
            # silently decrement the wrong item's stock.
            batch = db.query(OpticalBatch).filter(
                OpticalBatch.id == uuid.UUID(batch_id),
                OpticalBatch.product_id == product_uuid,
                OpticalBatch.is_active == True,
            ).first()
        else:
            # FEFO: earliest real expiry first; null-expiry batches (frames,
            # solutions) are never blocked and are consumed last.
            batch = db.query(OpticalBatch).filter(
                OpticalBatch.product_id == product_uuid,
                OpticalBatch.is_active == True,
                OpticalBatch.quantity >= qty,
                or_(OpticalBatch.expiry_date.is_(None), OpticalBatch.expiry_date > date.today()),
            ).order_by(
                case((OpticalBatch.expiry_date.is_(None), 1), else_=0),
                OpticalBatch.expiry_date.asc(),
            ).first()

        if not batch or batch.quantity < qty:
            expired_batch = db.query(OpticalBatch).filter(
                OpticalBatch.product_id == product_uuid,
                OpticalBatch.expiry_date.isnot(None),
                OpticalBatch.expiry_date <= date.today(),
                OpticalBatch.quantity > 0,
            ).first()
            if expired_batch:
                raise ValueError(
                    f"All available batches of {product.name if product else 'this product'} are expired. "
                    f"Cannot sell expired stock (Batch: {expired_batch.batch_number}, "
                    f"Expiry: {expired_batch.expiry_date}). Please remove from inventory."
                )
            raise ValueError(f"Insufficient stock for {product.name if product else 'unknown product'}")

        batch.quantity -= qty

        # Record the stock-out against a fresh sum of real batch quantities (not the
        # prior movement's balance_after + delta) so this ledger can never drift from
        # what's actually sellable — matches dispensing_service.py's pattern and what
        # inventory_service.get_stock_level()/low-stock now both read.
        db.flush()
        balance_after = db.query(
            func.coalesce(func.sum(OpticalBatch.quantity), 0)
        ).filter(
            OpticalBatch.product_id == product_uuid,
            OpticalBatch.is_active == True,
        ).scalar() or 0

        movement = StockMovement(
            hospital_id=hospital_id,
            item_type="optical_product",
            item_id=product_uuid,
            batch_id=batch.id,
            movement_type="sale",
            reference_type="optical_order",
            reference_id=sale.id,
            quantity=-qty,
            balance_after=int(balance_after),
            unit_cost=float(unit_price),
            notes=f"Optical sale: {sale.invoice_number}",
            performed_by=user_id,
        )
        db.add(movement)

        si = OpticalSaleItem(
            sale_id=sale.id,
            product_id=product_uuid,
            batch_id=batch.id,
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

    from .billing_queue_service import compute_payment_breakdown
    breakdown = compute_payment_breakdown(
        sale.total_amount, advance_amount=sale.advance_amount, amount_tendered=sale.amount_tendered
    )
    sale.paid_amount = breakdown["paid_amount"]
    sale.balance_amount = breakdown["balance_amount"]
    sale.payment_status = breakdown["payment_status"]

    db.commit()
    db.refresh(sale)
    return sale


def record_optical_sale_payment(
    db: Session,
    sale_id: str | uuid.UUID,
    hospital_id: uuid.UUID,
    amount: Decimal,
    payment_method: Optional[str] = None,
) -> Optional[OpticalSale]:
    """Record an additional payment collected against an existing optical
    sale (e.g. settling a partially-paid balance at the billing counter).

    Unlike pharmacy's mark_dispensing_paid (which *sets* paid_amount to sync
    from an external invoice payment), this *adds* to whatever paid_amount
    already exists — an optical sale can already carry a non-zero paid_amount
    from an advance collected at creation, and simply overwriting it would
    lose that advance instead of building on it."""
    if isinstance(sale_id, str):
        sale_id = uuid.UUID(sale_id)

    sale = db.query(OpticalSale).filter(
        OpticalSale.id == sale_id, OpticalSale.hospital_id == hospital_id,
    ).first()
    if not sale:
        return None

    total = sale.total_amount or Decimal("0")
    new_paid = min(total, (sale.paid_amount or Decimal("0")) + amount)
    sale.paid_amount = new_paid
    sale.balance_amount = max(Decimal("0"), total - new_paid)
    sale.payment_status = "paid" if new_paid >= total else ("partially_paid" if new_paid > 0 else "pending")
    if payment_method:
        sale.payment_method = payment_method

    db.commit()
    db.refresh(sale)
    return sale


def list_optical_queue(db: Session, hospital_id: uuid.UUID) -> list[dict]:
    """Today's optical sales ordered by queue token — the Waiting/Being Served/Ready/Collected board."""
    day_start, day_end = hospital_today_utc_range_by_id(db, hospital_id)
    sales = (
        db.query(OpticalSale)
        .filter(
            OpticalSale.hospital_id == hospital_id,
            OpticalSale.created_at >= day_start,
            OpticalSale.created_at < day_end,
        )
        .order_by(OpticalSale.queue_token.asc())
        .all()
    )
    return [
        {
            "id": str(s.id),
            "invoice_number": s.invoice_number,
            "patient_name": s.patient.full_name if getattr(s, "patient", None) else None,
            "queue_token": s.queue_token,
            "queue_status": s.queue_status,
            "total_amount": s.total_amount,
            "payment_status": s.payment_status,
            "created_at": s.created_at,
            "queue_called_at": s.queue_called_at,
        }
        for s in sales
    ]


def update_optical_queue_status(db: Session, sale_id: str | uuid.UUID, new_status: str) -> Optional[OpticalSale]:
    from .billing_queue_service import advance_queue_status

    sale = get_sale(db, sale_id)
    if not sale:
        return None
    advance_queue_status(sale, new_status)
    db.commit()
    db.refresh(sale)
    return sale


def get_sale(db: Session, sale_id: str | uuid.UUID) -> Optional[OpticalSale]:
    if isinstance(sale_id, str):
        sale_id = uuid.UUID(sale_id)
    return db.query(OpticalSale).filter(OpticalSale.id == sale_id).first()


def get_sale_items(db: Session, sale_id: uuid.UUID) -> list[OpticalSaleItem]:
    return db.query(OpticalSaleItem).filter(OpticalSaleItem.sale_id == sale_id).all()


def list_sales(
    db: Session, hospital_id: uuid.UUID,
    page: int = 1, limit: int = 20,
    search: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sale_status: Optional[str] = None,
) -> dict:
    query = db.query(OpticalSale).filter(OpticalSale.hospital_id == hospital_id)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(OpticalSale.invoice_number.ilike(s))
    if date_from:
        query = query.filter(func.date(OpticalSale.created_at) >= date_from)
    if date_to:
        query = query.filter(func.date(OpticalSale.created_at) <= date_to)
    if sale_status:
        query = query.filter(OpticalSale.status == sale_status)

    total = query.count()
    base_items = query.order_by(OpticalSale.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    sale_ids = [s.id for s in base_items]

    item_count_map: dict[uuid.UUID, int] = {}
    if sale_ids:
        count_rows = (
            db.query(OpticalSaleItem.sale_id, func.count(OpticalSaleItem.id))
            .filter(OpticalSaleItem.sale_id.in_(sale_ids))
            .group_by(OpticalSaleItem.sale_id)
            .all()
        )
        item_count_map = {row[0]: int(row[1]) for row in count_rows}

    items: list[dict] = []
    for sale in base_items:
        items.append({
            "id": str(sale.id),
            "hospital_id": str(sale.hospital_id),
            "invoice_number": sale.invoice_number,
            "patient_id": str(sale.patient_id) if sale.patient_id else None,
            "patient_name": sale.patient.full_name if getattr(sale, "patient", None) else None,
            "prescription_id": str(sale.prescription_id) if sale.prescription_id else None,
            "sale_type": sale.sale_type,
            "status": sale.status,
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
            "queue_token": sale.queue_token,
            "queue_status": sale.queue_status,
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

def create_stock_adjustment(db: Session, hospital_id: uuid.UUID, data: dict, user_id: uuid.UUID):
    """Create an optical stock adjustment using the shared inventory StockAdjustment model."""
    from ..models.inventory import StockAdjustment, StockMovement

    product_id = uuid.UUID(data["product_id"])
    batch_id = uuid.UUID(data["batch_id"]) if data.get("batch_id") else None
    qty = data["quantity"]
    adj_type = data["adjustment_type"]

    if adj_type in ("damage", "expired"):
        qty = -abs(qty)
    elif adj_type == "return":
        qty = abs(qty)

    movement_batch_id = batch_id

    if batch_id:
        batch = db.query(OpticalBatch).filter(
            OpticalBatch.id == batch_id,
            OpticalBatch.product_id == product_id,
            OpticalBatch.is_active == True,
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
        system_batch_number = f"SYS-ADJ-{datetime.now(timezone.utc).strftime('%Y%m%d')}"
        batch = db.query(OpticalBatch).filter(
            OpticalBatch.product_id == product_id,
            OpticalBatch.batch_number == system_batch_number,
        ).first()
        if batch:
            batch.quantity = (batch.quantity or 0) + qty
            batch.initial_quantity = (batch.initial_quantity or 0) + qty
            batch.is_active = True
        else:
            batch = OpticalBatch(
                product_id=product_id,
                batch_number=system_batch_number,
                mfg_date=date.today(),
                expiry_date=None,
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
        remaining = -qty
        batches = db.query(OpticalBatch).filter(
            OpticalBatch.product_id == product_id,
            OpticalBatch.is_active == True,
            OpticalBatch.quantity > 0,
        ).order_by(
            case((OpticalBatch.expiry_date.is_(None), 1), else_=0),
            OpticalBatch.expiry_date.asc(),
            OpticalBatch.created_at.asc(),
        ).all()

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

    adj = StockAdjustment(
        hospital_id=hospital_id,
        adjustment_number=f"ADJ-OPT-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        item_type="optical_product",
        item_id=product_id,
        batch_id=batch_id,
        adjustment_type=adj_type,
        quantity=qty,
        reason=data.get("reason", "Optical stock adjustment"),
        status="approved",
        approved_by=user_id,
        created_by=user_id,
    )
    db.add(adj)
    db.flush()

    balance_after = int(
        db.query(func.coalesce(func.sum(OpticalBatch.quantity), 0)).filter(
            OpticalBatch.product_id == product_id,
            OpticalBatch.is_active == True,
        ).scalar() or 0
    )

    movement_type = "adjustment"
    if adj_type == "damage":
        movement_type = "damaged"
    elif adj_type == "expired":
        movement_type = "expired"

    movement = StockMovement(
        hospital_id=hospital_id,
        item_type="optical_product",
        item_id=product_id,
        batch_id=movement_batch_id,
        movement_type=movement_type,
        reference_type="adjustment",
        reference_id=adj.id,
        quantity=qty,
        balance_after=balance_after,
        notes=f"Optical adjustment {adj.adjustment_number}: {adj.reason}",
        performed_by=user_id,
    )
    db.add(movement)

    db.commit()
    db.refresh(adj)
    return adj


def list_stock_adjustments(db: Session, hospital_id: uuid.UUID, product_id: Optional[str] = None) -> list:
    from ..models.inventory import StockAdjustment

    query = db.query(StockAdjustment).filter(
        StockAdjustment.hospital_id == hospital_id,
        StockAdjustment.item_type == "optical_product",
    )
    if product_id:
        query = query.filter(StockAdjustment.item_id == uuid.UUID(product_id))

    adjustments = query.order_by(StockAdjustment.created_at.desc()).limit(100).all()

    result = []
    for adj in adjustments:
        adj_dict = {
            "id": str(adj.id),
            "hospital_id": str(adj.hospital_id),
            "item_id": str(adj.item_id),
            "batch_id": str(adj.batch_id) if adj.batch_id else None,
            "adjustment_type": adj.adjustment_type,
            "quantity": adj.quantity,
            "reason": adj.reason,
            "status": adj.status,
            "approved_by": str(adj.approved_by) if adj.approved_by else None,
            "created_by": str(adj.created_by) if adj.created_by else None,
            "created_at": adj.created_at,
            "product_name": None,
        }
        product = get_optical_product_by_id(db, adj.item_id)
        if product:
            adj_dict["product_name"] = product.name
        result.append(adj_dict)

    return result


# ══════════════════════════════════════════════════
# Dashboard / Analytics
# ══════════════════════════════════════════════════

def get_optical_dashboard(db: Session, hospital_id: uuid.UUID) -> dict:
    today = hospital_today_by_id(db, hospital_id)
    thirty_days = today + timedelta(days=30)

    products = db.query(OpticalProduct.id, OpticalProduct.reorder_level).filter(
        OpticalProduct.hospital_id == hospital_id, OpticalProduct.is_active == True
    ).all()
    total_products = len(products)

    product_ids = [p.id for p in products]
    stock_map: dict[uuid.UUID, int] = {}
    expiring = 0
    expired = 0
    if product_ids:
        try:
            stock_rows = (
                db.query(OpticalBatch.product_id, func.coalesce(func.sum(OpticalBatch.quantity), 0))
                .filter(OpticalBatch.product_id.in_(product_ids), OpticalBatch.is_active == True)
                .group_by(OpticalBatch.product_id)
                .all()
            )
            stock_map = {row[0]: int(row[1]) for row in stock_rows}

            # Expiry counts must explicitly exclude null-expiry batches (frames,
            # solutions, accessories) — unlike MedicineBatch.expiry_date, this column
            # is nullable, and a bare `<= thirty_days` comparison against NULL would
            # just silently evaluate to NULL/false in SQL, but being explicit here
            # keeps the intent obvious rather than relying on that NULL semantics.
            expiring = db.query(func.count(OpticalBatch.id)).join(
                OpticalProduct, OpticalProduct.id == OpticalBatch.product_id
            ).filter(
                OpticalProduct.hospital_id == hospital_id,
                OpticalBatch.is_active == True,
                OpticalBatch.expiry_date.isnot(None),
                OpticalBatch.expiry_date <= thirty_days,
                OpticalBatch.expiry_date > today,
                OpticalBatch.quantity > 0,
            ).scalar() or 0

            expired = db.query(func.count(OpticalBatch.id)).join(
                OpticalProduct, OpticalProduct.id == OpticalBatch.product_id
            ).filter(
                OpticalProduct.hospital_id == hospital_id,
                OpticalBatch.is_active == True,
                OpticalBatch.expiry_date.isnot(None),
                OpticalBatch.expiry_date <= today,
                OpticalBatch.quantity > 0,
            ).scalar() or 0
        except Exception:
            db.rollback()
            logger.warning("optical_batches table may not exist yet; stock/expiry counts will show as 0")

    low_stock = sum(
        1 for p in products
        if 0 < stock_map.get(p.id, 0) <= (p.reorder_level or 5)
    )

    today_sales = db.query(
        func.count(OpticalSale.id),
        func.coalesce(func.sum(OpticalSale.paid_amount), 0),
    ).filter(
        OpticalSale.hospital_id == hospital_id,
        func.date(OpticalSale.created_at) == today,
    ).first()

    # "Pending" = finalized prescriptions that have no linked sale yet
    dispensed_rx_ids = db.query(OpticalSale.prescription_id).filter(
        OpticalSale.hospital_id == hospital_id,
        OpticalSale.prescription_id.isnot(None),
    ).subquery()
    pending_prescriptions = db.query(func.count(OpticalPrescription.id)).filter(
        OpticalPrescription.hospital_id == hospital_id,
        OpticalPrescription.is_finalized == True,
        ~OpticalPrescription.id.in_(dispensed_rx_ids),
    ).scalar() or 0

    return {
        "total_products": total_products,
        "low_stock_count": low_stock,
        "expiring_soon_count": expiring,
        "expired_count": expired,
        "today_sales_count": today_sales[0] if today_sales else 0,
        "today_sales_amount": today_sales[1] if today_sales else Decimal("0"),
        "pending_prescriptions": pending_prescriptions,
    }


def get_optical_sales_trend(db: Session, hospital_id: uuid.UUID, days: int = 30) -> list[dict]:
    today = hospital_today_by_id(db, hospital_id)
    start_date = today - timedelta(days=days - 1)

    results = db.query(
        func.date(OpticalSale.created_at).label("sale_date"),
        func.coalesce(func.sum(OpticalSale.paid_amount), 0).label("total_sales"),
        func.count(OpticalSale.id).label("orders_count"),
    ).filter(
        OpticalSale.hospital_id == hospital_id,
        func.date(OpticalSale.created_at) >= start_date,
        func.date(OpticalSale.created_at) <= today,
    ).group_by(
        func.date(OpticalSale.created_at)
    ).order_by(
        func.date(OpticalSale.created_at)
    ).all()

    sales_map = {
        str(r.sale_date): {
            "date": str(r.sale_date),
            "sales": float(r.total_sales) if r.total_sales else 0,
            "orders_count": r.orders_count or 0,
        }
        for r in results
    }

    trend_data = []
    for i in range(days):
        current_date = start_date + timedelta(days=i)
        date_str = str(current_date)
        trend_data.append(sales_map.get(date_str, {"date": date_str, "sales": 0, "orders_count": 0}))

    return trend_data


def get_optical_top_products(db: Session, hospital_id: uuid.UUID, days: int = 30, limit: int = 10) -> list[dict]:
    today = hospital_today_by_id(db, hospital_id)
    start_date = today - timedelta(days=days - 1)

    results = db.query(
        OpticalProduct.id,
        OpticalProduct.name,
        OpticalProduct.category,
        func.sum(OpticalSaleItem.quantity).label("total_quantity"),
        func.sum(OpticalSaleItem.total_price).label("total_revenue"),
    ).join(
        OpticalSaleItem, OpticalSaleItem.product_id == OpticalProduct.id
    ).join(
        OpticalSale, OpticalSale.id == OpticalSaleItem.sale_id
    ).filter(
        OpticalProduct.hospital_id == hospital_id,
        OpticalProduct.is_active == True,
        func.date(OpticalSale.created_at) >= start_date,
        func.date(OpticalSale.created_at) <= today,
    ).group_by(
        OpticalProduct.id, OpticalProduct.name, OpticalProduct.category
    ).order_by(
        func.sum(OpticalSaleItem.quantity).desc()
    ).limit(limit).all()

    return [
        {
            "name": r.name,
            "product_id": str(r.id),
            "quantity_sold": r.total_quantity or 0,
            "revenue": float(r.total_revenue) if r.total_revenue else 0,
            "category": r.category,
        }
        for r in results
    ]
