"""
Payroll service — turns one month's Attendance Report (present/absent/
deduction, already computed in attendance_service.get_month_report) into a
persisted payroll snapshot: base_salary - deduction_amount = net_payable,
per employee. Frozen at generation time so later edits to an employee's
salary or leave entitlement don't retroactively rewrite payroll history.
"""
import uuid
from sqlalchemy.orm import Session, joinedload

from ..models.payroll import PayrollRun, PayrollItem
from . import attendance_service


def generate_payroll(db: Session, hospital_id: uuid.UUID, year: int, month: int, generated_by: uuid.UUID) -> PayrollRun:
    report = attendance_service.get_month_report(db, hospital_id, year, month)

    run = (
        db.query(PayrollRun)
        .filter(PayrollRun.hospital_id == hospital_id, PayrollRun.year == year, PayrollRun.month == month)
        .first()
    )
    if run:
        db.query(PayrollItem).filter(PayrollItem.payroll_run_id == run.id).delete()
    else:
        run = PayrollRun(hospital_id=hospital_id, year=year, month=month, generated_by=generated_by)
        db.add(run)
        db.flush()

    run.generated_by = generated_by

    for emp in report["employees"]:
        # per_day_salary was derived from base_salary / working_days in
        # attendance_service — reconstruct base_salary from it rather than
        # re-querying the user, since working_days is already known here.
        base_salary = round(emp["per_day_salary"] * emp["working_days"], 2)
        net_payable = round(base_salary - emp["deduction_amount"], 2)
        db.add(PayrollItem(
            payroll_run_id=run.id,
            user_id=uuid.UUID(emp["user_id"]),
            present_count=emp["present_count"],
            absent_count=emp["absent_count"],
            paid_leave_entitlement=emp["paid_leave_entitlement"],
            working_days=emp["working_days"],
            base_salary=base_salary,
            per_day_salary=emp["per_day_salary"],
            deduction_days=emp["deduction_days"],
            deduction_amount=emp["deduction_amount"],
            net_payable=net_payable,
        ))

    db.commit()
    db.refresh(run)
    return run


def get_payroll(db: Session, hospital_id: uuid.UUID, year: int, month: int) -> PayrollRun | None:
    return (
        db.query(PayrollRun)
        .options(
            joinedload(PayrollRun.items).joinedload(PayrollItem.user),
        )
        .filter(PayrollRun.hospital_id == hospital_id, PayrollRun.year == year, PayrollRun.month == month)
        .first()
    )
