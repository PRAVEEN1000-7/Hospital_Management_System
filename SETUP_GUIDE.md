# Hospital Management System - Complete Setup Guide

> **Version:** 1.0.0  
> **Date:** February 15, 2026  
> **Tech Stack:** React 19 + FastAPI + PostgreSQL 15+

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Setup](#database-setup)
3. [Backend Setup](#backend-setup)
4. [Frontend Setup](#frontend-setup)
5. [Running the Application](#running-the-application)
6. [Post-Installation](#post-installation)
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

```bash
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
```

Execute scripts in order:

```bash
# Set environment variable for password
$env:PGPASSWORD="HMS@2026"

# 1. Create schema
psql -h localhost -U hospital_admin -d hospital_management -f scripts/001_create_schema.sql

# 2. Apply patient field migrations (if needed)
psql -h localhost -U hospital_admin -d hospital_management -f scripts/002_migrate_patient_fields.sql

# 3. Global support and user management
psql -h localhost -U hospital_admin -d hospital_management -f scripts/003_global_and_user_mgmt.sql

# 4. Hospital details table
psql -h localhost -U hospital_admin -d hospital_management -f scripts/004_create_hospital_details.sql

# 5. Add country codes support
psql -h localhost -U hospital_admin -d hospital_management -f scripts/005_add_hospital_country_codes.sql

# 6. Apply migrations (user profile fields)
psql -h localhost -U hospital_admin -d hospital_management -f migrations/001_add_user_profile_fields.sql

# 7. Add employee sequences and indexes
psql -h localhost -U hospital_admin -d hospital_management -f migrations/002_add_employee_sequences_and_indexes.sql

# 8. Backfill employee IDs
psql -h localhost -U hospital_admin -d hospital_management -f migrations/003_backfill_employee_ids.sql

# 9. Seed initial data
psql -h localhost -U hospital_admin -d hospital_management -f seeds/seed_data.sql
```

### Step 3: Verify Database Setup

```bash
# Connect to database
psql -h localhost -U hospital_admin -d hospital_management

# Check tables
\dt

# Check users
SELECT id, username, email, role, employee_id FROM users;

# Expected output: 4 default users (superadmin, admin, doctor1, nurse1)

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

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows PowerShell:
.\venv\Scripts\Activate.ps1

# Windows CMD:
.\venv\Scripts\activate.bat

# macOS/Linux:
source venv/bin/activate
```

### Step 3: Install Dependencies

```bash
# Upgrade pip
python -m pip install --upgrade pip

# Install requirements
pip install -r requirements.txt
```

### Step 4: Configure Environment Variables

Create `.env` file in `backend/` directory:

```bash
# Create .env file
New-Item -Path .env -ItemType File
```

Add the following content to `.env`:

```env
# Application
APP_NAME=Hospital Management System
APP_VERSION=1.0.0
DEBUG=True

# Database
DATABASE_URL=postgresql://hospital_admin:HMS%402026@localhost:5432/hospital_management
DB_ECHO=False

# Security
SECRET_KEY=ecb11559e040a01fd00456e98845390b186fac7e257041cd73ae2700cc9f193b
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS
CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173"]

# Pagination
DEFAULT_PAGE_SIZE=10
MAX_PAGE_SIZE=100

# File Upload
MAX_UPLOAD_SIZE_MB=10
ALLOWED_IMAGE_EXTENSIONS=[".jpg", ".jpeg", ".png", ".gif"]
```

**⚠️ IMPORTANT:** Generate a new SECRET_KEY for production:

```bash
# Generate secure secret key
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

## ⚛️ Frontend Setup

### Step 1: Navigate to Frontend Directory

```bash
cd d:\HMS\v1\frontend
```

### Step 2: Install Dependencies

```bash
# Install all npm packages
npm install

# Expected: ~200+ packages installed
```

### Step 3: Configure Environment Variables

Create `.env` file in `frontend/` directory:

```bash
# Create .env file
New-Item -Path .env -ItemType File
```

Add the following content:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:8000
VITE_API_PREFIX=/api/v1

# Application
VITE_APP_NAME=HMS
VITE_APP_VERSION=1.0.0
```

### Step 4: Verify Frontend Installation

```bash
# Start development server
npm run dev

# Expected output: 
# VITE v7.3.1  ready in xxx ms
# ➜  Local:   http://localhost:5173/
```

Press `Ctrl+C` to stop the server after verification.

---

## 🚀 Running the Application

### Option 1: Manual Start (Development)

**Terminal 1 - Backend:**
```bash
cd d:\HMS\v1\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd d:\HMS\v1\frontend
npm run dev
```

### Option 2: Using Scripts

Create startup scripts for convenience:

**`start-backend.ps1`** (in `backend/` directory):
```powershell
# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Start FastAPI server
uvicorn app.main:app --reload --port 8000
```

**`start-frontend.ps1`** (in `frontend/` directory):
```powershell
# Start Vite dev server
npm run dev
```

**Run both:**
```bash
# Terminal 1
cd d:\HMS\v1\backend
.\start-backend.ps1

# Terminal 2
cd d:\HMS\v1\frontend
.\start-frontend.ps1
```

---

## 📱 Post-Installation

### Access the Application

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
   - Hospital Name
   - Address
   - Contact Information
   - Logo Upload
   - Primary Color Theme

---

## 🔍 Troubleshooting

### Common Issues

#### 1. Database Connection Failed

**Error:** `FATAL: password authentication failed for user "hospital_admin"`

**Solution:**
```bash
# Reset user password
psql -U postgres
ALTER USER hospital_admin WITH PASSWORD 'HMS@2026';
\q
```

#### 2. Port Already in Use

**Error:** `Address already in use: bind: 8000`

**Solution:**
```bash
# Find and kill process using port 8000
# Windows:
netstat -ano | findstr :8000
taskkill /PID <process_id> /F

# macOS/Linux:
lsof -ti:8000 | xargs kill -9
```

#### 3. Module Not Found (Backend)

**Error:** `ModuleNotFoundError: No module named 'fastapi'`

**Solution:**
```bash
# Ensure virtual environment is activated
.\venv\Scripts\Activate.ps1

# Reinstall requirements
pip install -r requirements.txt
```

#### 4. Module Not Found (Frontend)

**Error:** `Cannot find module 'react'`

**Solution:**
```bash
# Delete node_modules and reinstall
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
```

#### 5. CORS Error

**Error:** `Access to XMLHttpRequest blocked by CORS policy`

**Solution:**
- Verify `CORS_ORIGINS` in `backend/.env` includes your frontend URL
- Restart backend server after changing .env

#### 6. Database Migration Errors

**Error:** `relation "users" already exists`

**Solution:**
```bash
# Check which tables exist
psql -h localhost -U hospital_admin -d hospital_management
\dt

# If tables exist, skip 001_create_schema.sql
# Start from migration files
```

---

## 📊 Database Schema Overview

### Core Tables

```
users                    → Staff/Admin accounts
├── id (PK)
├── username, email
├── employee_id (UNIQUE) → Auto-generated: ROLE-YYYY-####
├── first_name, last_name
├── role, department
└── employee sequences   → 8 sequences for auto-generation

patients                 → Patient records
├── id (PK)
├── prn (UNIQUE)         → Patient Registration Number
├── personal info
└── emergency contacts

hospital_details        → Hospital configuration
├── id (PK)
├── hospital info
└── theme settings

audit_logs             → Activity tracking
refresh_tokens         → JWT token management
```

### Indexes for Performance

```sql
-- Users table indexes
idx_users_role_active          → Fast active staff filtering
idx_users_department_role      → Department-specific queries
idx_users_employee_id          → Employee ID lookups
idx_users_created_at_desc      → Recent staff reports

-- Patient table indexes
idx_patients_prn              → PRN lookups
idx_patients_mobile           → Phone number search
idx_patients_name             → Name-based search
```

---

## 🏗️ Project Structure

```
d:\HMS\v1\
│
├── backend/                    # FastAPI Backend
│   ├── app/
│   │   ├── models/            # SQLAlchemy models
│   │   ├── schemas/           # Pydantic schemas
│   │   ├── routers/           # API endpoints
│   │   ├── services/          # Business logic
│   │   ├── utils/             # Helper functions
│   │   ├── database.py        # Database connection
│   │   └── main.py            # FastAPI app
│   ├── venv/                  # Virtual environment
│   ├── requirements.txt       # Python dependencies
│   └── .env                   # Environment variables
│
├── frontend/                  # React Frontend
│   ├── src/
│   │   ├── components/       # Reusable components
│   │   ├── pages/            # Page components
│   │   ├── services/         # API services
│   │   ├── types/            # TypeScript types
│   │   ├── utils/            # Helper functions
│   │   └── App.tsx           # Main app component
│   ├── public/               # Static assets
│   ├── package.json          # npm dependencies
│   └── .env                  # Environment variables
│
├── database/
│   ├── scripts/              # Initial schema
│   ├── migrations/           # Database migrations
│   └── seeds/                # Seed data
│
└── SETUP_GUIDE.md           # This file
```

---

## 🔐 Security Best Practices

### Before Going to Production

1. **Change Default Passwords**
   ```sql
   -- Update all default user passwords
   UPDATE users SET password_hash = '$2b$12$NEW_HASH';
   ```

2. **Generate New SECRET_KEY**
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

3. **Update CORS Origins**
   ```env
   CORS_ORIGINS=["https://yourdomain.com"]
   ```

4. **Enable HTTPS**
   - Use SSL certificates (Let's Encrypt)
   - Configure reverse proxy (Nginx/Apache)

5. **Set DEBUG=False**
   ```env
   DEBUG=False
   ```

6. **Database Backups**
   ```bash
   # Daily backup script
   pg_dump -h localhost -U hospital_admin hospital_management > backup_$(date +%Y%m%d).sql
   ```

---

## 📞 Support

### Documentation
- **API Docs:** http://localhost:8000/docs
- **Database Schema:** See `database/scripts/001_create_schema.sql`

### Key Features
- ✅ Employee ID Auto-generation (ROLE-YYYY-####)
- ✅ Role-based Access Control (8 roles)
- ✅ Patient Management with PRN
- ✅ Staff Directory with Photo Upload
- ✅ Activity Audit Logs
- ✅ Hospital Configuration
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
