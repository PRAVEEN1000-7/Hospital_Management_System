"""
Payroll router — always-live monthly payroll, gated by the `attendance`
module. No "generate" step: GET just computes the current numbers on every
call (see payroll_service.get_live_payroll).
"""
import logging
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user
from ..schemas.payroll import PayrollRunResponse, PayrollItemResponse
from ..schemas.allowance import AllowanceLineItem
from ..schemas.incentive import IncentiveLineItem
from ..schemas.advance_payment import AdvancePaymentLineItem
from ..services import payroll_service, allowance_service, incentive_service, advance_payment_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payroll", tags=["Payroll"])


def _to_response(live: dict, hospital_id, year: int, month: int, db: Session) -> PayrollRunResponse:
    # One query for the whole month's allowances/incentives, grouped in
    # Python — the "click an employee" detail popup needs every entry
    # logged for them that month, not just the sums already folded into
    # item["allowance_added"] / item["incentive_added"].
    all_allowances = allowance_service.list_allowances(db, hospital_id, year, month)
    allowances_by_user: dict = {}
    for a in all_allowances:
        allowances_by_user.setdefault(a.user_id, []).append(
            AllowanceLineItem(amount=float(a.amount), reason=a.reason, allowance_type=a.allowance_type)
        )

    all_incentives = incentive_service.list_incentives(db, hospital_id, year, month)
    incentives_by_user: dict = {}
    for i in all_incentives:
        incentives_by_user.setdefault(i.user_id, []).append(
            IncentiveLineItem(
                sales_amount=float(i.sales_amount),
                incentive_percent=float(i.incentive_percent),
                incentive_amount=float(i.incentive_amount),
            )
        )

    # Advances aren't month-tagged like allowances/incentives — pull every
    # advance for the hospital and work out, per employee, whether this
    # specific month has an active installment (see advance_payment_service
    # for why this is derived rather than stored).
    all_advances = advance_payment_service.list_advance_payments(db, hospital_id)
    advances_by_user: dict = {}
    for adv in all_advances:
        this_month = advance_payment_service.get_month_deduction(adv, year, month)
        if this_month <= 0:
            continue
        _, remaining_after, _ = advance_payment_service.get_status(adv, year, month)
        advances_by_user.setdefault(adv.user_id, []).append(
            AdvancePaymentLineItem(
                amount=float(adv.amount), emi_amount=float(adv.emi_amount),
                this_month_deduction=this_month, remaining_after=remaining_after,
                reason=adv.reason,
            )
        )

    items = [
        PayrollItemResponse(
            **item,
            allowances=allowances_by_user.get(uuid.UUID(item["user_id"]), []),
            incentives=incentives_by_user.get(uuid.UUID(item["user_id"]), []),
            advances=advances_by_user.get(uuid.UUID(item["user_id"]), []),
        )
        for item in live["items"]
    ]
    return PayrollRunResponse(
        year=live["year"],
        month=live["month"],
        items=sorted(items, key=lambda i: i.first_name),
        total_net_payable=round(sum(i.net_payable for i in items), 2),
    )


@router.get("/{year}/{month}", response_model=PayrollRunResponse)
async def get_payroll(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    live = payroll_service.get_live_payroll(db, current_user.hospital_id, year, month)
    return _to_response(live, current_user.hospital_id, year, month, db)


MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


@router.get("/{year}/{month}/pdf")
async def get_payroll_pdf(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate the month's payroll table as printable HTML — same
    self-contained-HTML-rendered-to-PDF-client-side pattern used by
    invoices/prescriptions/optical Rx (see get_invoice_pdf in invoices.py)."""
    import html as _html_mod
    from datetime import datetime
    from ..models.user import Hospital

    live = payroll_service.get_live_payroll(db, current_user.hospital_id, year, month)
    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()

    def _esc(value) -> str:
        if value is None or value == "":
            return ""
        return _html_mod.escape(str(value), quote=True)

    def fmt_money(v) -> str:
        return f"{float(v or 0):,.2f}"

    hosp_name = _esc((hospital.name if hospital else "") or "Hospital")
    hosp_address = _esc(hospital.address_line_1 if hospital else "")
    hosp_city = _esc(hospital.city if hospital else "")
    hosp_state = _esc(hospital.state_province if hospital else "")
    hosp_phone = _esc(hospital.phone if hospital else "")
    hosp_email = _esc(hospital.email if hospital else "")

    items = sorted(live["items"], key=lambda i: i["first_name"])
    total_net = sum(float(i["net_payable"]) for i in items)

    rows = "".join(
        f"""<tr>
            <td>{_esc(item['first_name'])} {_esc(item['last_name'])}<br><span class="muted">{_esc(item['reference_number']) if item['reference_number'] else '—'}</span></td>
            <td class="right">{float(item['present_count']):g}</td>
            <td class="right">{float(item['absent_count']):g}</td>
            <td class="right">{item['paid_leave_entitlement']}</td>
            <td class="right">₹{fmt_money(item['base_salary'])}</td>
            <td class="right">{f"₹{fmt_money(item['deduction_amount'])}" if item['deduction_amount'] else '—'}</td>
            <td class="right">{f"₹{fmt_money(item['allowance_added'])}" if item['allowance_added'] else '—'}</td>
            <td class="right">{f"₹{fmt_money(item['incentive_added'])}" if item['incentive_added'] else '—'}</td>
            <td class="right">{f"−₹{fmt_money(item['advance_deducted'])}" if item['advance_deducted'] else '—'}</td>
            <td class="right"><strong>₹{fmt_money(item['net_payable'])}</strong></td>
        </tr>"""
        for item in items
    )

    month_label = f"{MONTH_NAMES[month]} {year}"

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Payroll - {_esc(month_label)}</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; padding: 32px; color: #1e293b; }}
.header {{ text-align: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid #137fec; }}
.header h1 {{ margin: 0; color: #137fec; font-size: 24px; }}
.header p {{ margin: 4px 0 0; color: #64748b; font-size: 13px; }}
.title-row {{ display: flex; justify-content: space-between; align-items: center; margin: 18px 0; }}
.title-row h2 {{ margin: 0; font-size: 18px; color: #1e293b; }}
.title-row .meta {{ font-size: 12px; color: #64748b; text-align: right; }}
table {{ width: 100%; border-collapse: collapse; margin: 12px 0; }}
th, td {{ text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }}
th {{ color: #64748b; font-weight: 600; font-size: 11px; background: #f8fafc; text-transform: uppercase; }}
.right {{ text-align: right; }}
.muted {{ color: #94a3b8; font-size: 10px; }}
tfoot td {{ font-weight: bold; border-top: 2px solid #e2e8f0; border-bottom: none; padding-top: 12px; }}
.total-label {{ text-align: right; }}
.total-value {{ color: #137fec; font-size: 14px; }}
.signature-row {{ display: flex; justify-content: flex-end; margin-top: 40px; page-break-inside: avoid; }}
.signature-block {{ text-align: center; width: 200px; }}
.signature-block .sig-space {{ height: 46px; }}
.signature-block .sig-line {{ border-top: 1px solid #94a3b8; }}
.signature-block p {{ margin: 6px 0 0; font-size: 11px; color: #64748b; }}
.footer {{ margin-top: 20px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 14px; }}
@page {{ size: A4 landscape; margin: 12mm; }}
@media print {{ body {{ padding: 16px; }} }}
</style>
</head>
<body>
<div class="header">
    <h1>{hosp_name}</h1>
    <p>{', '.join(p for p in (hosp_address, hosp_city, hosp_state) if p)}</p>
    {f'<p>Phone: {hosp_phone} | Email: {hosp_email}</p>' if hosp_phone or hosp_email else ''}
</div>
<div class="title-row">
    <h2>Payroll — {_esc(month_label)}</h2>
    <div class="meta">
        As of {datetime.now().strftime("%B %d, %Y at %I:%M %p")}<br>
        {len(items)} employee{'s' if len(items) != 1 else ''}
    </div>
</div>
<table>
    <thead>
        <tr>
            <th>Employee</th>
            <th class="right">Present</th>
            <th class="right">Absent</th>
            <th class="right">Paid Leave</th>
            <th class="right">Base Salary</th>
            <th class="right">Deduction</th>
            <th class="right">Allowance</th>
            <th class="right">Incentive</th>
            <th class="right">Advance</th>
            <th class="right">Net Payable</th>
        </tr>
    </thead>
    <tbody>{rows}</tbody>
    <tfoot>
        <tr>
            <td colspan="10" class="total-label">Total Payable</td>
            <td class="right total-value">₹{fmt_money(total_net)}</td>
        </tr>
    </tfoot>
</table>
<div class="signature-row">
    <div class="signature-block">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <p>Authorized Signatory</p>
    </div>
</div>
<div class="footer">
    <p>Generated on {datetime.now().strftime("%B %d, %Y at %I:%M %p")} | {hosp_name}</p>
    <p>This is a computer-generated document.</p>
</div>
</body>
</html>"""

    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)
