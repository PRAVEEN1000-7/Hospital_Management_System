"""
Incentive service — sales-linked incentives for employees, computed from an
admin-entered sales_amount and incentive_percent. See models/incentive.py
for how this feeds into payroll_service.get_live_payroll.
"""
import uuid
from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sa_func

from ..models.incentive import Incentive


def create_incentive(
    db: Session, hospital_id: uuid.UUID, user_id: uuid.UUID, year: int, month: int,
    sales_amount: float, incentive_percent: float, created_by: uuid.UUID,
) -> Incentive:
    # Computed server-side, never trusted from the client (see schemas/incentive.py).
    incentive_amount = round(sales_amount * incentive_percent / 100, 2)
    incentive = Incentive(
        hospital_id=hospital_id, user_id=user_id, year=year, month=month,
        sales_amount=sales_amount, incentive_percent=incentive_percent,
        incentive_amount=incentive_amount, created_by=created_by,
    )
    db.add(incentive)
    db.commit()
    db.refresh(incentive)
    return incentive


def list_incentives(
    db: Session, hospital_id: uuid.UUID, year: int, month: int, user_id: Optional[uuid.UUID] = None,
) -> list[Incentive]:
    query = (
        db.query(Incentive)
        .options(joinedload(Incentive.user))
        .filter(Incentive.hospital_id == hospital_id, Incentive.year == year, Incentive.month == month)
    )
    if user_id is not None:
        query = query.filter(Incentive.user_id == user_id)
    return query.order_by(Incentive.created_at.desc()).all()


def delete_incentive(db: Session, hospital_id: uuid.UUID, incentive_id: uuid.UUID) -> bool:
    row = db.query(Incentive).filter(Incentive.id == incentive_id, Incentive.hospital_id == hospital_id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def get_month_incentive_totals(
    db: Session, hospital_id: uuid.UUID, year: int, month: int,
) -> dict[uuid.UUID, Decimal]:
    """Sum of incentive_amount per employee for one month — one query for
    the whole roster, used by payroll_service.get_live_payroll."""
    rows = (
        db.query(Incentive.user_id, sa_func.sum(Incentive.incentive_amount))
        .filter(Incentive.hospital_id == hospital_id, Incentive.year == year, Incentive.month == month)
        .group_by(Incentive.user_id)
        .all()
    )
    return {user_id: total for user_id, total in rows}
