"""
Attendance report router — daily present/absent/leave marking + the
monthly report grid, gated by the `attendance` module.
"""
import logging
import uuid
from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.attendance_record import AttendanceMarkRequest, AttendanceReportResponse, LeaveRecord
from ..services import attendance_service
from ..core.hospital_time import hospital_now_by_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/attendance-records", tags=["Attendance"])


@router.get("/report", response_model=AttendanceReportResponse)
async def get_report(
    year: int,
    month: int = Query(..., ge=1, le=12),
    shift_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    report = attendance_service.get_month_report(
        db, current_user.hospital_id, year, month,
        shift_id=uuid.UUID(shift_id) if shift_id else None,
    )
    return AttendanceReportResponse(**report)


@router.put("/{user_id}/{day}")
async def mark_attendance(
    user_id: str,
    day: date,
    body: AttendanceMarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    attendance_service.mark_day(
        db, current_user.hospital_id, uuid.UUID(user_id), day,
        body.status, current_user.id, reason=body.reason,
    )
    return {"status": "ok"}


@router.get("/leaves", response_model=list[LeaveRecord])
async def get_leaves(
    year: int,
    month: int = Query(..., ge=1, le=12),
    shift_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return attendance_service.get_month_leaves(
        db, current_user.hospital_id, year, month,
        shift_id=uuid.UUID(shift_id) if shift_id else None,
    )


@router.get("/leaves/pdf")
async def get_leaves_pdf(
    year: int,
    month: int = Query(..., ge=1, le=12),
    shift_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate the Leave Management log as printable HTML — same pattern
    as get_report_pdf / get_marking_pdf above. Portrait, not landscape:
    unlike the wide grids elsewhere in this module, this is a plain 5-column
    list and reads better on a normal page."""
    from datetime import datetime
    from fastapi.responses import HTMLResponse

    records = attendance_service.get_month_leaves(
        db, current_user.hospital_id, year, month,
        shift_id=uuid.UUID(shift_id) if shift_id else None,
    )
    header_html, hosp_name = _hospital_header_html(db, current_user.hospital_id)
    month_label = f"{MONTH_NAMES[month]} {year}"

    STATUS_BADGE = {
        "absent":   "background:#fee2e2;color:#b91c1c;",
        "half_day": "background:#fef3c7;color:#b45309;",
    }
    STATUS_TEXT = {"absent": "Absent", "half_day": "Half Day"}

    def fmt_date(d: str) -> str:
        return datetime.fromisoformat(d).strftime("%d %b %Y")

    rows = "".join(
        f"""<tr>
            <td>{_esc(r['first_name'])} {_esc(r['last_name'])}<br><span class="muted">{_esc(r['reference_number']) if r['reference_number'] else '—'}</span></td>
            <td>{_esc(r['designation']) if r['designation'] else '—'}</td>
            <td>{fmt_date(r['date'])}</td>
            <td><span class="badge" style="{STATUS_BADGE[r['status']]}">{STATUS_TEXT[r['status']]}</span></td>
            <td>{_esc(r['reason']) if r['reason'] else '—'}</td>
        </tr>"""
        for r in records
    )

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Leave Management - {_esc(month_label)}</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; padding: 32px; color: #1e293b; }}
.header {{ text-align: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid #137fec; }}
.header h1 {{ margin: 0; color: #137fec; font-size: 24px; }}
.header p {{ margin: 4px 0 0; color: #64748b; font-size: 13px; }}
.title-row {{ display: flex; justify-content: space-between; align-items: center; margin: 18px 0; }}
.title-row h2 {{ margin: 0; font-size: 18px; color: #1e293b; }}
.title-row .meta {{ font-size: 12px; color: #64748b; }}
table {{ width: 100%; border-collapse: collapse; margin: 12px 0; }}
th, td {{ text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }}
th {{ color: #64748b; font-weight: 600; font-size: 11px; background: #f8fafc; text-transform: uppercase; }}
.muted {{ color: #94a3b8; font-size: 10px; }}
.badge {{ display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; }}
.signature-row {{ display: flex; justify-content: flex-end; margin-top: 40px; page-break-inside: avoid; }}
.signature-block {{ text-align: center; width: 200px; }}
.signature-block .sig-space {{ height: 46px; }}
.signature-block .sig-line {{ border-top: 1px solid #94a3b8; }}
.signature-block p {{ margin: 6px 0 0; font-size: 11px; color: #64748b; }}
.footer {{ margin-top: 20px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 14px; }}
@page {{ size: A4; margin: 14mm; }}
@media print {{ body {{ padding: 16px; }} }}
</style>
</head>
<body>
{header_html}
<div class="title-row">
    <h2>Leave Management — {_esc(month_label)}</h2>
    <div class="meta">{len(records)} record{'s' if len(records) != 1 else ''}</div>
</div>
<table>
    <thead>
        <tr>
            <th>Employee</th>
            <th>Designation</th>
            <th>Date</th>
            <th>Type</th>
            <th>Reason</th>
        </tr>
    </thead>
    <tbody>{rows if records else '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No leave records for this month.</td></tr>'}</tbody>
</table>
<div class="signature-row">
    <div class="signature-block">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <p>Authorized Signatory</p>
    </div>
</div>
<div class="footer">
    <p>Generated on {hospital_now_by_id(db, current_user.hospital_id).strftime("%B %d, %Y at %I:%M %p")} | {hosp_name}</p>
    <p>This is a computer-generated document.</p>
</div>
</body>
</html>"""

    return HTMLResponse(content=html)


MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _esc(value) -> str:
    import html as _html_mod
    if value is None or value == "":
        return ""
    return _html_mod.escape(str(value), quote=True)


def _hospital_header_html(db: Session, hospital_id) -> str:
    from ..models.user import Hospital
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    hosp_name = _esc((hospital.name if hospital else "") or "Hospital")
    hosp_address = _esc(hospital.address_line_1 if hospital else "")
    hosp_city = _esc(hospital.city if hospital else "")
    hosp_state = _esc(hospital.state_province if hospital else "")
    hosp_phone = _esc(hospital.phone if hospital else "")
    hosp_email = _esc(hospital.email if hospital else "")
    return f"""<div class="header">
    <h1>{hosp_name}</h1>
    <p>{', '.join(p for p in (hosp_address, hosp_city, hosp_state) if p)}</p>
    {f'<p>Phone: {hosp_phone} | Email: {hosp_email}</p>' if hosp_phone or hosp_email else ''}
</div>""", hosp_name


@router.get("/report/pdf")
async def get_report_pdf(
    year: int,
    month: int = Query(..., ge=1, le=12),
    shift_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate the monthly Attendance Report as printable HTML — same
    self-contained-HTML-rendered-to-PDF-client-side pattern used by
    Payroll (see get_payroll_pdf in routers/payroll.py)."""
    from datetime import datetime
    from fastapi.responses import HTMLResponse

    report = attendance_service.get_month_report(
        db, current_user.hospital_id, year, month,
        shift_id=uuid.UUID(shift_id) if shift_id else None,
    )
    header_html, hosp_name = _hospital_header_html(db, current_user.hospital_id)
    month_label = f"{MONTH_NAMES[month]} {year}"
    employees = sorted(report["employees"], key=lambda e: e["first_name"])

    def fmt_shift_days(shift_days: dict) -> str:
        if not shift_days:
            return "—"
        return ", ".join(f"{_esc(name)} ({count})" for name, count in shift_days.items())

    rows = "".join(
        f"""<tr>
            <td>{_esc(emp['first_name'])} {_esc(emp['last_name'])}<br><span class="muted">{_esc(emp['reference_number']) if emp['reference_number'] else '—'}</span></td>
            <td>{fmt_shift_days(emp['shift_days'])}</td>
            <td class="right">{float(emp['present_count']):g}</td>
            <td class="right">{float(emp['absent_count']):g}</td>
            <td class="right">{emp['paid_leave_entitlement']}</td>
            <td class="right">{f"{float(emp['deduction_days']):g}" if emp['deduction_days'] else '—'}</td>
            <td class="right">{f"₹{float(emp['deduction_amount']):,.2f}" if emp['deduction_amount'] else '—'}</td>
        </tr>"""
        for emp in employees
    )

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Attendance Report - {_esc(month_label)}</title>
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
{header_html}
<div class="title-row">
    <h2>Attendance Report — {_esc(month_label)}</h2>
    <div class="meta">{len(employees)} employee{'s' if len(employees) != 1 else ''}</div>
</div>
<table>
    <thead>
        <tr>
            <th>Employee</th>
            <th>Shift</th>
            <th class="right">Present</th>
            <th class="right">Absent</th>
            <th class="right">Paid Leave</th>
            <th class="right">Deduction (days)</th>
            <th class="right">Deduction (₹)</th>
        </tr>
    </thead>
    <tbody>{rows}</tbody>
</table>
<div class="signature-row">
    <div class="signature-block">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <p>Authorized Signatory</p>
    </div>
</div>
<div class="footer">
    <p>Generated on {hospital_now_by_id(db, current_user.hospital_id).strftime("%B %d, %Y at %I:%M %p")} | {hosp_name}</p>
    <p>This is a computer-generated document.</p>
</div>
</body>
</html>"""

    return HTMLResponse(content=html)


@router.get("/marking-pdf")
async def get_marking_pdf(
    year: int,
    month: int = Query(..., ge=1, le=12),
    shift_id: str | None = None,
    # Day-of-month bounds (inclusive) — set by the frontend to mirror
    # whatever's actually on screen (Week view's 7 days, or a custom
    # From/To range), so the download matches the visible grid instead of
    # always being the full month. Omitted (or out of range) = full month,
    # same as before.
    from_day: int | None = Query(None, ge=1, le=31),
    to_day: int | None = Query(None, ge=1, le=31),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate the Attendance Marking day-by-day grid as printable HTML —
    same pattern as get_report_pdf above. Sliced to [from_day, to_day] when
    given, else the whole month."""
    import calendar
    from datetime import date as date_cls, datetime
    from fastapi.responses import HTMLResponse

    report = attendance_service.get_month_report(
        db, current_user.hospital_id, year, month,
        shift_id=uuid.UUID(shift_id) if shift_id else None,
    )
    header_html, hosp_name = _hospital_header_html(db, current_user.hospital_id)
    employees = sorted(report["employees"], key=lambda e: e["first_name"])
    total_days = report["total_days"]

    start_day = max(1, min(from_day, total_days)) if from_day else 1
    end_day = max(start_day, min(to_day, total_days)) if to_day else total_days

    month_label = (
        f"{MONTH_NAMES[month]} {year}"
        if start_day == 1 and end_day == total_days
        else f"{date_cls(year, month, start_day).strftime('%d %b')} – {date_cls(year, month, end_day).strftime('%d %b %Y')}"
    )

    STATUS_LABEL = {"present": "P", "absent": "A", "half_day": "H", "holiday": "WO",
                     "festival": "F", "na": "NA", "unmarked": ""}
    STATUS_STYLE = {
        "present":   "color:#047857;",
        "absent":    "color:#b91c1c;",
        "half_day":  "color:#b45309;",
        "holiday":   "color:#be123c;",
        "festival":  "color:#0f766e;",
        "na":        "color:#94a3b8;",
    }
    weekday_short = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    # Employee column gets a fixed share; the rest is split evenly across
    # however many days are in the selected range, so the table always
    # stretches to fill the full landscape width instead of sitting narrow
    # in the middle of the page with the days crammed into a small
    # fixed-pixel block.
    visible_days = end_day - start_day + 1
    emp_col_pct = 13
    day_col_pct = round((100 - emp_col_pct) / visible_days, 3)

    day_headers = "".join(
        f'<th class="daycol" style="width:{day_col_pct}%">{d}<br><span class="wd">{weekday_short[date_cls(year, month, d).weekday()]}</span></th>'
        for d in range(start_day, end_day + 1)
    )

    def day_cells(days: list) -> str:
        cells = []
        for d in days:
            if d == "unmarked":
                cells.append('<td class="daycol"></td>')
                continue
            style = STATUS_STYLE.get(d, "")
            label = STATUS_LABEL.get(d, "")
            cells.append(f'<td class="daycol"><span class="pill" style="{style}">{label}</span></td>')
        return "".join(cells)

    rows = "".join(
        f"""<tr>
            <td class="empcol" style="width:{emp_col_pct}%">{_esc(emp['first_name'])} {_esc(emp['last_name'])}<span class="muted">{_esc(emp['reference_number']) if emp['reference_number'] else '—'}</span></td>
            {day_cells(emp['days'][start_day - 1:end_day])}
        </tr>"""
        for emp in employees
    )

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Attendance Marking - {_esc(month_label)}</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #1e293b; }}
.header {{ text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #137fec; }}
.header h1 {{ margin: 0; color: #137fec; font-size: 22px; }}
.header p {{ margin: 3px 0 0; color: #64748b; font-size: 12px; }}
.title-row {{ margin: 16px 0 12px; font-size: 16px; font-weight: bold; }}
.legend {{ font-size: 10px; color: #64748b; margin-bottom: 14px; }}
.legend span {{ display: inline-block; padding: 2px 8px; border-radius: 10px; margin-right: 8px; font-weight: 600; }}
table {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
thead th {{ padding: 6px 2px; font-size: 9px; text-align: center; }}
th.daycol {{ background: #f8fafc; color: #64748b; font-weight: 700; border-bottom: 2px solid #e2e8f0; }}
th.daycol .wd {{ display: block; font-weight: 400; text-transform: none; color: #94a3b8; }}
th.empcol {{ background: #f8fafc; color: #64748b; font-weight: 700; border-bottom: 2px solid #e2e8f0; border-right: 2px solid #e2e8f0; text-align: left; padding: 6px 8px; }}
tbody tr {{ border-bottom: 1px solid #f1f5f9; }}
tbody tr:nth-child(even) {{ background: #fafbfc; }}
td.empcol {{ text-align: left; padding: 7px 8px; font-size: 10px; font-weight: 600; border-right: 2px solid #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
td.empcol .muted {{ display: block; color: #94a3b8; font-size: 8px; font-weight: 400; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
td.daycol {{ text-align: center; padding: 4px 1px; font-size: 9px; }}
.pill {{ display: inline-block; min-width: 16px; padding: 1px 3px; border-radius: 4px; font-weight: 700; line-height: 14px; }}
.signature-row {{ display: flex; justify-content: flex-end; margin-top: 30px; page-break-inside: avoid; }}
.signature-block {{ text-align: center; width: 180px; }}
.signature-block .sig-space {{ height: 36px; }}
.signature-block .sig-line {{ border-top: 1px solid #94a3b8; }}
.signature-block p {{ margin: 6px 0 0; font-size: 10px; color: #64748b; }}
.footer {{ margin-top: 16px; text-align: center; color: #94a3b8; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px; }}
@page {{ size: A4 landscape; margin: 8mm; }}
@media print {{ body {{ padding: 10px; }} }}
</style>
</head>
<body>
{header_html}
<div class="title-row">Attendance Marking — {_esc(month_label)}</div>
<div class="legend">
    <span style="color:#047857;">P Present</span>
    <span style="color:#b91c1c;">A Absent</span>
    <span style="color:#b45309;">H Half Day</span>
    <span style="color:#be123c;">WO Week-Off</span>
    <span style="color:#0f766e;">F Festival</span>
    <span style="color:#94a3b8;">NA Not Applicable</span>
</div>
<table>
    <thead><tr><th class="empcol">Employee</th>{day_headers}</tr></thead>
    <tbody>{rows}</tbody>
</table>
<div class="signature-row">
    <div class="signature-block">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <p>Authorized Signatory</p>
    </div>
</div>
<div class="footer">
    <p>Generated on {hospital_now_by_id(db, current_user.hospital_id).strftime("%B %d, %Y at %I:%M %p")} | {hosp_name}</p>
    <p>This is a computer-generated document.</p>
</div>
</body>
</html>"""

    return HTMLResponse(content=html)


@router.get("/annual-report/pdf")
async def get_annual_report_pdf(
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Whole-year attendance summary as printable HTML — one row per
    employee, Present/Absent for each of the 12 months, plus a Year Total
    block (Present / Absent / Working Days / Attendance %). Built by calling
    get_month_report for every month and aggregating — same trusted per-day
    resolution as the monthly report and Payroll, just looped and totaled;
    no separate calculation path, no shift breakdown, no ₹ deduction, no
    per-month % or Paid Leave (kept to Year Total only — 12 months of P/A/PL/%
    each made the grid too dense to read; see conversation history)."""
    from datetime import datetime
    from fastapi.responses import HTMLResponse

    month_reports = [
        attendance_service.get_month_report(db, current_user.hospital_id, year, m)
        for m in range(1, 13)
    ]
    header_html, hosp_name = _hospital_header_html(db, current_user.hospital_id)

    # Per employee, per month — just Present/Absent day counts. A month
    # entirely outside the employee's employment window (na_count ==
    # total_days, i.e. before joining / after leaving) is flagged
    # not-applicable rather than shown as a misleading 0/0.
    employees: dict[str, dict] = {}
    for month_idx, report in enumerate(month_reports, start=1):
        for emp in report["employees"]:
            entry = employees.setdefault(emp["user_id"], {
                "first_name": emp["first_name"], "last_name": emp["last_name"], "months": {},
            })
            entry["months"][month_idx] = {
                "present": emp["present_count"],
                "absent": emp["absent_count"],
                "working_days": emp["working_days"],
                "applicable": emp["na_count"] < report["total_days"],
            }

    def year_totals(months: dict) -> dict:
        applicable = [d for d in months.values() if d["applicable"]]
        present = sum(d["present"] for d in applicable)
        absent = sum(d["absent"] for d in applicable)
        working_days = sum(d["working_days"] for d in applicable)
        pct = round(present / working_days * 100, 1) if working_days > 0 else 0.0
        return {"present": present, "absent": absent, "working_days": working_days, "pct": pct}

    def month_cells(months: dict) -> str:
        cells = []
        for m in range(1, 13):
            data = months.get(m)
            if not data or not data["applicable"]:
                cells.append('<td class="mcol na">—</td><td class="mcol na">—</td>')
                continue
            cells.append(
                f'<td class="mcol">{float(data["present"]):g}</td>'
                f'<td class="mcol">{float(data["absent"]):g}</td>'
            )
        return "".join(cells)

    sorted_employees = sorted(employees.values(), key=lambda e: e["first_name"])

    # Employee column gets a fixed share; the 12 months (2 sub-columns each)
    # plus the Year Total block (4 columns) split the rest evenly.
    emp_col_pct = 12
    mcol_pct = round((100 - emp_col_pct) / (12 * 2 + 4), 3)

    month_group_headers = "".join(
        f'<th colspan="2" class="mgroup">{MONTH_NAMES[m][:3]}</th>' for m in range(1, 13)
    )
    sub_header_cell = '<th class="mcol sub">P</th><th class="mcol sub">A</th>'
    sub_headers = sub_header_cell * 12

    rows = "".join(
        f"""<tr>
            <td class="empcol" style="width:{emp_col_pct}%">{_esc(emp['first_name'])} {_esc(emp['last_name'])}</td>
            {month_cells(emp['months'])}
            <td class="mcol year">{float(totals['present']):g}</td>
            <td class="mcol year">{float(totals['absent']):g}</td>
            <td class="mcol year">{float(totals['working_days']):g}</td>
            <td class="mcol year pct-{'good' if totals['pct'] >= 95 else 'warn' if totals['pct'] >= 90 else 'bad'}">{totals['pct']:g}%</td>
        </tr>"""
        for emp in sorted_employees
        for totals in [year_totals(emp["months"])]
    )

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Annual Attendance Report - {year}</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #1e293b; }}
.header {{ text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #137fec; }}
.header h1 {{ margin: 0; color: #137fec; font-size: 22px; }}
.header p {{ margin: 3px 0 0; color: #64748b; font-size: 12px; }}
.title-row {{ margin: 16px 0 12px; font-size: 16px; font-weight: bold; }}
table {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
th, td {{ text-align: center; padding: 4px 2px; font-size: 8px; border-bottom: 1px solid #f1f5f9; }}
th.mcol, td.mcol {{ width: {mcol_pct}%; }}
th {{ background: #f8fafc; color: #64748b; font-weight: 700; font-size: 8px; text-transform: uppercase; }}
th.mgroup {{ border-left: 1px solid #e2e8f0; border-bottom: 2px solid #e2e8f0; }}
th.sub {{ border-bottom: 2px solid #e2e8f0; color: #94a3b8; font-weight: 600; }}
th.empcol, td.empcol {{ text-align: left; padding: 6px 8px; border-right: 2px solid #e2e8f0; white-space: nowrap; font-size: 10px; font-weight: 600; }}
td.mcol.year {{ background: #eff6ff; font-weight: 700; color: #137fec; border-left: 2px solid #e2e8f0; }}
td.mcol.na {{ color: #cbd5e1; }}
th.mcol.year {{ background: #dbeafe; border-left: 2px solid #e2e8f0; }}
tbody tr:nth-child(even) {{ background: #fafbfc; }}
td.mcol.pct-good {{ color: #047857; }}
td.mcol.pct-warn {{ color: #b45309; }}
td.mcol.pct-bad {{ color: #b91c1c; }}
.signature-row {{ display: flex; justify-content: flex-end; margin-top: 30px; page-break-inside: avoid; }}
.signature-block {{ text-align: center; width: 180px; }}
.signature-block .sig-space {{ height: 36px; }}
.signature-block .sig-line {{ border-top: 1px solid #94a3b8; }}
.signature-block p {{ margin: 6px 0 0; font-size: 10px; color: #64748b; }}
.footer {{ margin-top: 16px; text-align: center; color: #94a3b8; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px; }}
@page {{ size: A4 landscape; margin: 8mm; }}
@media print {{ body {{ padding: 10px; }} }}
</style>
</head>
<body>
{header_html}
<div class="title-row">Annual Attendance Report — {year}</div>
<table>
    <thead>
        <tr>
            <th class="empcol" rowspan="2" style="width:{emp_col_pct}%">Employee</th>
            {month_group_headers}
            <th colspan="4" class="mgroup year">Year Total</th>
        </tr>
        <tr>
            {sub_headers}
            <th class="mcol sub year">P</th><th class="mcol sub year">A</th><th class="mcol sub year">WD</th><th class="mcol sub year">%</th>
        </tr>
    </thead>
    <tbody>{rows if sorted_employees else f'<tr><td colspan="{12 * 2 + 5}" style="text-align:center;color:#94a3b8;padding:20px;">No employees found.</td></tr>'}</tbody>
</table>
<p style="font-size:9px;color:#94a3b8;margin-top:10px;">P = Present · A = Absent · WD = Working Days for the year · % = Attendance rate (Present ÷ Working Days) · — = Not employed that month</p>
<div class="signature-row">
    <div class="signature-block">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <p>Authorized Signatory</p>
    </div>
</div>
<div class="footer">
    <p>Generated on {hospital_now_by_id(db, current_user.hospital_id).strftime("%B %d, %Y at %I:%M %p")} | {hosp_name}</p>
    <p>This is a computer-generated document.</p>
</div>
</body>
</html>"""

    return HTMLResponse(content=html)
