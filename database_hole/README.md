# HMS Database — Setup & Run Guide

Complete step-by-step guide to install, configure, and run the Hospital Management System database.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install PostgreSQL](#2-install-postgresql)
3. [Create the Database](#3-create-the-database)
4. [Run the Schema](#4-run-the-schema)
5. [Eye Hospital? Apply the Feature Pack](#5-eye-hospital-apply-the-feature-pack)
6. [Load Seed Data (optional, dev only)](#6-load-seed-data-optional-dev-only)
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

Idempotent — uses `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` throughout, so it's safe to re-run.

---

## 5. Eye Hospital? Apply the Feature Pack

If (and only if) the hospital being set up is an **eye hospital** (or multi-specialty), additionally run:

```powershell
psql -U hms_user -d hms_db -f 02_eye_hospital_updates.sql
```

This adds the BRD v1.1 eye-hospital feature pack on top of the base structure: hospital specialty classification, Patient History block, Prescription dual-letterhead/Opthal fields, Pharmacy/Optical billing queue columns, Queue Display customization settings, the prescription-triggered Pharmacy Queue, and the Eye Hospital Drug Prescription `eye_side` marker.

It's purely additive and gated at the application layer by `hospitals.specialty` (`backend/app/core/tenant_security.py::is_eye_hospital_feature_enabled`) — running it on a general hospital's database is harmless (the columns/tables just stay unused), so applying it to every database up front is fine if you'd rather not track which hospitals need it.

---

## 6. Load Seed Data (optional, dev only)

**Do not run this against a real hospital's production database.** It inserts fictional hospitals ("HMS Core Hospital", "HMS Apollo Branch", etc.), demo users, and sample inventory data — useful only for local development/demos.

```powershell
psql -U hms_user -d hms_db -f 03_seed_data.sql
```

**Expected output:** a series of `INSERT 0 N` lines.

For a real deployment, skip this and onboard the first hospital/admin through the application itself.

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

### 7.2 Count rows in key tables (only meaningful if seed data was loaded)

```sql
SELECT 'hospitals' AS tbl, COUNT(*) FROM hospitals
UNION ALL SELECT 'departments', COUNT(*) FROM departments
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'patients', COUNT(*) FROM patients
UNION ALL SELECT 'doctors', COUNT(*) FROM doctors
UNION ALL SELECT 'medicines', COUNT(*) FROM medicines
ORDER BY tbl;
```

### 7.3 Verify the multi-tenant link

```sql
SELECT h.name, h.code, h.specialty, h.tenant_id, t.status
FROM hospitals h
LEFT JOIN saas_core.tenants t ON t.id = h.tenant_id;
```

Every hospital should have a non-null `tenant_id` with a matching active tenant.

### 7.4 Test queries

Use `04_reference_queries.sql` for a categorized library of common CRUD/operational queries (login lookup, patient search, stock checks, dashboard numbers, etc.) — reference only, never executed during deployment.

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
| `01_full_schema.sql` | Complete base structure — every hospital needs this. Core HMS schema, multi-tenant `saas_core`, RLS/security, inventory adjustments, common medicines, Optical Store batches, token revocation. | ✅ Yes, once |
| `02_eye_hospital_updates.sql` | BRD v1.1 eye-hospital feature pack — additive, gated by `hospitals.specialty`. | ✅ Yes, for eye/multi-specialty hospitals (harmless on others) |
| `03_seed_data.sql` | Fictional sample hospitals/users/inventory for dev & demo only. | ❌ No |
| `04_reference_queries.sql` | Categorized library of common queries — documentation only, never executed. | ❌ No (reference only) |
| `05_schema_structure.sql` | All post-base-schema DDL, grouped into 7 numbered sections: appointments/queue/doctor settings, patient verification, pharmacy/optical integrity, billing refund link, laboratory module, auth global uniqueness, inventory PO payments. Schema only — no seed rows. | ✅ Yes |
| `06_seed_reference_data.sql` | All production-safe seed/reference data for the tables `05` creates: optical opening-batch backfill, lab module registration + 18-test standard catalog, default PO payment modes, the `visiting_doctor` role. Run **after** `05`. | ✅ Yes |
| `07_queue_display_screens.sql` | BRD-005 — multi-screen Queue Display config (`queue_display_screens` table). Purely additive alongside the existing single-config `hospital_settings.queue_display_*` columns and `/public/queue/:hospitalCode` URL, which are untouched. | ✅ Yes |
| `08_role_permission_overrides.sql` | Roles & Permissions admin UI — `hospital_permission_overrides` table. Sparse per-hospital deltas on top of the static role/permission matrix (`backend/app/core/module_roles.py`); a hospital admin can now customize which roles see/edit each area from Hospital Settings, without a code deploy. | ✅ Yes |
| `09_grn_edit_and_opd_assignment.sql` | BRD 29-Jul-2026 — `appointment_queue.opd_assigned_at` (Walk-in Queue "OPD Assigned" tracking) + `grn_items.discrepancy_notes` (GRN item batch-correction extension). Both purely additive. | ✅ Yes |
| `10_lab_test_templates_batch2.sql` | Lab Test Catalog — 10 additional `lab_tests` rows (Lipid Profile, Prolactin, Iron Studies, HLA B27, Vitamin D3 & Calcium, Urine Culture & Sensitivity, standalone Blood Group & Rh Typing, Dengue Fever Profile, Peripheral Smear, general Microscopy), sourced from a client-supplied report workbook. Data only — reuses the existing `report_template` mechanism from `06`. | ✅ Yes |
| `99_drop_database.sql` | **Destructive.** Terminates connections, drops `hms_db` and the `hms_user` role entirely. Only for a clean local re-deploy. Run as the `postgres` superuser, never inside `hms_db`. | ❌ No |

`05` and `06` are each idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING` / guarded
`ALTER`/`ADD CONSTRAINT`) and safe to run in that order after `01`-`03`, including re-running
against a database that already has one or both applied. Every section inside them is clearly
banner-commented (`-- N. SECTION NAME --`) with the same "why" reasoning the original per-feature
files carried, so nothing was lost by consolidating — see the header comment of each file for a
full section index.

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

# 4. Dev/demo only — sample data
psql -U hms_user -d hms_db -f database_hole/03_seed_data.sql

# 5. Feature/fix schema + seed data — run in order, each is safe to re-run
psql -U hms_user -d hms_db -f database_hole/05_schema_structure.sql
psql -U hms_user -d hms_db -f database_hole/06_seed_reference_data.sql
psql -U hms_user -d hms_db -f database_hole/07_queue_display_screens.sql
psql -U hms_user -d hms_db -f database_hole/08_role_permission_overrides.sql
psql -U hms_user -d hms_db -f database_hole/09_grn_edit_and_opd_assignment.sql
psql -U hms_user -d hms_db -f database_hole/10_lab_test_templates_batch2.sql

# 6. Verify
psql -U hms_user -d hms_db -c "SELECT name, specialty, tenant_id FROM hospitals;"
```

---

*HMS Project — PostgreSQL 15+*
