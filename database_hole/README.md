# HMS Database — Setup & Run Guide

Complete step-by-step guide to install, configure, and run the Hospital Management System database.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install PostgreSQL](#2-install-postgresql)
3. [Create the Database](#3-create-the-database)
4. [Run the Schema](#4-run-the-schema)
5. [Load Seed Data](#5-load-seed-data)
6. [Verify Installation](#6-verify-installation)
7. [Test Queries](#7-test-queries)
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
# Connect to PostgreSQL
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

-- Exit psql
\q
```

> **Windows note:** If `en_US.UTF-8` fails, use `'English_United States.1252'` or omit the locale options.

---

## 4. Run the Schema

Navigate to the `database/` directory and execute the schema file:

### Option A: Using psql directly

```powershell
# From the project root
cd database

# Run schema (connect as hms_user)
psql -U hms_user -d hms_db -f 01_schema.sql
```

### Option B: Using psql with host/port

```powershell
psql -h localhost -p 5432 -U hms_user -d hms_db -f 01_schema.sql
```

### Option C: From inside psql

```sql
\c hms_db hms_user
\i 01_schema.sql
```

**Expected output:** You should see a series of:
```
CREATE EXTENSION
CREATE TABLE
ALTER TABLE
CREATE INDEX
CREATE FUNCTION
```

No `ERROR` lines should appear.

---

## 5. Load Seed Data

After the schema is created successfully:

```powershell
psql -U hms_user -d hms_db -f 02_seed_data.sql
```

**Expected output:**
```
INSERT 0 3
INSERT 0 3
INSERT 0 10
...
```

---

## 6. Verify Installation

Connect to the database and run these verification queries:

```powershell
psql -U hms_user -d hms_db
```

### 6.1 Check all tables were created

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

**Expected:** 60+ tables listed.

### 6.2 Count rows in key tables

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
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
ORDER BY tbl;
```

**Expected counts:**

| Table         | Rows |
|---------------|------|
| hospitals     | 3    |
| departments   | 10   |
| users         | 10   |
| roles         | 9    |
| permissions   | 37   |
| patients      | 5    |
| doctors       | 3    |
| appointments  | 5    |
| medicines     | 10   |
| invoices      | 3    |

### 6.3 Verify indexes

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### 6.4 Verify helper functions

```sql
-- Test checksum calculation
SELECT hms_calculate_checksum('HCM262') AS checksum;

-- Test ID generation
SELECT hms_generate_id(
    'a0000000-0000-0000-0000-000000000001',
    'HC', 'patient', 'M', '26', '2'
) AS generated_id;
```

---

## 7. Test Queries

Use queries from `03_queries.sql` to verify operations. Here are some quick tests:

### 7.1 Login lookup

```sql
SELECT u.id, u.email, u.first_name, u.last_name, ARRAY_AGG(r.name) AS roles
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN roles r ON r.id = ur.role_id
WHERE u.email = 'admin@hmscore.com' AND u.is_deleted = false
GROUP BY u.id;
```

### 7.2 Patient search

```sql
SELECT patient_reference_number, first_name, last_name, phone_number
FROM patients
WHERE first_name ILIKE '%john%' AND is_deleted = false;
```

### 7.3 Today's appointment summary

```sql
SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled
FROM appointments
WHERE hospital_id = 'a0000000-0000-0000-0000-000000000001'
  AND appointment_date = CURRENT_DATE;
```

### 7.4 Medicine stock check

```sql
SELECT m.name, m.generic_name,
       COALESCE(SUM(mb.current_quantity), 0) AS stock
FROM medicines m
LEFT JOIN medicine_batches mb ON mb.medicine_id = m.id AND mb.is_active = true
GROUP BY m.id
ORDER BY stock ASC;
```

### 7.5 Dashboard numbers

```sql
SELECT
    (SELECT COUNT(*) FROM patients WHERE is_deleted = false) AS total_patients,
    (SELECT COUNT(*) FROM doctors WHERE is_active = true AND is_deleted = false) AS active_doctors,
    (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURRENT_DATE AND is_deleted = false) AS today_appointments,
    (SELECT COALESCE(SUM(paid_amount), 0) FROM invoices WHERE invoice_date = CURRENT_DATE AND is_deleted = false) AS today_revenue;
```

---

## 8. Connection String

Use this connection string in your application:

```
postgresql://hms_user:HMS@2026@localhost:5432/hms_db
```

### Environment variable format (.env)

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hms_db
DB_USER=hms_user
DB_PASSWORD=HMS@2026
DB_SSL=false

# Full URL
DATABASE_URL=postgresql://hms_user:HMS@2026@localhost:5432/hms_db
```

---

## 9. File Reference

| File               | Purpose                                           |
|--------------------|----------------------------------------------------|
| `01_schema.sql`    | All tables, indexes, constraints, helper functions |
| `02_seed_data.sql` | Realistic sample data for development & testing    |
| `03_queries.sql`   | CRUD operations & common query reference           |
| `README.md`        | This setup guide                                   |

### Schema highlights

- **62+ tables** organized across 5 phases (Foundation → Core → Clinical → Billing → Support)
- **UUID primary keys** via `pgcrypto` extension
- **Soft deletes** (`is_deleted` + `deleted_at`) on all major entities
- **Audit columns** (`created_by`, `updated_by`, `created_at`, `updated_at`)
- **12-digit ID system** with checksum validation (PL/pgSQL functions)
- **Deferred foreign keys** for 3 circular dependencies
- **25+ performance indexes** with partial index support

---

## 10. Troubleshooting

### "permission denied to create extension"

The `pgcrypto` extension requires superuser privileges. Either:

```sql
-- Connect as postgres superuser
\c hms_db postgres
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
\c hms_db hms_user
-- Then re-run 01_schema.sql (it will skip the CREATE EXTENSION)
```

Or grant createdb rights:

```sql
ALTER USER hms_user WITH SUPERUSER;
-- Run schema, then revoke:
ALTER USER hms_user WITH NOSUPERUSER;
```

### "locale not found" on Windows

Replace the `CREATE DATABASE` command with:

```sql
CREATE DATABASE hms_db OWNER = hms_user ENCODING = 'UTF8';
```

### "relation already exists"

The schema uses `CREATE TABLE` (not `IF NOT EXISTS`). To re-run from scratch:

```sql
-- WARNING: This drops ALL data!
DROP DATABASE IF EXISTS hms_db;
CREATE DATABASE hms_db OWNER = hms_user ENCODING = 'UTF8';
```

### Foreign key violations in seed data

Make sure you run `01_schema.sql` **before** `02_seed_data.sql`. The seed data relies on the exact table structure and deferred foreign keys.

### psql command not found

Add PostgreSQL's `bin` directory to your PATH:

- **Windows:** `C:\Program Files\PostgreSQL\16\bin`
- **macOS (brew):** `/opt/homebrew/opt/postgresql@16/bin`
- **Linux:** Usually at `/usr/lib/postgresql/16/bin`

---

## Quick Start (TL;DR)

```powershell
# 1. Create database (as postgres superuser)
psql -U postgres -c "CREATE USER hms_user WITH PASSWORD 'HMS@2026';"
psql -U postgres -c "CREATE DATABASE hms_db OWNER hms_user;"

# 2. Run schema
psql -U hms_user -d hms_db -f database/01_schema.sql

# 3. Load sample data
psql -U hms_user -d hms_db -f database/02_seed_data.sql

# 4. Verify
psql -U hms_user -d hms_db -c "SELECT COUNT(*) FROM users;"
# Expected: 10
```

---

*HMS Project — PostgreSQL 15+*
