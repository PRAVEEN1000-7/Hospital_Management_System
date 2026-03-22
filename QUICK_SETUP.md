# Quick Setup Guide

## Prerequisites

- **Node.js** ≥ 18 + npm
- **Python** 3.11+
- **PostgreSQL** 15+

---

## 1. Database

### Create DB & User

```sql
-- Connect as postgres superuser
CREATE USER hms_user WITH PASSWORD 'HMS@2026';
CREATE DATABASE hms_db OWNER hms_user;
GRANT ALL PRIVILEGES ON DATABASE hms_db TO hms_user;

-- Connect to hms_db, then:
GRANT ALL ON SCHEMA public TO hms_user;
```

### Load Schema & Seed Data (Complete Setup with Inventory Module)

> **Updated:** The database now includes the Inventory Module with products, stock tracking, and purchase orders.

**Windows (PowerShell):**
```powershell
# Set password for non-interactive execution
$env:PGPASSWORD = "HMS@2026"

# Run all SQL files in order
psql -h localhost -U hms_user -d hms_db -f database_hole/01_schema.sql
psql -h localhost -U hms_user -d hms_db -f 02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f 04_inventory_alteration.sql
psql -h localhost -U hms_user -d hms_db -f 05_inventory_seeding.sql

# Verify setup
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM users;"          # Expected: 10
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM products;"       # Expected: 52
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM purchase_orders;" # Expected: 5
```

**Linux:**
```bash
export PGPASSWORD="HMS@2026"

psql -h localhost -U hms_user -d hms_db -f database_hole/01_schema.sql
psql -h localhost -U hms_user -d hms_db -f 02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f 04_inventory_alteration.sql
psql -h localhost -U hms_user -d hms_db -f 05_inventory_seeding.sql

# Verify setup
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM users;"          # Expected: 10
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM products;"       # Expected: 52
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM purchase_orders;" # Expected: 5
```

### Connection String

```
postgresql://hms_user:HMS%402026@localhost:5432/hms_db
```

> **Note:** The `@` in the password must be URL-encoded as `%40`

---

## 2. Backend (FastAPI — port 8000)

```bash
cd backend
python -m venv venv

# Activate venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs at: `http://localhost:8000/docs`

---

## 3. Frontend (React + Vite — port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open: `http://localhost:3000`

---

## 4. Default Logins

| Role         | Username     | Password         |
|--------------|-------------|------------------|
| Super Admin  | superadmin  | superadmin@123   |
| Admin        | admin       | admin@123        |
| Doctor 1     | doctor1     | doctor@123       |
| Doctor 2     | doctor2     | doctor@123       |

---

## 5. Database Cleanup

### Delete all data (keep tables)

```sql
-- Connect to hms_db as hms_user or postgres
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;
```

### Re-seed after truncate

**Windows:**
```powershell
$env:PGPASSWORD = "HMS@2026"
psql -h localhost -U hms_user -d hms_db -f database_hole/02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f 06_inventory_seeding.sql
```

**Linux:**
```bash
export PGPASSWORD="HMS@2026"
psql -h localhost -U hms_user -d hms_db -f database_hole/02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f 06_inventory_seeding.sql
```

### Drop everything & start fresh

```sql
-- As postgres superuser:
DROP DATABASE IF EXISTS hms_db;
CREATE DATABASE hms_db OWNER hms_user;

-- Then re-run complete setup:
-- Windows: $env:PGPASSWORD = "HMS@2026"
-- Linux: export PGPASSWORD="HMS@2026"
-- psql -h localhost -U hms_user -d hms_db -f database_hole/01_schema.sql
-- psql -h localhost -U hms_user -d hms_db -f 02_seed_data.sql
-- psql -h localhost -U hms_user -d hms_db -f 05_inventory_alteration.sql
-- psql -h localhost -U hms_user -d hms_db -f 06_inventory_seeding.sql
```

---

## 6. Quick Verification Commands

**Check table count (expect 65+):**
```powershell
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
```

**Check key data counts:**
```sql
SELECT 'users' AS table_name, COUNT(*) FROM users
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'purchase_orders', COUNT(*) FROM purchase_orders;
```

Expected:
- users: 10
- products: 52
- suppliers: 3
- purchase_orders: 5

---

> For detailed database setup instructions, see [`database_hole/README.md`](database_hole/README.md)
