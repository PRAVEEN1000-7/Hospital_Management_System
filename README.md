# HMS — Setup Guide

Complete step-by-step instructions to get the Hospital Management System running on a fresh machine.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Clone the Repository](#step-1--clone-the-repository)
3. [Create the Database](#step-2--create-the-database)
4. [Set Up the Backend](#step-3--set-up-the-backend)
5. [Set Up the Frontend](#step-4--set-up-the-frontend)
6. [First-Time Login](#step-5--first-time-login)
7. [Default Credentials](#default-credentials)
8. [Useful Commands](#useful-commands)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Install the following before proceeding:

| Software   | Version    | Download                                                 |
| ---------- | ---------- | -------------------------------------------------------- |
| PostgreSQL | 15 or higher | https://www.postgresql.org/download/                   |
| Python     | 3.11 or higher | https://www.python.org/downloads/                    |
| Node.js    | 20 or higher   | https://nodejs.org/                                  |
| Git        | Any recent     | https://git-scm.com/downloads                        |

> **Windows tips:**
>
> - During PostgreSQL install, note the **superuser password** you set.
> - During Python install, check **"Add Python to PATH"**.
> - After PostgreSQL install, add its `bin` folder to PATH (e.g. `C:\Program Files\PostgreSQL\15\bin`) so `psql` works from any terminal.

---

## Step 1 — Clone the Repository

```powershell
git clone <REPO_URL>
cd HMS/v1
```

Replace `<REPO_URL>` with your GitHub repository URL.

---

## Step 2 — Create the Database

### 2.1 — Create User & Database

Open **PowerShell** (or any terminal) and connect to PostgreSQL as the superuser:

```powershell
psql -U postgres
```

Run the following SQL commands:

```sql
-- Create the application database user
CREATE USER hms_user WITH PASSWORD 'HMS@2026';

-- Create the database
CREATE DATABASE hms_db;

-- Grant full access
GRANT ALL PRIVILEGES ON DATABASE hms_db TO hms_user;

-- Connect to the new database
\c hms_db

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

### 2.2 — Run Schema & Seed Scripts

The SQL files are located in the `database_hole/` folder. Run them **in order**:

```powershell
# Set password for non-interactive execution
$env:PGPASSWORD = "HMS@2026"

# 1. Create all tables (62 tables)
psql -h localhost -U hms_user -d hms_db -f database_hole/01_schema.sql

# 2. Seed initial data (hospitals, departments, roles, users, sample patients)
psql -h localhost -U hms_user -d hms_db -f database_hole/02_seed_data.sql

# 3. Create waitlist table
psql -h localhost -U hms_user -d hms_db -f database_hole/04_waitlist_table.sql
```

> **Note:** `03_queries.sql` contains reference queries only — it does NOT need to be executed.

### 2.3 — Verify the Setup

```powershell
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';"
```

You should see **63 tables** (62 from schema + 1 waitlist).

---

## Step 3 — Set Up the Backend

### 3.1 — Create a Virtual Environment

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```

> On macOS/Linux: `source venv/bin/activate`

### 3.2 — Install Dependencies

```powershell
pip install -r requirements.txt
```

### 3.3 — Configure Environment Variables

```powershell
Copy-Item .env.example .env
```

Open `backend\.env` and update these values:

```env
# Application
APP_NAME=Hospital Management System
APP_VERSION=1.0.0
DEBUG=True

# Database  (@ in password must be encoded as %40)
DATABASE_URL=postgresql://hms_user:HMS%402026@localhost:5432/hms_db
DB_ECHO=False

# Security  (generate a unique key — see command below)
SECRET_KEY=<YOUR_SECRET_KEY>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS  (must include the frontend URL)
CORS_ORIGINS=["http://localhost:3000"]

# Pagination
DEFAULT_PAGE_SIZE=10
MAX_PAGE_SIZE=100

# PRN  (Patient Reference Number prefix)
PRN_PREFIX=HMS
```

Generate a strong secret key:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

> **Important:** The `@` in `HMS@2026` must be URL-encoded as `%40` in the `DATABASE_URL`.

### 3.4 — Create the Uploads Folder

The backend stores patient photos and other uploads here:

```powershell
mkdir uploads
```

### 3.5 — Start the Backend Server

```powershell
uvicorn app.main:app --reload --port 8000
```

You should see:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

**Verify:** Open http://localhost:8000/docs — you should see the Swagger API documentation.

---

## Step 4 — Set Up the Frontend

Open a **new terminal** (keep the backend running).

### 4.1 — Install Dependencies

```powershell
cd frontend
npm install
```

### 4.2 — Configure Environment Variables

```powershell
Copy-Item .env.example .env
```

The default `.env` should contain:

```env
VITE_API_BASE_URL=http://localhost:8000
```

> This is the backend server URL. The frontend proxies `/api` requests to it via Vite's dev server.

### 4.3 — Start the Development Server

```powershell
npm run dev
```

You should see:

```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
```

**Open** http://localhost:3000 in your browser.

---

## Step 5 — First-Time Login

1. Open http://localhost:3000
2. Log in with the **superadmin** credentials (see below)
3. Complete the **Hospital Setup** wizard (hospital name, address, settings)
4. You can now create users, register patients, manage appointments, etc.

---

## Default Credentials

All seed users share the same password. Change them after first login.

| Role          | Username        | Password     |
| ------------- | --------------- | ------------ |
| Super Admin   | `superadmin`    | `Admin@123`  |
| Admin         | `admin1`        | `Admin@123`  |
| Doctor        | `drsmith`       | `Admin@123`  |
| Doctor        | `drjohnson`     | `Admin@123`  |
| Nurse         | `nursewilson`   | `Admin@123`  |
| Receptionist  | `reception1`    | `Admin@123`  |
| Pharmacist    | `pharma1`       | `Admin@123`  |
| Cashier       | `cashier1`      | `Admin@123`  |

> **Security:** All non-superadmin users have `must_change_password = true` and will be prompted to change their password on first login.

---

## Useful Commands

### Backend

| Command                                 | Purpose                        |
| --------------------------------------- | ------------------------------ |
| `.\venv\Scripts\Activate.ps1`           | Activate virtual environment   |
| `uvicorn app.main:app --reload`         | Start backend (hot reload)     |
| `pip install -r requirements.txt`       | Install/update dependencies    |
| `pip freeze`                            | List installed packages        |

### Frontend

| Command           | Purpose                        |
| ----------------- | ------------------------------ |
| `npm run dev`     | Start dev server (port 3000)   |
| `npm run build`   | Build for production           |
| `npm run preview` | Preview production build       |
| `npm run lint`    | Run ESLint                     |

### Database

| Command                                                                  | Purpose              |
| ------------------------------------------------------------------------ | -------------------- |
| `psql -h localhost -U hms_user -d hms_db`                                | Connect to database  |
| `psql -U hms_user -d hms_db -c "\dt"`                                    | List all tables      |
| `psql -U hms_user -d hms_db -c "SELECT count(*) FROM users;"`            | Count users          |

---

## Troubleshooting

### `psql` is not recognized

Add PostgreSQL's `bin` directory to your system PATH:

```powershell
# Temporary (current session only)
$env:PATH += ";C:\Program Files\PostgreSQL\15\bin"

# Permanent: System Properties → Environment Variables → Path → Add the above path
```

### Port already in use

```powershell
# Find process using port 8000
netstat -ano | findstr :8000

# Kill it (replace <PID> with actual number)
taskkill /PID <PID> /F
```

### Database connection refused

1. Check PostgreSQL is running:
   ```powershell
   Get-Service postgresql*
   ```
2. Start it if stopped:
   ```powershell
   Start-Service postgresql-x64-15
   ```

### CORS errors in browser

Ensure `CORS_ORIGINS` in `backend\.env` includes your frontend URL:

```env
CORS_ORIGINS=["http://localhost:3000"]
```

### Module not found (backend)

Make sure the virtual environment is activated:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Permission denied on database objects

```sql
\c hms_db
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hms_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hms_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hms_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hms_user;
```

### Frontend build errors after `git pull`

```powershell
cd frontend
rm -r node_modules
npm install
```

---

## Project Structure

```
HMS/v1/
├── backend/                  # FastAPI backend
│   ├── app/
│   │   ├── config.py         # Settings (reads .env)
│   │   ├── main.py           # App entry point
│   │   ├── models/           # SQLAlchemy models
│   │   ├── routers/          # API route handlers
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   └── services/         # Business logic
│   ├── uploads/              # User-uploaded files (gitignored)
│   ├── requirements.txt      # Python dependencies
│   └── .env.example          # Environment template
│
├── frontend/                 # React + TypeScript frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Page-level components
│   │   ├── services/         # API service modules
│   │   ├── types/            # TypeScript type definitions
│   │   ├── contexts/         # React contexts (Auth, Toast)
│   │   ├── App.tsx           # Router & route definitions
│   │   └── main.tsx          # Entry point
│   ├── package.json          # Node dependencies
│   ├── vite.config.ts        # Vite config (port, proxy)
│   ├── tailwind.config.js    # Tailwind CSS theme
│   └── .env.example          # Environment template
│
├── database_hole/            # Database SQL scripts
│   ├── 01_schema.sql         # Full schema (62 tables)
│   ├── 02_seed_data.sql      # Seed data (users, departments, etc.)
│   ├── 03_queries.sql        # Reference queries (DO NOT run)
│   ├── 04_waitlist_table.sql # Waitlist table migration
│   └── README.md             # Database-specific setup notes
│
├── project-plan/             # Architecture & design docs
├── .gitignore                # Git ignore rules
├── README.md                 # Project overview
└── SETUP_GUIDE.md            # ← You are here
```

---

## Quick Start (TL;DR)

For those who just want the commands:

```powershell
# 1. Database
psql -U postgres -c "CREATE USER hms_user WITH PASSWORD 'HMS@2026';"
psql -U postgres -c "CREATE DATABASE hms_db OWNER hms_user;"
psql -U hms_user -d hms_db -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
$env:PGPASSWORD = "HMS@2026"
psql -h localhost -U hms_user -d hms_db -f database_hole/01_schema.sql
psql -h localhost -U hms_user -d hms_db -f database_hole/02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f database_hole/04_waitlist_table.sql

# 2. Backend  (Terminal 1)
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# → Edit .env: set DATABASE_URL and SECRET_KEY
mkdir uploads
uvicorn app.main:app --reload --port 8000

# 3. Frontend  (Terminal 2)
cd frontend
npm install
Copy-Item .env.example .env
npm run dev

# 4. Open http://localhost:3000  →  Login: superadmin / Admin@123
```

---

<p align="center">
  <sub>For project overview and architecture, see <a href="README.md">README.md</a></sub>
</p>
