"""
Payroll router — generate/list payroll runs and drill into payslips, plus
the payslip print endpoint (escaped self-contained HTML, same pattern as
invoices.py's /pdf endpoint — no WeasyPrint in this codebase; the frontend
converts it to PDF client-side via htmlStringToPdf()).
"""
import logging
import html as _html_mod
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User, Hospital
from ..models.payroll import Payslip
from ..models.employee import EmployeeProfile
from ..core.module_roles import require_permission
from ..schemas.payroll import (
    PayrollRunGenerateRequest, PayrollRunResponse, PayrollRunListResponse,
    PayslipResponse, PayslipListResponse,
)
from ..services.payroll_service import (
    list_payroll_runs, get_payroll_run, list_payslips, get_payslip,
    generate_payroll_run, PayrollBlockedError, PayrollAlreadyExistsError,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payroll", tags=["Payroll"])
payslips_router = APIRouter(prefix="/payslips", tags=["Payroll"])

payroll_view_guard = require_permission("employee.payroll", "view")
payroll_edit_guard = require_permission("employee.payroll", "edit")


def _enrich_payslip(db: Session, p: Payslip) -> PayslipResponse:
    resp = PayslipResponse.model_validate(p)
    if p.employee:
        resp.employee_name = f"{p.employee.first_name} {p.employee.last_name}".strip()
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == p.employee_id).first()
    if profile:
        resp.designation = profile.designation
    return resp


@router.get("/runs", response_model=PayrollRunListResponse)
async def get_payroll_runs(
    db: Session = Depends(get_db),
    current_user: User = Depends(payroll_view_guard),
):
    rows = list_payroll_runs(db, current_user.hospital_id)
    data = []
    for row in rows:
        resp = PayrollRunResponse.model_validate(row["run"])
        resp.payslip_count = row["payslip_count"]
        data.append(resp)
    return PayrollRunListResponse(total=len(data), data=data)


@router.post("/runs", response_model=PayrollRunResponse, status_code=status.HTTP_201_CREATED)
async def create_payroll_run(
    data: PayrollRunGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(payroll_edit_guard),
):
    try:
        run = generate_payroll_run(db, current_user.hospital_id, current_user.id, data.period_month, data.period_year)
    except PayrollAlreadyExistsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except PayrollBlockedError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    resp = PayrollRunResponse.model_validate(run)
    resp.payslip_count = len(list_payslips(db, run.id))
    return resp


@router.get("/runs/{run_id}/payslips", response_model=PayslipListResponse)
async def get_run_payslips(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(payroll_view_guard),
):
    run = get_payroll_run(db, run_id)
    if not run or str(run.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Payroll run not found")
    rows = list_payslips(db, run_id)
    return PayslipListResponse(total=len(rows), data=[_enrich_payslip(db, p) for p in rows])


@payslips_router.get("/{payslip_id}", response_model=PayslipResponse)
async def get_payslip_detail(
    payslip_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(payroll_view_guard),
):
    payslip = get_payslip(db, payslip_id)
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    run = get_payroll_run(db, payslip.payroll_run_id)
    if not run or str(run.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Payslip not found")
    return _enrich_payslip(db, payslip)


@payslips_router.get("/{payslip_id}/print")
async def get_payslip_print_html(
    payslip_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(payroll_view_guard),
):
    """Self-contained HTML document — mirrors invoices.py's /pdf endpoint
    exactly (inline <style>, escaped values); the frontend converts it to
    PDF client-side via htmlStringToPdf(), no WeasyPrint involved."""
    payslip = get_payslip(db, payslip_id)
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    run = get_payroll_run(db, payslip.payroll_run_id)
    if not run or str(run.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Payslip not found")

    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
    employee = payslip.employee
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == payslip.employee_id).first()

    def _esc(value) -> str:
        if value is None or value == "":
            return ""
        return _html_mod.escape(str(value), quote=True)

    def fmt_money(v) -> str:
        return f"{float(v or 0):,.2f}"

    hosp_name = _esc((hospital.name if hospital else "") or "Hospital")
    employee_name = _esc(f"{employee.first_name} {employee.last_name}".strip()) if employee else "—"
    designation = _esc(profile.designation) if profile and profile.designation else ""
    period = _esc(f"{run.period_month:02d}/{run.period_year}")

    row = lambda label, value: f'<div class="row"><span>{_esc(label)}</span><span>{value}</span></div>'  # noqa: E731

    html = f"""<!DOCTYPE html>
<html>
<head>
<title>Payslip - {employee_name} - {period}</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #1e293b; }}
.header {{ text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #0284c7; }}
.header h1 {{ margin: 0; color: #0284c7; font-size: 28px; }}
.header p {{ margin: 4px 0 0; color: #64748b; font-size: 14px; }}
.title {{ font-size: 18px; font-weight: bold; color: #0284c7; text-align: center; margin: 20px 0; padding: 12px; background: #f0f9ff; border-radius: 8px; }}
.section-title {{ font-size: 15px; font-weight: bold; color: #0284c7; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; }}
.row {{ display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9; }}
.summary {{ width: 320px; margin-left: auto; margin-top: 16px; }}
.summary-total {{ font-size: 17px; font-weight: bold; border-top: 2px solid #e2e8f0; padding-top: 10px; margin-top: 8px; display: flex; justify-content: space-between; }}
.footer {{ margin-top: 40px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
@media print {{ body {{ padding: 20px; }} }}
</style>
</head>
<body>
<div class="header">
    <h1>{hosp_name}</h1>
    <p>Payslip</p>
</div>
<div class="title">Payslip — {period}</div>
<p class="section-title">Employee</p>
{row('Name', employee_name)}
{row('Designation', designation or '—')}
<p class="section-title">Attendance Summary (verified)</p>
{row('Present Days', payslip.present_days)}
{row('Absent Days', payslip.absent_days)}
{row('Leave Days Taken', payslip.leave_days_taken)}
{row('Holiday Days', payslip.holiday_days)}
{row('Loss of Pay (LOP) Days', payslip.lop_days)}
<div class="summary">
    <div class="row"><span>Gross Salary</span><span>₹{fmt_money(payslip.gross_salary)}</span></div>
    <div class="row"><span>Per-Day Rate</span><span>₹{fmt_money(payslip.per_day_rate)}</span></div>
    <div class="row"><span>LOP Deduction</span><span>−₹{fmt_money(payslip.deduction_amount)}</span></div>
    <div class="summary-total"><span>Net Salary</span><span>₹{fmt_money(payslip.net_salary)}</span></div>
</div>
<div class="footer">
    <p>Feed-only payslip — does not represent salary disbursement or a statutory filing.</p>
    <p>This is a computer-generated document. No signature required.</p>
</div>
</body>
</html>"""

    return HTMLResponse(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": f'inline; filename="payslip_{employee_name}_{period.replace("/", "-")}.html"'},
    )
