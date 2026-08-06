"""
Payroll service — computes one month's payroll LIVE, every time it's asked
for: base_salary - deduction_amount + allowance_added + incentive_added -
advance_deducted = net_payable, per employee. Nothing here is persisted or
cached — it's built fresh from attendance_service.get_month_report() (itself
already live) plus this month's allowance/incentive/advance totals, so
entering an allowance, incentive, or advance is reflected the moment you
reopen Payroll, with no separate "generate" step.
"""
import uuid
from sqlalchemy.orm import Session

from . import attendance_service, allowance_service, incentive_service, advance_payment_service


def get_live_payroll(db: Session, hospital_id: uuid.UUID, year: int, month: int) -> dict:
    report = attendance_service.get_month_report(db, hospital_id, year, month)
    allowance_totals = allowance_service.get_month_allowance_totals(db, hospital_id, year, month)
    incentive_totals = incentive_service.get_month_incentive_totals(db, hospital_id, year, month)
    advance_totals = advance_payment_service.get_month_advance_totals(db, hospital_id, year, month)

    items = []
    for emp in report["employees"]:
        # per_day_salary was derived from base_salary / working_days in
        # attendance_service — reconstruct base_salary from it rather than
        # re-querying the user, since working_days is already known here.
        base_salary = round(emp["per_day_salary"] * emp["working_days"], 2)
        user_uuid = uuid.UUID(emp["user_id"])
        allowance_added = float(allowance_totals.get(user_uuid, 0))
        incentive_added = float(incentive_totals.get(user_uuid, 0))
        advance_deducted = float(advance_totals.get(user_uuid, 0))
        net_payable = round(
            base_salary - emp["deduction_amount"] + allowance_added + incentive_added - advance_deducted, 2
        )
        items.append({
            "user_id": emp["user_id"],
            "reference_number": emp["reference_number"],
            "first_name": emp["first_name"],
            "last_name": emp["last_name"],
            "designation": emp["designation"],
            "present_count": emp["present_count"],
            "absent_count": emp["absent_count"],
            "paid_leave_entitlement": emp["paid_leave_entitlement"],
            "working_days": emp["working_days"],
            "base_salary": base_salary,
            "per_day_salary": emp["per_day_salary"],
            "deduction_days": emp["deduction_days"],
            "deduction_amount": emp["deduction_amount"],
            "allowance_added": allowance_added,
            "incentive_added": incentive_added,
            "advance_deducted": advance_deducted,
            "net_payable": net_payable,
        })

    return {
        "year": year,
        "month": month,
        "items": items,
    }
