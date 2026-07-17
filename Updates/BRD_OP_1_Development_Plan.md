# BRD_OP_1 — Development Plan

**Source:** `Updates/BRD_OP_1.md` (Business Requirements Document — OPD & Prescription Management System, v1.0, 16 July 2026)
**Prepared:** Gap analysis against the current `opthal` branch, followed by a phased implementation plan.

## Context

The BRD covers three features: a **Prescription Dashboard** (data grid of visits), **Patient Registration email/phone verification** with a verified checkmark, and an enhanced **OPD Assignment** search-and-confirm flow. Every requirement in the BRD was compared line-by-line against the current codebase. Findings:

- **OPD Assignment (§3.3)** is closest to done — type-ahead patient search and a "register new patient" shortcut already exist and already closely match the BRD. What's missing: a confirm/cancel dialog step between selecting a patient and completing assignment, a few extra display fields (age, allergies, last visit), and the verified checkmark (which depends on the verification feature below).
- **Prescription Dashboard (§3.1)** is largely missing. A prescription list page exists, but with the wrong columns (no "Reason for Visit", no medicine-name list, no "Billed Tablets"), no sorting, and the patient name isn't clickable.
- **Patient Verification (§3.2)** is complete greenfield — no database columns, no SMS provider, no email-verification flow, and no "verified checkmark" concept exist anywhere in the codebase today.

### Decisions confirmed before planning (the BRD itself flags these as open questions in its §5.3, or they emerged from the gap analysis)

- **Unverified patients are never blocked** from OPD assignment or anything else — verification is informational/flagging only, never a hard gate.
- **Phone/OTP verification is planned but built behind a swappable provider interface.** No SMS vendor is procured yet. Email verification (which reuses the existing SMTP setup) ships first; the entire OTP code path — schema, generation, expiry, attempts, staff UI — is built and testable in a log-only mode now, with only the real vendor adapter (Twilio/MSG91/etc.) deferred until a provider and API credentials are supplied.
- **The Prescription Dashboard is a dedicated page**, not something embedded inline into the shared multi-role Dashboard. It retrofits the existing prescription list page in place and is linked from the shared Dashboard via a quick-action card — this keeps the shared landing page fast and uncluttered for roles (admin, receptionist, pharmacist) that don't need this grid.

### Build order

**Phase 1 (OPD Assignment) → Phase 2 (Prescription Dashboard) → Phase 3 (Patient Verification).** Each phase is independently shippable, ordered lowest-risk/most-reuse first. Phase 3's phone/OTP sub-step is explicitly allowed to lag behind SMS vendor procurement without blocking the rest of the plan.

---

## Reuse map

Read this before writing any new code — most of this plan is extending existing patterns, not inventing new ones.

| Need | Existing pattern | Location |
|---|---|---|
| Safe server-side sort allowlist | `list_patients()`'s `_sortable` dict → `sort_col.asc()/desc()` | `backend/app/services/patient_service.py:190-198` |
| Date range filter UI | `DateRangeFilter` component (already used in the prescription list) | `frontend/src/components/common/DateRangeFilter.tsx` |
| Patient detail modal layout to adapt | `detailItem` modal (demographics + allergies/chronic conditions + emergency contact) | `frontend/src/pages/WalkInQueue.tsx:1792-2021` |
| Debounced typeahead search | Existing 300ms/min-2-char pattern | `frontend/src/pages/WalkInRegistration.tsx:97-108` |
| Cross-tab near-real-time refresh | `useDashboardRefresh()` | `frontend/src/contexts/DashboardRefreshContext.tsx` |
| 30s polling precedent | Pending-prescription-count poll | `frontend/src/components/common/Layout.tsx:177` |
| Token-based verification (single-use, hashed, time-limited) | `PasswordResetToken` model + `/forgot-password`/`/reset-password` flow | `backend/app/models/user.py:215-225`; `backend/app/routers/auth.py:442-601` |
| Public unauthenticated route | `/reset-password` | `frontend/src/App.tsx:151-157`, `frontend/src/pages/ResetPassword.tsx` |
| Audit trail persistence | `AuditLogger.log()` / `saas_core.audit_logs` | `backend/app/core/audit_logger.py` |
| Graceful "provider not configured" degrade | `send_email()`'s `if not settings.SMTP_HOST` branch | `backend/app/services/email_service.py:12-14` |
| External-provider settings shape | `SMTP_*` block | `backend/app/config.py:46-52` |
| Proven billed-amount join (single row) | `enrich_prescription()`'s `PharmacySale → PharmacySaleItem → PrescriptionItem` join | `backend/app/services/prescription_service.py:706-722` |

Two things worth flagging up front:

1. `Patient` already has its own `reason_for_visit` column (`backend/app/models/patient.py:50`) — patient-level, overwritten on every registration/edit — distinct from `Appointment.chief_complaint` (per-visit, correctly populated by `register_walk_in`). The dashboard should prefer the per-visit field and fall back to the patient-level one only when a prescription has no linked appointment.
2. `known_allergies`/`chronic_conditions` already exist as `Patient` columns but are missing from the general-purpose response schemas (`backend/app/schemas/patient.py:164-198,219-232`), so they're silently dropped from every API response today — despite the frontend `Patient` TypeScript type already declaring them.

---

## Phase 1 — OPD Assignment enhancements (BRD §3.3)

Lowest risk: search and "register new patient" already work. This phase adds a confirmation step and fills display gaps.

### Backend
- `backend/app/schemas/patient.py` — add `known_allergies`, `chronic_conditions` to `PatientResponse` (:164-198); add `date_of_birth`, `age_years`, `age_months`, `known_allergies`, `chronic_conditions` to `PatientListItem` (:219-232). These are already-stored columns just missing from the response shape — no frontend type change needed since the TS type already declares them.
- `backend/app/services/patient_service.py` — add `get_patient_last_visit(db, patient_id, hospital_id) -> date | None`: latest `Appointment.appointment_date` where `status == "completed"`.
- `backend/app/routers/patients.py` — new `GET /patients/{patient_id}/last-visit` → `{"last_visit_date": ... | null}`, guarded by the existing `patient_read_role_guard`.
- `backend/app/routers/walk_ins.py` — in `register_walk_in()` and `assign_doctor_to_walkin()`, add an `AuditLogger.log(...)` call after commit, recording the OPD assignment for the BRD's auditability requirement (§4). This is the first non-auth use of `AuditLogger` in the codebase — the `AuditAction.APPOINTMENT_CREATE`/`APPOINTMENT_UPDATE` enum members already exist and are currently unused.

### Frontend
- `frontend/src/services/patientService.ts` — add `getLastVisit(id)`.
- `frontend/src/pages/WalkInRegistration.tsx` — this is the actual "OPD Assignment" page (route `/appointments/walk-in`; the page heading literally reads "OPD Assignment").
  - Dropdown rows (:397-409): show age (via `date-fns` `differenceInYears`, same as `PatientDetail.tsx` already uses) plus phone/gender — data now present in the response.
  - Replace the direct `selectPatient(p)` call (:56, invoked at :398) with a confirm-dialog step: new state (`pendingPatientId`, `pendingDetail`, `pendingLastVisit`, `pendingLoading`) → `openConfirmDialog(p)` fetches patient detail + last visit in parallel → shows a modal adapted directly from `WalkInQueue.tsx:1792-2021`'s `detailItem` modal layout (name header, demographics grid, allergies/chronic-conditions block, plus a new "Last Visit" tile), with **Confirm & Assign to OPD** (proceeds to the existing `selectPatient` logic, closes dialog) and **Cancel** (discards pending state, returns to search) buttons.
  - Note: "Confirm & Assign" here means confirming patient identity — doctor/urgency/reason are still chosen in the existing panel *after* this dialog closes, matching the current page flow.
  - The verified checkmark is deferred to Phase 3 (it needs `email_verified`/`phone_verified` to exist) — leave a clear slot for it in the dropdown row and dialog header now so Phase 3 is a one-line addition later.

---

## Phase 2 — Prescription Dashboard (BRD §3.1)

Retrofit `frontend/src/pages/PrescriptionList.tsx` in place (already mounted at `/prescriptions`) rather than building a new page.

### Backend
- `backend/app/schemas/prescription.py` — `PrescriptionListItem` (:314-339): add `reason_for_visit`, `medicine_names: list[str]`, `dispensed_quantity_total`, `final_amount`.
- `backend/app/services/prescription_service.py`:
  - `list_prescriptions()` (:325-383) — add `sort_by`/`sort_order` params, following `patient_service.list_patients()`'s safe-allowlist pattern exactly (a `_sortable` dict mapping column names to SQLAlchemy expressions). Direct columns (`created_at`, `status`, `diagnosis`) sort with no join; `patient_name`/`doctor_name`/`reason_for_visit` need a conditional join added only when that column is the actual sort target. Sorting by `billed_tablets` needs a correlated `scalar_subquery()` over `PharmacySaleItem` joined through `PrescriptionItem` — if that's too costly against the <2s/1000-row performance target, fall back to sorting only the current page client-side for that one column and document the trade-off.
  - `enrich_prescriptions()` (:727-780) — extend the existing batch-loading section (no new per-row query): batch-fetch `Appointment.chief_complaint` alongside the appointment-number lookup already there (:746-750), falling back to the patient-level `reason_for_visit` (already loaded at :734) when no appointment is linked; batch-fetch medicine names via `PrescriptionItem.medicine_name` grouped by `prescription_id`; batch-fetch dispensed totals by turning `enrich_prescription()`'s proven single-row join (:706-722) into a `GROUP BY` batch query over the same join path.
  - The `doctor_id` filter already exists (:343-346) — no backend change needed, only a frontend UI gap.
- `backend/app/routers/prescriptions.py` — `list_all_prescriptions()` (:82-107) and `my_prescriptions()` (:110-130): add `sort_by`/`sort_order` query params, mirroring `routers/patients.py:138-139`.
- **No DB migration** — every new field is sourced via joins to existing columns.

### Frontend
- `frontend/src/types/prescription.ts` — extend `PrescriptionListItem` (:103-120) to match the new schema fields.
- `frontend/src/services/prescriptionService.ts` — add `sort_by`/`sort_order` to `PrescriptionFilters`; no implementation change needed since `getPrescriptions()` already forwards any filter key generically.
- `frontend/src/pages/PrescriptionList.tsx` — the core retrofit:
  - Add a doctor filter dropdown, reusing `scheduleService.getDoctors()` exactly as `WalkInRegistration.tsx:71` does.
  - New columns: **Reason for Visit** (truncated), **Past Prescribed Medicines** (first 2 names + "+N more"), **Billed Tablets** (quantity / amount).
  - Patient Name cell (:424, currently plain text) — make clickable → patient detail page; verified-checkmark slot added here too, wired in Phase 3.
  - Column headers (:402-410) become click-to-sort (small local `sortBy`/`sortOrder` state — a genuinely different UX than the existing dropdown-based sort selector elsewhere, so this is a new small addition, not a reuse).
  - Pagination stays as-is — the existing Prev/Next already satisfies the BRD's "pagination **or** virtual scrolling," and no virtualization precedent exists anywhere in this codebase.
  - Near-real-time refresh: subscribe to `useDashboardRefresh()` in the fetch effect, plus a 30-second poll matching the existing `Layout.tsx:177` precedent.
- `frontend/src/pages/Dashboard.tsx` — add a "Prescription Dashboard" quick-action card linking to `/prescriptions`, for the `doctor` and `admin`/`super_admin` roles (the pharmacist role already has an equivalent quick action today).

---

## Phase 3 — Patient Verification + verified-badge rollout (BRD §3.2)

Complete greenfield. Sequence: schema → email verification (ships now) → verified-badge rollout → phone/OTP (built now, real vendor deferred).

### 3a. Schema

New file `database_hole/12_add_patient_verification.sql` (written now; **run manually by you, never executed by the assistant**, per this project's standing convention):

```sql
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS patient_email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_email_verif_patient ON patient_email_verification_tokens(patient_id);

CREATE TABLE IF NOT EXISTS patient_phone_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    otp_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    used_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_phone_otp_patient ON patient_phone_otps(patient_id);
```

- `backend/app/models/patient.py` — add the 4 new columns to `Patient`.
- New `backend/app/models/patient_verification.py` — `PatientEmailVerificationToken`, `PatientPhoneOtp`, same shape as `PasswordResetToken` (`models/user.py:215-225`), plus `attempts_count`/`max_attempts` on the OTP model.
- `backend/app/models/__init__.py` — register both new model imports (this file aggregates every model module; easy to miss and would silently break table creation).

### 3b. Email verification

- New `backend/app/services/verification_service.py`:
  - `send_email_verification(db, patient, created_by_user_id, origin)` — invalidate prior unused tokens, generate a random token, hash it, store with a 24-hour expiry, email a verification link via the existing `send_email()`, log the attempt via `AuditLogger`.
  - `confirm_email_verification(db, raw_token)` — hash the incoming token, look up an unused+unexpired match, mark it used, set `email_verified=True` + `email_verified_at`, log via `AuditLogger`. Distinguish invalid/already-used vs. expired for the right audit action and user-facing message.
- `backend/app/core/audit_logger.py` — add `AuditAction` members for sent/verified/failed/expired, for both email and phone — this directly satisfies the BRD's "all verification attempts logged" requirement (§4).
- `backend/app/schemas/patient.py` — add `email_verified`, `email_verified_at`, `phone_verified`, `phone_verified_at` to `PatientResponse` and `PatientListItem`; add a computed `is_verified` field (`email_verified AND phone_verified`) to both, mirroring the existing `full_name` computed-field pattern already on `PatientListItem`. This becomes the single field every frontend site keys off, so the "both required" rule for the checkmark can't drift between screens.
- `backend/app/routers/patients.py` — `POST /patients/{id}/send-email-verification` (staff-authenticated); `POST /patients/verify-email` (**public, no auth** — the patient clicks their own emailed link, they're not logged into the HMS).
- `backend/app/services/patient_service.py` — in `update_patient()` (:207-219), capture the old email/phone before the update loop runs; afterward, if the email changed and was previously verified, reset its verified status (same for phone). This implements "editing clears verified status" — easy to miss since the update loop is fully generic today.

### 3c. Verified-badge rollout

- New `frontend/src/components/common/VerifiedBadge.tsx` — the one new shared UI component in this plan (justified: the BRD demands visual consistency across 5+ sites and nothing like it exists yet). Green checkmark with a native tooltip reading "Email and phone verified."
- `frontend/src/types/patient.ts` — add the verification fields + `is_verified` to `Patient`.
- `frontend/src/services/patientService.ts` — add `sendEmailVerification(id)`, `confirmEmailVerification(token)`.
- Also extend `enrich_prescriptions()`/`PrescriptionListItem` (Phase 2 files) to surface `email_verified`/`phone_verified` from the already-loaded patient data, so the Prescription Dashboard's badge doesn't need a second lookup.
- Rollout sites (add the badge next to the patient name):
  1. Patient registration form — header/edit mode (also where the Send-Verification button lives; note a brand-new patient has no ID until first save, so this can only appear once the record exists).
  2. Patient list — Name column.
  3. Prescription Dashboard — Patient Name cell (Phase 2's newly-clickable name).
  4. OPD Assignment — typeahead dropdown rows and the Phase 1 confirm dialog header.
  5. Patient detail page — header name area.
  6. Walk-in queue's patient detail modal header.
  - Final sweep before calling this done: search the frontend for every place a patient's name is rendered, to catch any other site not listed above.

### 3d. Phone/OTP — build now, real vendor deferred

- New `backend/app/services/sms_provider.py` — an abstract SMS-sending interface with a default log-only implementation (mirrors how `send_email()` already degrades gracefully when SMTP isn't configured — warns and returns false, never crashes). Everything else — schema, OTP generation/hashing/expiry/attempts, staff UI, audit logging — is fully buildable and testable today; only the concrete vendor adapter (Twilio/MSG91/etc.) waits on you supplying a provider and credentials.
- `backend/app/config.py` — add SMS provider/API key/secret/sender-ID settings, mirroring the existing SMTP settings block; leaving the provider unset means log-only mode.
- `verification_service.py` — `send_phone_otp`: daily-limit check, invalidate prior unused OTPs, generate a 6-digit code, hash it, 10-minute expiry (within the BRD's 5-10 minute window), send via the SMS interface. `verify_phone_otp`: look up the latest unused+unexpired OTP, increment attempt count on mismatch (capped), mark used and flip `phone_verified` on match.
- `backend/app/routers/patients.py` — `POST /patients/{id}/send-otp`, `POST /patients/{id}/verify-otp` (both staff-authenticated — staff reads the OTP off the patient's phone and types it into the desk UI).
- Frontend: the same Send-OTP → cooldown → Enter-OTP → Verify pattern on the registration form and the OPD Assignment new-patient modal, next to the phone field.

---

## Explicitly out of scope

- Doctor scheduling/appointment booking, pharmacy inventory, and full billing/invoice generation logic (BRD §6 — out of scope by the client's own document).
- A coded "Reason for Visit" dropdown — kept as free text, matching the existing convention used everywhere else in the app; a coded system would be a much larger, unrelated change to patient intake.
- Virtual scrolling — pagination already satisfies the BRD's requirement, and no virtualization precedent exists anywhere in this codebase.
- Blocking OPD assignment for unverified patients — confirmed flag-only.
- Choosing/integrating a specific SMS vendor — scaffolded behind a swappable interface; the actual adapter is blocked on a vendor decision and credentials.

## Verification plan

- Backend: compile and import checks after every phase.
- Frontend: type-check clean after every phase.
- **Phase 1:** search an existing patient in OPD Assignment → confirm dialog shows correct age/allergies/last-visit → Confirm proceeds to doctor/urgency selection → Cancel returns to search with nothing assigned; confirm an audit log entry is created for the assignment.
- **Phase 2:** open the Prescription Dashboard → confirm Reason for Visit, medicine list, and Billed Tablets populate correctly for a dispensed prescription; click every column header and confirm sort order changes; filter by doctor and date range; click a patient name and confirm it lands on patient detail.
- **Phase 3:** register a patient, send email verification, click the emailed link → status flips to verified; edit the email afterward → status resets; confirm the checkmark only appears once phone is *also* verified (test OTP in log-only mode by reading the code from the backend log, since no real SMS vendor is wired up yet); confirm the checkmark renders identically across every rollout site.
