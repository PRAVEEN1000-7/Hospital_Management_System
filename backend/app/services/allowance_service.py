"""
Allowance service — one-off, event-tied payments to employees (a business
trip, a campaign fee, etc.), logged against the (year, month) they should
count toward. See models/allowance.py for the full picture of how
'added_to_salary' vs 'in_hand' feeds into payroll_service.get_live_payroll.
"""
import uuid
from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sa_func

from ..models.allowance import Allowance


def create_allowance(
    db: Session, hospital_id: uuid.UUID, user_id: uuid.UUID, year: int, month: int,
    amount: float, reason: str, allowance_type: str, created_by: uuid.UUID,
) -> Allowance:
    allowance = Allowance(
        hospital_id=hospital_id, user_id=user_id, year=year, month=month,
        amount=amount, reason=reason, allowance_type=allowance_type, created_by=created_by,
    )
    db.add(allowance)
    db.commit()
    db.refresh(allowance)
    return allowance


def list_allowances(
    db: Session, hospital_id: uuid.UUID, year: int, month: int, user_id: Optional[uuid.UUID] = None,
) -> list[Allowance]:
    query = (
        db.query(Allowance)
        .options(joinedload(Allowance.user))
        .filter(Allowance.hospital_id == hospital_id, Allowance.year == year, Allowance.month == month)
    )
    if user_id is not None:
        query = query.filter(Allowance.user_id == user_id)
    return query.order_by(Allowance.created_at.desc()).all()


def delete_allowance(db: Session, hospital_id: uuid.UUID, allowance_id: uuid.UUID) -> bool:
    row = db.query(Allowance).filter(Allowance.id == allowance_id, Allowance.hospital_id == hospital_id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def get_month_allowance_totals(
    db: Session, hospital_id: uuid.UUID, year: int, month: int,
) -> dict[uuid.UUID, Decimal]:
    """Sum of 'added_to_salary' allowances per employee for one month — one
    query for the whole roster, used by payroll_service.get_live_payroll to
    fold into net_payable."""
    rows = (
        db.query(Allowance.user_id, sa_func.sum(Allowance.amount))
        .filter(
            Allowance.hospital_id == hospital_id, Allowance.year == year, Allowance.month == month,
            Allowance.allowance_type == "added_to_salary",
        )
        .group_by(Allowance.user_id)
        .all()
    )
    return {user_id: total for user_id, total in rows}
