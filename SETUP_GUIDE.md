# Setup Guide

Step-by-step instructions to get the Hospital Management System running on your local machine.

---

## Prerequisites

Install the following before proceeding:

| Software | Version | Download |
|----------|---------|----------|
| PostgreSQL | 15 or higher | https://www.postgresql.org/download/windows/ |
| Python | 3.11 or higher | https://www.python.org/downloads/ |
| Node.js | 20 or higher | https://nodejs.org/ |

> **Tip:** During PostgreSQL installation, note down the superuser password you set. You'll need it to create the application database.

> **Tip:** During Python installation, check **"Add Python to PATH"**.

---

## Step 1 — Create the Database

Open **pgAdmin** or a terminal with `psql` access.

### Using psql

```sql
-- Connect as the PostgreSQL superuser
psql -U postgres

-- Create the application user
CREATE USER hospital_admin WITH PASSWORD '<YOUR_DB_PASSWORD>';

-- Create the database
CREATE DATABASE hospital_management;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE hospital_management TO hospital_admin;

-- Connect to the new database
\c hospital_management

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO hospital_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hospital_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hospital_admin;

-- Enable required extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Exit psql
\q
```

### Run Schema & Migration Scripts

Open **PowerShell** and run:

```powershell
cd d:\HMS\v1\database

# Set password for non-interactive execution
$env:PGPASSWORD = "<YOUR_DB_PASSWORD>"

# Schema scripts (run in order)
psql -h localhost -U hospital_admin -d hospital_management -f scripts\001_create_schema.sql
psql -h localhost -U hospital_admin -d hospital_management -f scripts\002_migrate_patient_fields.sql
psql -h localhost -U hospital_admin -d hospital_management -f scripts\003_global_and_user_mgmt.sql
psql -h localhost -U hospital_admin -d hospital_management -f scripts\004_create_hospital_details.sql

# Migration scripts (run in order)
psql -h localhost -U hospital_admin -d hospital_management -f migrations\001_add_user_profile_fields.sql
psql -h localhost -U hospital_admin -d hospital_management -f migrations\002_add_employee_sequences_and_indexes.sql
psql -h localhost -U hospital_admin -d hospital_management -f migrations\003_backfill_employee_ids.sql
psql -h localhost -U hospital_admin -d hospital_management -f migrations\004_migrate_to_new_id_format.sql

# Seed initial data
psql -h localhost -U hospital_admin -d hospital_management -f seeds\seed_data.sql
```

> **Note:** If `psql` is not recognized, add PostgreSQL's `bin` directory to your system PATH (e.g., `C:\Program Files\PostgreSQL\15\bin`).

---

## Step 2 — Set Up the Backend

### Create a Virtual Environment

```powershell
cd d:\HMS\v1\backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### Install Dependencies

```powershell
pip install -r requirements.txt
```

### Configure Environment Variables

Copy the example file and update it:

```powershell
Copy-Item .env.example .env
```

Edit `backend\.env` with your actual values:

```env
# Application
APP_NAME=Hospital Management System
APP_VERSION=1.0.0
DEBUG=True

# Database
DATABASE_URL=postgresql://hospital_admin:<YOUR_DB_PASSWORD>@localhost:5432/hospital_management
DB_ECHO=False

# Security
SECRET_KEY=<generate-with-python-secrets-token_hex-32>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS
CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173"]

# Pagination
DEFAULT_PAGE_SIZE=10
MAX_PAGE_SIZE=100

# PRN (Patient Reference Number)
PRN_PREFIX=HMS
```

> **Important:** The `@` in the database password must be URL-encoded as `%40` in `DATABASE_URL`.

> Generate a strong secret key: `python -c "import secrets; print(secrets.token_hex(32))"`

### Start the Backend Server

```powershell
uvicorn app.main:app --reload --port 8000
```

You should see:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

Verify by opening http://localhost:8000/docs in your browser.

---

## Step 3 — Set Up the Frontend

Open a **new PowerShell window** (keep the backend running).

### Install Dependencies

```powershell
cd d:\HMS\v1\frontend
npm install
```

### Configure Environment Variables

Create `frontend\.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

### Start the Development Server

```powershell
npm run dev
```

You should see:

```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

---

## Step 4 — First-Time Login

1. Open http://localhost:5173 in your browser
2. Log in with the default superadmin credentials:
   - **Username:** `superadmin`
   - **Password:** (set during database seed — see `seeds/seed_data.sql`)
3. Complete the **Hospital Setup** wizard (3 steps)
4. **Change the default password** from the profile settings

---

## Troubleshooting

### Port Already in Use

```powershell
# Find process using port 8000
netstat -ano | findstr :8000

# Kill it (replace PID with actual number)
taskkill /PID <PID> /F
```

### psql Not Recognized

Add PostgreSQL to your PATH:

```powershell
$env:PATH += ";C:\Program Files\PostgreSQL\15\bin"
```

Or add it permanently via **System Properties → Environment Variables → Path**.

### Module Not Found (Backend)

Make sure the virtual environment is activated:

```powershell
cd d:\HMS\v1\backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### CORS Errors in Browser

Ensure `CORS_ORIGINS` in `backend\.env` includes your frontend URL:

```env
CORS_ORIGINS=["http://localhost:5173"]
```

### Database Connection Refused

1. Check PostgreSQL service is running:
   ```powershell
   Get-Service postgresql*
   ```
2. If stopped, start it:
   ```powershell
   Start-Service postgresql-x64-15
   ```
3. Verify connection:
   ```powershell
   psql -h localhost -U hospital_admin -d hospital_management -c "SELECT 1;"
   ```

### Permission Denied on Database Objects

If you see "permission denied for table/sequence" errors:

```sql
\c hospital_management
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hospital_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hospital_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hospital_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hospital_admin;
```

---

## Useful Commands

| Command | Purpose |
|---------|---------|
| `uvicorn app.main:app --reload` | Start backend with hot reload |
| `npm run dev` | Start frontend dev server |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build |
| `pip freeze` | List installed Python packages |

---

<p align="center">
  <sub>For the main project documentation, see <a href="README.md">README.md</a></sub>
</p>
