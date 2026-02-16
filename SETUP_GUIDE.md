# Hospital Management System - Setup Guide

> **Version:** 1.0.0  
> **Date:** February 16, 2026  
> **Tech Stack:** React 19 + FastAPI + PostgreSQL 15+

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Setup](#database-setup)
3. [Backend Setup](#backend-setup)
4. [Frontend Setup](#frontend-setup)
5. [Running the Application](#running-the-application)
6. [First-Time Configuration](#first-time-configuration)
7. [Troubleshooting](#troubleshooting)

---

## 🔧 Prerequisites

### Required Software

| Software | Version | Download Link |
|----------|---------|---------------|
| **PostgreSQL** | 15+ | https://www.postgresql.org/download/ |
| **Python** | 3.11+ | https://www.python.org/downloads/ |
| **Node.js** | 20+ | https://nodejs.org/ |
| **Git** | Latest | https://git-scm.com/downloads/ |

### Verify Installation

Open PowerShell and run:

```powershell
# Check PostgreSQL
psql --version
# Expected: psql (PostgreSQL) 15.x or higher

# Check Python
python --version
# Expected: Python 3.11.x or higher

# Check Node.js
node --version
# Expected: v20.x.x or higher

# Check npm
npm --version
# Expected: 10.x.x or higher
```

---

## 🗄️ Database Setup

### Step 1: Create Database User

Open PostgreSQL command line (psql) as superuser:

```bash
# Windows
psql -U postgres

# macOS/Linux
sudo -u postgres psql
```

Execute these commands:

```sql
-- Create database user
CREATE USER hospital_admin WITH PASSWORD 'HMS@2026';

-- Create database
CREATE DATABASE hospital_management;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE hospital_management TO hospital_admin;

-- Connect to the database
\c hospital_management

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO hospital_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hospital_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hospital_admin;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Exit
\q
```

### Step 2: Run Database Scripts

Navigate to the project database directory:

```bash
cd d:\HMS\v1\database
``` using PowerShell:

```powershell
# Set environment variable for password
$env:PGPASSWORD="HMS@2026"

# 1. Create schema
psql -h localhost -U hospital_admin -d hospital_management -f scripts\001_create_schema.sql

# 2. Apply patient field migrations
psql -h localhost -U hospital_admin -d hospital_management -f scripts\002_migrate_patient_fields.sql

# 3. Global support and user management
psql -h localhost -U hospital_admin -d hospital_management -f scripts\003_global_and_user_mgmt.sql

# 4. Hospital details table
psql -h localhost -U hospital_admin -d hospital_management -f scripts\004_create_hospital_details.sql

# 5. Apply migrations (user profile fields)
psql -h localhost -U hospital_admin -d hospital_management -f migrations\001_add_user_profile_fields.sql

# 6. Add employee sequences and indexes
psql -h localhost -U hospital_admin -d hospital_management -f migrations\002_add_employee_sequences_and_indexes.sql

# 7. Backfill employee IDs
psql -h localhost -U hospital_admin -d hospital_management -f migrations\003_backfill_employee_ids.sql

# 8. Seed initial data (creates default users and sample patients)
psql -h localhost -U hospital_admin -d hospital_management -f seeds\
# 8. Seed initial data
psql -h localhost -U hospital_admin -d hospital_management -f seeds/seed_data.sql
```

### Step 3: Verify Database Setup

```bash
# Cpowershell
# Connect to database
psql -h localhost -U hospital_admin -d hospital_management

# Check tables
\dt

# Check users (should show 4 default users)
SELECT id, username, email, role, employee_id FROM users;

# Check patients (should show 4 sample patients)
SELECT prn, first_name, last_name, mobile_number FROM patients;
# Exit
\q
```

---

## 🐍 Backend Setup

### Step 1: Navigate to Backend Directory

```bash
cd d:\HMS\v1\backend
```

### Step 2: Create Virtual Environment

```powershell
# Create virtual environment
python -m venv venv

# Activate virtual environment (PowerShell)
.\venv\Scripts\Activate.ps1

# If you get execution policy error, run:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Step 3: Install Dependencies

```bash
# Upgrade pip
python -m pip install --upgrade pip
powershell
# Upgrade pip
python -m pip install --upgrade pip

# Install all requirements
pip install -r requirements.txt

# Verify installation
pip lisent Variables

Create `.env` file in `backend/` directory:

```powershell
# Create .env file
New-Item -Path .env -ItemType File -Force
```

Add the following content to `.env`:

```env
# Application
APP_NAME=Hospital Management System
APP_VERSION=1.0.0
DEBUG=True

# Database
DATABASE_URL=postgresql://hospital_admin:HMS%402026@localhost:5432/hospital_management

# Security
SECRET_KEY=ecb11559e040a01fd00456e98845390b186fac7e257041cd73ae2700cc9f193b
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# CORS (Frontend URLs)
CORS_ORIGINS=["http://localhost:5173"]
```

**⚠️ IMPORTANT:** For production, generate a new SECRET_KEY:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

### Step 5: Verify Backend Installation

```bash
# Test FastAPI server
uvicorn app.main:app --reload --port 8000

# Expected output: Server running at http://127.0.0.1:8000
# API Docs available at: http://127.0.0.1:8000/docs
```

Press `Ctrl+C` to stop the server after verification.

---

## powershell
# Start FastAPI server
uvicorn app.main:app --reload --port 8000

# Expected output: 
# INFO:     Uvicorn running on http://127.0.0.1:8000
# INFO:     Application startup complete
```

Open browser and visit:
- **API Docs:** http://127.0.0.1:8000/docs
- **Health Check:** http://127.0.0.1:8000/health

### Step 2: Install Dependencies

```bash
# Install all npm packages
npm install

# Expected: ~200+ packages installed
```

###powershell
# Install all npm packages
npm install

# This will install React, TypeScript, Tailwind CSS, and other dependencies
# Expected: 200+ packages installed successfully
# Create .env file
Newpowershell
# Create .env file
New-Item -Path .env -ItemType File -Force
```

Add the following content:

```env
# API Configuration (Backend URL)
VITE_API_BASE_URL=http://localhost:8000/api/v1
### Step 4: Verify Frontend Installation

```bash
# Start development server
npm run dev

# Expected output: 
# VITE v7.3.1  ready in xxx ms
# ➜  Local:   http://localhost:5173/
```powershell
# Start development server
npm run dev

# Expected output: 
# VITE ready in xxx ms
# ➜  Local:   http://localhost:5173/
# ➜  Network: use --host to expose
```

Open browser and visit http://localhost:5173
### Option 1: Manual Start (Development)

**Terminal 1 - Backend:**
```bash
cd d:\HMS\v1\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```Start Both Services

Open **two separate PowerShell terminals**:

**Terminal 1 - Backend Server:**
```powershell
cd d:\HMS\v1\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 - Frontend Server:**
```powershell
cd d:\HMS\v1\frontend
npm run dev
```

### Access Points

Once both servers are running:

- **Application:** http://localhost:5173
- **API Backend:** http://localhost:8000
- **API Documentation:** http://localhost:8000/docs

**Keep both terminals open while using the application.**
1. **Frontend:** http://localhost:5173
2. **Backend API:** http://localhost:8000
3. **API Documentation:** http://localhost:8000/docs
4. **Alternative API Docs:** http://localhost:8000/redoc

### Default Login Credentials

| Role | Username | Password | Employee ID |
|------|----------|----------|-------------|
| Super Admin | `superadmin` | (check seed file) | ADM-2024-0002 |
| Admin | `admin` | (check seed file) | ADM-2024-0003 |
| Doctor | `doctor1` | (check seed file) | DOC-2024-0001 |
| Nurse | `nurse1` | (check seed file) | NUR-2024-0001 |

**⚠️ Change these passwords immediately in production!**

### Configure Hospital Details

1. Login as Super Admin
2. Navigate to Settings > Hospital Configuration
3. Fill in your hospital information:
   - HFirst-Time Configuration

### Step 1: Login

Open http://localhost:5173 in your browser.

**Default Login Credentials:**

| Username | Role | Employee ID |
|----------|------|-------------|
| `superadmin` | Super Admin | EMP-2024-001 |
| `admin` | Admin | EMP-2024-002 |
| `doctor1` | Doctor | EMP-2024-003 |
| `nurse1` | Nurse | EMP-2024-004 |

**Default Password:** Check `database/seeds/seed_data.sql` for the password (currently hashed).

To set a custom password, decode the bcrypt hash or update the seed file before running it.

**⚠️ SECURITY:** Change all default passwords immediately after first login!

### Step 2: Configure Hospital Details

1. Login as **Super Admin** or **Admin**
2. Navigate to **Hospital Setup** from the dashboard
3. Complete the 3-step setup wizard:
   - **Step 1:** Basic Details (name, type, contact info, address)
   - **Step 2:** Facility Information (beds, staff, working hours, legal info)
   - **Step 3:** Review and Submit

### Step 3: Change Default Passwords

1. Go to **User Management**
2. For each default user, click **Reset Password**
3. Set strong passwords for all accounts

### Step 4: Create Staff Accounts

1. Navigate to **Staff Directory**
2. Click **Add Staff Member**
3. Fill in staff details (Employee IDs are auto-generated)
4. Assign appropriate roles and departments
# Find and kill process using port 8000
# Wpowershell
# Find process using port 8000
netstat -ano | findstr :8000

# Kill the process (replace <PID> with actual process ID)
taskkill /PID <PID> /F

# Or change the port in backend startup:
uvicorn app.main:app --reload --port 8001
#### 3. Module Not Found (Backend)

**Error:** `ModuleNotFoundError: No module named 'fastapi'`

**Solution:**
```bash
# Epowershell
# Ensure virtual environment is activated (look for (venv) in prompt)
.\venv\Scripts\Activate.ps1

# Verify pip is from venv
where.exe pip

# Reinstall requirements
pip install -r requirements.txt
```

#### 4. Module Not Found (Frontend)

**Error:** `Cannot find module 'react'`

**Solution:**
```powershell
# Delete node_modules and package-lock.json
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json

# Clear npm cache
npm cache clean --force

# Reinstall all packages
```

#### 5. CORS Error

**Error:** `Access to XMLHttpRequest blocked by CORS policy`

**Solution:**
- Verify `CORS_ORIGINS` in `backend/.env` includes your frontend URL
- Restart backend server after changing .env

#### 6. Database Migration Errors

**Error:** `relation "users" already exists`
powershell
# Check existing tables
psql -h localhost -U hospital_admin -d hospital_management
\dt

# If you need to start fresh, drop and recreate database:
# (Connect as postgres user first)
psql -U postgres
DROP DATABASE hospital_management;
CREATE DATABASE hospital_management;
GRANT ALL PRIVILEGES ON DATABASE hospital_management TO hospital_admin;
\q🎉 Setup Complete!

Your Hospital Management System is now ready to use.

### Quick Start Checklist

- ✅ PostgreSQL database created and configured
- ✅ Backend server running on http://localhost:8000
- ✅ Frontend application running on http://localhost:5173
- ✅ Default users seeded (superadmin, admin, doctor1, nurse1)
- ✅ Sample patients created

### Next Steps

1. **Login:** Use default credentials to access the system
2. **Configure Hospital:** Complete the Hospital Setup wizard
3. **Change Passwords:** Update all default passwords
4. **Create Staff:** Add your staff members with auto-generated Employee IDs
5. **Add Patients:** Start registering patients with auto-generated PRNs

### Important URLs

- **Application:** http://localhost:5173
- **API Documentation:** http://localhost:8000/docs
- **Interactive API Docs:** http://localhost:8000/redoc

### For Production Deployment

1. Generate new SECRET_KEY
2. Change all default passwords
3. Update CORS_ORIGINS to production domain
4. Set DEBUG=False
5. Enable HTTPS
6. Set up automated database backups

---

## 📚 Additional Resources

- **Project Documentation:** `PROJECT_DOCUMENTATION.md`
- **API Integration Guide:** `API_FRONTEND_REFERENCE.md`
- **Frontend-Backend Guide:** `FRONTEND_BACKEND_INTEGRATION_GUIDE.md`
- **Database Scripts:** `database/scripts/`

**For questions or issues, refer to the Troubleshooting section above.ration
- ✅ ID Card Printing
- ✅ CSV Export Functionality

### Technology Stack
- **Frontend:** React 19.2, TypeScript 5.9, Tailwind CSS 3.4, React Hook Form, Zod
- **Backend:** FastAPI 0.109, Python 3.11, SQLAlchemy 2.0, Pydantic 2.6
- **Database:** PostgreSQL 15+, pgcrypto extension
- **Authentication:** JWT (access token + refresh token)

---

## 🎉 Setup Complete!

Your Hospital Management System is now ready to use.

**Next Steps:**
1. Login with super admin credentials
2. Configure hospital details
3. Create staff accounts
4. Start managing patients

**Enjoy your HMS! 🏥**
