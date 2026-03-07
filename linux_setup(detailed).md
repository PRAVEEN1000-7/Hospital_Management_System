# HMS — Ubuntu Setup Guide

---

## Table of Contents

### Part A — Ubuntu Server Setup
6. [Prerequisites](#6-prerequisites)
7. [Category A — PostgreSQL Database](#7-category-a--postgresql-database)
8. [Category B — Backend (FastAPI + Python)](#8-category-b--backend-fastapi--python)
9. [Category C — Frontend (React + Vite)](#9-category-c--frontend-react--vite)
10. [Category D — Nginx Reverse Proxy](#10-category-d--nginx-reverse-proxy)
11. [Category E — Firewall & Networking](#11-category-e--firewall--networking)
12. [Category F — Service Management](#12-category-f--service-management)
13. [Category G — Troubleshooting](#13-category-g--troubleshooting)
14. [Category H — Quick-Reference Commands](#14-category-h--quick-reference-commands)

---

# Part B — Ubuntu Server Setup Guide

**From Zero to Deployment**

---

## 6. Prerequisites

| Software | Minimum Version | Purpose |
|---|---|---|
| Ubuntu | 22.04 LTS+ | Server OS |
| PostgreSQL | 15+ | Database |
| Python | 3.10+ (3.11 recommended) | Backend runtime |
| Node.js | 20+ | Frontend build/dev |
| npm | Bundled with Node.js | Package manager |
| Git | Any recent | Code management |
| Nginx | Latest | Reverse proxy (optional) |

### Install Everything

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3-pip nodejs npm postgresql postgresql-contrib git curl ufw nginx
```

> If `python3.11` not available:
> ```bash
> sudo add-apt-repository ppa:deadsnakes/ppa -y && sudo apt update
> sudo apt install -y python3.11 python3.11-venv
> ```

### Verify Installations

```bash
python3.11 --version
node -v
npm -v
psql --version
nginx -v
git --version
```

### Find Your Public IP

```bash
curl -4 ifconfig.me
```

> Save this — referred to as `YOUR_PUBLIC_IP` throughout.

---

## 7. Category A — PostgreSQL Database

### A1 — Fix Peer Authentication (Common Ubuntu Issue)

Ubuntu uses `peer` auth by default — it matches Linux username to DB username. Custom users like `hms_user` fail unless you switch to `md5`.

```bash
# Find and edit pg_hba.conf
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

**Change this line:**
```
local   all   all   peer
```
**To:**
```
local   all   all   md5
```

```bash
sudo systemctl restart postgresql
```

### A2 — Create Database & User

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create user and database
sudo -u postgres psql -c "CREATE USER hms_user WITH PASSWORD 'HMS@2026';"
sudo -u postgres psql -c "CREATE DATABASE hms_db OWNER hms_user;"

# Grant required permissions
sudo -u postgres psql -d hms_db -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
sudo -u postgres psql -d hms_db -c "GRANT ALL ON SCHEMA public TO hms_user;"
sudo -u postgres psql -d hms_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hms_user;"
sudo -u postgres psql -d hms_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hms_user;"
```

### A3 — Run Schema & Seed Data

```bash
cd ~/Hospital_Management_System

# Run in order — order matters!
psql -h localhost -U hms_user -d hms_db -f database_hole/01_schema.sql
psql -h localhost -U hms_user -d hms_db -f database_hole/02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f database_hole/04_waitlist_table.sql
```

> **Do NOT run** `03_queries.sql` — it's a reference file, not a migration.

### A4 — Verify Database

```bash
# Table count (expect ~63)
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"

# User count (expect 10)
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM users;"

# Hospital count (expect 3)
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM hospitals;"

# Role count (expect 9)
psql -h localhost -U hms_user -d hms_db -c "SELECT COUNT(*) FROM roles;"
```

### A5 — Avoid Repeated Password Prompts

```bash
echo "localhost:5432:hms_db:hms_user:HMS@2026" > ~/.pgpass
chmod 600 ~/.pgpass
```

### A6 — Connect Interactively

```bash
# Always use -h localhost to force TCP (avoids peer auth)
psql -h localhost -U hms_user -d hms_db
```

> **DON'T** use `sudo psql` — this runs as root, triggering peer auth mismatch.

### A7 — Reset Password (If Needed)

```bash
sudo -u postgres psql -c "ALTER USER hms_user WITH PASSWORD 'new_password_here';"
```

### A8 — Full Database Reset (Destructive)

```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS hms_db;"
sudo -u postgres psql -c "DROP USER IF EXISTS hms_user;"

# Then re-run steps A2 through A4
```

---

## 8. Category B — Backend (FastAPI + Python)

### B1 — Create Virtual Environment

```bash
cd ~/Hospital_Management_System/backend
python3.11 -m venv venv
source venv/bin/activate
```

> On Ubuntu, always use `source venv/bin/activate` — NOT `venv\Scripts\activate` (that's Windows).

### B2 — Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### B3 — Create Required Directories

```bash
mkdir -p ~/Hospital_Management_System/backend/uploads
```

### B4 — Configure Backend `.env`

```bash
nano ~/Hospital_Management_System/backend/.env
```

Paste the following:

```dotenv
# ── Application ──
APP_NAME=Hospital Management System
APP_VERSION=1.0.0
DEBUG=False

# ── Database ──
# Note: @ in password HMS@2026 is URL-encoded as %40
DATABASE_URL=postgresql://hms_user:HMS%402026@localhost:5432/hms_db
DB_ECHO=False

# ── Security ──
SECRET_KEY=REPLACE_WITH_GENERATED_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── CORS ──
CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173", "http://YOUR_PUBLIC_IP:3000"]

# ── Pagination ──
DEFAULT_PAGE_SIZE=10
MAX_PAGE_SIZE=100

# ── PRN ──
PRN_PREFIX=HMS

# ── SMTP (Optional) ──
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=noreply@hospital.com
SMTP_FROM_NAME=Hospital Management System
```

### B5 — Generate Secret Key & Auto-Configure

```bash
SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
PUBLIC_IP=$(curl -4 -s ifconfig.me)

sed -i "s/REPLACE_WITH_GENERATED_KEY/$SECRET/" ~/Hospital_Management_System/backend/.env
sed -i "s/YOUR_PUBLIC_IP/$PUBLIC_IP/g" ~/Hospital_Management_System/backend/.env

# Verify
cat ~/Hospital_Management_System/backend/.env
```

### B6 — Start Backend

```bash
cd ~/Hospital_Management_System/backend
source venv/bin/activate
nohup venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
echo $! > backend.pid
```

> **Always use `venv/bin/uvicorn`** — plain `uvicorn` won't be found outside the venv.

### B7 — Verify Backend

```bash
# Check it's listening
sudo ss -tlnp | grep 8000

# Test root endpoint
curl -s http://localhost:8000/

# Test login API
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "superadmin@123"}'
```

Expected: JSON with `access_token`.

### B8 — View Backend Logs

```bash
tail -f ~/Hospital_Management_System/backend/backend.log
```

### B9 — Stop Backend

```bash
pkill -f "uvicorn app.main:app"
```

---

## 9. Category C — Frontend (React + Vite)

### C1 — Install Dependencies

```bash
cd ~/Hospital_Management_System/frontend
npm install
```

> If peer dependency errors: `npm install --legacy-peer-deps`

### C2 — Configure Frontend `.env`

```bash
nano ~/Hospital_Management_System/frontend/.env
```

```dotenv
VITE_API_BASE_URL=http://YOUR_PUBLIC_IP:8000/api/v1
```

> This **must** be the public IP, not `localhost`. The browser makes requests from the client machine, not the server.

**Quick setup:**
```bash
PUBLIC_IP=$(curl -4 -s ifconfig.me)
echo "VITE_API_BASE_URL=http://$PUBLIC_IP:8000/api/v1" > ~/Hospital_Management_System/frontend/.env
cat ~/Hospital_Management_System/frontend/.env
```

### C3 — Fix Vite HMR WebSocket (Optional — For Development)

If you're running Vite in dev mode on a remote server and want hot-reload:

```bash
nano ~/Hospital_Management_System/frontend/vite.config.ts
```

Add inside `defineConfig({})`:
```ts
server: {
  host: '0.0.0.0',
  port: 3000,
  hmr: {
    host: 'YOUR_PUBLIC_IP',
    port: 3000,
  },
},
```

### C4 — Start Frontend

```bash
cd ~/Hospital_Management_System/frontend
nohup npm run dev -- --host 0.0.0.0 --port 3000 > frontend.log 2>&1 &
echo $! > frontend.pid
```

> **Must bind to `0.0.0.0`** — binding to `localhost` or `[::1]` blocks public access.

### C5 — Verify Frontend

```bash
sudo ss -tlnp | grep 3000
```

Expect `0.0.0.0:3000` — if it shows `[::1]:3000`, it's only accessible locally.

### C6 — View Frontend Logs

```bash
tail -f ~/Hospital_Management_System/frontend/frontend.log
```

### C7 — Stop Frontend

```bash
pkill -f "npm run dev"
```

---

## 10. Category D — Nginx Reverse Proxy

> **Optional but recommended** — lets you access everything on port 80.

### D1 — Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/default
```

Replace contents with:

```nginx
server {
    listen 80;
    server_name YOUR_PUBLIC_IP;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### D2 — Test & Reload

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 11. Category E — Firewall & Networking

### E1 — Configure UFW

```bash
sudo ufw allow 22/tcp      # SSH — don't lock yourself out!
sudo ufw allow 80/tcp      # Nginx (if using)
sudo ufw allow 3000/tcp    # Frontend (direct access)
sudo ufw allow 8000/tcp    # Backend (direct access)
sudo ufw enable
sudo ufw status
```

### E2 — Cloud Provider Firewall

> **Critical:** If using AWS, GCP, Azure, DigitalOcean, etc., you must **also** open ports in the cloud provider's **Security Group / Firewall rules**. `ufw` alone is not enough.

| Port | Service | Direction |
|---|---|---|
| 22 | SSH | Inbound |
| 80 | Nginx | Inbound |
| 3000 | Frontend | Inbound |
| 8000 | Backend API | Inbound |

---

## 12. Category F — Service Management

### F1 — Check All Services

```bash
sudo ss -tlnp | grep -E '3000|8000|5432'
```

| Service | Port | Expected Bind |
|---|---|---|
| PostgreSQL | 5432 | `127.0.0.1:5432` |
| Backend | 8000 | `0.0.0.0:8000` |
| Frontend | 3000 | `0.0.0.0:3000` |

### F2 — Stop All Services

```bash
pkill -f "uvicorn app.main:app"
pkill -f "npm run dev"
# PostgreSQL stays running (managed by systemctl)
```

### F3 — Restart Everything (After Reboot/Update)

```bash
# Ensure PostgreSQL is running
sudo systemctl start postgresql

# Stop any existing processes
pkill -f "uvicorn app.main:app" 2>/dev/null
pkill -f "npm run dev" 2>/dev/null
sleep 2

# Start backend
cd ~/Hospital_Management_System/backend
source venv/bin/activate
nohup venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
echo $! > backend.pid

# Start frontend
cd ~/Hospital_Management_System/frontend
nohup npm run dev -- --host 0.0.0.0 --port 3000 > frontend.log 2>&1 &
echo $! > frontend.pid

# Verify
sleep 3
sudo ss -tlnp | grep -E '3000|8000|5432'
```

### F4 — Kill by PID (If pkill Doesn't Work)

```bash
# Find PID from ss output
sudo ss -tlnp | grep -E '3000|8000'
# Then kill:
kill -9 <PID>
```

### F5 — Create start/stop/health Scripts

**`~/Hospital_Management_System/start.sh`**
```bash
#!/bin/bash
echo "Starting HMS services..."
sudo systemctl start postgresql
cd ~/Hospital_Management_System/backend
source venv/bin/activate
nohup venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
echo $! > backend.pid
cd ~/Hospital_Management_System/frontend
nohup npm run dev -- --host 0.0.0.0 --port 3000 > frontend.log 2>&1 &
echo $! > frontend.pid
sleep 3
echo "Services started. Checking ports..."
sudo ss -tlnp | grep -E '3000|8000|5432'
```

**`~/Hospital_Management_System/stop.sh`**
```bash
#!/bin/bash
echo "Stopping HMS services..."
pkill -f "uvicorn app.main:app" 2>/dev/null
pkill -f "npm run dev" 2>/dev/null
echo "Stopped."
```

**`~/Hospital_Management_System/health.sh`**
```bash
#!/bin/bash
echo "=== HMS Health Check ==="
echo ""
echo "--- Port Status ---"
sudo ss -tlnp | grep -E '3000|8000|5432'
echo ""
echo "--- Backend API ---"
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:8000/ 2>/dev/null || echo "DOWN"
echo ""
echo "--- Database ---"
psql -h localhost -U hms_user -d hms_db -c "SELECT 1;" > /dev/null 2>&1 && echo "DB: OK" || echo "DB: DOWN"
```

```bash
chmod +x ~/Hospital_Management_System/start.sh
chmod +x ~/Hospital_Management_System/stop.sh
chmod +x ~/Hospital_Management_System/health.sh
```

---

## 13. Category G — Troubleshooting

### PostgreSQL Issues

| Error | Cause | Fix |
|---|---|---|
| `Peer authentication failed for user "hms_user"` | Ubuntu peer auth default | Change `pg_hba.conf` to `md5` (see A1) |
| `sudo psql` fails with peer auth | Running as root, not hms_user | Use `psql -h localhost -U hms_user -d hms_db` |
| `connection refused` | PostgreSQL not running | `sudo systemctl start postgresql` |
| `database "hms_db" does not exist` | DB not created yet | Run step A2 |
| `permission denied for schema public` | Missing grants | Run `GRANT ALL ON SCHEMA public TO hms_user;` as postgres |
| Password prompt keeps appearing | No `.pgpass` file | Run step A5 |

### Backend Issues

| Error | Cause | Fix |
|---|---|---|
| `uvicorn: command not found` | Not using venv path | Use `venv/bin/uvicorn` |
| `ModuleNotFoundError` | Venv not activated or deps missing | `source venv/bin/activate && pip install -r requirements.txt` |
| `Address already in use (8000)` | Previous instance running | `pkill -f uvicorn` then restart |
| `502 Bad Gateway` (via Nginx) | Backend not running | Check `ss -tlnp | grep 8000`, restart backend |
| Login returns 401 | Wrong credentials or DB not seeded | Verify seed data: `SELECT username FROM users;` |

### Frontend Issues

| Error | Cause | Fix |
|---|---|---|
| Frontend not loading on public IP | Vite bound to localhost | Start with `--host 0.0.0.0` |
| `[::1]:3000` in ss output | IPv6 only — blocks IPv4 access | Use `--host 0.0.0.0` flag |
| Vite HMR WebSocket error | HMR defaulting to localhost | Add `hmr.host` in `vite.config.ts` (see C3) |
| `npm install` fails | Node version too old | Upgrade Node.js to 20+ |
| Blank page after deploy | API URL wrong | Check `VITE_API_BASE_URL` uses public IP |

### CORS Issues

| Error | Cause | Fix |
|---|---|---|
| `OPTIONS 400 Bad Request` | CORS missing public IP | Add `http://YOUR_IP:3000` to `CORS_ORIGINS` in backend `.env` |
| Login fails from browser, works in curl | CORS rejection | Add public IP to `CORS_ORIGINS`, restart backend |
| Browser console shows "blocked by CORS" | Origin mismatch | `CORS_ORIGINS` must exactly match browser URL (protocol + host + port, no trailing slash) |

### General Issues

| Error | Cause | Fix |
|---|---|---|
| `uv` not found after install | PATH not updated | `source ~/.bashrc` or `export PATH="$HOME/.local/bin:$PATH"` |
| `.cargo/env` not found | uv doesn't use cargo | Use `source ~/.bashrc` instead |
| Everything stops after SSH disconnect | nohup wasn't used or shell killed | Always use `nohup ... &` pattern. Consider `tmux` or `screen`. |

---

## 14. Category H — Quick-Reference Commands

### Test Login API

**From server (Ubuntu):**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "superadmin@123"}'
```

**From Windows CMD:**
```cmd
curl -X POST http://YOUR_PUBLIC_IP:8000/api/v1/auth/login -H "Content-Type: application/json" -d "{\"username\": \"superadmin\", \"password\": \"superadmin@123\"}"
```

**From Windows PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://YOUR_PUBLIC_IP:8000/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"username": "superadmin", "password": "superadmin@123"}'
```

Expected response: `{"access_token": "...", "token_type": "bearer", ...}`

### Database Quick Commands

```bash
# Connect
psql -h localhost -U hms_user -d hms_db

# Count tables
\dt | wc -l

# List all tables
\dt

# Check a specific table
\d users
\d appointments

# Quick counts
SELECT 'hospitals' AS tbl, COUNT(*) FROM hospitals
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'patients', COUNT(*) FROM patients
UNION ALL SELECT 'doctors', COUNT(*) FROM doctors
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments
UNION ALL SELECT 'prescriptions', COUNT(*) FROM prescriptions
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices;
```

### Service Status One-Liner

```bash
echo "=== Ports ===" && sudo ss -tlnp | grep -E '3000|8000|5432' && echo "=== Backend ===" && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/
```

### URLs After Setup

```
Frontend:  http://YOUR_PUBLIC_IP:3000
Backend:   http://YOUR_PUBLIC_IP:8000
Swagger:   http://YOUR_PUBLIC_IP:8000/api/docs
```

Login: **`superadmin`** / **`superadmin@123`**

---

*Replace `YOUR_PUBLIC_IP` with your actual server IP throughout this guide.*
*Replace `HMS@2026` with your chosen database password if different.*
