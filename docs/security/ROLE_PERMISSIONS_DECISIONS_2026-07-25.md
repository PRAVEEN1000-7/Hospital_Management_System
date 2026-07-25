# Role Permissions Matrix — Decisions Log (2026-07-25)

Source: `HMS Roles & Permissions.xlsx` (client-supplied), implemented as the shared permission
matrix in `backend/app/core/module_roles.py` / `frontend/src/config/modulePermissions.ts`.

## Clarifying questions asked, and the client's answers (verbatim)

**Q1. Pharmacist "Can View & Edit" on Prescription → All Prescription** — the sheet gives
pharmacists real edit/finalize/delete rights on the doctor's prescription record itself (not just
their own Pharmacy-module dispensing screens, which already had full access). Asked whether this
should be implemented literally or softened to view-only for pharmacists.

> "implment the access control mentioned in tha plan as it is.because my client need that one.so
> implement the details shared as it is."

**Decision: implemented literally.** Pharmacist has real edit (including delete/finalize) rights on
`rx.all`.

**Q2. Doctor "Can View & Edit" on General → Staff Directory** — the sheet gives doctors real edit
rights on other staff members' HR-style directory records (names, roles, contact info), not just
view.

> "flow the shared roles only"

**Decision: implemented literally.** Doctor has edit rights on `general.staff_directory`.

**Q3. Systemic: does "Edit" include delete?** — asked whether granting a non-admin role "Edit" on a
module should include destructive delete actions, or whether delete should stay Admin/Super Admin
only regardless of what the sheet says for that role.

> "flow the access mentioned in the file.after that add these 3 questions and details as separate
> md file for my future refernce."

**Decision: implemented literally.** Wherever a role is granted "Edit" in the matrix, that includes
delete for that module — delete is no longer admin-only-by-default for those modules (e.g.
`patients.py`'s previous admin-only `patient_delete_role_guard` is now `edit_roles("general.patients")`,
which includes doctor/nurse/receptionist too).

## Conflict discovered during planning (not one of the 3 questions above)

The sheet's **Billing & Invoices** row (all 4 submodules: Billing & Invoices, Payments, Refunds,
Daily Settlements) grants access to **only Admin (edit) and Cashier (edit)** — Doctor, Receptionist,
and Pharmacist all become "No access".

This directly conflicts with the consultation-fee "Collected By" feature built earlier in this same
project phase: `payment_service.py`'s `COLLECTOR_ROLES = {"super_admin", "admin", "cashier",
"pharmacist", "receptionist"}` treats receptionist and pharmacist as valid fee collectors, and
`AppointmentManagement.tsx`'s fee-collection modal lets a receptionist record a payment against an
appointment today.

Implementing the sheet literally (per the "implement as-is" instructions above, which were given
before this specific conflict was found) means **receptionist and pharmacist lose access to the
billing/payments screens entirely**, including the ability to open `/billing/payments` or record a
payment collected by themselves. `COLLECTOR_ROLES` in `payment_service.py` itself is left unchanged
(a receptionist can still be *selected* as the collector by whoever *is* allowed into billing — e.g.
an admin/cashier recording "collected by: <receptionist>") but a receptionist can no longer walk
through that flow themselves via the UI.

**This was implemented literally, exactly as flagged.** If this turns out to be a spreadsheet
oversight rather than an intentional policy change, the fix is a one-line edit to the `billing` entry
in `MODULE_ROLES` (`backend/app/core/module_roles.py`) / `MODULE_ROLES` (`frontend/src/config/modulePermissions.ts`)
to add `receptionist`/`pharmacist` back in at whatever access level is intended.

## Additional conflicts surfaced while wiring the routers/pages (2026-07-25)

- **Inventory: pharmacist downgraded from edit to view-only.** `inventory.py`'s
  `inventory_manage_roles`/`grn_verify_roles` previously included pharmacist with full write access
  (raising POs, verifying GRNs, adjusting stock) — the code comment there explicitly said pharmacists
  "need the same write access as inventory_manager." The sheet's Inventory row gives pharmacist only
  "Can View." Implemented literally: pharmacist can no longer create/edit purchase orders, GRNs,
  suppliers, or adjustments — only inventory_manager/admin can.
- **Pharmacy dispensing/queue: cashier and inventory_manager lose access.** `/pharmacy/queue`,
  `/pharmacy/dispense/:id`, and `/pharmacy/dispensing/:id/billing` previously allowed cashier and/or
  inventory_manager (frontend `allowedRoles` arrays). The sheet's Pharmacy row grants only Admin
  (edit) and Pharmacist (edit), with inventory_manager view-only and no cashier entry at all.
  Implemented literally — same class of conflict as the Billing one above, since dispensing-billing
  is a billing-adjacent action.
- **Analytics: pharmacist/cashier/inventory_manager lose the main Analytics Dashboard.**
  `Layout.tsx`/`App.tsx` previously let pharmacist, cashier, and inventory_manager into `/analytics`
  (each seeing their own domain panel per `AnalyticsDashboard.tsx`'s existing per-role panel logic).
  The sheet's General → Analytics row grants only Admin/Doctor (edit) and Report Viewer (view).
  Implemented literally — those three roles no longer reach the shared `/analytics` route at all;
  their own domain dashboards (Pharmacy/Inventory/Billing) are unaffected and still show their stats.
- **Patients: nurse/doctor gain full edit (including delete), report_viewer gains view.** Previously
  `patient_delete_role_guard` was admin-only and only admin/receptionist could create/edit patients.
  Per the literal matrix, doctor and nurse now have full edit (create/update/delete) on patients, and
  report_viewer gains read-only list/detail access.
- **Appointments: several previously-unchecked routers now enforce roles for the first time.**
  `appointments.py`, `walk_ins.py`, `waitlist.py`, `appointment_reports.py` had **no backend role
  check at all** before this change (any authenticated role, including e.g. cashier or optical_staff,
  could call their endpoints). They now enforce the matrix — this closes a real gap, not just a
  relabeling.

If any of the above turns out to be an unintended side effect of a spreadsheet cell rather than a
deliberate policy choice, the fix in every case is a one-line edit to the relevant key in
`MODULE_ROLES` (both `backend/app/core/module_roles.py` and
`frontend/src/config/modulePermissions.ts` — keep them in sync).

## Other implementation notes worth keeping alongside these decisions

- **Lab role untouched.** The spreadsheet's "Lab" column is blank for all 43 rows — confirming there
  is nothing for the Lab role to gain or lose from this matrix. `lab.py`'s `LAB_STAFF_ROLES` /
  `LAB_VIEW_ROLES` / `LAB_ORDER_ROLES` constants were not modified.
- **`lab_technician` has no row in the `roles` DB table at all** (verified via direct `psql` query on
  2026-07-25) — it is unassignable to any user today via the normal staff-creation flow, regardless of
  any RBAC code referencing it. Pre-existing gap, out of scope for this change.
- **Blank "Special Doctor / Visiting Doctor" cells** in the raw sheet (General rows: Patient
  Directory, Patient Registration, Staff Directory, Analytics; all 7 Optical Store rows) were treated
  as `none` — the safest default, consistent with the explicit "No access" entries in the same column
  on neighboring rows.
