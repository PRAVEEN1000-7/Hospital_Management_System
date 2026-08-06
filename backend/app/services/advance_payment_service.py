"""
Advance Payment service — a salary advance/loan recovered as a fixed EMI
each month. Deliberately no monthly repayment ledger table: everything
about "how much is repaid" and "what's this month's installment" is derived
live from (amount, emi_amount, start_year, start_month) versus whichever
month is being asked about. See models/advance_payment.py for the reasoning.
"""
import uuid
from datetime import date
from typing import Optional
from sqlalchemy.orm import Session, joinedload

from ..models.advance_payment import AdvancePayment


def create_advance_payment(
    db: Session, hospital_id: uuid.UUID, user_id: uuid.UUID, amount: float, installments: int,
    start_year: int, start_month: int, reason: str, created_by: uuid.UUID,
) -> AdvancePayment:
    # Computed server-side, never trusted from the client (see schemas/advance_payment.py).
    emi_amount = round(amount / installments, 2)
    advance = AdvancePayment(
        hospital_id=hospital_id, user_id=user_id, amount=amount, installments=installments,
        emi_amount=emi_amount, start_year=start_year, start_month=start_month,
        reason=reason, created_by=created_by,
    )
    db.add(advance)
    db.commit()
    db.refresh(advance)
    return advance


def list_advance_payments(
    db: Session, hospital_id: uuid.UUID, user_id: Optional[uuid.UUID] = None,
) -> list[AdvancePayment]:
    query = (
        db.query(AdvancePayment)
        .options(joinedload(AdvancePayment.user))
        .filter(AdvancePayment.hospital_id == hospital_id)
    )
    if user_id is not None:
        query = query.filter(AdvancePayment.user_id == user_id)
    return query.order_by(AdvancePayment.created_at.desc()).all()


def delete_advance_payment(db: Session, hospital_id: uuid.UUID, advance_id: uuid.UUID) -> bool:
    row = db.query(AdvancePayment).filter(AdvancePayment.id == advance_id, AdvancePayment.hospital_id == hospital_id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def _repaid_after_n_installments(amount: float, emi_amount: float, n: int) -> float:
    """Total repaid after n installments have been deducted (n can be 0)."""
    if n <= 0:
        return 0.0
    return min(amount, round(emi_amount * n, 2))


def get_status(advance: AdvancePayment, as_of_year: int, as_of_month: int) -> tuple[float, float, bool]:
    """(repaid_amount, remaining_amount, is_completed) as of the END of
    as_of_year/as_of_month — i.e. including that month's installment if it
    falls within the schedule."""
    amount = float(advance.amount)
    emi = float(advance.emi_amount)
    start_idx = advance.start_year * 12 + advance.start_month
    as_of_idx = as_of_year * 12 + as_of_month
    n = as_of_idx - start_idx + 1
    n_clamped = max(0, min(advance.installments, n))
    repaid = _repaid_after_n_installments(amount, emi, n_clamped)
    remaining = round(amount - repaid, 2)
    return repaid, remaining, n >= advance.installments


def get_month_deduction(advance: AdvancePayment, year: int, month: int) -> float:
    """This specific month's installment — 0 if the advance hasn't started
    yet, or has already been fully repaid before this month. The final
    installment is whatever's left, so amount/installments not dividing
    evenly never leaves a stray paise balance."""
    amount = float(advance.amount)
    emi = float(advance.emi_amount)
    start_idx = advance.start_year * 12 + advance.start_month
    idx = year * 12 + month
    n = idx - start_idx + 1
    if n < 1 or n > advance.installments:
        return 0.0
    repaid_before = _repaid_after_n_installments(amount, emi, n - 1)
    repaid_through = _repaid_after_n_installments(amount, emi, n)
    return round(repaid_through - repaid_before, 2)


def get_month_advance_totals(db: Session, hospital_id: uuid.UUID, year: int, month: int) -> dict[uuid.UUID, float]:
    """Sum of this month's advance deductions per employee — an employee
    could have more than one advance running at once. Used by
    payroll_service.get_live_payroll."""
    advances = db.query(AdvancePayment).filter(AdvancePayment.hospital_id == hospital_id).all()
    totals: dict[uuid.UUID, float] = {}
    for a in advances:
        deduction = get_month_deduction(a, year, month)
        if deduction > 0:
            totals[a.user_id] = round(totals.get(a.user_id, 0.0) + deduction, 2)
    return totals


def today_year_month() -> tuple[int, int]:
    t = date.today()
    return t.year, t.month
