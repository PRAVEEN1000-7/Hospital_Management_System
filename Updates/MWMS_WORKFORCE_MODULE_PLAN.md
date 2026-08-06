# Workforce Management Modules (MWMS → HMS)

**Documentation only.** No code has been written for this. This plan proposes how to bring the
modules described in the Mecandria Workforce Management System BRD into HMS as new
**plug-and-play modules** — the same way every add-on in this codebase already works: a hospital
either has a module toggled on or doesn't, and the UI/API simply aren't reachable when it's off.

Source: `Mecandria_Workforce_Management_BRD.pdf` (v1.0, 24-Jul-2026). Scope per the BRD: Employee,
Holiday, Shift, Attendance, and Leave Management, with Payroll limited to supplying
Leave-Without-Pay (LOP) and payable-day figures — **not** full salary computation, disbursement,
or statutory filings (PF/ESI/tax reports are explicitly out of scope). Biometric/device-level
attendance is explicitly deferred to a future phase — this phase is manual marking only.

## Context

Rather than building MWMS as a second product, these eight areas become opt-in add-ons inside
HMS, sold to hospital clients who want to run staff attendance/leave/payroll-feed alongside their
clinical system. HMS already has almost all of the supporting infrastructure this needs:

| MWMS needs | HMS already has |
|---|---|
| Multi-tenant plug-and-play modules | `saas_core.modules` × `saas_core.tenant_modules`, one toggle per hospital, surfaced automatically in the existing Super Admin module-toggle UI |
| User & Roles | Full `users`/`roles` system with a flat role allow-list, JWT auth, RBAC dependencies |
| Employee directory UI | `StaffDirectory.tsx` + `StaffModals.tsx` — already a working staff directory with search/filter/CSV export and role-conditional form sections (`DoctorFields` is the exact template for adding an "Employee Details" section) |
| Department master data | `departments` table — already exists, reused as-is |
| Shift/leave precedent (pattern only) | `doctor_schedules` (shift shape) and `doctor_leaves` (leave-approval shape) exist, but both are doctor-only and appointment-booking-oriented — useful as a design template, not directly reusable |
| Notifications | `notification_service.notify_hospital_users(...)` — role-targeted, hospital-scoped |
| Payslip/report PDFs | WeasyPrint, already used for prescriptions/invoices/optical Rx |
| Email delivery | `services/email_service.py` — already configured, reused to email payslips |
| Deployment | One codebase already serves local dev, on-premise, and SaaS — no separate deployment story needed |

**Verified against the actual codebase** (not assumed): grepped the full backend, frontend, and
`database_hole/` for any existing attendance/leave/shift/payroll code — none exists outside a
single "GAP REPORT" comment in `AnalyticsDashboard.tsx` listing HR/Payroll as a known, anticipated,
not-yet-built future panel.

## Design decisions

**Employee = an extension of `users`, not a new identity system, and not a new page.** Every HMS
staff member is already a `User`. `employee_profiles`, 1:1 on `user_id`, adds HR fields — same
relationship shape as `doctors` extending `users`. **Employee Management has no new frontend
page** — HR fields are added directly into `StaffDirectory.tsx` / `StaffModals.tsx`'s existing
Create/Edit drawers, as a new "Employee Details" section following the exact pattern already used
for `DoctorFields`, gated by the `employee_management` module being enabled rather than by role.

**Attendance is a manual, provisional-then-verified grid — no timestamps, no biometric.** Per the
BRD, device integration is a future phase. Per discussion: since there's no reliable way to know
an employee's actual arrival time without hardware, the schema deliberately does **not** capture
a "marked time" — only a status (present/absent/holiday/on-leave), to avoid it being misread as a
real arrival time. Every admin click writes to the database immediately (not held in browser
state) with `is_verified = false`; nothing defaults to `absent` — an unmarked employee stays
`not_marked` until an admin explicitly sets it. An end-of-day "Verify" action locks the day's
rows (`is_verified = true`), which is what Payroll reads from. This directly solves the
"employee arrived but wasn't marked before the admin saw them" problem: the system never guesses.

**Holidays are stored as individual dates, including recurring weekly-offs.** Rather than a
recurrence engine, a "mark all Sundays as holiday for this year" bulk action inserts one row per
date. This keeps the attendance grid's holiday lookup a simple per-date check.

**Leave is HR data-entry, not a self-service request queue.** Per discussion, this is closer to
"HR logs that Rahul is out today, reason: fever" than a formal request/approval workflow —
`leave_records.status` defaults to `approved` since HR is entering it directly. The schema still
supports a `pending`/`rejected` state if self-service is added later, but that's not required now.

**Per-day salary is a fixed 30-day divisor, auto-calculated.** Per discussion: `per_day_salary =
basic_salary ÷ 30`, always — not the actual number of days in that calendar month, and holidays
are not excluded (they're paid). This recalculates automatically whenever `basic_salary` changes,
and removes any "which divisor" ambiguity from the payroll deduction formula.

**Guest/visiting doctors need an opt-out.** `employee_profiles.include_in_payroll` — same idea as
the existing `doctors.analytics_enabled` flag that already excludes guest doctors from analytics.

## Proposed modules (registered in `saas_core.modules`, same mechanism as every existing module)

| `code` | Depends on | Notes |
|---|---|---|
| `employee_management` | — | Foundation; everything else requires it |
| `holiday_management` | `employee_management` | Feeds Attendance, Leave, Payroll |
| `shift_management` | `employee_management` | Shift definitions + assignment |
| `attendance` | `employee_management` | Manual grid marking only — biometric deferred to a future phase, per BRD |
| `leave_management` | `employee_management` | HR data-entry, LOP calculation |
| `payroll` | `employee_management`, `attendance`, `leave_management` | LOP/payable-days/deduction figures only — not salary disbursement or statutory filings |

Reports (Daily Attendance Count, Absentee Report, Verified Attendance Sheet, LOP Report, Paid
Leave Balance Report — the five named in the BRD) are views over the modules above, following the
existing Analytics page's React Query + filter-store pattern rather than inventing new
data-fetching architecture.

New role: `hr_manager`, added to the existing flat role list. Self-service screens (view my
attendance, view my leave balance) are open to any authenticated staff role.

## Data model — `database_hole/14_add_workforce_module.sql`

All tables `hospital_id`-scoped like the rest of the schema, keyed off the existing
`users`/`hospitals`/`departments` tables rather than duplicating identity data.

### 1. `employee_profiles`
1:1 extension of `users`, same shape as `doctors`.

| Column | Type | Key |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `users.id`, UNIQUE |
| `hospital_id` | UUID | FK → `hospitals.id` |
| `department_id` | UUID | FK → `departments.id` |
| `designation` | VARCHAR | |
| `date_of_joining` | DATE | |
| `date_of_leaving` | DATE, nullable | |
| `employment_type` | VARCHAR | full_time / part_time / contract |
| `bank_account_holder_name` | VARCHAR | |
| `bank_account_number` | VARCHAR | |
| `bank_ifsc` | VARCHAR | |
| `bank_branch` | VARCHAR | |
| `pf_number` | VARCHAR | |
| `pan_number` | VARCHAR | |
| `reporting_manager_id` | UUID, nullable | FK → `users.id` |
| `paid_leave_entitlement` | INTEGER | admin-configured, per year |
| `include_in_payroll` | BOOLEAN, default true | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### 2. `employee_salary`
Kept separate from the profile so it can change over time (effective-dated).

| Column | Type | Key |
|---|---|---|
| `id` | UUID | PK |
| `employee_id` | UUID | FK → `users.id` |
| `hospital_id` | UUID | FK → `hospitals.id` |
| `basic_salary` | NUMERIC(12,2) | entered by HR |
| `per_day_salary` | NUMERIC(12,2) | **auto-calculated** = `basic_salary ÷ 30`, recalculated on every `basic_salary` update |
| `flexi_allowance` | NUMERIC(12,2), default 0 | |
| `pf_contribution_employee` | NUMERIC(12,2), default 0 | |
| `effective_from` | DATE | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### 3. `holidays`
| Column | Type | Key |
|---|---|---|
| `id` | UUID | PK |
| `hospital_id` | UUID | FK → `hospitals.id` |
| `date` | DATE | |
| `name` | VARCHAR | |
| `type` | VARCHAR | festival / weekly_off / other |
| `created_at` | TIMESTAMPTZ | |

Constraint: `UNIQUE(hospital_id, date)`.

### 4. `shifts`
| Column | Type | Key |
|---|---|---|
| `id` | UUID | PK |
| `hospital_id` | UUID | FK → `hospitals.id` |
| `name` | VARCHAR | Day / Night |
| `start_time` | TIME | |
| `end_time` | TIME | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### 5. `employee_shift_assignments`
| Column | Type | Key |
|---|---|---|
| `id` | UUID | PK |
| `employee_id` | UUID | FK → `users.id` |
| `shift_id` | UUID | FK → `shifts.id` |
| `effective_from` | DATE | |
| `effective_to` | DATE, nullable | |
| `assigned_by` | UUID | FK → `users.id` |
| `reason` | VARCHAR | why the shift was set/changed (BRD REQ-SHF-02) |
| `created_at` | TIMESTAMPTZ | |

### 6. `attendance_records`
One row per employee per date — not a check-in/check-out log.

| Column | Type | Key |
|---|---|---|
| `id` | UUID | PK |
| `hospital_id` | UUID | FK → `hospitals.id` |
| `employee_id` | UUID | FK → `users.id` |
| `date` | DATE | |
| `status` | VARCHAR, default `not_marked` | not_marked / present / absent / holiday / on_leave |
| `is_verified` | BOOLEAN, default false | provisional until end-of-day verify |
| `marked_by` | UUID, nullable | FK → `users.id` — audit only, not attendance data |
| `verified_by` | UUID, nullable | FK → `users.id` |
| `verified_at` | TIMESTAMPTZ, nullable | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

Constraint: `UNIQUE(hospital_id, employee_id, date)` — a grid click is always an upsert.
`status` auto-fills to `holiday` wherever a matching `holidays` row exists for that date; a
`leave_records` entry writes `on_leave` for its covered dates so the two never disagree.

### 7. `leave_records`
| Column | Type | Key |
|---|---|---|
| `id` | UUID | PK |
| `hospital_id` | UUID | FK → `hospitals.id` |
| `employee_id` | UUID | FK → `users.id` |
| `start_date` | DATE | |
| `end_date` | DATE | |
| `reason` | VARCHAR | |
| `status` | VARCHAR, default `approved` | approved / pending / rejected |
| `entered_by` | UUID | FK → `users.id` |
| `created_at` | TIMESTAMPTZ | |

### 8. `leave_balances`
| Column | Type | Key |
|---|---|---|
| `id` | UUID | PK |
| `employee_id` | UUID | FK → `users.id` |
| `year` | INTEGER | |
| `allocated` | INTEGER | copied from `employee_profiles.paid_leave_entitlement` |
| `used` | INTEGER, default 0 | |

Constraint: `UNIQUE(employee_id, year)`.

### 9. `payroll_runs`
| Column | Type | Key |
|---|---|---|
| `id` | UUID | PK |
| `hospital_id` | UUID | FK → `hospitals.id` |
| `period_month` | INTEGER | |
| `period_year` | INTEGER | |
| `status` | VARCHAR | draft / processed |
| `generated_by` | UUID | FK → `users.id` |
| `generated_at` | TIMESTAMPTZ | |

Constraint: `UNIQUE(hospital_id, period_month, period_year)`.

### 10. `payslips`
| Column | Type | Key |
|---|---|---|
| `id` | UUID | PK |
| `payroll_run_id` | UUID | FK → `payroll_runs.id` |
| `employee_id` | UUID | FK → `users.id` |
| `present_days` | INTEGER | |
| `absent_days` | INTEGER | |
| `leave_days_taken` | INTEGER | |
| `holiday_days` | INTEGER | |
| `lop_days` | INTEGER | |
| `per_day_rate` | NUMERIC(12,2) | copied from `employee_salary.per_day_salary` |
| `deduction_amount` | NUMERIC(12,2) | = `lop_days × per_day_rate` |
| `gross_salary` | NUMERIC(12,2) | |
| `net_salary` | NUMERIC(12,2) | = `gross_salary − deduction_amount` |
| `generated_at` | TIMESTAMPTZ | |

Constraint: `UNIQUE(payroll_run_id, employee_id)`.

## Payroll calculation — worked formula

```
lop_days          = max(0, leave_days_taken − leave_balances.allocated)
per_day_rate       = employee_salary.per_day_salary   (already = basic_salary ÷ 30)
deduction_amount    = lop_days × per_day_rate
net_salary           = gross_salary − deduction_amount
```

Sourced entirely from `attendance_records` for the payroll period (`is_verified = true` rows
only) — present/absent/on_leave/holiday counts, no manual re-entry, matching BRD REQ-PAY-03.
Example from discussion: salary ₹30,000 → `per_day_salary` = ₹1,000; if paid-leave entitlement is
2 and the employee takes 3, `lop_days` = 1, deduction = ₹1,000.

## Backend shape

- `backend/app/models/employee.py` (`EmployeeProfile`, `EmployeeSalary`), `holiday.py`, `shift.py`
  (`Shift`, `EmployeeShiftAssignment`), `attendance.py` (`AttendanceRecord`), `leave.py`
  (`LeaveRecord`, `LeaveBalance`), `payroll.py` (`PayrollRun`, `Payslip`)
- `backend/app/schemas/` — one file per domain, same split
- `backend/app/services/employee_service.py`, `holiday_service.py`, `shift_service.py`,
  `attendance_service.py`, `leave_service.py`, `payroll_service.py`
- `backend/app/routers/employees.py`, `holidays.py`, `shifts.py`, `attendance.py`, `leave.py`,
  `payroll.py` — registered in `main.py` behind the same
  `Depends(SubscriptionValidator.require_module_access(...))` pattern already used elsewhere
- Notifications reuse `notify_hospital_users(...)`: leave entered → reporting manager; payroll
  processed → `hr_manager`/`admin`
- Audit logging needs no extra work — the existing blanket middleware logs every authenticated
  mutating request automatically
- Payslip PDF + email reuse the existing WeasyPrint pattern and `email_service.py`

## Frontend shape

- **No new page for Employee Management** — extends `StaffDirectory.tsx` / `StaffModals.tsx`
  directly (see Design decisions above).
- `frontend/src/pages/workforce/` — `HolidayCalendar.tsx` (year/month/week views),
  `ShiftManagement.tsx`, `AttendanceGrid.tsx` (Excel-like, shift-filtered, department-split,
  click-to-mark, provisional-until-verified, "Verify & Download" action), `LeaveManagement.tsx`
  (HR data-entry + LOP/balance view), `PayrollDashboard.tsx` + `PayslipView.tsx`.
- Services/types: one file per domain, same thin-wrapper shape as every existing service.
- Nav: new collapsible "Workforce" section in `Layout.tsx`, gated per-item by
  `isModuleEnabled(...)`, same pattern as every other module.
- Routes: `App.tsx` entries wrapped in `ProtectedRoute requiredModule="..."`.
- Reports: follows the Analytics page's React Query + filter-store pattern, the one part of the
  app already proven at cacheable/filterable report data.

## Suggested phasing

1. **`employee_management`** (including `employee_salary`) + **`holiday_management`** —
   foundation, low risk, unlocks everything else.
2. **`shift_management`** + **`attendance`** — the grid, provisional/verify flow.
3. **`leave_management`** — data-entry + LOP calculation, feeds off Attendance.
4. **Workforce reports** — can be built incrementally alongside phases 1-3.
5. **`payroll`** — last; reads verified Attendance + Leave + `employee_salary`, produces the
   LOP/deduction/payslip figures. Full salary disbursement and statutory filings stay out of
   scope per the BRD.

## Resolved (previously open) questions

- ~~Mandatory selfie / biometric~~ — resolved: biometric is explicitly deferred to a future
  phase per the BRD; this phase is manual-only, no timestamps captured at all.
- ~~Statutory payroll deductions~~ — resolved: out of scope per the BRD (§3.2); this module only
  supplies LOP and payable-day figures to a separate payroll/disbursement process.
- ~~Auto-enroll all users as employees, or opt-in?~~ — still open; `include_in_payroll` gives a
  per-employee opt-out regardless of which default is chosen.
- ~~Per-day salary divisor~~ — resolved: fixed 30, not actual days-in-month, holidays included
  as paid days.

## Implementation progress

- [ ] `database_hole/14_add_workforce_module.sql` (all 10 tables above)
- [ ] Backend models/schemas/services/routers for Employee (+ Salary), Holiday, Shift,
      Attendance, Leave, Payroll
- [ ] `StaffModals.tsx` — new "Employee Details" section (designation, department, bank, PF/PAN)
- [ ] Frontend pages/services/types for Holiday, Shift, Attendance grid, Leave, Payroll
- [ ] Nav/routes/roles wiring (`Layout.tsx`, `App.tsx`, `StaffModals.tsx` role list, `constants.ts`)
- [ ] Workforce reports (Analytics-pattern): Daily Attendance Count, Absentee Report, Verified
      Attendance Sheet, LOP Report, Paid Leave Balance Report
- [ ] Payslip PDF generation + email delivery
- [ ] End-to-end walkthrough per module
