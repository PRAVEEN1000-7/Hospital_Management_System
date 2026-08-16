# HMS Database — Setup & Run Guide

Complete step-by-step guide to install, configure, and run the Hospital Management System database.

**This is a multi-tenant platform with no bundled demo/sample data.** A fresh
database gets: the schema, real platform infrastructure (module registry,
RBAC config, your production lab test catalog), and exactly one Super Admin
login. You create real hospitals through the app itself after logging in —
nothing here inserts a fictional hospital, patient, or staff account.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install PostgreSQL](#2-install-postgresql)
3. [Create the Database](#3-create-the-database)
4. [Run the Schema](#4-run-the-schema)
5. [Eye Hospital? Apply the Feature Pack](#5-eye-hospital-apply-the-feature-pack)
6. [Seed Platform Essentials + Super Admin Login](#6-seed-platform-essentials--super-admin-login)
7. [Verify Installation](#7-verify-installation)
8. [Connection String](#8-connection-string)
9. [File Reference](#9-file-reference)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

| Requirement    | Minimum Version | Notes                              |
|----------------|-----------------|------------------------------------|
| PostgreSQL     | 15+             | Uses `gen_random_uuid()`, `pgcrypto` |
| psql CLI       | Bundled         | Comes with PostgreSQL              |
| Disk space     | ~200 MB         | For DB + indexes                   |
| RAM            | 2 GB+           | Recommended for development        |

---

## 2. Install PostgreSQL

### Windows

1. Download from [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
2. Run the installer (use **Stack Builder** or **EDB installer**)
3. Set a password for the `postgres` superuser (remember it!)
4. Keep default port **5432**
5. Add `C:\Program Files\PostgreSQL\16\bin` to your **PATH** environment variable

Verify:

```powershell
psql --version
```

### macOS

```bash
brew install postgresql@16
brew services start postgresql@16
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

## 3. Create the Database

Open a terminal and connect as the `postgres` superuser:

### Windows (PowerShell)

```powershell
psql -U postgres
# You'll be prompted for the password you set during installation
```

### macOS / Linux

```bash
sudo -u postgres psql
```

Once connected to `psql`:

```sql
-- Create a dedicated user for the HMS application
CREATE USER hms_user WITH PASSWORD '<STRONG_PASSWORD>';

-- Create the database
CREATE DATABASE hms_db
    OWNER = hms_user
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE = template0;

GRANT ALL PRIVILEGES ON DATABASE hms_db TO hms_user;
\q
```

> **Windows note:** If `en_US.UTF-8` fails, use `'English_United States.1252'` or omit the locale options.

---

## 4. Run the Schema

This is the **base structure every hospital needs** — core HMS tables (public schema), the multi-tenant `saas_core` schema, RLS/security, inventory adjustments, common medicines, Optical Store batch tracking, and access-token revocation. It is a single consolidated file; run it once on a fresh database.

```powershell
cd database_hole
psql -U hms_user -d hms_db -f 01_full_schema.sql
```

**Expected output:** a long series of `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE` / `INSERT` lines, no `ERROR`.

This file is **not** safe to re-run against a database that already has the schema — most of its `CREATE TABLE` statements don't use `IF NOT EXISTS` (only 7 of 72 do), since it's meant to run once against a truly empty database. If you need to re-apply just its seed data (module registry, subscription plans, system settings) against an existing database, use `deploy/flush_and_reseed_database.py` instead (§6) — it reproduces that data idempotently without re-running the schema DDL.

---

## 5. Eye Hospital? Apply the Feature Pack

If (and only if) the hospital being set up is an **eye hospital** (or multi-specialty), additionally run:

```powershell
psql -U hms_user -d hms_db -f 02_eye_hospital_updates.sql
```

This adds the BRD v1.1 eye-hospital feature pack on top of the base structure: hospital specialty classification, Patient History block, Prescription dual-letterhead/Opthal fields, Pharmacy/Optical billing queue columns, Queue Display customization settings, the prescription-triggered Pharmacy Queue, and the Eye Hospital Drug Prescription `eye_side` marker.

It's purely additive and gated at the application layer by `hospitals.specialty` (`backend/app/core/tenant_security.py::is_eye_hospital_feature_enabled`) — running it on a general hospital's database is harmless (the columns/tables just stay unused), so applying it to every database up front is fine if you'd rather not track which hospitals need it.

---

## 6. Seed Platform Essentials + Super Admin Login

Run the remaining schema/reference migrations, then seed exactly what's needed to log in — no demo data, no fictional hospitals.

```powershell
cd database_hole
psql -U hms_user -d hms_db -f 05_schema_structure.sql
psql -U hms_user -d hms_db -f 07_queue_display_screens.sql
psql -U hms_user -d hms_db -f 08_role_permission_overrides.sql
psql -U hms_user -d hms_db -f 09_grn_edit_and_opd_assignment.sql
psql -U hms_user -d hms_db -f 10_lab_test_templates_batch2.sql
psql -U hms_user -d hms_db -f 11_lab_technician_role.sql
psql -U hms_user -d hms_db -f 12_lab_test_templates_batch3.sql
psql -U hms_user -d hms_db -f 13_lab_test_fasting_blood_sugar.sql
psql -U hms_user -d hms_db -f 14_optional_doctor_id.sql
psql -U hms_user -d hms_db -f 15_clinical_note_ngrams.sql
psql -U hms_user -d hms_db -f 16_ngram_field_type_and_medicine_columns.sql
psql -U hms_user -d hms_db -f 2026-08-09_medicine_bulk_upload_fields.sql

cd ../backend
python ../deploy/flush_and_reseed_database.py --confirm FLUSH \
    --superadmin-username superadmin_hms \
    --superadmin-email superadmin@mecandria.com \
    --superadmin-password 'Superadmin@123'
```

That script does two things at once, safely, even on a database that already
has data in it: it wipes any existing rows (schema untouched — see its own
docstring for the exact `TRUNCATE` behavior), then seeds:

- The core module registry, system settings, and module dependencies (the
  real infrastructure `01_full_schema.sql` carries — reproduced idempotently
  rather than re-running that file, per §4)
- The 14 system roles (admin, doctor, pharmacist, etc.)
- One invisible placeholder "Platform" hospital/tenant — not a real
  hospital, exists only because a Super Admin's `hospital_id` column can't
  be null; never shown anywhere in the UI
- Exactly **one** Super Admin login (the credentials you pass above)

It prints a verification at the end confirming the database has exactly one
user. Log in with that Super Admin account and create your first real
hospital through the UI — the client's hospital admin then builds out their
own staff/patients/data from there.

**If you only want to seed without flushing** (e.g. a fresh database you
already know is empty), the same script does both — there's no separate
"seed-only" file; it's idempotent either way (see its docstring).

---

## 7. Verify Installation

```powershell
psql -U hms_user -d hms_db
```

### 7.1 Check all tables were created

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

**Expected:** 65+ tables listed (more if `02_eye_hospital_updates.sql` was also applied, since it adds `pharmacy_queue_entries`).

### 7.2 Confirm exactly one user exists

```sql
SELECT u.username, u.email, r.name AS role
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE u.is_deleted = false;
```

**Expected:** exactly one row — your Super Admin. `deploy/flush_and_reseed_database.py` prints this same check automatically at the end of its run.

### 7.3 Verify the multi-tenant link

```sql
SELECT h.name, h.code, h.specialty, h.tenant_id, t.status
FROM hospitals h
LEFT JOIN saas_core.tenants t ON t.id = h.tenant_id;
```

Every hospital should have a non-null `tenant_id` with a matching active tenant. Right after seeding, the only row here will be the invisible `Platform (System Account Holder)` placeholder (`is_system = true`) — that's expected, not a bug.

---

## 8. Connection String

```
postgresql://hms_user:<STRONG_PASSWORD>@localhost:5432/hms_db
```

```env
DATABASE_URL=postgresql://hms_user:<STRONG_PASSWORD>@localhost:5432/hms_db
SECRET_KEY=<python -c "import secrets; print(secrets.token_hex(32))">
DEBUG=false
```

---

## 9. File Reference

| File | Purpose | Run against production? |
|------|---------|--------------------------|
| `01_full_schema.sql` | Complete base structure — every hospital needs this. Core HMS schema, multi-tenant `saas_core`, RLS/security, inventory adjustments, common medicines, Optical Store batches, token revocation, and (Section 8) Workforce Management — Attendance, Holidays, Shifts, Payroll, Allowances/Incentives/Advance Payments. Also carries the real seed data for `saas_core.modules`/`subscription_plans`/`system_settings` — see §6 for how that's re-applied without re-running this whole file. | ✅ Yes, once |
| `02_eye_hospital_updates.sql` | BRD v1.1 eye-hospital feature pack — additive, gated by `hospitals.specialty`. | ✅ Yes, for eye/multi-specialty hospitals (harmless on others) |
| `05_schema_structure.sql` | All post-base-schema DDL, grouped into 7 numbered sections: appointments/queue/doctor settings, patient verification, pharmacy/optical integrity, billing refund link, laboratory module, auth global uniqueness, inventory PO payments. Schema only — no seed rows. | ✅ Yes |
| `07_queue_display_screens.sql` | BRD-005 — multi-screen Queue Display config (`queue_display_screens` table). Purely additive alongside the existing single-config `hospital_settings.queue_display_*` columns and `/public/queue/:hospitalCode` URL, which are untouched. | ✅ Yes |
| `08_role_permission_overrides.sql` | Roles & Permissions admin UI — `hospital_permission_overrides` table. Sparse per-hospital deltas on top of the static role/permission matrix (`backend/app/core/module_roles.py`); a hospital admin can now customize which roles see/edit each area from Hospital Settings, without a code deploy. | ✅ Yes |
| `09_grn_edit_and_opd_assignment.sql` | BRD 29-Jul-2026 — `appointment_queue.opd_assigned_at` (Walk-in Queue "OPD Assigned" tracking) + `grn_items.discrepancy_notes` (GRN item batch-correction extension). Both purely additive. | ✅ Yes |
| `10_lab_test_templates_batch2.sql` | Lab Test Catalog — 10 additional `lab_tests` rows (Lipid Profile, Prolactin, Iron Studies, HLA B27, Vitamin D3 & Calcium, Urine Culture & Sensitivity, standalone Blood Group & Rh Typing, Dengue Fever Profile, Peripheral Smear, general Microscopy), sourced from a client-supplied report workbook. Data only. | ✅ Yes |
| `11_lab_technician_role.sql` | Seeds the missing `lab_technician` system role row (`roles` table) — the Lab module's routes/RBAC/staff-creation dropdown all referenced this role by name since it was built, but the actual row was never seeded, so creating a "Lab Technician" staff member silently attached no role at all. Data only. | ✅ Yes |
| `12_lab_test_templates_batch3.sql` | Lab Test Catalog — 3 additional `lab_tests` rows (Blood Sugar (RBS), Hormonal Profile [FSH/LH/Prolactin/Testosterone], MUSK Antibody), sourced from two more client-supplied report specs. Data only. | ✅ Yes |
| `13_lab_test_fasting_blood_sugar.sql` | Lab Test Catalog — 1 additional `lab_tests` row (Blood Sugar (FBS), 80-120 mg/dl — distinct from the RBS test in `12`). Data only. | ✅ Yes |
| `14_optional_doctor_id.sql` | Drops `NOT NULL` on `prescriptions.doctor_id`, `lab_orders.doctor_id`, and `optical_prescriptions.doctor_id` — lets the pharmacist/lab-technician/optical-staff walk-in create flows leave a record's doctor unattributed instead of forcing a dropdown pick. Schema only. | ✅ Yes |
| `15_clinical_note_ngrams.sql` | Clinical Notes autocomplete — `clinical_note_ngrams` table, a per-hospital statistical (non-AI) n-gram model powering an inline "ghost text" suggestion on the prescription Clinical Notes field. Schema only — populate via `python ../deploy/seed_ngram_model.py` (bootstrap from existing finalized notes); it's then kept current automatically as new prescriptions are finalized. | ✅ Yes |
| `16_ngram_field_type_and_medicine_columns.sql` | Extends the autocomplete model to 9 more fields (Diagnosis, Advice, Optical Prescription Notes, Pharmacy/Optical Sale Notes, Medicine Description/Drug Interaction Notes/Side Effects, Stock Adjustment Reason) — adds `clinical_note_ngrams.field_type` so each field keeps its own suggestion pool. Also adds `medicines.drug_interaction_notes`/`medicines.side_effects` (pre-existing bug fix — the Medicine Form UI had these fields but no DB column, so they were silently discarded). | ✅ Yes |
| `2026-08-09_medicine_bulk_upload_fields.sql` | Adds `medicines.brand`/`dosage_form`/`schedule_type`/`rack_location`/`drug_interaction_notes`/`side_effects` and `medicine_batches.supplier_id` — the single Add Medicine form, bulk-upload Excel template, and Medicine Detail page's batch table all already sent/displayed these fields, but the tables had no columns for them, so `_filter_model_data` silently dropped every one of them on every create/update. Schema only. | ✅ Yes |
| `2026-08-13_general_billing_module.sql` | Registers the "General Billing" module (`saas_core.modules` row, `required_modules='{"billing"}'`) — a free-form billing screen for miscellaneous charges, usable by receptionist. No new tables: invoices are plain `Invoice`/`InvoiceItem` rows with `invoice_type='general'`. Data only. Same pattern as the `attendance` module (added post-`01_full_schema.sql`, not backported into `deploy/flush_and_reseed_database.py`'s hardcoded module list). | ✅ Yes |
| `2026-08-14_lab_test_panels.sql` | Adds `lab_test_panels` — named bundles of existing `lab_tests` catalog rows (e.g. "MHC — Master Health Checkup") a doctor can pick as one unit from the Prescription Builder, expanding into every member test on the order. `test_ids` is a plain `UUID[]` array (no FK — same tradeoff as `subscription_plans.modules_included`). Schema only. | ✅ Yes |
| `workforce_attendance_module_combined.sql` | **Not needed on a fresh install** — `01_full_schema.sql` Section 8 already has this. Only for patching a database that was bootstrapped from an older copy of `01_full_schema.sql`, before Section 8 was added to it: a verbatim, transaction-wrapped, standalone-runnable copy of Section 8 (Workforce Management) plus the `password_reset_tokens` block from Section 7. Not part of `../deploy/flush_and_reseed_database.py`'s replay list — run manually, once, against an existing database that needs it. | ⚠️ Only if patching a pre-Section-8 database |
| `security_token_revocation_combined.sql` | **Not needed on a fresh install** — `01_full_schema.sql` Section 7 already has this. Only for patching a database bootstrapped before Section 7 was added: `revoked_tokens` (the access-token blocklist) + its indexes + the `refresh_tokens` performance indexes + the `v_revoked_tokens_expired` housekeeping view. Missing this table means logout/password-change/account-deactivation silently fail to invalidate the user's still-valid JWT (app fails open and logs CRITICAL, rather than 500ing every request) — a real security gap, not just a cosmetic error. Replaces the standalone `security_updates.sql` referenced in old log messages, which no longer exists as its own file. | ⚠️ Only if seeing "revoked_tokens table is missing" in the logs |
| `99_drop_database.sql` | **Destructive.** Terminates connections, drops `hms_db` and the `hms_user` role entirely. Only for a clean local re-deploy. Run as the `postgres` superuser, never inside `hms_db`. | ❌ No |
| `../deploy/flush_and_reseed_database.py` | **Destructive** (wipes all data, keeps schema) **+ seeds** platform essentials + one Super Admin in the same run. The actual "get a working, login-ready database" step for production — see §6. | ✅ Yes (the intended way to seed production) |

### Files that used to be here and were deliberately deleted

This was originally a single-tenant application; these files were the
pre-multi-tenant/dev-testing artifacts left over from that era and from
ongoing development. None of them belong in a client-facing production
database, so they were removed rather than just excluded from the setup
steps above:

- **`03_seed_data.sql`** — fictional demo hospitals ("HMS Core Hospital", "HMS Apollo Branch", etc.), demo users, and sample inventory data. Dev/demo only, never meant for production, and explicitly said so in its own header.
- **`04_reference_queries.sql`** — a categorized cheat sheet of example SQL queries for developers, referencing `03`'s demo data by hardcoded ID (e.g. `WHERE username = 'doctor1'`). Never executed by any deployment step; became meaningless once `03` was removed.
- **`06_seed_reference_data.sql`** — the *original* 18-test lab catalog, default PO payment modes, and the `visiting_doctor` role, all dev/testing-era seed data. The one genuinely load-bearing row it carried — the `lab` module registration (what makes "Laboratory" appear in the per-hospital module toggle UI at all) — was preserved by moving that single `INSERT` into `deploy/flush_and_reseed_database.py`'s `seed_core_platform_data()` before deleting the file, so nothing functional was lost.
- **`10_add_attendance_module.sql` through `26_add_advance_payments.sql`** (17 files — the Workforce Management feature's incremental development history: Attendance, Employee/HR fields, Holidays, Shift Management + history, Payroll, Allowances, Incentives, Password Reset Tokens, Paid Leave Policy, Advance Payments). Unlike the other removals above, these were never dev-only — they described a real, currently-live feature. They were deleted because their end state was, at some point, folded into `01_full_schema.sql` as Section 8 (plus the `password_reset_tokens` block in Section 7), making the 17 files pure duplicates: the schema they describe already ships with every fresh install via `01_full_schema.sql`, with nothing left to run separately. `workforce_attendance_module_combined.sql` (above) is the one thing extracted back out of that consolidation — a standalone-safe copy of just Section 8, for the one case `01_full_schema.sql` itself can't cover: patching a database that already existed before Section 8 was added to it.

Your real, production lab test catalog is `10`-`13` — sourced from actual client report templates, not dev placeholders — and is unaffected by any of the above.

---

### Schema highlights

- **65+ tables** across core HMS, multi-tenant SaaS core, and the eye-hospital pack
- **UUID primary keys** via `pgcrypto`
- **Soft deletes** (`is_deleted` + `deleted_at`) on all major entities
- **Audit columns** (`created_by`, `updated_by`, `created_at`, `updated_at`)
- **12-digit ID system** with checksum validation (PL/pgSQL functions, in `01_full_schema.sql` Section 1)
- **Row-Level Security** on patients/appointments/prescriptions/invoices (Section 3) — the table owner (`hms_user`) bypasses RLS; the application enforces tenant isolation at the query layer via `hospital_id`
- **Multi-tenant module gating** via `saas_core.tenant_modules` — what unlocks the eye-hospital pack at the UI/API layer is `hospitals.specialty`, set by `02_eye_hospital_updates.sql`

---

## 10. Troubleshooting

### "permission denied to create extension"

The `pgcrypto` extension requires superuser privileges.

```sql
\c hms_db postgres
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
\c hms_db hms_user
-- Then re-run 01_full_schema.sql (it will skip the CREATE EXTENSION)
```

Or temporarily:

```sql
ALTER USER hms_user WITH SUPERUSER;
-- Run schema, then revoke:
ALTER USER hms_user WITH NOSUPERUSER;
```

### "locale not found" on Windows

```sql
CREATE DATABASE hms_db OWNER = hms_user ENCODING = 'UTF8';
```

### Need to start over completely

```powershell
psql -U postgres -f 99_drop_database.sql
psql -U postgres -c "CREATE USER hms_user WITH PASSWORD '<STRONG_PASSWORD>';"
psql -U postgres -c "CREATE DATABASE hms_db OWNER hms_user;"
psql -U hms_user -d hms_db -f 01_full_schema.sql
```

### psql command not found

Add PostgreSQL's `bin` directory to your PATH:

- **Windows:** `C:\Program Files\PostgreSQL\16\bin`
- **macOS (brew):** `/opt/homebrew/opt/postgresql@16/bin`
- **Linux:** Usually at `/usr/lib/postgresql/16/bin`

---

## Quick Start (TL;DR)

```powershell
# 1. Create database + role (as postgres superuser)
psql -U postgres -c "CREATE USER hms_user WITH PASSWORD '<STRONG_PASSWORD>';"
psql -U postgres -c "CREATE DATABASE hms_db OWNER hms_user;"

# 2. Base structure (every hospital)
psql -U hms_user -d hms_db -f database_hole/01_full_schema.sql

# 3. Eye hospital? Apply the feature pack too
psql -U hms_user -d hms_db -f database_hole/02_eye_hospital_updates.sql

# 4. Remaining schema/reference migrations — run in order, each safe to re-run
psql -U hms_user -d hms_db -f database_hole/05_schema_structure.sql
psql -U hms_user -d hms_db -f database_hole/07_queue_display_screens.sql
psql -U hms_user -d hms_db -f database_hole/08_role_permission_overrides.sql
psql -U hms_user -d hms_db -f database_hole/09_grn_edit_and_opd_assignment.sql
psql -U hms_user -d hms_db -f database_hole/10_lab_test_templates_batch2.sql
psql -U hms_user -d hms_db -f database_hole/11_lab_technician_role.sql
psql -U hms_user -d hms_db -f database_hole/12_lab_test_templates_batch3.sql
psql -U hms_user -d hms_db -f database_hole/13_lab_test_fasting_blood_sugar.sql
psql -U hms_user -d hms_db -f database_hole/14_optional_doctor_id.sql
psql -U hms_user -d hms_db -f database_hole/15_clinical_note_ngrams.sql
psql -U hms_user -d hms_db -f database_hole/16_ngram_field_type_and_medicine_columns.sql
psql -U hms_user -d hms_db -f database_hole/2026-08-09_medicine_bulk_upload_fields.sql
psql -U hms_user -d hms_db -f database_hole/2026-08-12_appointment_followup_label.sql
psql -U hms_user -d hms_db -f database_hole/2026-08-12_gst_purchase_order.sql
psql -U hms_user -d hms_db -f database_hole/2026-08-13_general_billing_module.sql
psql -U hms_user -d hms_db -f database_hole/2026-08-14_lab_test_panels.sql
psql -U hms_user -d hms_db -f database_hole/2026-08-15_medicine_batch_mrp_column.sql

# 5. Seed platform essentials (module registry, RBAC, roles) + one Super Admin login
cd backend
python ../deploy/flush_and_reseed_database.py --confirm FLUSH \
    --superadmin-username superadmin_hms \
    --superadmin-email superadmin@mecandria.com \
    --superadmin-password 'Superadmin@123'

# 6. Verify — should show exactly one row: the invisible Platform placeholder
psql -U hms_user -d hms_db -c "SELECT name, specialty, tenant_id FROM hospitals;"
```

No demo hospitals, no sample patients, no test staff accounts. Log in as the
Super Admin above and create your first real hospital through the UI.

---

*HMS Project — PostgreSQL 15+*
