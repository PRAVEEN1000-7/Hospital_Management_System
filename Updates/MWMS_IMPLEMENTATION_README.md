# How to implement MWMS inside HMS — step-by-step README

This is the practical "do this, then this" guide. For the full schema and reasoning behind each
decision, see [`MWMS_WORKFORCE_MODULE_PLAN.md`](./MWMS_WORKFORCE_MODULE_PLAN.md) in this same
folder — this file is the checklist version of that plan, based on the Mecandria Workforce
Management System BRD.

**Nothing has been built yet. This is a documentation-only plan, in the order you should build
it.**

---

## Scope, per the BRD

**In scope:** Employee Management, Holiday Management, Shift Management, Attendance Management
(manual only), Leave Management, and a Payroll module limited to supplying Leave-Without-Pay
(LOP) and payable-day figures.

**Out of scope for this phase:** full salary computation/disbursement, statutory compliance
filings (PF/ESI/tax reports), and biometric/device-level attendance hardware (assumed to be a
future phase). Nothing below builds toward those — don't add them "while you're in there."

---

## Step 1 — Employee Management (foundation, build this first)

**What it does:** turns an existing HMS `User` into a tracked "employee" with HR + salary fields.
**No new page** — this extends the existing Staff Directory.

**New pieces:**
- Database: `employee_profiles` (designation, department, date of joining, bank details, PF/PAN
  numbers, paid leave entitlement) — 1:1 linked to `users`. `employee_salary` (basic salary, and
  an **auto-calculated `per_day_salary` = basic salary ÷ 30**, recalculated every time basic
  salary is updated — fixed 30-day divisor, holidays included as paid days, not excluded).
- Frontend: a new "Employee Details" section added directly into `StaffModals.tsx`'s existing
  Create/Edit drawers (same pattern already used for the doctor-specific fields there), plus new
  columns in `StaffDirectory.tsx`'s table/view drawer.
- Register the module: `employee_management` row in `saas_core.modules`.

**Done when:** a super admin can toggle "Employee Management" on for a test hospital, and Staff
Directory's Add/Edit Staff form shows the new HR + salary fields, with per-day salary appearing
automatically the moment basic salary is entered.

---

## Step 2 — Holiday Management

**What it does:** a per-hospital holiday calendar (year/month/week views). Marking a date as a
holiday automatically fills 'Holiday' into the Attendance grid for every employee that day — no
manual attendance entry needed for those dates.

**New pieces:**
- Database: `holidays` (date, name, type: festival/weekly_off/other).
- A bulk "mark all Sundays as holiday for this year" action, so recurring weekly-offs don't
  need to be added one date at a time.
- Frontend: `pages/workforce/HolidayCalendar.tsx`.
- Module row: `holiday_management`, depends on `employee_management`.

**Done when:** an admin can add holidays (including bulk weekly-offs), and those dates show as
'Holiday' automatically once the Attendance grid exists (Step 4).

---

## Step 3 — Shift Management

**What it does:** define shifts (Day / Night), assign one to each employee. Every shift add or
change requires a reason and records who made it (audit trail).

**New pieces:**
- Database: `shifts` (name, start time, end time), `employee_shift_assignments` (employee, shift,
  effective date, assigned by, reason).
- Frontend: `pages/workforce/ShiftManagement.tsx`.
- Module row: `shift_management`, depends on `employee_management`.

**Done when:** an HR manager can create a Day/Night shift, assign an employee to it, and the
change is logged with a reason.

---

## Step 4 — Attendance (manual grid — no biometric, no timestamps)

**What it does:** a shift-filtered, department-split, Excel-like grid. Clicking an employee's
cell for a date marks them present/absent — that's it, no arrival time is recorded, since without
biometric hardware there's no reliable way to know actual arrival time, and recording *when the
admin happened to click* could be misread as *when the employee arrived*.

**How the grid behaves — this is the important part:**
- Every click **saves to the database immediately** — it is not held only in the browser, so
  refreshing or closing the tab loses nothing.
- Default status is `not_marked`, **never** `absent`. An employee only becomes `absent` if an
  admin explicitly clicks it. This is what prevents "employee came in, admin didn't see them
  yet, and they end up wrongly marked absent."
- Marking is provisional (`is_verified = false`) all day — freely editable, correctable at any
  time.
- An end-of-day **"Verify & Download"** action locks the day's entries (`is_verified = true`) and
  produces the verified attendance sheet with present/absent counts and an absentee list. This
  is the point where any employee still `not_marked` should be flagged, so nothing gets silently
  finalized as absent by omission.
- Dates that match a `holidays` entry pre-fill as `'holiday'` automatically. Dates covered by a
  `leave_records` entry pre-fill as `'on_leave'` automatically.

**New pieces:**
- Database: `attendance_records` — one row per employee per date (`status`, `is_verified`,
  `marked_by`, `verified_by`/`verified_at`). No `marked_time` column.
- Frontend: `pages/workforce/AttendanceGrid.tsx`.
- Module row: `attendance`, depends on `employee_management`.

**Biometric device import is not part of this phase** — the BRD marks it a future phase, and it
can't be scoped yet anyway (the log format is specific to whatever hardware a client eventually
picks).

**Done when:** a full month's attendance can be marked, corrected freely before verification,
verified at end of day, and downloaded — matching present/absent counts and an absentee list.

---

## Step 5 — Leave Management

**What it does:** HR logs leave directly (not a self-service request queue) — e.g. "Rahul, out
today, reason: fever." Requires at least one day's prior notice except for a flagged emergency.
Automatically highlights an employee once their leave exceeds their paid balance, and calculates
Leave Without Pay (LOP) once the balance is exhausted.

**New pieces:**
- Database: `leave_records` (employee, date range, reason, status — defaults to `approved` since
  HR enters it directly), `leave_balances` (per employee per year: allocated vs. used, allocated
  copied from `employee_profiles.paid_leave_entitlement`).
- A `leave_records` entry also writes `on_leave` into `attendance_records` for its covered dates,
  so the grid and the leave log never disagree.
- Frontend: `pages/workforce/LeaveManagement.tsx`.
- Module row: `leave_management`, depends on `employee_management`.

**Done when:** HR can log a leave entry, the employee's balance updates, and an over-balance entry
is visually flagged.

---

## Step 6 — Payroll (LOP/payable-days feed only — last)

**What it does:** for a given month, pulls verified attendance + leave data and computes:

```
lop_days          = max(0, leave_days_taken − leave_balances.allocated)
per_day_rate       = employee_salary.per_day_salary
deduction_amount    = lop_days × per_day_rate
net_salary           = gross_salary − deduction_amount
```

Worked example: basic salary ₹30,000 → per-day salary ₹1,000. Paid-leave entitlement is 2 days;
employee takes 3 → 1 LOP day → ₹1,000 deducted.

**This does not compute full salary disbursement or statutory deductions (PF/ESI/tax) — that's a
separate system this module only feeds figures into**, per the BRD's explicit scope boundary.

**New pieces:**
- Database: `payroll_runs` (month/year/status), `payslips` (per-employee present/absent/leave/
  holiday/LOP day counts, deduction, gross/net).
- Payslip PDF (reusing the existing WeasyPrint pattern) with company logo watermark (reusing
  `Hospital.logo_url`, already stored) and an email-delivery option (reusing the existing
  `email_service.py`).
- Module row: `payroll`, depends on `employee_management` + `attendance` + `leave_management`.

**Done when:** running payroll for a month produces a correct per-employee payslip figure,
downloadable as PDF and emailable, matching the worked example above.

---

## Step 7 — Reports (build alongside any of the above, not strictly last)

Five reports named in the BRD: **Daily Attendance Count**, **Absentee Report**, **Verified
Attendance Sheet**, **Leave Without Pay (LOP) Report**, **Paid Leave Balance Report**.

**How:** copy the pattern already used by HMS's Analytics page (React Query + a filter store) —
the one part of the app already built for cacheable, filterable report data.

---

## How a client actually turns this on

No new mechanism needed — the same Super Admin screen that already toggles Pharmacy/Optical/Lab
per hospital will show these new modules automatically, since it reads whatever rows exist in
`saas_core.modules` rather than a hardcoded list.

---

## Quick reference — build order

1. Employee Management (+ salary, auto per-day rate)
2. Holiday Management
3. Shift Management
4. Attendance (manual grid, provisional → verified — no biometric this phase)
5. Leave Management (HR data-entry, LOP calculation)
6. Reports (parallel, anytime after step 1)
7. Payroll (last — LOP/payable-days feed only, not salary disbursement)
