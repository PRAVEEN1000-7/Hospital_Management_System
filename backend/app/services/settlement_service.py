"""
Daily settlement service — aggregate, close, and verify daily cash collections.
"""
import uuid
import logging
from decimal import Decimal
from math import ceil
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from ..models.settlement import DailySettlement
from ..models.payment import Payment
from ..models.refund import Refund
from ..models.user import User
from ..schemas.settlement import (
    SettlementCreate, SettlementResponse, SettlementListItem, PaginatedSettlementResponse
)

logger = logging.getLogger(__name__)

# Payment modes that map to card/online vs cash
CASH_MODES = {"cash"}
CARD_MODES = {"card", "debit_card", "credit_card"}
ONLINE_MODES = {"upi", "wallet", "bank_transfer", "online", "cheque", "insurance"}


def _aggregate_totals(db: Session, hospital_id: uuid.UUID, settlement_date: date) -> dict:
    """Sum completed payments for a given date grouped by mode."""
    payments = (
        db.query(Payment)
        .filter(
            Payment.hospital_id == hospital_id,
            Payment.payment_date == settlement_date,
            Payment.status == "completed",
        )
        .all()
    )
    total_cash = Decimal("0")
    total_card = Decimal("0")
    total_online = Decimal("0")
    total_other = Decimal("0")

    for p in payments:
        amt = p.amount or Decimal("0")
        if p.payment_mode in CASH_MODES:
            total_cash += amt
        elif p.payment_mode in CARD_MODES:
            total_card += amt
        elif p.payment_mode in ONLINE_MODES:
            total_online += amt
        else:
            total_other += amt

    total_collected = total_cash + total_card + total_online + total_other

    # Refunds processed today
    refunds = (
        db.query(Refund)
        .filter(
            Refund.hospital_id == hospital_id,
            func.date(Refund.processed_at) == settlement_date,
            Refund.status == "processed",
        )
        .all()
    )
    total_refunds = sum(r.amount or Decimal("0") for r in refunds)
    net_amount = total_collected - total_refunds

    return {
        "total_cash": round(total_cash, 2),
        "total_card": round(total_card, 2),
        "total_online": round(total_online, 2),
        "total_other": round(total_other, 2),
        "total_collected": round(total_collected, 2),
        "total_refunds": round(total_refunds, 2),
        "net_amount": round(net_amount, 2),
    }


def _to_response(db: Session, record: DailySettlement) -> SettlementResponse:
    cashier_name = ""
    cashier = db.query(User).filter(User.id == record.cashier_user_id).first()
    if cashier:
        cashier_name = f"{cashier.first_name} {cashier.last_name}".strip()
    resp = SettlementResponse.model_validate(record)
    resp.cashier_name = cashier_name
    return resp


def create_settlement(
    db: Session, data: SettlementCreate, user_id: uuid.UUID, hospital_id: uuid.UUID
) -> DailySettlement:
    settlement_date = data.settlement_date or date.today()

    # Prevent duplicate open settlements for same cashier + date
    existing = (
        db.query(DailySettlement)
        .filter(
            DailySettlement.hospital_id == hospital_id,
            DailySettlement.settlement_date == settlement_date,
            DailySettlement.cashier_user_id == user_id,
        )
        .first()
    )
    if existing:
        raise ValueError("A settlement already exists for this date and cashier")

    totals = _aggregate_totals(db, hospital_id, settlement_date)
    record = DailySettlement(
        hospital_id=hospital_id,
        settlement_date=settlement_date,
        cashier_user_id=user_id,
        notes=data.notes,
        status="open",
        **totals,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info(f"Settlement created for {settlement_date} by cashier {user_id}")
    return record


def close_settlement(db: Session, record: DailySettlement) -> DailySettlement:
    if record.status != "open":
        raise ValueError(f"Only open settlements can be closed (current: {record.status})")
    record.status = "closed"
    db.commit()
    db.refresh(record)
    return record


def verify_settlement(db: Session, record: DailySettlement, verifier_id: uuid.UUID) -> DailySettlement:
    if record.status != "closed":
        raise ValueError("Only closed settlements can be verified")
    record.status = "verified"
    record.verified_by = verifier_id
    db.commit()
    db.refresh(record)
    return record


def list_settlements(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 10,
    status: Optional[str] = None,
) -> PaginatedSettlementResponse:
    query = (
        db.query(DailySettlement)
        .filter(DailySettlement.hospital_id == hospital_id)
    )
    if status:
        query = query.filter(DailySettlement.status == status)
    total = query.count()
    rows = query.order_by(DailySettlement.settlement_date.desc()).offset((page - 1) * limit).limit(limit).all()

    items = []
    for s in rows:
        cashier_name = ""
        cashier = db.query(User).filter(User.id == s.cashier_user_id).first()
        if cashier:
            cashier_name = f"{cashier.first_name} {cashier.last_name}".strip()
        items.append(SettlementListItem(
            id=str(s.id),
            settlement_date=s.settlement_date,
            cashier_name=cashier_name,
            total_collected=s.total_collected or Decimal("0"),
            total_refunds=s.total_refunds or Decimal("0"),
            net_amount=s.net_amount or Decimal("0"),
            status=s.status,
            created_at=s.created_at,
        ))

    return PaginatedSettlementResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=ceil(total / limit) if total else 1,
    )


def get_settlement_by_id(db: Session, settlement_id: str | uuid.UUID) -> Optional[DailySettlement]:
    if isinstance(settlement_id, str):
        try:
            settlement_id = uuid.UUID(settlement_id)
        except ValueError:
            return None
    return (
        db.query(DailySettlement)
        .filter(DailySettlement.id == settlement_id)
        .first()
    )
