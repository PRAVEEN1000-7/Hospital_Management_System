"""
Payroll service — feed only (LOP/payable-days/deduction figures), reads
exclusively from *verified* attendance_records for the period (BRD
REQ-PAY-03: no manual re-entry). Blocks generation outright if any tracked
employee has an unverified attendance row in the period — payroll integrity
is tied directly to the Attendance verify step (Phase 2).

    lop_days         = max(0, leave_days_taken - leave_balances.allocated)
    per_day_rate      = employee_salary.per_day_salary  (already basic_salary / 30)
    deduction_amount  = lop_days * per_day_rate
    net_salary        = gross_salary - deduction_amount

gross_salary = basic_salary + flexi_allowance (the only other salary
component this system tracks; pf_contribution_employee is intentionally not
subtracted here — full salary disbursement/statutory deductions are out of
scope per the BRD, this is a LOP/payable-days feed only).
"""
import uuid
import logging
import calendar
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session
from ..models.payroll import PayrollRun, Payslip
from ..models.attendance import AttendanceRecord
from ..models.employee import EmployeeProfile, EmployeeSalary
from ..models.leave import LeaveBalance
from ..services.notification_service import notify_hospital_users
from ..services.employee_service import ensure_employee_profiles

logger = logging.getLogger(__name__)


class PayrollBlockedError(Exception):
    """Raised when the period has unverified attendance rows still outstanding."""


class PayrollAlreadyExistsError(Exception):
    """Raised when a payroll run already exists for this hospital/period."""


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def list_payroll_runs(db: Session, hospital_id: uuid.UUID) -> list[dict]:
    runs = (
        db.query(PayrollRun)
        .filter(PayrollRun.hospital_id == hospital_id)
        .order_by(PayrollRun.period_year.desc(), PayrollRun.period_month.desc())
        .all()
    )
    result = []
    for run in runs:
        count = db.query(Payslip).filter(Payslip.payroll_run_id == run.id).count()
        result.append({"run": run, "payslip_count": count})
    return result


def get_payroll_run(db: Session, run_id: str | uuid.UUID) -> PayrollRun | None:
    if isinstance(run_id, str):
        try:
            run_id = uuid.UUID(run_id)
        except ValueError:
            return None
    return db.query(PayrollRun).filter(PayrollRun.id == run_id).first()


def list_payslips(db: Session, payroll_run_id: str | uuid.UUID) -> list[Payslip]:
    if isinstance(payroll_run_id, str):
        payroll_run_id = uuid.UUID(payroll_run_id)
    return db.query(Payslip).filter(Payslip.payroll_run_id == payroll_run_id).all()


def get_payslip(db: Session, payslip_id: str | uuid.UUID) -> Payslip | None:
    if isinstance(payslip_id, str):
        try:
            payslip_id = uuid.UUID(payslip_id)
        except ValueError:
            return None
    return db.query(Payslip).filter(Payslip.id == payslip_id).first()


def generate_payroll_run(
    db: Session,
    hospital_id: uuid.UUID,
    generated_by: uuid.UUID,
    period_month: int,
    period_year: int,
) -> PayrollRun:
    existing = (
        db.query(PayrollRun)
        .filter(
            PayrollRun.hospital_id == hospital_id,
            PayrollRun.period_month == period_month,
            PayrollRun.period_year == period_year,
        )
        .first()
    )
    if existing:
        raise PayrollAlreadyExistsError(f"Payroll for {period_month}/{period_year} was already generated")

    date_from, date_to = _month_bounds(period_year, period_month)
    ensure_employee_profiles(db, hospital_id)
    profiles = (
        db.query(EmployeeProfile)
        .filter(EmployeeProfile.hospital_id == hospital_id, EmployeeProfile.include_in_payroll == True)  # noqa: E712
        .all()
    )
    employee_ids = [p.user_id for p in profiles]
    if not employee_ids:
        raise PayrollBlockedError("No payroll-eligible employees found")

    unverified_count = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.hospital_id == hospital_id,
            AttendanceRecord.employee_id.in_(employee_ids),
            AttendanceRecord.date >= date_from,
            AttendanceRecord.date <= date_to,
            AttendanceRecord.is_verified == False,  # noqa: E712
        )
        .count()
    )
    if unverified_count > 0:
        raise PayrollBlockedError(
            f"{unverified_count} attendance row(s) in this period are not yet verified — "
            "verify attendance for the full period before generating payroll"
        )

    run = PayrollRun(
        hospital_id=hospital_id, period_month=period_month, period_year=period_year,
        status="draft", generated_by=generated_by,
    )
    db.add(run)
    db.flush()  # assigns run.id without committing yet

    payslip_count = 0
    for profile in profiles:
        salary = (
            db.query(EmployeeSalary)
            .filter(EmployeeSalary.employee_id == profile.user_id, EmployeeSalary.effective_from <= date_to)
            .order_by(EmployeeSalary.effective_from.desc())
            .first()
        )
        if not salary:
            continue  # no salary on record yet — can't compute a payslip

        records = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.hospital_id == hospital_id,
                AttendanceRecord.employee_id == profile.user_id,
                AttendanceRecord.date >= date_from,
                AttendanceRecord.date <= date_to,
                AttendanceRecord.is_verified == True,  # noqa: E712
            )
            .all()
        )
        present = sum(1 for r in records if r.status == "present")
        absent = sum(1 for r in records if r.status == "absent")
        on_leave = sum(1 for r in records if r.status == "on_leave")
        holiday = sum(1 for r in records if r.status == "holiday")

        balance = (
            db.query(LeaveBalance)
            .filter(LeaveBalance.employee_id == profile.user_id, LeaveBalance.year == period_year)
            .first()
        )
        allocated = balance.allocated if balance else (profile.paid_leave_entitlement or 0)
        lop_days = max(0, on_leave - allocated)

        gross_salary = salary.basic_salary + (salary.flexi_allowance or Decimal("0"))
        deduction = Decimal(lop_days) * salary.per_day_salary
        net_salary = gross_salary - deduction

        payslip = Payslip(
            payroll_run_id=run.id, employee_id=profile.user_id,
            present_days=present, absent_days=absent, leave_days_taken=on_leave, holiday_days=holiday,
            lop_days=lop_days, per_day_rate=salary.per_day_salary, deduction_amount=deduction,
            gross_salary=gross_salary, net_salary=net_salary,
        )
        db.add(payslip)
        payslip_count += 1

    run.status = "processed"
    db.commit()
    db.refresh(run)

    notify_hospital_users(
        db, hospital_id,
        title="Payroll processed",
        message=f"Payroll for {period_month}/{period_year} processed — {payslip_count} payslip(s) generated.",
        notification_type="payroll",
        reference_type="payroll_run",
        reference_id=run.id,
        role_names=["hr_manager", "admin"],
    )

    logger.info(f"Payroll run generated: hospital={hospital_id} period={period_month}/{period_year} payslips={payslip_count}")
    return run
