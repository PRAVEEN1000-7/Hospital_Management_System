# HMS Multi-Tenant — Project Documentation & Current Change Set

> Generated as a working reference before implementing further changes. Covers (1) the existing system as of the last commit (`ed924b7`), and (2) everything currently sitting uncommitted in the working tree (34 modified + 9 new files). Nothing in the working tree was touched while producing this document.

---

## 1. What This Project Is

A multi-tenant **Hospital Management System (HMS)** — SaaS platform serving multiple hospitals ("tenants"), each with their own staff, patients, subscription plan, and enabled feature modules. Core domains: patient registration, appointments/walk-ins, prescriptions, pharmacy, optical/ophthalmology store, generic inventory, billing/invoicing, and a super-admin console for platform operators.

The current uncommitted work implements **BRD v1.1** (see `BRD_HMS_v1.md` / `BRD_HMS_v1_GapAnalysis.md`, already in the repo as untracked files) for a specific client — **Balaji Eye Foundation / Balaji Health Foundation** — adding: patient clinical-history capture, an ophthalmology toggle + dual-letterhead on prescriptions, payment/queue tracking for Pharmacy and Optical sales, and a public kiosk-style Queue Display screen.

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy (ORM, not Alembic — raw SQL migration files), Pydantic v2, JWT (HS256) |
| Database | PostgreSQL 15+, two schemas: `public` (operational/hospital data) and `saas_core` (tenant/billing/subscription) |
| Frontend | React 18 + TypeScript, Vite, React Router v6, Tailwind CSS, Zustand (one store), Axios |
| Auth | JWT access token + opaque refresh token (SHA-256 hashed at rest), bcrypt-12 password hashing |

## 3. Repository Layout

```
backend/app/
  main.py            FastAPI app, middleware stack, router registration
  config.py          Settings (env-driven, fails closed in production if secrets are placeholders)
  database.py        SQLAlchemy engine/session (pool_size=10, max_overflow=20)
  dependencies.py    get_current_user / RBAC + tenant validation dependencies
  core/              tenant.py (TenantMiddleware), tenant_security.py (Tenant/Subscription/Scope validators),
                     security.py, audit_logger.py, audit_middleware.py, rate_limiter.py
  models/            SQLAlchemy models (one file per domain)
  routers/           FastAPI routers (one file per domain), ~28 modules
  schemas/           Pydantic request/response models
  services/          Business logic, called from routers
backend/migrations/  Ad-hoc SQL migration scripts (NOT Alembic-managed)
database_hole/       Hand-maintained, numbered SQL schema/seed files (the actual source of truth for DB structure)
frontend/src/
  App.tsx            All route definitions
  contexts/          AuthContext, SuperAdminContext, ToastContext, ConfirmContext, etc.
  components/common/ Layout (sidebar/nav), ProtectedRoute, shared widgets
  services/          One Axios-backed service module per backend domain
  pages/             Route components, grouped by module folder (pharmacy/, optical/, inventory/, ...)
  types/             Shared TypeScript DTOs, one file per domain
  stores/            Zustand: analyticsStore.ts only
```

---

## 4. Multi-Tenancy Model

**Shared schema, not schema-per-tenant.** Isolation is enforced via `hospital_id` (and indirectly `tenant_id`) columns checked on every query/dependency — not via separate Postgres schemas per customer.

- `saas_core.tenants` — the billing/SaaS entity. Fields: name, slug, code, status (pending/trialing/active/suspended), trial_ends_at, onboarding_completed, primary/secondary color, **`specialty`** (new, see §9).
- `public.hospitals` — the operational unit staff/patients actually belong to. `hospitals.tenant_id → saas_core.tenants.id` (nullable — a hospital can run "standalone" with no SaaS tenant). One tenant **can** own multiple hospitals.
- `saas_core.subscription_plans` / `tenant_subscriptions` — plan catalog and the tenant's active subscription (status, trial window, custom JSONB overrides for limits/features).
- `saas_core.modules` / `tenant_modules` — feature catalog and per-tenant enable/disable + JSONB feature config. This is what backs `requiredModule` gating in the frontend and `SubscriptionValidator.require_module_access()` in the backend.
- `saas_core.usage_tracking` — per-tenant usage counters (users, patients, appointments/month, storage) checked against plan limits.

**Request resolution chain:** JWT → `user.hospital_id` → `hospital.tenant_id` → `tenant_subscriptions` (active plan) → `tenant_modules` (is this module enabled?) → handler runs.

Enforcement happens in layers (`app/dependencies.py` + `app/core/tenant_security.py`):
1. `get_current_user()` decodes the JWT, reloads the user from DB, and **re-validates** `hospital_id` from the token against the DB record — a mismatch is logged as a `SECURITY ALERT` and audited, then rejected with 403. This guards against a stale/forged token referencing a different hospital.
2. `TenantValidator.get_tenant_for_user()` resolves the tenant and rejects if suspended. Returns `None` for super-admins and for hospitals with no linked tenant (standalone mode) — both are allowed through.
3. `SubscriptionValidator.require_module_access(module_name)` — used as a router-level FastAPI dependency (see `main.py`, e.g. `_require_pharmacy = [Depends(SubscriptionValidator.require_module_access('pharmacy'))]`) — blocks the whole router if the module isn't enabled for the tenant's plan.
4. **New in this change set**: `SubscriptionValidator` also now special-cases the `optical` module — even with the module enabled on the subscription, it additionally requires `hospital.specialty in ('eye_hospital', 'multi_specialty')` (`backend/app/core/tenant_security.py:211-224`). This stops a general hospital under a multi-hospital tenant from getting Optical just because a sibling hospital subscribed to it.

---

## 5. Backend Architecture

### 5.1 App bootstrap (`main.py`)
Middleware order: `TenantMiddleware` → CORS → request logging → audit logging (persists every mutating request to `audit_logs`) → per-user rate limiting (in-memory, **per-process** — note for anyone scaling to multiple workers). Routers for `prescriptions`, `pharmacy`, `inventory`, `billing`, and `optical` are registered with a shared module-access dependency injected at `include_router(..., dependencies=[...])` level, so the gating is centralized rather than repeated per-endpoint. `Base.metadata.create_all()` is **not** called — schema is entirely managed by the hand-written SQL files in `database_hole/` (see §7), which is why ORM model changes always need a matching manual `ALTER TABLE`.

### 5.2 Auth & RBAC
- Login (`routers/auth.py` → `services/auth_service.py`): bcrypt-12 verify, escalating lockout (5 attempts→15min, 10→1hr, 20+→indefinite), tenant-active check, then JWT issued with `user_id`, `hospital_id`, roles, permissions; 60-minute expiry (`ACCESS_TOKEN_EXPIRE_MINUTES`, `config.py`).
- Refresh tokens: opaque random token, only the SHA-256 hash is persisted (`refresh_tokens` table), with `device_info`/`ip_address`/`revoked_at`. The most recent commit (`ed924b7`) added an access-token blocklist alongside this.
- RBAC: `User —UserRole→ Role —RolePermission→ Permission`. Permissions are `module:action:resource` strings, aggregated onto the user object. Role aliasing exists for legacy names (`administrator`→`admin`, etc., `dependencies.py:174-179`).

### 5.3 Router inventory (`backend/app/routers/`)

| Router | Purpose |
|---|---|
| auth | Login/logout/refresh, `/me`, password reset |
| superadmin / tenant_admin | Platform-level tenant CRUD, subscriptions, modules, audit; hospital-side admin views |
| hospital / hospital_settings | Hospital profile, branding, logo upload |
| users | Staff CRUD, role assignment |
| patients | Patient CRUD/search, PRN generation |
| appointments / schedules / appointment_settings / appointment_reports | Scheduling, doctor availability, config, analytics |
| departments / doctors | Org structure, doctor profiles |
| walk_ins / waitlist | Walk-in check-in and queueing (the original `AppointmentQueue` / `queue_number` system, reused by the new Queue Display) |
| prescriptions (+ medicines_router, templates_router) | Doctor prescriptions, PDF generation, templates |
| pharmacy / pharmacy_dispensing | Medicine master + sales/dispensing |
| optical | Optical/ophthalmology products, prescriptions, sales |
| inventory (+ suppliers/po/grn/movements/adjustments/cycle_counts routers) | Generic stock pipeline |
| invoices / payments / refunds / settlements / tax_configurations | Billing |
| notifications / logs | In-app notifications; frontend error/log ingestion |

### 5.4 Core domain models (`backend/app/models/`)
`User`, `Hospital` (now carries `specialty`), `Doctor`, `Patient` (now carries clinical-history fields), `Appointment`/`AppointmentQueue`, `Prescription` (now carries opthal + dual-letterhead fields), `Medicine`/`MedicineBatch`, `PharmacySale`(table `pharmacy_dispensing`)/items, `OpticalSale`(table `optical_orders`)/`OpticalProduct`/`OpticalBatch`/`OpticalPrescription`, `InventoryItem` family, `Invoice`/`Payment`/`Refund`/`Settlement`, `Tenant`/`SubscriptionPlan`/`TenantSubscription`/`Module`/`TenantModule`/`UsageTracking` (all `saas_core` schema), `Role`/`Permission`, `Notification`.

### 5.5 Service layer convention
Routers stay thin; `app/services/*.py` holds the actual logic, takes `db: Session` first, returns ORM objects or dicts, raises `ValueError` for domain errors (translated to HTTP 400 in the router). Example: `tenant_service.create_tenant()` does tenant + hospital + admin-user creation transactionally in one call.

### 5.6 Superadmin / tenant onboarding
`Tenant` = billing entity, `Hospital` = operational unit; one tenant can own multiple hospitals. `TenantService.create_tenant()` creates the tenant row, the first hospital, and the admin user together, sets a trial window (default 14 days), and seeds default module enablement. Super-admin auth is a fully separate JWT path (no `hospital_id` claim) and bypasses tenant/module checks entirely.

---

## 6. Frontend Architecture

### 6.1 Routing & protection (`App.tsx`, `components/common/ProtectedRoute.tsx`)
React Router v6. Public: `/login`, `/reset-password`. Super-admin: `/superadmin/*` under its own `SuperAdminProvider`. Everything else sits behind one `<ProtectedRoute>` wrapping `<Layout>`. `ProtectedRoute` takes optional `allowedRoles` (role allow-list; super_admin always passes) and `requiredModule` (shows a "module disabled" lock screen instead of the page if the tenant hasn't enabled it). ~88 routes grouped by module (Patients, Appointments, Prescriptions, Pharmacy, Optical, Inventory, Billing, Analytics, SuperAdmin, Settings).

### 6.2 Auth/tenant context
`AuthContext` holds `user`, `token`, `enabledModules`, exposes `isModuleEnabled()`, `hasPermission()`, `hasRole()`; refreshes the module list on tab focus/storage events so an admin toggling a module elsewhere is picked up without a full reload. `SuperAdminContext` is intentionally separate from the hospital-user auth context even though both currently use the same `access_token` localStorage key.

### 6.3 API/service layer (`services/api.ts`)
Single Axios instance; request interceptor attaches the bearer token and silently refreshes it ~5 minutes before expiry (de-duped via a shared in-flight promise); response interceptor force-logs-out on 401 and fires a `hms:quota-exceeded` event on 402. Every backend domain has a matching `xService.ts` (pharmacyService, opticalService, prescriptionService, etc.) following the same get/create/update shape.

### 6.4 Layout & navigation (`components/common/Layout.tsx`)
Sidebar sections are built from `canAccessX = hasRole(...) && isModuleEnabled(...)` booleans — both the role check and the module-subscription check gate visibility, independent of the route-level `ProtectedRoute` check (defense in depth / UX consistency). Sections: Main, Appointments, Prescriptions, Pharmacy, Optical Store, Inventory, Billing, System (admin), Account.

### 6.5 Page inventory (by module)
Patients (4), Appointments/Walk-ins/Waitlist (8), Prescriptions (3), Pharmacy (10 — now 11 with the new Queue page), Optical (10 — now 11 with the new Queue page), Inventory (10), Billing (8, several are UI-only stubs: Insurance Claims/Providers, Credit Notes), Analytics (1), SuperAdmin (8), Settings (3), Auth (3).

### 6.6 Types & state
Per-domain DTO files under `types/`. State is mostly React Context; the only Zustand store is `analyticsStore.ts` (dashboard filter state).

---

## 7. Database Schema Evolution (`database_hole/*.sql`)

This directory — **not Alembic** — is the actual schema source of truth, applied by hand in numeric order:

| File | Purpose |
|---|---|
| `01_schema.sql` | Base schema: ~62 tables, UUID PKs, soft deletes, 12-digit ID system w/ checksum |
| `02_seed_data.sql` | Dev sample data |
| `03_queries.sql` | Reference CRUD/reporting queries |
| `04_inventory_seed.sql`, `inventory_alter.sql` | Inventory module additions |
| `05_multi_tenant_schema.sql`, `06_fix_multi_tenant.sql`, `07_security_schema_fixes.sql`, `08_fix_hospitals_tenant_id.sql` | Introduced `saas_core` schema + tenant/subscription/module tables, then corrective patches |
| `09_common_medicines.sql` | Shared medicine master data |
| `10_optical_batches.sql` | Optical module batching |
| `security_updates.sql` | Security hardening (referenced by the latest commit `ed924b7`) |
| **`11_hospital_tenant_specialty.sql`** | **Untracked — BRD v1.1.** Hospital/tenant `specialty` classification + backfill |
| **`12_patient_history.sql`** | **Untracked — BRD v1.1.** Patient History block columns on `patients` |
| **`13_prescription_enhancements.sql`** | **Untracked — BRD v1.1.** Dual-letterhead `institution_id`, Opthal toggle/notes, `vitals_blood_sugar` |
| **`14_pharmacy_optical_billing_queue.sql`** | **Untracked — BRD v1.1.** Shared payment fields + Optical's sale-triggered queue columns on `pharmacy_dispensing`/`optical_orders`, `consultation_fee` |
| **`15_hospital_settings_queue_display.sql`** | **Untracked — BRD v1.1.** Queue Display customization columns on `hospital_settings` |
| **`16_pharmacy_queue_entries.sql`** | **Untracked — BRD v1.1.** New `pharmacy_queue_entries` table — Pharmacy's prescription-triggered queue (decoupled from billing, unlike Optical's) |
| `multi_*.sql`, `multi_DEPLOY.md` | Multi-tenant deployment reference set (parallel/alternate track) |

> Files 11–16 supersede three earlier draft scripts (`backend/run_migration.py`, `backend/migrations/add_brd_v1_features.sql`, an earlier monolithic `11_eye_hospital_billing_queue.sql`) which have been deleted — they were partial/overlapping duplicates of the same change set, now consolidated into one categorized file per concern.

---

## 8. Core End-to-End Working Flows (pre-existing)

**Patient → Prescription → Dispensing → Billing**
1. Patient registered (`patients` router) → gets a PRN.
2. Walk-in or scheduled appointment created → patient enters `AppointmentQueue` (`walk_ins`/`appointments`/`schedules`) with a sequential `queue_number`.
3. Doctor opens the patient, writes a `Prescription` with diagnosis/medicines/vitals (`prescriptions` router + `PrescriptionBuilder.tsx`); PDF generated server-side (`routers/prescriptions.py: get_prescription_pdf`).
4. If medicines were prescribed, the patient flows to **Pharmacy** (`pharmacy`/`pharmacy_dispensing`) where staff create a `PharmacySale`, decrementing `MedicineBatch` stock.
5. If optical items needed, the same happens via the **Optical** module (`OpticalSale`, `OpticalProduct`/`OpticalBatch`).
6. Billing (`invoices`/`payments`/`refunds`/`settlements`) can be generated from sales or independently.

**Tenant onboarding (Super Admin)**
Super admin creates a tenant → `TenantService.create_tenant()` creates tenant + first hospital + admin user + trial subscription + default module set in one transaction → hospital admin logs in and completes onboarding (`onboarding_step`/`onboarding_completed` on `Tenant`).

**Auth/module gating on every request**
Login → JWT → every protected request re-validates hospital/tenant status → router-level `require_module_access` blocks disabled modules → frontend independently hides nav items and route content for the same modules (UX mirrors backend enforcement, doesn't replace it).

---

## 9. Current Uncommitted Changes (working tree)

Everything below is **staged in the working directory only** — not committed, not discarded, exactly as found. Source requirements: `BRD_HMS_v1.md` (full BRD) and `BRD_HMS_v1_GapAnalysis.md` (status of each requirement against the code, both already present as untracked files in the repo). This is the **"Queue Display | Prescription | Pharmacy | Opthal Billing"** BRD v1.1 for Balaji Eye/Health Foundation.

### 9.1 Hospital/Tenant "specialty" classification + Optical gating
- New column `hospitals.specialty` (`general` | `eye_hospital` | `multi_specialty`), default `general` (`backend/app/models/user.py`).
- New column `saas_core.tenants.specialty`, mirrored onto the hospital when a superadmin edits it (`backend/app/services/tenant_service.py:494-510` — updating a tenant's specialty also patches the linked hospital row).
- `SubscriptionValidator` now hard-blocks the `optical` module for any hospital not classified `eye_hospital`/`multi_specialty`, even if the module is enabled at the subscription level (`backend/app/core/tenant_security.py:211-224`).
- Surfaced everywhere a hospital is created/edited/viewed: `SuperAdminCreateHospital.tsx`, `SuperAdminHospitalEdit.tsx` (new dropdown), `SuperAdminHospitalDetail.tsx` (read-only display), and propagated to the logged-in user via `UserResponse.hospital_specialty` (`schemas/auth.py`, `routers/auth.py`) so the frontend can react to it (e.g. `PrescriptionBuilder.tsx` defaults the Opthal toggle on for eye hospitals).

### 9.2 Patient History block (BRD §2)
New `Patient` columns (`backend/app/models/patient.py`): `reason_for_visit` (Text), `symptoms` (JSONB array — multi-select + free text), `blood_sugar_value` (Numeric), `blood_sugar_unit` (mg/dL | mmol/L). **Backend model + migration only** — no frontend form exists yet to capture these at registration (see §11 gaps).

### 9.3 Prescription: Opthal toggle + dual-letterhead institution (BRD §4)
- New `Prescription` columns: `institution_id` (FK→hospitals, for dual letterhead), `vitals_blood_sugar`, `is_opthal` (bool), `opthal_notes` (Text).
- `PrescriptionBuilder.tsx` gained `isOpthal`/`opthalNotes` state, defaulted on when `user.hospital_specialty === 'eye_hospital'`.
- PDF generation (`routers/prescriptions.py:393-588`) now resolves the letterhead from `rx.institution_id` if set (falling back to the prescribing hospital), renders a highlighted "Ophthalmology Examination" block when `is_opthal && opthal_notes`, and adds **Qty**/**Route** columns to the medicines table.
- `prescription_service.update_prescription()` changed its update-field logic from `if data[k] is not None` to `if k in data` for `is_opthal`/`opthal_notes` etc. — i.e. an explicit `null` now actually clears the field instead of being silently ignored (subtle behavior change worth knowing if you touch that function).
- No "institution selector" UI exists yet on the prescription form to actually set `institution_id` — only the backend field + PDF rendering are wired (see §11).

### 9.4 Shared billing + dispensing-queue helper (new file)
`backend/app/services/billing_queue_service.py` — intentionally shared by both Pharmacy and Optical so they don't diverge:
- `compute_payment_breakdown(total, advance_amount, amount_tendered)` → `{paid_amount, balance_amount, payment_status}`. `payment_status` is `pending` (nothing paid) / `partially_paid` (balance > 0) / `paid` (balance ≤ 0).
- `generate_daily_queue_token(db, hospital_id, model)` → next integer token, scoped per hospital **and reset daily** (mirrors the existing `AppointmentQueue` token pattern, applied to sales).
- `advance_queue_status(sale, new_status)` → enforces the state machine `waiting → being_served → ready → collected`.

### 9.5 Pharmacy & Optical sales: payment + queue fields
Both `PharmacySale` and `OpticalSale` gain **identical** new columns (previously `payment_method`/`payment_status` were just hardcoded Python class attributes, never persisted — now real DB columns):
`payment_method`, `payment_status` (default now `pending`, was `paid`), `amount_tendered`, `advance_amount` (Optical only conceptually, but column exists on both), `paid_amount`, `balance_amount`, `queue_token`, `queue_status` (default `waiting`), `queue_called_at`. `PharmacySale` additionally gets `consultation_fee` (added to `total_amount` at sale time).
- `optical_service.create_sale()` / `pharmacy_service.create_sale()` now call `generate_daily_queue_token()` and `compute_payment_breakdown()` at creation time.
- New service functions `list_optical_queue()` / `list_pharmacy_queue()` (today's sales ordered by `queue_token`) and `update_optical_queue_status()` / `update_pharmacy_queue_status()`.
- New router endpoints: `GET/PUT /optical/queue[, /{id}/status]` and `GET/PUT /pharmacy/queue[, /{id}/status]`.
- `NewSale.tsx` (Pharmacy) and `NewOpticalSale.tsx` (Optical) both gained payment-method/amount-tendered/advance-amount inputs and a live balance/change calculation. `NewOpticalSale.tsx` also gained "+ Add Frame" / "+ Add Lens" quick-add buttons (`quickAddByCategory()`) per BRD §7.3.

### 9.6 New Dispensing Queue UI
- `frontend/src/components/common/DispensingQueueBoard.tsx` — shared table component (Waiting/Being Served/Ready/Collected, with a "mark next status" action button), used identically by:
- `frontend/src/pages/pharmacy/PharmacyQueue.tsx` and `frontend/src/pages/optical/OpticalQueue.tsx` — thin wrappers (15s poll interval) around the shared board.
- Both wired into `App.tsx` (routes `/pharmacy/queue`, `/optical/queue`) and `Layout.tsx` sidebar ("Dispensing Queue" nav item under each module).

### 9.7 New public Queue Display kiosk page — **not yet routed**
`frontend/src/pages/QueueDisplay.tsx` exists (4-column board: Doctor 1, Doctor 2, Pharmacy, Opthal; pulls from `pharmacyService.getQueue()`, `opticalService.getQueue()`, `walkInService.getQueueStatus()`; 10s auto-refresh per BRD §3.5 QD-06) **but there is no route for it in `App.tsx`** and it isn't linked from `Layout.tsx`. The page is currently unreachable in the running app. The "Doctor 1/Doctor 2" split is also done client-side by alternating array index (`idx % 2`), not by actual doctor identity — a placeholder per the gap analysis (§2, QD-04 marked 🟡 Update: column config is hardcoded, no Customization Settings screen yet).

### 9.8 Superadmin hospital create/edit
`SuperAdminCreateHospital.tsx` / `SuperAdminHospitalEdit.tsx` both gained a "Hospital Specialty" `<select>` (general/eye_hospital/multi_specialty) feeding `HospitalCreate`/`HospitalUpdate`/`TenantOnboardingRequest` schemas, which now all accept `specialty` with the same regex constraint.

### 9.9 Prescription schema `extra="ignore"`
Several `ConfigDict(from_attributes=True)` → `ConfigDict(from_attributes=True, extra="ignore")` changes in `schemas/prescription.py` — defensive change so ORM objects with extra attributes (likely from the new `institution`/opthal relationships) don't fail Pydantic validation.

### 9.10 ✅ Migrations consolidated (resolved)
The three overlapping, partial migration drafts that originally shipped with this feature set (`backend/run_migration.py`, `backend/migrations/add_brd_v1_features.sql`, an early monolithic `database_hole/11_eye_hospital_billing_queue.sql`) have been **deleted** and replaced with six clean, single-concern, idempotent files — `database_hole/11_hospital_tenant_specialty.sql` through `16_pharmacy_queue_entries.sql` (see §7). Together they're a strict superset of the three originals, plus a `vitals_blood_sugar` column none of the three originals had. **Still not confirmed-applied to any database** — there's no migration ledger/Alembic in this project — run 11→16 in order against the target DB before relying on any BRD v1.1 backend code path.

---

## 10. Full File Manifest (current working tree)

**Modified (34):**
`backend/app/core/tenant_security.py` · `models/{optical,patient,pharmacy,prescription,tenant,user}.py` · `routers/{auth,optical,pharmacy,prescriptions,superadmin}.py` · `schemas/{auth,hospital,optical,pharmacy,prescription,tenant}.py` · `services/{optical_service,pharmacy_service,prescription_service,tenant_service}.py` · `frontend/src/App.tsx` · `components/common/Layout.tsx` · `pages/PrescriptionBuilder.tsx` · `pages/SuperAdminCreateHospital.tsx` · `pages/SuperAdminHospitalDetail.tsx` · `pages/SuperAdminHospitalEdit.tsx` · `pages/optical/NewOpticalSale.tsx` · `pages/pharmacy/NewSale.tsx` · `services/{opticalService,pharmacyService}.ts` · `types/{auth,optical,pharmacy,prescription}.ts`

**New / untracked (9, as originally drafted — since superseded by the full BRD v1.1 implementation pass, see §9.10):**
`BRD_HMS_v1.md`, `BRD_HMS_v1_GapAnalysis.md` (requirements docs) · `backend/app/services/billing_queue_service.py` · `database_hole/11_hospital_tenant_specialty.sql` through `16_pharmacy_queue_entries.sql` · `frontend/src/components/common/DispensingQueueBoard.tsx` · `frontend/src/pages/QueueDisplay.tsx` · `frontend/src/pages/optical/OpticalQueue.tsx` · `frontend/src/pages/pharmacy/PharmacyQueue.tsx`

---

## 11. Known Gaps / Open Items (carried over from the Gap Analysis doc + found while documenting)

1. **Migrations consolidated but not yet confirmed-applied** — see §9.10. Run `database_hole/11_hospital_tenant_specialty.sql` through `16_pharmacy_queue_entries.sql` in order against the target DB before relying on any BRD v1.1 backend code path.
2. **QueueDisplay.tsx has no route** — built but unreachable; needs an `App.tsx` route (BRD says it should sit between Walk-in Queue and Doctor Schedule in nav, likely as a kiosk/full-screen page rather than a sidebar item).
3. **No registration-time UI for Patient History** — `reason_for_visit`/`symptoms`/`blood_sugar_*` exist on the model/DB only; nothing in the patient registration form captures them yet, and the BRD's symptom master list/multi-select dropdown UI doesn't exist.
4. **No institution-selector UI on the prescription form** — `institution_id` exists but nothing lets the doctor pick "Balaji Eye Foundation" vs "Balaji Health Foundation" letterhead per prescription.
5. **Queue Display column configuration is hardcoded** — no "Customization Settings" screen for toggling Doctor 2/Pharmacy/Opthal columns (BRD QD-04), and the Doctor 1/Doctor 2 split is index-parity-based, not tied to actual doctor identity.
6. **Eye diagram image asset** for the Opthal prescription section — open item per BRD §9, not yet sourced/uploaded as a system asset.
7. **No "Plug & Play" customization settings model at all** — every BRD toggle right now is a hardcoded frontend constant rather than a stored per-hospital setting.

---

## 12. Where to Look When Implementing the Next Change

- Adding more BRD-style sale/payment behavior → extend `backend/app/services/billing_queue_service.py` (shared by Pharmacy + Optical) rather than duplicating logic in each service.
- Anything DB-schema related → check whether it belongs in a *new* numbered `database_hole/NN_*.sql` file (the project's real migration convention) rather than another ad-hoc script like `run_migration.py`.
- Module gating decisions (who can see a feature) → `backend/app/core/tenant_security.py` (`SubscriptionValidator`) on the backend, `AuthContext.isModuleEnabled()` + `Layout.tsx` `canAccessX` booleans + `ProtectedRoute`'s `requiredModule` on the frontend — all three need to stay in sync.
- New hospital-level settings (like `specialty`) need to be threaded through: model → schema → router → `tenant_service` (if it should also sync onto the `Tenant`) → frontend type (`types/auth.ts` `User.hospital_specialty`-style) → superadmin create/edit/detail pages → any consuming page (e.g. `PrescriptionBuilder.tsx` reading `user.hospital_specialty`).
