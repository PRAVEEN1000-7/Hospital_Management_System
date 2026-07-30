# Workforce Management (MWMS → HMS) — Implementation Plan

*Companion implementation plan for `Workforce_Management_Modules_MWMS_to_HMS.md`. That file is
the architecture proposal; this file is the phased, codebase-verified execution plan.*

## Context

`Workforce_Management_Modules_MWMS_to_HMS.md` is a documentation-only architecture proposal
(no code) for bringing Employee/Holiday/Shift/Attendance/Leave/Payroll-feed modules into HMS
as opt-in, per-hospital toggleable add-ons — the same mechanism every existing HMS module
(pharmacy, inventory, optical, etc.) already uses.

Every infrastructure claim in the source doc was verified against the actual code (via 3
parallel codebase-exploration passes) rather than trusted at face value. **Almost everything
it claims is real and directly reusable — one claim is wrong (WeasyPrint doesn't exist in this
codebase) and is corrected below.** The plan that follows reflects the verified codebase, not
the doc's assumptions.

---

## Verified facts (condensed — full detail was gathered via codebase exploration)

- **Module toggle system is real and complete.** `saas_core.modules` / `saas_core.tenant_modules`
  (`database_hole/01_full_schema.sql:1704-1902`) already hold `pharmacy`, `inventory`, `optical`,
  `analytics`, etc. as rows with `required_modules` dependency arrays. Backend gating is
  `SubscriptionValidator.require_module_access('code')` (`backend/app/core/tenant_security.py:161-247`),
  applied **centrally in `main.py`** per router-group (e.g. `_require_pharmacy = [Depends(...)]`
  then `app.include_router(pharmacy.router, dependencies=_require_pharmacy)`) — not scattered
  across individual router files. Frontend gating is `isModuleEnabled('code')` from `useAuth()`
  (`frontend/src/contexts/AuthContext.tsx:156-162`), combined with RBAC in `Layout.tsx`
  (`hasAccess('key', roles) && isModuleEnabled('code')`). The Super Admin module-toggle page
  (`frontend/src/pages/SuperAdminHospitalDetail.tsx`, "Modules" tab) needs **zero changes** —
  new module rows appear there automatically once seeded.
- **RBAC matrix is a real, actively-maintained dict-of-dicts**, not a stub:
  `backend/app/core/module_roles.py` (`MODULE_ROLES: Dict[key, Dict[role, "view"|"edit"]]`,
  helpers `view_roles()`/`edit_roles()`) mirrors `frontend/src/config/modulePermissions.ts`
  exactly. Keys look like `"general.patients"`, `"billing"`, `"appt.manage"`. Both files must
  be updated together with new keys for every new workforce permission area.
- **Roles are relational, not a column.** `User.roles` is a computed property over a
  `user_roles` join table → `roles` table (`backend/app/models/user.py:115`, `Role`). The
  `roles` table's `hospital_id` column is **nullable** — system-wide roles are seeded with
  `hospital_id = NULL` (confirmed from the actual `visiting_doctor` seed row,
  `database_hole/06_seed_reference_data.sql:341-349`, guarded by
  `WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'visiting_doctor' AND hospital_id IS NULL)`).
  Adding `hr_manager` requires: (1) add to `VALID_ROLES` whitelist in
  `backend/app/schemas/user.py:7-11` (currently: super_admin, admin, doctor, visiting_doctor,
  nurse, receptionist, pharmacist, optical_staff, lab_technician, cashier, inventory_manager,
  report_viewer, staff), (2) seed **one global** `roles` row (`hospital_id IS NULL`) following
  the exact `visiting_doctor` pattern above — **not** one row per hospital, (3) add to frontend
  `ALL_ROLES` in `frontend/src/components/staff/StaffModals.tsx:135-139`. User→role assignment
  itself is looked up by name only (`backend/app/services/user_service.py:232`,
  `db.query(Role).filter(Role.name == role_name).first()`), so a single global row is sufficient
  for every hospital to assign the role.
- **Staff UI extension point confirmed.** `StaffModals.tsx` already has a role-conditional
  `DoctorFields` component (~line 293) rendered as `{isDoctorRole && <DoctorFields/>}` in both
  create (~662) and edit (~885). A new `EmployeeFields` section follows this exact shape but
  gated on `isModuleEnabled('employee_management')` instead of role — matches the source doc's
  "employee = extension of users, applies to any staff member" decision.
- **`doctor_schedules`/`doctor_leaves` are booking-specific, not reusable as tables** —
  confirmed genuinely appointment-slot-shaped (`slot_duration_minutes`, `max_patients`). New
  `shifts`/`attendance_records`/`leave_records` tables per the source doc's simpler shape are
  the right call, used only as a *design template*, not a shared table.
- **`doctor_leaves.status` defaults to `"approved"` with no actual approve/reject endpoint** —
  this is existing precedent that directly supports the source doc's decision that
  `leave_records` should also default to approved (HR data-entry, not a request queue).
- **Notifications:** `notify_hospital_users(db, hospital_id, title, message, ..., role_names=,
  extra_user_ids=, exclude_user_ids=)` (`backend/app/services/notification_service.py:16-28`)
  is called directly at existing sites (appointment booked, PO created) — same direct-call
  pattern applies to "leave entered → notify reporting manager" and "payroll processed →
  notify hr_manager/admin".
- **Audit logging is automatic** — a blanket FastAPI middleware
  (`backend/app/core/audit_middleware.py`, wired in `main.py`) logs every authenticated
  mutating request by inferring entity from the URL path. New workforce endpoints need no
  manual audit calls.
- **⚠️ CORRECTION vs the source doc: no WeasyPrint anywhere in this codebase.** The doc's
  "Payslip/report PDFs — WeasyPrint" claim is false. The real, actually-used pattern
  (`backend/app/routers/invoices.py:252-263`, `/{invoice_id}/pdf`) is: backend returns a
  fully self-contained **escaped HTML string** via `HTMLResponse`; the frontend converts it
  client-side via `frontend/src/utils/pdf.ts::htmlStringToPdf()` (html2canvas + jsPDF,
  offscreen-iframe rasterization, A4 pagination). Payslip PDF must follow *this* pattern, not
  WeasyPrint.
- **Email is real and already supports attachments:** `backend/app/services/email_service.py`
  has `send_email_with_attachment(to_email, subject, html_body, attachment_bytes, ...)`,
  used today for patient ID cards — but since PDF generation is client-side only, there is no
  existing path that produces PDF *bytes* on the server. This is a genuine gap (see Open
  Questions).
- **Analytics filter/query pattern** (`frontend/src/stores/analyticsStore.ts` Zustand +
  `frontend/src/hooks/useAnalyticsQueries.ts` TanStack Query, keyed by filters, 5-min
  staleTime) is the confirmed template for future Workforce Reports.
- **The source doc's own "GAP REPORT" claim is confirmed true** —
  `frontend/src/pages/analytics/AnalyticsDashboard.tsx:181-193` already has a placeholder
  comment listing "HR / Payroll → Staff cost, attendance, overtime" as a known future panel.
- **`department.py` is the confirmed template for simple master-data models**
  (`backend/app/models/department.py`): `id`, `hospital_id` FK, `name`, `code`, `description`,
  `is_active`, `display_order`, timestamps.
- **Next migration file number confirmed via Glob: `08`** (highest existing file is
  `07_queue_display_screens.sql`) — re-verify with Glob immediately before creating the file,
  in case another session has added `08_*` since this plan was written.

---

## Phase 0 — Foundation plumbing (module rows, roles, RBAC skeleton)

Do this once, before any Phase 1 code, so every later phase only adds keys to already-wired
systems.

- `database_hole/08_workforce_management.sql`:
  - `INSERT ... ON CONFLICT DO NOTHING` into `saas_core.modules` for 6 codes: `employee_management`
    (no dependency), `holiday_management`/`shift_management`/`attendance` (each
    `required_modules = ARRAY['employee_management']`), `leave_management`
    (`required_modules = ARRAY['employee_management']`), `payroll`
    (`required_modules = ARRAY['employee_management','attendance','leave_management']`). All
    `is_core=false`. Match the exact column order/shape of the existing seed block at
    `01_full_schema.sql:1890-1902`.
  - Seed **one global** `hr_manager` `roles` row (`hospital_id IS NULL`), following the exact
    `visiting_doctor` pattern at `06_seed_reference_data.sql:341-349` (including the
    `WHERE NOT EXISTS (...)` idempotency guard) — not one row per hospital.
- `backend/app/schemas/user.py`: add `"hr_manager"` to `VALID_ROLES` (line ~7-11).
- `frontend/src/components/staff/StaffModals.tsx`: add `"hr_manager"` to `ALL_ROLES`
  (~line 135-139).
- `backend/app/core/module_roles.py` **and** `frontend/src/config/modulePermissions.ts`
  (must stay in sync): add keys `employee.records`, `employee.holidays`, `employee.shifts`,
  `employee.attendance`, `employee.leave`, `employee.payroll`, each `{"admin": "edit",
  "hr_manager": "edit"}` to start (view-only access for other roles is an open question below).
- `backend/app/main.py`: add one `_require_<module>` dependency list per new module code,
  ready for `include_router(...)` calls added in later phases.

## Phase 1 — Employee Management + Holiday Management (foundation)

**Backend:** `backend/app/models/employee.py` (`EmployeeProfile` 1:1 users, `EmployeeSalary`
effective-dated — schema exactly as specified in the source doc §4.1/4.2), registered in
`models/__init__.py`. `backend/app/models/holiday.py` (`Holiday`, §4.3). Schemas mirroring
`backend/app/schemas/department.py`'s simple master-data CRUD shape. Services
(`employee_service.py`, `holiday_service.py`) following `department_service.py` structure —
salary changes insert a new `employee_salary` row rather than updating in place, preserving
effective-dated history; `holiday_service.py` exposes a "list holidays in date range" helper
needed by Phases 2/3/5. Routers (`employees.py`, `holidays.py`) mirroring
`routers/departments.py`, registered in `main.py` with the Phase 0 dependency lists. Same
migration file creates `employee_profiles`, `employee_salary`, `holidays` tables.

**Frontend:** `employeeService.ts`, `holidayService.ts` (thin wrappers, mirror
`doctorService.ts`). `StaffModals.tsx`: new `EmployeeFields` component (copy `DoctorFields`
shape) rendered `{isModuleEnabled('employee_management') && <EmployeeFields/>}` in both create
and edit blocks. `StaffDirectory.tsx`: optional department/designation columns when the module
is on. New `HolidayCalendar.tsx` page, nav entry in `Layout.tsx` gated
`isModuleEnabled('holiday_management') && hasAccess('employee.holidays', roles)`.

## Phase 2 — Shift Management + Attendance

**Backend:** `models/shift.py` (`Shift`, `EmployeeShiftAssignment`, §4.4/4.5),
`models/attendance.py` (`AttendanceRecord`, §4.6 — `status` default `not_marked`,
`is_verified`, `UNIQUE(hospital_id, employee_id, date)`). `attendance_service.py` is the core
new logic: bulk get/set attendance for a date range × employee list, auto-populating
`holiday` status from Phase 1's holiday lookup and `on_leave` once Phase 3 exists, plus a
separate `verify` action (`is_verified`/`verified_by`/`verified_at`) distinct from `mark` —
this two-step provisional/verified workflow has no existing precedent in the codebase and is
genuinely new. Routers registered with Phase 0's dependency lists. Migration adds `shifts`,
`employee_shift_assignments`, `attendance_records`.

**Frontend:** `shiftService.ts`, `attendanceService.ts`. `ShiftManagement.tsx` (shift CRUD +
assignment UI). `AttendanceGrid.tsx` — employees × days-in-month grid, click-to-cycle status,
bulk actions, a "Verify" action separating provisional vs. verified rows. **This is the most
novel UI in the whole plan — no existing component matches this shape; budget real design
time, not a template copy.** (`DoctorSchedule.tsx` is worth a glance only for date-picker
conventions, not grid logic.)

## Phase 3 — Leave Management (LOP calculation)

**Backend:** `models/leave.py` (`LeaveRecord` — status defaults `"approved"`, consistent with
the `doctor_leaves` precedent; `LeaveBalance` per employee/year, §4.7/4.8). `leave_service.py`:
creating a leave record increments `leave_balances.used`, calls into `attendance_service` to
mark `attendance_records.status='on_leave'` for the covered dates, and computes LOP (leave
days beyond `allocated`/`paid_leave_entitlement`) for Phase 5 to consume. On create, calls
`notify_hospital_users(..., extra_user_ids=[reporting_manager_id])`. Migration adds
`leave_records`, `leave_balances`.

**Frontend:** `leaveService.ts`, `LeaveManagement.tsx` (HR enters leave on the employee's
behalf + a balance summary view).

## Phase 4 — Workforce Reports

No new tables; can be built incrementally alongside Phases 2-3. `workforceReportsStore.ts`
mirrors `analyticsStore.ts` (Zustand filters). `useWorkforceReportsQueries.ts` mirrors
`useAnalyticsQueries.ts` (TanStack Query, 5-min staleTime). A reports router (attendance
summary, leave summary, headcount), each endpoint gated on its underlying module. `WorkforceReports.tsx`
page — this is also what finally fills in the "HR / Payroll" gap already flagged in
`AnalyticsDashboard.tsx`'s GAP REPORT comment.

## Phase 5 — Payroll (feed only: LOP/payable-days, no disbursement)

**Backend:** `models/payroll.py` (`PayrollRun`, `Payslip`, §4.9/4.10). `payroll_service.py`'s
"generate" action reads verified (`is_verified=true` only) `attendance_records` +
`leave_records` + the latest `employee_salary` row for the period, computes day-count buckets
and `net_salary = gross_salary - (lop_days × per_day_salary)`, writes one `payslips` row per
employee, sets `payroll_runs.status='processed'`. **Must block/warn if any attendance rows in
the period are unverified** — this ties payroll integrity directly to the Phase 2 verify step.
New `GET /payslips/{id}/print` returns escaped HTML exactly like
`invoices.py:252-263` (not WeasyPrint — see correction above). On success, notify
`role_names=["hr_manager","admin"]`. Migration adds `payroll_runs`, `payslips`.

**Frontend:** `payrollService.ts`, `PayrollRuns.tsx` (list/generate runs, drill into payslips),
`PayslipDetail.tsx` calling `payrollService.getPayslipPrintHtml(id)` then `htmlStringToPdf()`
— matching the invoice-PDF pattern exactly.

---

## Open design questions (flagged, not silently resolved)

1. **Payslip email delivery gap.** No server-side path produces PDF *bytes* today (PDF is
   client-rendered only). Recommend shipping "download PDF" in Phase 5 and deferring "email
   payslip" to a stretch phase once a bytes-producing path is chosen (server-side PDF lib, or
   client-generates-then-uploads-bytes).
2. **Cross-role self-service visibility.** Should doctors/nurses/receptionists get read-only
   access to their *own* attendance/leave? Phase 0's RBAC keys are admin/hr_manager-only;
   self-service would need additional view-level entries and self-scoped endpoint variants.
3. **`paid_leave_entitlement` vs. `leave_balances.allocated`.** Confirm at Phase 3 whether
   `allocated` auto-seeds from `employee_profiles.paid_leave_entitlement` each year (needs a
   seeding job) or is set manually by HR annually.
4. **Attendance grid scale.** A month × all-employees grid could be large for bigger
   hospitals — confirm pagination/virtualization approach before building `AttendanceGrid.tsx`.

---

## Verification

- Backend: `python -m py_compile` on every new/touched file per phase; a live-import smoke
  test (`import app.main`) after each phase's router registration.
- Each migration addition re-run against the dev DB to confirm idempotency
  (`CREATE TABLE IF NOT EXISTS` throughout, matching this project's convention).
- Frontend: `npx tsc -b --noEmit` after each phase.
- Manual, per phase: toggle the new module on for a test hospital via the existing Super
  Admin "Modules" tab and confirm the corresponding nav item/page appears only when enabled
  and only for `admin`/`hr_manager`; confirm it's invisible for a hospital with the module off.
- Phase 2 specifically: mark attendance for a few employees, confirm holiday/leave
  auto-population doesn't fight with manual marks, then Verify and confirm rows lock.
- Phase 5 specifically: run the worked example from the source doc (₹30,000 salary → ₹1,000/day;
  2-day entitlement, 3 days taken → 1 LOP day → ₹1,000 deduction) against a seeded test
  employee and confirm the generated payslip matches exactly.

### Critical files
- `database_hole/08_workforce_management.sql` (verify next number via Glob immediately before creating)
- `backend/app/main.py`, `backend/app/core/module_roles.py`, `backend/app/schemas/user.py`
- `frontend/src/config/modulePermissions.ts`, `frontend/src/components/staff/StaffModals.tsx`,
  `frontend/src/contexts/AuthContext.tsx` (isModuleEnabled — read-only reference, no changes needed)

---

## Status

- [x] Phase 0 — Foundation plumbing (`database_hole/11_workforce_management.sql` — the
      plan's assumed `08` was stale; three other files had already claimed 08-10 by the
      time this ran, confirmed via Glob per the plan's own instruction to re-check)
- [x] Phase 1 — Employee Management + Holiday Management (`database_hole/12_employee_holiday_tables.sql`;
      `models/employee.py`, `models/holiday.py`; `routers/employees.py`, `routers/holidays.py`;
      `EmployeeFields` in StaffModals.tsx create+edit; `pages/workforce/HolidayCalendar.tsx` +
      Layout.tsx "Workforce" nav section + App.tsx route. Deviation from the plan: employee HR
      fields are a separate `POST/PUT /employees` call made right after user create/update
      succeeds, not merged into `UserCreate`/`UserUpdate` — kept the already-sensitive core user
      flow untouched. Live-tested end-to-end incl. module+RBAC gating together (admin 200,
      doctor 403); caught and fixed a real bug during testing — service-layer `_enrich()` set
      `employee_name`/`department_name` on the ORM object *before* Pydantic validation, which
      silently dropped them since the schema's `_orm_to_dict` only reads real table columns;
      moved enrichment to the router layer post-validation, matching routers/doctors.py's
      existing pattern.)
- [x] Phase 2 — Shift Management + Attendance (`database_hole/13_shift_attendance_tables.sql`;
      `models/shift.py`, `models/attendance.py`; `routers/shifts.py`, `routers/attendance.py`;
      `services/attendance_service.py` implements the provisional/verify workflow — holiday
      auto-fill on grid read, upsert-on-click marking, verify-locks-the-range, and a 409 if
      re-marking an already-verified date. Frontend: `ShiftManagement.tsx` (shift CRUD +
      assignment), `AttendanceGrid.tsx` (employees × days-in-month, click-to-cycle
      not_marked→present→absent→on_leave→holiday, locked cells show a lock icon). Live-tested
      end-to-end: shift + assignment creation, holiday auto-populating an unmarked grid cell,
      marking present, verifying a range, and confirming a re-mark attempt on a verified date
      correctly 409s.)
- [x] Phase 3 — Leave Management (`database_hole/14_leave_tables.sql`; `models/leave.py`;
      `routers/leave.py`; `services/leave_service.py` — creating a record increments
      `leave_balances.used`, writes `on_leave` into attendance via `attendance_service.mark_on_leave`,
      and notifies the reporting manager. Resolved the plan's open question #3: `allocated`
      auto-seeds from `employee_profiles.paid_leave_entitlement` the first time a balance is
      needed for an employee/year, rather than requiring an annual manual HR step. Frontend:
      `LeaveManagement.tsx` (HR entry + balance table). Live-tested end-to-end incl. the BRD's
      own worked example — 2 days allocated, 3 taken → balance shows remaining=0 and attendance
      grid correctly shows `on_leave` for all 3 covered dates.)
- [x] Phase 4 — Workforce Reports (no new tables — read-only aggregations over Phases 1-3.
      `services/workforce_reports_service.py` + `routers/workforce_reports.py` implement all 5
      BRD-named reports (Daily Attendance Count, Absentee Report, Verified Attendance Sheet, LOP
      Report, Paid Leave Balance Report) + a Headcount report. This router is registered in
      main.py with NO blanket module dependency — each endpoint declares its own
      `require_module_access(...)` inline instead, since different reports need different
      modules (a deviation from every other router in this feature, called out explicitly in the
      router's docstring). Frontend: `workforceReportsStore.ts` (mirrors analyticsStore.ts),
      `useWorkforceReportsQueries.ts` (mirrors useAnalyticsQueries.ts), `WorkforceReports.tsx`.
      The "HR / Payroll" GAP REPORT comment this was meant to fill in AnalyticsDashboard.tsx was
      already removed in an earlier, separate Analytics-redesign session — nothing left to clean
      up there. Live-tested all endpoints respond 200 with correct empty-state shape.)
- [x] Phase 5 — Payroll (`database_hole/15_payroll_tables.sql`; `models/payroll.py`;
      `routers/payroll.py` (+ a separate `payslips_router` for `/payslips/{id}` and
      `/payslips/{id}/print`); `services/payroll_service.generate_payroll_run` reads only
      *verified* attendance_records, blocks with 422 if any tracked employee has an unverified
      row in the period, blocks with 409 if the period was already generated, computes
      `gross_salary = basic_salary + flexi_allowance` and
      `net_salary = gross_salary - (lop_days × per_day_salary)` exactly per the BRD formula.
      `/payslips/{id}/print` returns escaped self-contained HTML matching invoices.py's `/pdf`
      pattern exactly (confirmed: no WeasyPrint anywhere in this codebase). Frontend:
      `PayrollRuns.tsx` (generate + expandable run → payslip list), `PayslipDetail.tsx`
      (breakdown + `htmlStringToPdf()` download, same pattern as InvoiceDetail.tsx). Live-tested
      the BRD's own worked example end-to-end (₹30,000 salary → ₹1,000/day; 2-day entitlement, 3
      taken → 1 LOP day → exactly ₹1,000 deduction, ₹29,000 net) plus both block conditions
      (unverified attendance → 422, duplicate period → 409). Caught and fixed a real bug during
      testing: `EmployeeProfile.user`'s backref defaulted to a list (no `uselist=False`), so
      `payslip.employee.employee_profile.designation` crashed with `AttributeError:
      'InstrumentedList' object has no attribute 'designation'` — fixed by querying
      `EmployeeProfile` directly in the router instead of relying on the reverse relationship.)

**All 6 phases complete.** Every module was live-tested end-to-end against the dev DB (not just
compiled) — module-toggle + RBAC gating together, the holiday→attendance auto-fill, the
attendance verify-lock, the leave→attendance sync and LOP math, and the full payroll generation
path — with test data cleaned up and module toggles reverted after each phase. `npx tsc -b
--noEmit` and `npm run build` both pass clean on the final state.

*(Update the checklist above as phases complete — the user will share updates between phases.)*
