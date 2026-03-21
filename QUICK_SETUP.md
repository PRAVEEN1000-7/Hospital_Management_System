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

### Load Schema & Seed Data

```bash
psql -U hms_user -d hms_db -f database_hole/01_schema.sql
psql -U hms_user -d hms_db -f database_hole/02_seed_data.sql
```

### Optional: Enforce OPD On-Spot Payment

If OPD payment must be completed before invoice issue:

```sql
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS allow_opd_credit BOOLEAN DEFAULT true;
UPDATE hospital_settings
SET allow_opd_credit = false
WHERE hospital_id = 'a0000000-0000-0000-0000-000000000001';
```

Behavior when disabled:
- OPD due date auto-matches invoice date.
- OPD invoice issue is blocked until full payment is recorded.

### Connection String

```
postgresql://hms_user:HMS%402026@localhost:5432/hms_db
```

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

```bash
psql -U hms_user -d hms_db -f database_hole/02_seed_data.sql
```

### Drop everything & start fresh

```sql
-- As postgres superuser:
DROP DATABASE IF EXISTS hms_db;
CREATE DATABASE hms_db OWNER hms_user;

-- Then re-run schema + seed:
-- psql -U hms_user -d hms_db -f database_hole/01_schema.sql
-- psql -U hms_user -d hms_db -f database_hole/02_seed_data.sql
```
