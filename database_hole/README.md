# HMS Database — Complete Setup & Reference Guide

> **PostgreSQL 15+ · 65+ Tables · Inventory Module · 12-Digit ID System**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Installation](#3-installation)
4. [Database Setup](#4-database-setup)
5. [SQL Files Execution Order](#5-sql-files-execution-order)
6. [Verification](#6-verification)
7. [Connection Strings](#7-connection-strings)
8. [Database Architecture](#8-database-architecture)
9. [Key Features](#9-key-features)
10. [Useful Commands](#10-useful-commands)
11. [Troubleshooting](#11-troubleshooting)
12. [File Reference](#12-file-reference)

---

## 1. Overview

The HMS database is a comprehensive PostgreSQL schema designed for multi-hospital management systems. It includes:

- **65+ tables** organized across 5 phases (Foundation → Core → Clinical → Billing → Inventory)
- **Complete RBAC** (Role-Based Access Control) with users, roles, and permissions
- **12-digit HMS ID system** with checksum validation for patients and staff
- **Inventory module** with products, stock tracking, purchase orders, and GRN
- **Soft deletes** and audit logging on all major entities
- **Multi-tenancy** support via `hospital_id` foreign keys

---

## 2. Prerequisites

| Requirement    | Minimum Version | Notes                              |
|----------------|-----------------|------------------------------------|
| PostgreSQL     | 15+             | Uses `gen_random_uuid()`, `pgcrypto` |
| psql CLI       | Bundled         | Comes with PostgreSQL              |
| Disk space     | ~250 MB         | For DB + indexes + sample data     |
| RAM            | 2 GB+           | Recommended for development        |

---

## 3. Installation

### Windows

1. Download from [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
2. Run the installer (Stack Builder or EDB installer)
3. Set a password for the `postgres` superuser (remember it!)
4. Keep default port **5432**
5. Add PostgreSQL `bin` to PATH: `C:\Program Files\PostgreSQL\15\bin`

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

## 4. Database Setup

### 4.1 — Create User & Database

Open a terminal and connect as the `postgres` superuser:

**Windows (PowerShell):**
```powershell
psql -U postgres
```

**Linux/macOS:**
```bash
sudo -u postgres psql
```

Run the following SQL commands:

```sql
-- Create the application database user
CREATE USER hms_user WITH PASSWORD 'HMS@2026';

-- Create the database
CREATE DATABASE hms_db
    OWNER = hms_user
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE = template0;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE hms_db TO hms_user;

-- Connect to the new database
\c hms_db hms_user

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO hms_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hms_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hms_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hms_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hms_user;

-- Enable required extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Exit psql
\q
```

> **Windows note:** If `en_US.UTF-8` fails, use `'English_United States.1252'` or omit the locale options.

### 4.2 — Run SQL Files in Order

Navigate to the `database_hole/` folder and execute the SQL files **in this exact order**:

**Windows (PowerShell):**
```powershell
# Set password for non-interactive execution
$env:PGPASSWORD = "HMS@2026"

# 1. Base schema (62 tables)
psql -h localhost -U hms_user -d hms_db -f 01_schema.sql

# 2. Base seed data (hospitals, departments, users, roles)
psql -h localhost -U hms_user -d hms_db -f 02_seed_data.sql

# 3. Inventory alterations (products, stock tables, views)
psql -h localhost -U hms_user -d hms_db -f 04_inventory_alteration.sql

# 4. Inventory seed data (products, purchase orders, stock movements)
psql -h localhost -U hms_user -d hms_db -f 05_inventory_seeding.sql
```

**Linux:**
```bash
export PGPASSWORD="HMS@2026"

psql -h localhost -U hms_user -d hms_db -f 01_schema.sql
psql -h localhost -U hms_user -d hms_db -f 02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f 04_inventory_alteration.sql
psql -h localhost -U hms_user -d hms_db -f 05_inventory_seeding.sql
```

> **Note:** `03_queries.sql` contains reference queries only — it does **NOT** need to be executed.

---

## 5. SQL Files Execution Order

| Order | File | Purpose | Tables Created |
|-------|------|---------|----------------|
| 1 | `01_schema.sql` | Base schema | 62 tables (Foundation → Support) |
| 2 | `02_seed_data.sql` | Base seed data | Hospitals, departments, users, roles, patients, doctors, appointments |
| 3 | `04_inventory_alteration.sql` | Inventory schema | `products`, `stock_summary`, `stock_alerts` + views |
| 4 | `05_inventory_seeding.sql` | Inventory seed | 52 products, stock levels, purchase orders, GRNs, stock movements |

**Total after setup:** 65 tables + 8 views + sample data

---

## 6. Verification

### 6.1 — Check Table Count

```powershell
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';"
```

**Expected:** 65+ tables

### 6.2 — Count Rows in Key Tables

```sql
SELECT 'hospitals' AS tbl, COUNT(*) FROM hospitals
UNION ALL SELECT 'departments', COUNT(*) FROM departments
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'roles', COUNT(*) FROM roles
UNION ALL SELECT 'permissions', COUNT(*) FROM permissions
UNION ALL SELECT 'patients', COUNT(*) FROM patients
UNION ALL SELECT 'doctors', COUNT(*) FROM doctors
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments
UNION ALL SELECT 'medicines', COUNT(*) FROM medicines
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'purchase_orders', COUNT(*) FROM purchase_orders
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
ORDER BY tbl;
```

**Expected counts:**

| Table | Rows |
|-------|------|
| hospitals | 3 |
| departments | 10 |
| users | 10 |
| roles | 9 |
| permissions | 37 |
| patients | 5 |
| doctors | 3 |
| appointments | 5 |
| medicines | 10 |
| products | 52 |
| suppliers | 3 |
| purchase_orders | 5 |
| invoices | 3 |

### 6.3 — Verify Helper Functions

```sql
-- Test checksum calculation
SELECT hms_calculate_checksum('HCM262') AS checksum;

-- Test ID generation
SELECT hms_generate_id(
    'a0000000-0000-0000-0000-000000000001',
    'HC', 'patient', 'M', '26', '2'
) AS generated_id;
```

### 6.4 — Verify Inventory Views

```sql
-- Test inventory dashboard view
SELECT * FROM v_complete_inventory_dashboard;

-- Test low stock products view
SELECT * FROM v_low_stock_products LIMIT 5;

-- Test expiring products view
SELECT * FROM v_expiring_products LIMIT 5;
```

---

## 7. Connection Strings

### Application Connection String

```
postgresql://hms_user:HMS%402026@localhost:5432/hms_db
```

> **Important:** The `@` in `HMS@2026` must be URL-encoded as `%40`

### Environment Variable Format (.env)

```env
# Individual components
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hms_db
DB_USER=hms_user
DB_PASSWORD=HMS@2026
DB_SSL=false

# Full URL (remember to encode @ as %40)
DATABASE_URL=postgresql://hms_user:HMS%402026@localhost:5432/hms_db
```

### Backend (Python SQLAlchemy)

```python
# backend/app/core/config.py
DATABASE_URL = "postgresql://hms_user:HMS%402026@localhost:5432/hms_db"
```

### Frontend (No direct DB access — uses API)

```env
# frontend/.env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

---

## 8. Database Architecture

### 8.1 — Layered Schema Design

```
┌─────────────────────────────────────────────────────────┐
│                    PHASE 0: FOUNDATION                   │
│  hospitals, departments, users, roles, permissions      │
│  hospital_settings, tax_configurations                  │
├─────────────────────────────────────────────────────────┤
│                    PHASE 1: CORE                         │
│  patients, doctors, appointments, doctor_schedules      │
│  id_cards, id_sequences, audit_logs                     │
├─────────────────────────────────────────────────────────┤
│                    PHASE 2: CLINICAL                     │
│  prescriptions, prescription_items, medicines           │
│  medicine_batches, pharmacy_dispensing, lab_orders      │
├─────────────────────────────────────────────────────────┤
│                    PHASE 3: BILLING                      │
│  invoices, invoice_items, payments, refunds             │
│  daily_settlements, credit_notes                        │
├─────────────────────────────────────────────────────────┤
│                    PHASE 4: INVENTORY                    │
│  products, stock_summary, stock_alerts                  │
│  suppliers, purchase_orders, grn_items                  │
│  stock_movements, stock_adjustments, cycle_counts       │
├─────────────────────────────────────────────────────────┤
│                    PHASE 5: SUPPORT                      │
│  optical_products, optical_orders, optical_repairs      │
│  insurance_policies, insurance_claims                   │
│  notifications, notification_queue                      │
└─────────────────────────────────────────────────────────┘
```

### 8.2 — Entity Relationship Highlights

```
hospitals (1) ── (N) users
hospitals (1) ── (N) departments
hospitals (1) ── (N) patients
hospitals (1) ── (N) doctors
hospitals (1) ── (N) appointments
hospitals (1) ── (N) invoices
hospitals (1) ── (N) products
hospitals (1) ── (N) purchase_orders

users (N) ── (N) roles  [via user_roles]
roles (N) ── (N) permissions  [via role_permissions]

doctors (1) ── (N) appointments
patients (1) ── (N) appointments
patients (1) ── (N) prescriptions
patients (1) ── (N) invoices

products (1) ── (N) stock_summary
products (1) ── (N) stock_movements
suppliers (1) ── (N) purchase_orders
purchase_orders (1) ── (N) purchase_order_items
```

---

## 9. Key Features

### 9.1 — 12-Digit HMS ID System

All patients and staff receive auto-generated 12-character reference numbers:

**Format:** `[HH][G][YY][M][C][#####]`

| Segment | Len | Description |
|---------|-----|-------------|
| HH | 2 | Hospital code (HC, HA, HM...) |
| G | 1 | Gender (M/F/O/N/U) |
| YY | 2 | Registration year (last 2 digits) |
| M | 1 | Month (1-9, A=Oct, B=Nov, C=Dec) |
| C | 1 | Checksum (validation character) |
| ##### | 5 | Auto-increment sequence |

**Example:** `HCF265GP000148` = HMS Core Hospital, Female, 2026 May, General Practice, sequence 000148

### 9.2 — Soft Deletes

All major tables use soft deletes:
- `is_deleted BOOLEAN DEFAULT false`
- `deleted_at TIMESTAMPTZ`
- Queries must filter: `WHERE is_deleted = false`

### 9.3 — Audit Logging

Every CUD (Create/Update/Delete) operation is logged:
- `audit_logs` table tracks all changes
- Records: old_values, new_values, user_id, ip_address, timestamp

### 9.4 — Inventory Module

**New tables (Phase 4):**
- `products` — Central product catalog (52 sample products)
- `stock_summary` — Real-time stock levels per product
- `stock_alerts` — Low stock and expiry alerts
- `suppliers` — Vendor management with product categories
- `purchase_orders` — Purchase order management
- `purchase_order_items` — PO line items
- `goods_receipt_notes` — GRN for received goods
- `grn_items` — GRN line items with batch/expiry
- `stock_movements` — Complete stock audit trail
- `stock_adjustments` — Manual stock corrections
- `cycle_counts` — Periodic physical counts
- `cycle_count_items` — Count line items with variances

**Views for reporting:**
- `v_purchase_orders_with_products`
- `v_grns_with_products`
- `v_stock_movements_with_products`
- `v_adjustments_with_products`
- `v_cycle_counts_with_products`
- `v_low_stock_products`
- `v_expiring_products`
- `v_complete_inventory_dashboard`

### 9.5 — Multi-Tenancy

All operational tables include `hospital_id UUID` foreign key:
- Data isolation per hospital
- Hospital-specific configurations
- Shared master data (roles, permissions)

---

## 10. Useful Commands

### Connect to Database

**Windows:**
```powershell
psql -h localhost -U hms_user -d hms_db
```

**Linux:**
```bash
psql -h localhost -U hms_user -d hms_db
```

### List All Tables

```sql
\dt
```

### Describe a Table

```sql
\d users
\d products
\d purchase_orders
```

### Count Tables

```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
```

### View All Functions

```sql
\df
```

### View All Indexes

```sql
SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public';
```

### Truncate All Data (Keep Schema)

```sql
-- WARNING: Deletes ALL data!
TRUNCATE TABLE
    waitlists, password_emails, id_cards, id_sequences, audit_logs,
    notification_queue, notification_templates, notifications,
    cycle_count_items, cycle_counts, stock_adjustments, stock_movements,
    grn_items, goods_receipt_notes, purchase_order_items, purchase_orders, suppliers,
    optical_repairs, optical_order_items, optical_orders,
    pharmacy_return_items, pharmacy_returns, pharmacy_dispensing_items,
    medicine_batches, pharmacy_dispensing,
    pre_authorizations, insurance_claims, insurance_policies, insurance_providers,
    daily_settlements, credit_notes, refunds, payments, invoice_items, invoices,
    optical_prescriptions, optical_products, lab_orders,
    prescription_versions, prescription_templates, prescription_items, prescriptions, medicines,
    appointment_queue, appointment_status_log, appointments,
    doctor_fees, doctor_leaves, doctor_schedules, doctors,
    patient_documents, patient_consents, patients, refresh_tokens, role_permissions, user_roles
CASCADE;
```

### Re-seed After Truncate

```powershell
$env:PGPASSWORD = "HMS@2026"
psql -h localhost -U hms_user -d hms_db -f 02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f 05_inventory_seeding.sql
```

### Full Reset (Drop & Recreate)

**Windows:**
```powershell
psql -U postgres -c "DROP DATABASE IF EXISTS hms_db;"
psql -U postgres -c "DROP USER IF EXISTS hms_user;"
psql -U postgres -c "CREATE USER hms_user WITH PASSWORD 'HMS@2026';"
psql -U postgres -c "CREATE DATABASE hms_db OWNER hms_user;"
psql -U postgres -d hms_db -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql -U postgres -d hms_db -c "GRANT ALL ON SCHEMA public TO hms_user;"
psql -U postgres -d hms_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hms_user;"
psql -U postgres -d hms_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hms_user;"

$env:PGPASSWORD = "HMS@2026"
psql -h localhost -U hms_user -d hms_db -f 01_schema.sql
psql -h localhost -U hms_user -d hms_db -f 02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f 04_inventory_alteration.sql
psql -h localhost -U hms_user -d hms_db -f 05_inventory_seeding.sql
```

**Linux:**
```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS hms_db;"
sudo -u postgres psql -c "DROP USER IF EXISTS hms_user;"
sudo -u postgres psql -c "CREATE USER hms_user WITH PASSWORD 'HMS@2026';"
sudo -u postgres psql -c "CREATE DATABASE hms_db OWNER hms_user;"
sudo -u postgres psql -d hms_db -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
sudo -u postgres psql -d hms_db -c "GRANT ALL ON SCHEMA public TO hms_user;"
sudo -u postgres psql -d hms_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hms_user;"
sudo -u postgres psql -d hms_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hms_user;"

export PGPASSWORD="HMS@2026"
psql -h localhost -U hms_user -d hms_db -f 01_schema.sql
psql -h localhost -U hms_user -d hms_db -f 02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f 04_inventory_alteration.sql
psql -h localhost -U hms_user -d hms_db -f 05_inventory_seeding.sql
```

---

## 11. Troubleshooting

### "permission denied to create extension"

The `pgcrypto` extension requires superuser privileges:

```sql
-- Connect as postgres superuser
\c hms_db postgres
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
\c hms_db hms_user
```

### "locale not found" on Windows

Replace the `CREATE DATABASE` command with:

```sql
CREATE DATABASE hms_db OWNER = hms_user ENCODING = 'UTF8';
```

### "relation already exists"

The schema uses `CREATE TABLE IF NOT EXISTS`. To re-run from scratch:

```sql
-- WARNING: This drops ALL data!
DROP DATABASE IF EXISTS hms_db;
CREATE DATABASE hms_db OWNER = hms_user ENCODING = 'UTF8';
```

### Foreign key violations in seed data

Ensure you run files in the correct order:
1. `01_schema.sql` (creates tables)
2. `02_seed_data.sql` (inserts base data)
3. `04_inventory_alteration.sql` (adds inventory tables)
4. `05_inventory_seeding.sql` (inserts inventory data)

### psql command not found

Add PostgreSQL's `bin` directory to your PATH:

**Windows:**
```powershell
# Temporary (current session only)
$env:PATH += ";C:\Program Files\PostgreSQL\15\bin"

# Permanent: System Properties → Environment Variables → Path → Add the path
```

**Linux:**
```bash
export PATH="/usr/lib/postgresql/15/bin:$PATH"
```

### "peer authentication failed" (Linux)

Edit `pg_hba.conf`:

```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

Change:
```
local   all   all   peer
```
To:
```
local   all   all   md5
```

Then restart:
```bash
sudo systemctl restart postgresql
```

### Inventory views not found

Ensure you ran `04_inventory_alteration.sql` before querying views:

```powershell
psql -h localhost -U hms_user -d hms_db -f 04_inventory_alteration.sql
```

---

## 12. File Reference

| File | Purpose | Lines | Tables |
|------|---------|-------|--------|
| `01_schema.sql` | Base schema (62 tables) | ~2500 | 62 |
| `02_seed_data.sql` | Base seed data | ~800 | Sample data for 10+ tables |
| `03_queries.sql` | Reference queries (DO NOT RUN) | ~500 | — |
| `04_inventory_alteration.sql` | Inventory schema alterations | ~600 | 3 new + 8 views |
| `05_inventory_seeding.sql` | Inventory seed data | ~900 | 52 products + workflow data |
| `99_drop_database.sql` | Cleanup/drop script | ~50 | — |
| `README.md` | This guide | — | — |

### Schema Highlights

- **65+ tables** across 5 phases
- **8 materialized views** for inventory reporting
- **UUID primary keys** via `pgcrypto`
- **Soft deletes** (`is_deleted` + `deleted_at`)
- **Audit columns** (`created_by`, `updated_by`, `created_at`, `updated_at`)
- **12-digit ID system** with checksum validation (PL/pgSQL functions)
- **Deferred foreign keys** for circular dependencies
- **50+ performance indexes** with partial index support
- **Triggers** for GRN segregation of duties

---

## Quick Start (TL;DR)

```powershell
# 1. Create database and user
psql -U postgres -c "CREATE USER hms_user WITH PASSWORD 'HMS@2026';"
psql -U postgres -c "CREATE DATABASE hms_db OWNER hms_user;"

# 2. Set password for non-interactive execution
$env:PGPASSWORD = "HMS@2026"

# 3. Run all SQL files in order
psql -h localhost -U hms_user -d hms_db -f 01_schema.sql
psql -h localhost -U hms_user -d hms_db -f 02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f 04_inventory_alteration.sql
psql -h localhost -U hms_user -d hms_db -f 05_inventory_seeding.sql

# 4. Verify
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM users;"
# Expected: 10

psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM products;"
# Expected: 52
```

---

**HMS Database Team · PostgreSQL 15+ · Last Updated: March 2026**
