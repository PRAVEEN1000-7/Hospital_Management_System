# HMS — Complete Setup Guide

> **Windows Development · Linux Development · Linux Production · Security Hardening**

---

## Table of Contents

### General
1. [Prerequisites](#1-prerequisites)
2. [Default Credentials](#2-default-credentials)
3. [Environment Files Reference](#3-environment-files-reference)
4. [Database Management](#4-database-management)
5. [Project Structure](#5-project-structure)

### Windows — Local Development
6. [Windows Dev: Database](#6-windows-dev-database)
7. [Windows Dev: Backend](#7-windows-dev-backend)
8. [Windows Dev: Frontend](#8-windows-dev-frontend)
9. [Windows Dev: Verify & Login](#9-windows-dev-verify--login)

### Linux — Development Phase
10. [Linux Dev: Install Prerequisites](#10-linux-dev-install-prerequisites)
11. [Linux Dev: Database](#11-linux-dev-database)
12. [Linux Dev: Backend](#12-linux-dev-backend)
13. [Linux Dev: Frontend](#13-linux-dev-frontend)
14. [Linux Dev: Verify & Login](#14-linux-dev-verify--login)

### Linux — Production Deployment
15. [Production: Database Hardening](#15-production-database-hardening)
16. [Production: Backend with Gunicorn](#16-production-backend-with-gunicorn)
17. [Production: Frontend Build & Serve](#17-production-frontend-build--serve)
18. [Production: Nginx Reverse Proxy](#18-production-nginx-reverse-proxy)
19. [Production: Systemd Services](#19-production-systemd-services)
20. [Production: SSL/TLS with Certbot](#20-production-ssltls-with-certbot)

### Security
21. [Security: Firewall (UFW)](#21-security-firewall-ufw)
22. [Security: SSH Hardening](#22-security-ssh-hardening)
23. [Security: PostgreSQL Hardening](#23-security-postgresql-hardening)
24. [Security: Application Hardening](#24-security-application-hardening)
25. [Security: Checklist](#25-security-checklist)

### Operations
26. [Service Management](#26-service-management)
27. [Troubleshooting](#27-troubleshooting)

---

# General

---

## 1. Prerequisites

| Software   | Version  | Windows Download                        | Ubuntu Install                          |
|------------|----------|-----------------------------------------|-----------------------------------------|
| PostgreSQL | 15+      | https://www.postgresql.org/download/    | `sudo apt install postgresql`           |
| Python     | 3.11+    | https://www.python.org/downloads/       | `sudo apt install python3.11`           |
| Node.js    | 20+      | https://nodejs.org/                     | `sudo apt install nodejs npm`           |
| Git        | Any      | https://git-scm.com/downloads           | `sudo apt install git`                  |
| Nginx      | —        | Not needed (dev only)                   | `sudo apt install nginx`                |

**Windows notes:**
- Check **"Add Python to PATH"** during install.
- Add PostgreSQL `bin` to PATH: `C:\Program Files\PostgreSQL\15\bin`

---

## 2. Default Credentials

Pattern: **`<username>@123`**. All non-superadmin users must change password on first login.

| Role               | Username        | Password           |
|--------------------|-----------------|---------------------|
| Super Admin        | `superadmin`    | `superadmin@123`   |
| Hospital Admin     | `admin`         | `admin@123`        |
| Doctor (Gen Med)   | `doctor1`       | `doctor@123`       |
| Doctor (Cardio)    | `doctor2`       | `doctor@123`       |
| Doctor (Ophthal)   | `doctor3`       | `doctor@123`       |
| Receptionist       | `receptionist`  | `receptionist@123` |
| Pharmacist         | `pharmacist`    | `pharmacist@123`   |
| Cashier            | `cashier`       | `cashier@123`      |
| Optical Staff      | `optical`       | `optical@123`      |
| Inventory Manager  | `inventory`     | `inventory@123`    |

---

## 3. Environment Files Reference

### 3.1 — Backend (`backend/.env`)

```env
# ── Application ──
APP_NAME=Hospital Management System
APP_VERSION=1.0.0
DEBUG=True                           # False for production

# ── Database ──
# Format: postgresql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DB>
# Note: @ in password → %40
DATABASE_URL=postgresql://hms_user:HMS%402026@localhost:5432/hms_db
DB_ECHO=False

# ── Security ──
# Generate: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=<YOUR_SECRET_KEY>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── CORS ──
# JSON array. NO trailing slashes.
CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173"]

# ── Pagination ──
DEFAULT_PAGE_SIZE=10
MAX_PAGE_SIZE=100

# ── PRN ──
PRN_PREFIX=HMS

# ── SMTP (Optional — leave blank to disable) ──
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=noreply@hospital.com
SMTP_FROM_NAME=Hospital Management System

# ── Hospital Details (ID cards, reports) ──
HOSPITAL_NAME=City General Hospital
HOSPITAL_ADDRESS=123 Medical Center Road
HOSPITAL_CITY=Mumbai
HOSPITAL_STATE=Maharashtra
HOSPITAL_COUNTRY=India
HOSPITAL_PIN_CODE=400001
HOSPITAL_PHONE=+91 22 1234 5678
HOSPITAL_EMAIL=info@hospital.com
HOSPITAL_WEBSITE=www.hospital.com
```

### 3.2 — Frontend (`frontend/.env`)

```env
# Local dev:
VITE_API_BASE_URL=http://localhost:8000/api/v1
# Server (replace YOUR_PUBLIC_IP):
# VITE_API_BASE_URL=http://YOUR_PUBLIC_IP:8000/api/v1
```

### 3.3 — CORS Explained

CORS controls which frontend URLs can call the backend API.

**Flow:** `backend/.env` → `config.py` reads `CORS_ORIGINS` → `main.py` applies FastAPI CORS middleware.

| Scenario            | `CORS_ORIGINS` value                                      |
|---------------------|-----------------------------------------------------------|
| Local dev           | `["http://localhost:3000", "http://localhost:5173"]`      |
| Remote server       | `["http://YOUR_PUBLIC_IP:3000"]`                          |
| Custom domain       | `["https://yourdomain.com"]`                              |
| Multiple            | Combine all into the JSON array                           |

**Common mistakes:** trailing `/`, missing port, `https` vs `http`, not restarting backend after change.

---

## 4. Database Management

### 4.1 — Useful Commands

**Windows (PowerShell):**
```powershell
psql -U hms_user -d hms_db          # Connect
```

**Linux:**
```bash
psql -h localhost -U hms_user -d hms_db    # Connect (always use -h localhost)
```

**Inside psql:**
```sql
\dt                                  -- List tables
\d users                             -- Describe table
SELECT COUNT(*) FROM users;          -- Count records
```

### 4.2 — Full Reset (Drop & Recreate)

> **WARNING:** Permanently deletes all data.

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
psql -U hms_user -d hms_db -f database_hole/01_schema.sql
psql -U hms_user -d hms_db -f database_hole/02_seed_data.sql
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
psql -h localhost -U hms_user -d hms_db -f database_hole/01_schema.sql
psql -h localhost -U hms_user -d hms_db -f database_hole/02_seed_data.sql
```

### 4.3 — Truncate All Tables (Keep Schema)

```sql
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
    patient_documents, patient_consents, patients,
    refresh_tokens, role_permissions, user_roles, permissions, roles, users,
    tax_configurations, hospital_settings, departments, hospitals
CASCADE;
```

Then re-seed: run `02_seed_data.sql`

### 4.4 — Clear Transactional Data Only (Keep Users & Setup)

```sql
TRUNCATE TABLE
    waitlists, password_emails, id_cards, audit_logs,
    notification_queue, notifications,
    cycle_count_items, cycle_counts, stock_adjustments, stock_movements,
    grn_items, goods_receipt_notes, purchase_order_items, purchase_orders,
    optical_repairs, optical_order_items, optical_orders,
    pharmacy_return_items, pharmacy_returns, pharmacy_dispensing_items, pharmacy_dispensing,
    pre_authorizations, insurance_claims, insurance_policies,
    daily_settlements, credit_notes, refunds, payments, invoice_items, invoices,
    optical_prescriptions, lab_orders,
    prescription_versions, prescription_items, prescriptions,
    appointment_queue, appointment_status_log, appointments,
    patient_documents, patient_consents, patients, refresh_tokens
CASCADE;
```

---

## 5. Project Structure

```
Hospital_Management_System/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── config.py        # Settings (reads .env)
│   │   ├── main.py          # App entry + CORS middleware
│   │   ├── database.py      # SQLAlchemy engine & session
│   │   ├── dependencies.py  # Auth guards, current_user
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── routers/         # API route handlers
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── services/        # Business logic layer
│   │   └── utils/           # Security helpers (hashing, JWT)
│   ├── uploads/             # User-uploaded files (gitignored)
│   ├── requirements.txt
│   └── .env                 # ← YOU CREATE THIS
├── frontend/                # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page-level components
│   │   ├── services/        # Axios API modules
│   │   ├── types/           # TypeScript type definitions
│   │   ├── contexts/        # React contexts (Auth, Toast)
│   │   └── utils/           # Helpers, formatters
│   ├── vite.config.ts
│   ├── package.json
│   └── .env                 # ← YOU CREATE THIS
├── database_hole/           # SQL scripts
│   ├── 01_schema.sql        # Full schema (62+ tables)
│   ├── 02_seed_data.sql     # Seed data (3 hospitals, 10 users)
│   ├── 03_queries.sql       # Reference only — DO NOT run
├── project-plan/            # Architecture & design docs
├── SETUP_GUIDE.md           # ← You are here
└── MULTI_HOSPITAL_GUIDE.md  # Multi-hospital usage guide
```

---

# Windows — Local Development

---

## 6. Windows Dev: Database

### 6.1 — Clone & Enter Project

```powershell
git clone <REPO_URL>
cd Hospital_Management_System
```

### 6.2 — Verify psql Is Available

```powershell
psql --version
```

If `psql is not recognized`:
```powershell
# Temporary fix (current session only)
$env:PATH += ";C:\Program Files\PostgreSQL\15\bin"

# Permanent fix: System Properties → Environment Variables → Path → add:
# C:\Program Files\PostgreSQL\15\bin
```

### 6.3 — Verify PostgreSQL Service Is Running

```powershell
Get-Service postgresql*
```

If stopped:
```powershell
Start-Service postgresql-x64-15
```

### 6.4 — Create User & Database

```powershell
psql -U postgres -c "CREATE USER hms_user WITH PASSWORD 'HMS@2026';"
psql -U postgres -c "CREATE DATABASE hms_db OWNER hms_user;"
```

### 6.5 — Run Schema & Seed Data

```powershell
psql -U hms_user -d hms_db -f database_hole/01_schema.sql
psql -U hms_user -d hms_db -f database_hole/02_seed_data.sql
```

> `03_queries.sql` is for reference only — do NOT run it.

### 6.6 — Verify

```powershell
psql -U hms_user -d hms_db -c "SELECT COUNT(*) FROM users;"
# Expected: 10
```
### Delete the entire DB ( if needed to delete DB)
```
psql -U postgres

\c postgres

SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='hms_db';

DROP DATABASE IF EXISTS hms_db;

REASSIGN OWNED BY hms_user TO postgres;

DROP OWNED BY hms_user;

DROP ROLE IF EXISTS hms_user;
```

---

## 7. Windows Dev: Backend

### 7.1 — Create Virtual Environment

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 7.2 — Install Dependencies

```powershell
pip install -r requirements.txt
```

### 7.3 — Create Uploads Directory

```powershell
mkdir uploads
```

### 7.4 — Create `.env` File

Create `backend\.env` and paste:

```env
APP_NAME=Hospital Management System
APP_VERSION=1.0.0
DEBUG=True
DATABASE_URL=postgresql://hms_user:HMS%402026@localhost:5432/hms_db
DB_ECHO=False
SECRET_KEY=ecb11559e040a01fd00456e98845390b186fac7e257041cd73ae2700cc9f193b
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173"]
DEFAULT_PAGE_SIZE=10
MAX_PAGE_SIZE=100
PRN_PREFIX=HMS
```

> The `@` in `HMS@2026` must be URL-encoded as `%40` in `DATABASE_URL`.

### 7.5 — Start Backend

```powershell
uvicorn app.main:app --reload --port 8000
```

### 7.6 — Verify

Open http://localhost:8000/api/docs — Swagger UI should appear.

---

## 8. Windows Dev: Frontend

Open a **new terminal** (keep backend running).

### 8.1 — Install Packages

```powershell
cd frontend
npm install
```

> Peer dependency errors? Use `npm install --legacy-peer-deps`

### 8.2 — Create `.env` File

Create `frontend\.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

### 8.3 — Start Dev Server

```powershell
npm run dev
```

---

## 9. Windows Dev: Verify & Login

1. Open http://localhost:3000
2. Login: **`superadmin`** / **`superadmin@123`**
3. Complete the Hospital Setup wizard on first login

### Quick Test via PowerShell

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" `
  -Method POST -ContentType "application/json" `
  -Body '{"username": "superadmin", "password": "superadmin@123"}'
```

Expected: JSON with `access_token`.

---

# Linux — Development Phase

> For quick local development on an Ubuntu machine. NOT hardened for public access.

---

## 10. Linux Dev: Install Prerequisites

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3-pip nodejs npm postgresql postgresql-contrib git curl
```

> If `python3.11` not available:
> ```bash
> sudo add-apt-repository ppa:deadsnakes/ppa -y && sudo apt update
> sudo apt install -y python3.11 python3.11-venv
> ```

Verify:
```bash
python3.11 --version
node -v
psql --version
```

Clone:
```bash
cd ~
git clone <REPO_URL> Hospital_Management_System
cd Hospital_Management_System
```

---

## 11. Linux Dev: Database

### 11.1 — Start PostgreSQL

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 11.2 — Fix Peer Authentication (Common Ubuntu Issue)

Ubuntu defaults to `peer` auth — matches Linux username to DB username. Since your Linux user isn't `hms_user`, login fails.

```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

Find and change:
```
local   all   all   peer
```
To:
```
local   all   all   md5
```

```bash
sudo systemctl restart postgresql
```

### 11.3 — Create User & Database

```bash
sudo -u postgres psql -c "CREATE USER hms_user WITH PASSWORD 'HMS@2026';"
sudo -u postgres psql -c "CREATE DATABASE hms_db OWNER hms_user;"
sudo -u postgres psql -d hms_db -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
sudo -u postgres psql -d hms_db -c "GRANT ALL ON SCHEMA public TO hms_user;"
sudo -u postgres psql -d hms_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hms_user;"
sudo -u postgres psql -d hms_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hms_user;"
```

### 11.4 — Run Schema & Seed Data

```bash
psql -h localhost -U hms_user -d hms_db -f database_hole/01_schema.sql
psql -h localhost -U hms_user -d hms_db -f database_hole/02_seed_data.sql
```

> Always use `-h localhost` to force TCP and avoid peer auth issues.

### 11.5 — Verify

```bash
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM users;"
# Expected: 10
```

### 11.6 — Skip Password Prompts

```bash
echo "localhost:5432:hms_db:hms_user:HMS@2026" > ~/.pgpass
chmod 600 ~/.pgpass
```

---

## 12. Linux Dev: Backend

### 12.1 — Create Virtual Environment

```bash
cd ~/Hospital_Management_System/backend
python3.11 -m venv venv
source venv/bin/activate
```

### 12.2 — Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 12.3 — Create Required Directories

```bash
mkdir -p uploads
```

### 12.4 — Create `.env` File

```bash
nano .env
```

Paste backend env from [Section 3.1](#31--backend-backendenv). For local dev, keep `DEBUG=True` and `CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173"]`.

Generate a secret key:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 12.5 — Start Backend (Dev Mode)

```bash
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> `--reload` watches for file changes. Do NOT use in production.

---

## 13. Linux Dev: Frontend

Open a **new terminal**.

### 13.1 — Install Dependencies

```bash
cd ~/Hospital_Management_System/frontend
npm install
```

### 13.2 — Create `.env` File

```bash
echo "VITE_API_BASE_URL=http://localhost:8000/api/v1" > .env
```

### 13.3 — Start Dev Server

```bash
npm run dev -- --host 0.0.0.0 --port 3000
```

---

## 14. Linux Dev: Verify & Login

```bash
# Check ports
sudo ss -tlnp | grep -E '3000|8000|5432'

# Test API
curl -s http://localhost:8000/api/v1/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "superadmin@123"}'
```

Open http://localhost:3000 → Login: **`superadmin`** / **`superadmin@123`**

---

# Linux — Production Deployment

> For deploying on a public-facing Ubuntu server (VPS, AWS, GCP, DigitalOcean, etc.)

> Replace **`YOUR_PUBLIC_IP`** throughout. Find it: `curl -4 ifconfig.me`

> Replace **`yourdomain.com`** if you have a domain name.

---

## 15. Production: Database Hardening

Complete steps [11.1 through 11.6](#11-linux-dev-database) first, then apply these changes:

### 15.1 — Use a Strong Password

```bash
# Generate a random 24-char password
openssl rand -base64 24
```

```bash
sudo -u postgres psql -c "ALTER USER hms_user WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';"
```

Update `DATABASE_URL` in `backend/.env` accordingly (URL-encode special characters).

### 15.2 — Restrict Database Connections

```bash
sudo nano /etc/postgresql/*/main/postgresql.conf
```

Ensure:
```
listen_addresses = 'localhost'     # Only local connections
```

```bash
sudo systemctl restart postgresql
```

### 15.3 — Enable Automated Backups

```bash
# Create backup script
cat > ~/backup_hms.sh << 'EOF'
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=~/backups/hms
mkdir -p $BACKUP_DIR
pg_dump -h localhost -U hms_user -d hms_db -F c -f "$BACKUP_DIR/hms_$TIMESTAMP.backup"
# Keep only last 7 days
find $BACKUP_DIR -name "*.backup" -mtime +7 -delete
EOF
chmod +x ~/backup_hms.sh
```

Add to cron (daily at 2 AM):
```bash
(crontab -l 2>/dev/null; echo "0 2 * * * ~/backup_hms.sh") | crontab -
```

Restore from backup:
```bash
pg_restore -h localhost -U hms_user -d hms_db -c ~/backups/hms/hms_XXXXXXXX.backup
```

---

## 16. Production: Backend with Gunicorn

### 16.1 — Install Gunicorn

```bash
cd ~/Hospital_Management_System/backend
source venv/bin/activate
pip install gunicorn
```

### 16.2 — Configure Production `.env`

```bash
nano .env
```

Key production changes:
```env
DEBUG=False
SECRET_KEY=<GENERATED_64_CHAR_HEX>
CORS_ORIGINS=["https://yourdomain.com", "http://YOUR_PUBLIC_IP"]
```

Generate secret:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Auto-configure:
```bash
SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
PUBLIC_IP=$(curl -4 -s ifconfig.me)
sed -i "s/<YOUR_SECRET_KEY>/$SECRET/" .env
sed -i "s/YOUR_PUBLIC_IP/$PUBLIC_IP/g" .env
sed -i "s/DEBUG=True/DEBUG=False/" .env
```

### 16.3 — Start with Gunicorn

Create log directory first:
```bash
sudo mkdir -p /var/log/hms
sudo chown $USER:$USER /var/log/hms
```

```bash
cd ~/Hospital_Management_System/backend
source venv/bin/activate
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8000 \
  --access-logfile /var/log/hms/backend_access.log \
  --error-logfile /var/log/hms/backend_error.log
```

> **Why Gunicorn instead of bare uvicorn?**
> - Multiple worker processes (uses all CPU cores)
> - Automatic worker restart on crash
> - Better memory management
> - Production-grade process supervision

---

## 17. Production: Frontend Build & Serve

### 17.1 — Configure Production `.env`

```bash
cd ~/Hospital_Management_System/frontend
```

```bash
# Option A: Domain name
echo "VITE_API_BASE_URL=https://yourdomain.com/api/v1" > .env

# Option B: IP address
PUBLIC_IP=$(curl -4 -s ifconfig.me)
echo "VITE_API_BASE_URL=http://$PUBLIC_IP/api/v1" > .env
```

### 17.2 — Build for Production

```bash
npm install
npm run build
```

This creates `frontend/dist/` — a static bundle. No Node.js needed at runtime.

### 17.3 — Serve via Nginx

The built files in `dist/` will be served by Nginx (configured in [Section 18](#18-production-nginx-reverse-proxy)). No need to run `npm run dev` in production.

---

## 18. Production: Nginx Reverse Proxy

### 18.1 — Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### 18.2 — Create Site Config

```bash
sudo nano /etc/nginx/sites-available/hms
```

```nginx
server {
    listen 80;
    server_name YOUR_PUBLIC_IP;   # or yourdomain.com

    # Frontend (static files from Vite build)
    root /home/YOUR_USER/Hospital_Management_System/frontend/dist;
    index index.html;

    # Frontend routes (SPA — all paths → index.html)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for long-running API calls
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 60s;
    }

    # Uploaded files
    location /uploads {
        alias /home/YOUR_USER/Hospital_Management_System/backend/uploads;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # File upload size
    client_max_body_size 20M;
}
```

> Replace `YOUR_USER` with your Linux username (e.g., `ubuntu`, `root`, etc.)

### 18.3 — Enable & Test

```bash
sudo ln -sf /etc/nginx/sites-available/hms /etc/nginx/sites-enabled/hms
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## 19. Production: Systemd Services

Systemd automatically starts services on boot and restarts them on crash.

### 19.1 — Backend Service

```bash
sudo nano /etc/systemd/system/hms-backend.service
```

```ini
[Unit]
Description=HMS Backend (Gunicorn + Uvicorn)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=YOUR_USER
Group=YOUR_USER
WorkingDirectory=/home/YOUR_USER/Hospital_Management_System/backend
Environment="PATH=/home/YOUR_USER/Hospital_Management_System/backend/venv/bin:/usr/bin"
ExecStart=/home/YOUR_USER/Hospital_Management_System/backend/venv/bin/gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8000 \
  --access-logfile /var/log/hms/backend_access.log \
  --error-logfile /var/log/hms/backend_error.log
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 19.2 — Enable & Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable hms-backend
sudo systemctl start hms-backend
sudo systemctl status hms-backend
```

### 19.3 — Management Commands

```bash
sudo systemctl start hms-backend     # Start
sudo systemctl stop hms-backend      # Stop
sudo systemctl restart hms-backend   # Restart
sudo systemctl status hms-backend    # Status
sudo journalctl -u hms-backend -f    # Live logs
```

---

## 20. Production: SSL/TLS with Certbot

> Requires a **domain name** pointing to your server's public IP.

### 20.1 — Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 20.2 — Get Certificate

```bash
sudo certbot --nginx -d yourdomain.com
```

Follow the prompts. Certbot automatically:
- Gets a free Let's Encrypt certificate
- Modifies your Nginx config to use HTTPS
- Redirects HTTP → HTTPS

### 20.3 — Auto-Renewal

Certbot installs a cron job automatically. Verify:
```bash
sudo certbot renew --dry-run
```

### 20.4 — Update App Config for HTTPS

After SSL is active, update:

**Backend `.env`:**
```env
CORS_ORIGINS=["https://yourdomain.com"]
```

**Frontend `.env`:**
```env
VITE_API_BASE_URL=https://yourdomain.com/api/v1
```

Rebuild frontend and restart backend:
```bash
cd ~/Hospital_Management_System/frontend && npm run build

---

## 🔧 Database Alterations

If you already have an existing database and are updating to a newer version, run these ALTER TABLE statements:

### Add Emergency Contact Country Code
```sql
ALTER TABLE patients ADD COLUMN emergency_contact_country_code VARCHAR(5) DEFAULT '+91';
```
sudo systemctl restart hms-backend
sudo systemctl reload nginx
```

---

# Security

---

## 21. Security: Firewall (UFW)

### 21.1 — Basic Setup

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp       # SSH
sudo ufw allow 80/tcp       # HTTP
sudo ufw allow 443/tcp      # HTTPS
sudo ufw enable
sudo ufw status verbose
```

### 21.2 — Development (Also Allow Direct Ports)

```bash
sudo ufw allow 3000/tcp     # Frontend dev server
sudo ufw allow 8000/tcp     # Backend direct access
```

### 21.3 — Production (Remove Dev Ports)

In production, Nginx handles everything on port 80/443. Direct access to 3000/8000 is unnecessary:

```bash
sudo ufw delete allow 3000/tcp
sudo ufw delete allow 8000/tcp
```

### 21.4 — Cloud Provider Firewall

> **Critical:** AWS/GCP/Azure/DigitalOcean have their own firewall (Security Groups). You must open ports there too — UFW alone is not enough.

| Port | Purpose | Dev | Prod |
|------|---------|-----|------|
| 22   | SSH     | ✅  | ✅   |
| 80   | HTTP    | ✅  | ✅   |
| 443  | HTTPS   | —   | ✅   |
| 3000 | Vite    | ✅  | ❌   |
| 8000 | API     | ✅  | ❌   |

---

## 22. Security: SSH Hardening

### 22.1 — Use SSH Key Auth (Disable Password Login)

```bash
# On your LOCAL machine — generate key if you don't have one
ssh-keygen -t ed25519

# Copy public key to server
ssh-copy-id user@YOUR_PUBLIC_IP
```

### 22.2 — Disable Password Auth

```bash
sudo nano /etc/ssh/sshd_config
```

Set:
```
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
```

```bash
sudo systemctl restart sshd
```

### 22.3 — Install Fail2Ban

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

This automatically bans IPs after repeated failed SSH attempts.

---

## 23. Security: PostgreSQL Hardening

### 23.1 — Restrict to Localhost Only

Already covered in [Section 15.2](#152--restrict-database-connections). Verify:

```bash
sudo ss -tlnp | grep 5432
# Should show 127.0.0.1:5432 — NOT 0.0.0.0:5432
```

### 23.2 — Use Separate DB User (Already Done)

The `hms_user` account is a non-superuser with access only to `hms_db`. Never use the `postgres` superuser in application code.

### 23.3 — Connection Limits

```bash
sudo -u postgres psql -c "ALTER USER hms_user CONNECTION LIMIT 20;"
```

---

## 24. Security: Application Hardening

### 24.1 — Production `.env` Checklist

```env
DEBUG=False                          # Never True in production
SECRET_KEY=<64_char_random_hex>      # Never use the default
CORS_ORIGINS=["https://yourdomain.com"]  # Exact origin, no wildcards
```

### 24.2 — Rate Limiting (Optional)

Add to Nginx config inside the `http {}` block (in `/etc/nginx/nginx.conf`):

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
```

Then in the `server` block (`/etc/nginx/sites-available/hms`):
```nginx
location /api {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://127.0.0.1:8000;
    # ... rest of proxy config
}
```

### 24.3 — Hide Server Version

```bash
sudo nano /etc/nginx/nginx.conf
```

Inside `http {}`:
```nginx
server_tokens off;
```

```bash
sudo systemctl reload nginx
```

---

## 25. Security: Checklist

| Item | Dev | Prod |
|------|-----|------|
| Strong DB password | ☐ | ✅ |
| Unique SECRET_KEY | ☐ | ✅ |
| DEBUG=False | — | ✅ |
| HTTPS (SSL/TLS) | — | ✅ |
| UFW enabled | ☐ | ✅ |
| Ports 3000/8000 closed in UFW | — | ✅ |
| SSH key auth only | — | ✅ |
| Fail2Ban installed | — | ✅ |
| PostgreSQL localhost only | ✅ | ✅ |
| CORS restricted to exact origin | — | ✅ |
| Nginx hides server_tokens | — | ✅ |
| Automated DB backups | — | ✅ |
| Gunicorn (not bare uvicorn) | — | ✅ |
| Systemd auto-restart | — | ✅ |
| Cloud firewall rules set | — | ✅ |

---

# Operations

---

## 26. Service Management

### 26.1 — Development (nohup)

```bash
# Start backend
cd ~/Hospital_Management_System/backend
source venv/bin/activate
nohup venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &

# Start frontend
cd ~/Hospital_Management_System/frontend
nohup npm run dev -- --host 0.0.0.0 --port 3000 > frontend.log 2>&1 &

# Stop
pkill -f "uvicorn app.main:app"
pkill -f "npm run dev"
```

### 26.2 — Production (systemd)

```bash
# Start/stop/restart
sudo systemctl start hms-backend
sudo systemctl stop hms-backend
sudo systemctl restart hms-backend

# Nginx
sudo systemctl reload nginx

# View logs
sudo journalctl -u hms-backend -f
tail -f /var/log/hms/backend_access.log
tail -f /var/log/hms/backend_error.log
sudo tail -f /var/log/nginx/access.log
```

### 26.3 — Check All Services

```bash
sudo ss -tlnp | grep -E '80|443|8000|5432'
```

| Service    | Port | Expected Bind (Prod) |
|------------|------|----------------------|
| PostgreSQL | 5432 | `127.0.0.1:5432`     |
| Backend    | 8000 | `127.0.0.1:8000`     |
| Nginx      | 80   | `0.0.0.0:80`         |
| Nginx      | 443  | `0.0.0.0:443`        |

### 26.4 — Restart Everything (After Reboot)

```bash
sudo systemctl start postgresql
sudo systemctl start hms-backend
sudo systemctl start nginx
```

With systemd `enable`, this happens automatically on boot.

---

## 27. Troubleshooting

### PostgreSQL

| Error | Cause | Fix |
|-------|-------|-----|
| `Peer authentication failed for user "hms_user"` | Ubuntu peer auth | Change `pg_hba.conf` to `md5`, restart PostgreSQL ([Section 11.2](#112--fix-peer-authentication-common-ubuntu-issue)) |
| `sudo psql` fails with peer auth | Running as root | Use `psql -h localhost -U hms_user -d hms_db` |
| `connection refused` | PostgreSQL not running | `sudo systemctl start postgresql` |
| `database "hms_db" does not exist` | DB not created | Run [Section 11.3](#113--create-user--database) |
| `permission denied for schema public` | Missing grants | `GRANT ALL ON SCHEMA public TO hms_user;` |
| Password prompt every time | No `.pgpass` | Run [Section 11.6](#116--skip-password-prompts) |

### Backend

| Error | Cause | Fix |
|-------|-------|-----|
| `uvicorn: command not found` | Not using venv path | Use `venv/bin/uvicorn` or activate venv first |
| `ModuleNotFoundError` | Venv not activated / deps missing | `source venv/bin/activate && pip install -r requirements.txt` |
| `Address already in use (8000)` | Previous instance running | `pkill -f uvicorn` or `sudo kill $(lsof -t -i:8000)` |
| `502 Bad Gateway` (via Nginx) | Backend not running | Check `ss -tlnp \| grep 8000`, restart backend |
| Login returns 401 | Wrong creds or no seed data | `SELECT username FROM users;` to verify |

### Frontend

| Error | Cause | Fix |
|-------|-------|-----|
| Not loading on public IP | Vite bound to localhost | Use `--host 0.0.0.0` |
| `[::1]:3000` in ss output | IPv6 only | Use `--host 0.0.0.0` |
| Vite HMR WebSocket error | HMR host misconfigured | Add `hmr.host` in `vite.config.ts` |
| `npm install` fails | Node.js too old | Upgrade to Node 20+ |
| Blank page after deploy | Wrong API URL | Check `VITE_API_BASE_URL` in `.env`, rebuild |

### CORS

| Error | Cause | Fix |
|-------|-------|-----|
| `OPTIONS 400 Bad Request` | Public IP missing from CORS | Add `http://YOUR_IP:3000` to `CORS_ORIGINS` |
| Login works in curl, not browser | CORS rejection | Add exact origin to `CORS_ORIGINS`, restart backend |
| Console: "blocked by CORS" | Origin mismatch | Must match exactly: protocol + host + port, no trailing slash |

### Windows-Specific

| Error | Cause | Fix |
|-------|-------|-----|
| `psql` not recognized | Not in PATH | `$env:PATH += ";C:\Program Files\PostgreSQL\15\bin"` |
| Port in use | Previous process | `netstat -ano \| findstr :8000` then `taskkill /PID <PID> /F` |
| PostgreSQL not running | Service stopped | `Start-Service postgresql-x64-15` |
| `.\venv\Scripts\Activate.ps1` blocked | Execution policy | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |

### General

| Error | Cause | Fix |
|-------|-------|-----|
| Services stop after SSH disconnect | Didn't use nohup/systemd | Use `nohup ... &` or set up systemd |
| `.env` changes not applied | Process not restarted | Restart backend after every `.env` change |
| Frontend shows old code | Browser cache | Hard refresh: Ctrl+Shift+R |

---

### Test Login API

**Linux:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "superadmin@123"}'
```

**Windows CMD:**
```cmd
curl -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d "{\"username\": \"superadmin\", \"password\": \"superadmin@123\"}"
```

**Windows PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"username": "superadmin", "password": "superadmin@123"}'
```

---

### URLs

| What    | Dev (local)                  | Production                          |
|---------|------------------------------|--------------------------------------|
| App     | http://localhost:3000        | https://yourdomain.com               |
| API     | http://localhost:8000        | https://yourdomain.com/api           |
| Swagger | http://localhost:8000/api/docs | https://yourdomain.com/api/docs   |

---

*Replace `YOUR_PUBLIC_IP` with your actual server IP.*
*Replace `YOUR_USER` with your Linux username.*
*Replace `yourdomain.com` with your actual domain.*
