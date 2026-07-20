# Laboratory Module

## Context

The hospital wants a Laboratory department added to the system, on par with the existing Pharmacy and Optical modules: its own admin-toggleable module, its own staff login/role, a way for a doctor to order a test directly from a prescription, and a place for lab staff to collect payment and enter results — with results then visible on the patient's record. There is no lab functionality today; this is new, built to match the two existing prescription-driven modules so it fits the codebase's own conventions rather than introducing a third pattern.

Research (this session) into Pharmacy and Optical established:
- **Optical is the closer template**, not Pharmacy: Optical is a doctor-authored order (`OpticalPrescription`, `is_finalized` flag) created from a card inside `PrescriptionBuilder.tsx`, fulfilled/billed later in a single combined sale record (`OpticalSale`) that carries both payment fields and queue fields in one table. Pharmacy splits pre-billing queue from post-billing sale into two tables *only* because pharmacists must pick specific stock batches at dispense time — Lab has no inventory/batch concept, so that split isn't needed.
- **Real billing is the generic Invoice/Payment system**, not each module's own `payment_status` column. `DispensingBilling.tsx` calls `invoiceService.create()` → `invoiceService.issue()` → `paymentService.record()` (the same path used for OPD consultation fees, already fixed twice this session — a void-invoice reuse bug and a stale-request race condition), and only afterward does a non-fatal sync call to update the module's own denormalized status for its worklist view. Lab billing reuses this exact path so it inherits those fixes for free.
- **Module toggles are DB-driven** (`saas_core.modules` × `saas_core.tenant_modules`, seeded in `database_hole/01_full_schema.sql:1889-1902`, `code` is UNIQUE). Adding one new row makes it appear automatically in the existing generic super-admin toggle UI (`SuperAdminHospitalDetail.tsx` maps over whatever the API returns — no hardcoded list).
- **Roles are a flat allow-list**, not DB-enforced RBAC — `VALID_ROLES` in `backend/app/schemas/user.py`, mirrored by a static `ALL_ROLES`/`ROLE_MODULE_REQUIREMENTS` map in `frontend/src/components/staff/StaffModals.tsx`. (The `permissions`/`role_permissions` SQL tables exist but are never queried anywhere — legacy, safe to ignore.)
- A structural correction from a design-review pass: the queue token **must live on the order row (`lab_orders`), not the billing row (`lab_sales`)** — `finalize_prescription` needs to hand out a token the moment the doctor finalizes, before any bill exists to attach it to. This mirrors exactly why Pharmacy's queue entry is a separate table from its sale.

Scope for this pass (explicitly excluded, to keep this buildable): no file/PDF attachment on results (structured fields only — value, unit, reference range, flag, notes); no standalone/walk-in lab order path (prescription-driven only, matching how the user described it and how Optical is scoped).

## Data model — `database_hole/13_add_lab_module.sql`

New file, following the existing numbered-file convention (`05_add_optical_batches.sql` etc.) and the exact `saas_core.modules` row shape from `01_full_schema.sql:1890-1902`.

```sql
INSERT INTO saas_core.modules (code, name, description, category, frontend_route_prefix, api_prefix, icon, is_core, required_modules) VALUES
('lab', 'Laboratory', 'Lab test catalog, ordering, sample tracking, and results', 'clinical', '/lab', '/api/v1/lab', 'flask', false, '{"patients","prescriptions"}')
ON CONFLICT (code) DO NOTHING;
```
`required_modules` includes `prescriptions` (unlike Optical, whose `required_modules` was deliberately trimmed to *not* require it — Lab's only entry point is the prescription flow, so it should hard-require it; this is mechanically enforced via `TenantService`'s dependency auto-enable).

Four tables, matching the `id UUID PK / hospital_id FK / *_number UNIQUE / status VARCHAR + inline comment / created_at,updated_at TIMESTAMPTZ` convention used by `optical_prescriptions` / `pharmacy_dispensing`:

1. **`lab_tests`** — catalog: `id, hospital_id, name, code (unique per hospital), category, sample_type, price, unit, reference_range, turnaround_hours, is_active, created_at, updated_at`.
2. **`lab_orders`** — the doctor's order, mirrors `optical_prescriptions`, **and carries the queue fields**: `id, hospital_id, order_number (unique), patient_id, doctor_id, appointment_id, prescription_id (nullable FK → prescriptions), notes, is_finalized, queue_token, queue_status ('waiting'|'being_served'|'collected'), queue_called_at, created_at, updated_at`.
3. **`lab_order_items`** — one row per ordered test, holds the eventual result: `id, lab_order_id, lab_test_id, test_name, price (both denormalized snapshots at order time, same pattern as PrescriptionItem.medicine_name), status ('ordered'|'sample_collected'|'in_progress'|'completed'|'cancelled'), result_value, result_unit, reference_range, result_flag ('normal'|'high'|'low'|'abnormal'), result_notes, resulted_at, resulted_by, created_at`.
4. **`lab_sales`** — billing only, created when lab staff starts checkout (mirrors `OpticalSale`'s payment columns, minus queue fields since those now live on `lab_orders`): `id, hospital_id, sale_number, lab_order_id (FK), patient_id, subtotal, discount_amount, tax_amount, total_amount, payment_method, payment_status, amount_tendered, advance_amount, paid_amount, balance_amount, status ('pending'|'completed'|'cancelled'), created_at, updated_at`.

Status: this SQL file has been written and applied to the local dev DB.

## Backend

- **`backend/app/models/lab.py`** — the 4 SQLAlchemy models above, `hospital`/`patient`/`doctor` relationships following `optical.py`'s style.
- **`backend/app/schemas/lab.py`** — `LabTestCreate/Response`, `LabOrderCreate` (`patient_id`, `appointment_id?`, `test_ids: list[str]`, `notes?`), `LabOrderResponse`, `LabResultEntry` (`result_value`, `result_unit?`, `result_flag?`, `result_notes?`).
- **`backend/app/schemas/invoice.py`** — additive, closed-enum extension (confirmed safe: only `"opd"` has invoice-type-specific branching in `invoice_service.py`): add `"lab_test"` to `VALID_ITEM_TYPES`, `"lab"` to `VALID_INVOICE_TYPES`, and `"lab": ["lab_test", "service"]` to `INVOICE_TYPE_ITEM_MAPPING` (also add `"lab_test"` to the `"combined"` entry, same as `"medicine"`/`"optical_product"`).
- **`backend/app/schemas/user.py`** — add `"lab_technician"` to `VALID_ROLES`.
- **`backend/app/services/lab_service.py`**:
  - Catalog CRUD (`create/update/list/deactivate_lab_test`).
  - `create_lab_order(db, patient_id, doctor_id, appointment_id, test_ids, notes, hospital_id, created_by)` — mirrors `create_optical_prescription`'s **retry-on-`IntegrityError` loop** for `order_number` generation (this exact race is why Optical's create wraps its insert in a 5-attempt retry). Fires `notify_hospital_users(role_names=["lab_technician","admin"])` at creation time, matching Optical's own timing exactly.
  - `enqueue_lab_queue_entry(db, lab_order)` — assigns `queue_token` via the already-generic `get_or_assign_visit_token()`, sets `queue_status='waiting'`. Called from `finalize_prescription`, not from order creation (a lab order isn't actionable/queued until the clinical Rx it's attached to is finalized).
  - `list_lab_queue(db, hospital_id)` — today's finalized orders ordered by token, mirrors `list_pharmacy_queue_entries`.
  - `advance_lab_queue_status`, `get_or_create_lab_sale` (computes `total_amount` from the order's items), `sync_lab_sale_payment_status` (the non-authoritative post-payment sync, mirrors `mark_dispensing_paid`).
  - `record_lab_result(db, order_item_id, result)` — sets result fields, `status='completed'`, `resulted_at/resulted_by`; if every item on the order is now completed, flips the order's overall status too.
  - `get_patient_lab_results(db, patient_id, hospital_id)` — finalized orders + their items, for `PatientDetail.tsx`.
- **`backend/app/routers/lab.py`** (prefix `/lab`), with two guard sets — deliberately *tighter* than Pharmacy's current (Pharmacy's dispense/mark-paid endpoints have no role check at all, confirmed by research — not a gap worth replicating):
  ```python
  LAB_STAFF_ROLES = {"super_admin", "admin", "lab_technician"}
  LAB_VIEW_ROLES  = {"super_admin", "admin", "lab_technician", "doctor"}
  ```
  - `GET/POST/PUT /lab/tests[/{id}]` — catalog CRUD, `LAB_STAFF_ROLES`.
  - `POST /lab/orders` — doctor orders test(s); allow `{"doctor","admin","super_admin"}`.
  - `GET /lab/queue` — worklist, `LAB_STAFF_ROLES`.
  - `GET /lab/orders/{id}` — order detail, `LAB_VIEW_ROLES`.
  - `PUT /lab/orders/{id}/queue-status` — advance waiting→being_served→collected, `LAB_STAFF_ROLES`.
  - `POST /lab/orders/{id}/sale` — get-or-create the billing header, `LAB_STAFF_ROLES`.
  - `PUT /lab/sales/{id}/mark-paid` — post-payment sync, `LAB_STAFF_ROLES`.
  - `PUT /lab/orders/{id}/items/{item_id}/result` — enter/update a result, `LAB_STAFF_ROLES`.
  - `GET /lab/results/patient/{patient_id}` — `LAB_VIEW_ROLES` (+ implicitly reachable from `PatientDetail.tsx` for any role that can view that page — reuse the same `patient_read_role_guard` pattern from `patients.py` if broader visibility turns out to be wanted).
- **`backend/app/services/billing_queue_service.py`** — add `LabOrder` to `_next_hospital_wide_daily_token`'s max-query list (`_max_today(LabOrder, LabOrder.queue_token)`, using the standard `created_at` day-range filter — Lab orders are always created same-day at finalize time, no pre-booking complication like Appointments had, so this is simpler than the Appointment fix made earlier this session).
- **`backend/app/services/prescription_service.py`**, `finalize_prescription`:
  - Extend the zero-items check (~line 536-560) with a Lab-equivalent branch alongside the existing Optical one — otherwise a prescription containing *only* a lab order (no medicines) hard-fails finalization with "cannot finalize empty prescription." Same lookup pattern: by `appointment_id` if present, else `patient_id + doctor_id` within the hospital's "today" window.
  - Extend the "also finalize the linked record" block (~line 615-632) to set the matching `LabOrder.is_finalized = True` **and** call `enqueue_lab_queue_entry`, committed alongside the clinical Rx in the same transaction.

## Frontend

- **`frontend/src/types/lab.ts`**, **`frontend/src/services/labService.ts`** — thin wrappers over the endpoints above, following `opticalService.ts`'s shape.
- **`frontend/src/pages/lab/`**:
  - `LabDashboard.tsx` — today's order/queue counts, mirrors `PharmacyDashboard.tsx`'s structure.
  - `LabTestCatalog.tsx` — table + modal-form CRUD for the test catalog (admin/lab_technician).
  - `LabQueue.tsx` — today's finalized orders by queue token, click-through to detail (mirrors the pharmacy queue list pattern).
  - `LabOrderDetail.tsx` — **one combined page** for billing + result entry (deliberately not split into 3 pages like Pharmacy, since Lab has no batch-picking step to justify that split — confirmed no existing single-detail-page counter-pattern argues otherwise). Flow: fetch order → if unpaid, billing form matching `DispensingBilling.tsx`'s payment fields (mode/amount/reference) driving `invoiceService.create/issue` → `paymentService.record` → `labService.markSalePaid` (mirrors `handlePaymentAndPrint`) → once paid, per-test result-entry fields unlock (value/unit/flag/notes) → `labService.recordResult`.
- **`frontend/src/pages/PrescriptionBuilder.tsx`** — new "Laboratory Tests" card, parallel to the existing Optical Rx card (~line 1549-1638) but gated by `isModuleEnabled('lab')` only (**not** `isEyeHospital` — lab tests apply to every hospital type). Multi-select against `labService.getTests()` + notes textarea; submitted as an independent, non-blocking `labService.createOrder(...)` call after the main Rx save succeeds (same sequencing as the Optical submit block at lines 763-780 — failure here doesn't roll back the drug prescription). No separate frontend "finalize" call needed — the server-side `finalize_prescription` change above handles it automatically, same as Optical.
- **`frontend/src/pages/PatientDetail.tsx`** — net-new "Lab Results" section (the page currently has no sub-record sections at all), inserted after the existing Address section, following its header markup (`w-8 h-[2px] bg-primary/20` + `h2`) — fetches via `labService.getPatientResults(id)` in a `useEffect` alongside the existing `refreshPatient`.
- **`frontend/src/components/common/Layout.tsx`** — `canAccessLab = hasRole('lab_technician','admin','super_admin') && isModuleEnabled('lab')`, plus a nav block copied from the pharmacy block (~line 820-871: same collapsible structure, `labOpen` state, icon `biotech` or `science`).
- **`frontend/src/App.tsx`** — `/lab/*` routes mirroring the pharmacy block (~line 384-489) 1:1, each wrapped in `ProtectedRoute allowedRoles={[...,'lab_technician']} requiredModule="lab"`.
- **`frontend/src/components/staff/StaffModals.tsx`** — add `'lab_technician'` to `ALL_ROLES` (~line 136) and `lab_technician: ['lab']` to `ROLE_MODULE_REQUIREMENTS` (~line 142), so admins can create lab logins and the role only offers itself once the module is enabled.
- **`frontend/src/utils/constants.ts`** — `ROLE_LABELS`/`ROLE_TEXT_COLORS` entries for `lab_technician` (~lines 27-39, 69-81), so it renders correctly wherever `getRoleBadge`/`formatRole` is used (staff list, audit log, etc.).

## Verification

1. Backend: `python -c "import ast; ast.parse(open(f).read())"` on every new/edited `.py` file, then a live import check via the backend venv (`./venv/Scripts/python.exe -c "import app.routers.lab"` etc.) the same way earlier fixes in this session were checked — catches import/syntax errors before touching the DB.
2. Apply `database_hole/13_add_lab_module.sql` against the local dev DB; confirm via a read-only query (same pattern used earlier this session) that `saas_core.modules` now has a `lab` row and the 4 new tables exist.
3. `npx tsc --noEmit -p frontend` — confirm no new type errors across the edited/new frontend files.
4. End-to-end walkthrough (per the `verify` skill, driving the actual app rather than just typechecking):
   - As super_admin: enable the `lab` module for the test hospital in `SuperAdminHospitalDetail.tsx`; confirm the Lab nav section appears.
   - Create a `lab_technician` user via `StaffModals.tsx`.
   - Add a couple of tests via `LabTestCatalog.tsx`.
   - As a doctor: write a prescription, add a lab test via the new card, finalize — confirm it appears in `LabQueue.tsx` with a queue token.
   - As the lab_technician: open the order, collect payment, confirm the invoice/payment record correctly (reusing the already-fixed generic path), enter a result.
   - As any patient-viewing role: open `PatientDetail.tsx` for that patient, confirm the result is visible in the new Lab Results section.

## Implementation progress

- [x] `database_hole/13_add_lab_module.sql` written and applied to local dev DB (4 tables + `saas_core.modules` row).
- [ ] `backend/app/models/lab.py`
- [ ] `backend/app/schemas/lab.py`, `invoice.py`/`user.py` extensions
- [ ] `backend/app/services/lab_service.py`
- [ ] `backend/app/routers/lab.py` + register in `main.py`
- [ ] Wire into `billing_queue_service.py` / `prescription_service.py`
- [ ] Backend syntax/import verification
- [ ] `frontend/src/types/lab.ts`, `services/labService.ts`
- [ ] `frontend/src/pages/lab/*` (Dashboard, TestCatalog, Queue, OrderDetail)
- [ ] `PrescriptionBuilder.tsx` lab ordering card
- [ ] `PatientDetail.tsx` Lab Results section
- [ ] Nav/routes/roles wiring (`Layout.tsx`, `App.tsx`, `StaffModals.tsx`, `constants.ts`)
- [ ] Frontend `tsc --noEmit` verification
- [ ] End-to-end walkthrough
