# HMS Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Database Setup](#database-setup)
4. [Backend Deployment](#backend-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [Nginx Configuration](#nginx-configuration)
7. [Docker Deployment](#docker-deployment)
8. [SSL / HTTPS](#ssl--https)
9. [Redis Setup](#redis-setup)
10. [Post-Deployment Checklist](#post-deployment-checklist)
11. [Monitoring & Logs](#monitoring--logs)
12. [Backup Strategy](#backup-strategy)
13. [Updating / Rolling Deploys](#updating--rolling-deploys)

---

## Prerequisites

| Dependency | Minimum Version | Notes |
|---|---|---|
| Python | 3.11+ | Backend runtime |
| Node.js | 18+ | Frontend build |
| PostgreSQL | 15+ | Primary database |
| Redis | 7+ | Rate limiting, session cache |
| Nginx | 1.24+ | Reverse proxy, static serving |
| Ubuntu / Debian | 22.04 LTS | Recommended OS |

---

## Environment Variables

Create `backend/.env` from the template below. **Never commit real values.**

```env
# ── Application ───────────────────────────────────────────────────────────────
APP_NAME="Hospital Management System"
APP_VERSION="1.0.0"
DEBUG=false

# ── Security (REQUIRED — generate fresh values) ───────────────────────────────
# python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=<generated-64-char-hex>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://hms_user:<strong-password>@localhost:5432/hms_db
DB_ECHO=false

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://:@localhost:6379/0

# ── CORS (comma-separated, exact match) ───────────────────────────────────────
CORS_ORIGINS=["https://yourdomain.com","https://www.yourdomain.com"]

# ── SMTP Email ────────────────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME="HMS Platform"

# ── Rate Limiting ─────────────────────────────────────────────────────────────
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS_PER_MINUTE=100
RATE_LIMIT_LOGIN_ATTEMPTS=5

# ── Hospital Defaults (used in email templates / reports) ─────────────────────
HOSPITAL_NAME="Your Hospital Name"
HOSPITAL_ADDRESS="123 Medical Street"
HOSPITAL_CITY="City"
HOSPITAL_STATE="State"
HOSPITAL_COUNTRY="India"
HOSPITAL_PIN_CODE="000000"
HOSPITAL_PHONE="+91 00 0000 0000"
HOSPITAL_EMAIL="info@yourhospital.com"
HOSPITAL_WEBSITE="www.yourhospital.com"
```

Create `frontend/.env.production`:

```env
VITE_API_BASE_URL=https://yourdomain.com/api/v1
```

---

## Database Setup

### 1. Create database and user

```sql
-- As PostgreSQL superuser (postgres)
CREATE USER hms_user WITH PASSWORD 'your-strong-password';
CREATE DATABASE hms_db OWNER hms_user;
GRANT ALL PRIVILEGES ON DATABASE hms_db TO hms_user;

-- Connect to hms_db and run:
CREATE SCHEMA IF NOT EXISTS saas_core AUTHORIZATION hms_user;
GRANT ALL ON SCHEMA public TO hms_user;
GRANT ALL ON SCHEMA saas_core TO hms_user;
```

### 2. Run migrations in order

```bash
cd database_hole

psql -U hms_user -d hms_db -f 01_schema.sql
psql -U hms_user -d hms_db -f 02_seed_data.sql
psql -U hms_user -d hms_db -f 03_hospital_settings.sql
psql -U hms_user -d hms_db -f 04_invoice_schema.sql
psql -U hms_user -d hms_db -f 05_multi_tenant_schema.sql
psql -U hms_user -d hms_db -f 06_payment_requests.sql
psql -U hms_user -d hms_db -f 07_security_schema_fixes.sql
```

### 3. Verify

```bash
psql -U hms_user -d hms_db -c "\dt saas_core.*"
psql -U hms_user -d hms_db -c "\dt public.*"
```

---

## Backend Deployment

### 1. Install Python dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Linux/macOS
# .venv\Scripts\activate           # Windows
pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Test the backend locally

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# Docs: http://localhost:8000/api/docs
```

### 3. Production server with Gunicorn + Uvicorn workers

```bash
# Install gunicorn
pip install gunicorn

# Run (adjust workers = 2 × CPU cores + 1)
gunicorn app.main:app \
  --workers 5 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --access-logfile /var/log/hms/gunicorn-access.log \
  --error-logfile /var/log/hms/gunicorn-error.log \
  --log-level info
```

### 4. Systemd service (auto-start on reboot)

Create `/etc/systemd/system/hms-backend.service`:

```ini
[Unit]
Description=HMS Backend API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/hms/backend
Environment="PATH=/opt/hms/backend/.venv/bin"
EnvironmentFile=/opt/hms/backend/.env
ExecStart=/opt/hms/backend/.venv/bin/gunicorn app.main:app \
    --workers 5 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8000 \
    --timeout 120
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable hms-backend
sudo systemctl start hms-backend
sudo systemctl status hms-backend
```

---

## Frontend Deployment

### 1. Build

```bash
cd frontend
npm install
npm run build
# Output: frontend/dist/
```

### 2. Serve via Nginx (recommended)

Copy the build output to Nginx's web root:

```bash
sudo mkdir -p /var/www/hms
sudo cp -r frontend/dist/* /var/www/hms/
sudo chown -R www-data:www-data /var/www/hms
```

---

## Nginx Configuration

Create `/etc/nginx/sites-available/hms`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Upload size limit
    client_max_body_size 20M;

    # Frontend (React SPA)
    root /var/www/hms;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Uploaded files
    location /uploads/ {
        proxy_pass http://127.0.0.1:8000/uploads/;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/hms /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Docker Deployment

### `docker-compose.yml`

```yaml
version: "3.9"

services:
  db:
    image: postgres:15
    restart: always
    environment:
      POSTGRES_DB: hms_db
      POSTGRES_USER: hms_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database_hole:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hms_user -d hms_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redisdata:/data

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: always
    env_file: ./backend/.env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    ports:
      - "127.0.0.1:8000:8000"
    volumes:
      - uploads:/app/uploads

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_BASE_URL: ${VITE_API_BASE_URL}
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro

volumes:
  pgdata:
  redisdata:
  uploads:
```

### `backend/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["gunicorn", "app.main:app", "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", "--timeout", "120"]
```

### `frontend/Dockerfile`

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## SSL / HTTPS

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renew (verify cron)
sudo certbot renew --dry-run
```

---

## Redis Setup

```bash
sudo apt install redis-server

# Edit /etc/redis/redis.conf:
# requirepass your-redis-password
# maxmemory 256mb
# maxmemory-policy allkeys-lru

sudo systemctl enable redis-server
sudo systemctl start redis-server
```

Add `REDIS_URL=redis://:your-redis-password@localhost:6379/0` to `backend/.env`.

---

## Post-Deployment Checklist

- [ ] `SECRET_KEY` is set to a unique random value (never the default)
- [ ] `DEBUG=false` in production
- [ ] `DATABASE_URL` uses a non-default strong password
- [ ] `CORS_ORIGINS` lists only your actual frontend domain(s)
- [ ] SMTP credentials configured and test email sent
- [ ] Redis is running and `REDIS_URL` is set
- [ ] All 7 SQL migration files executed in order
- [ ] Nginx serving HTTPS (HTTP redirects to HTTPS)
- [ ] SSL certificate installed and auto-renewal working
- [ ] Systemd service enabled and running (`systemctl status hms-backend`)
- [ ] Health check reachable: `curl https://yourdomain.com/health`
- [ ] Super admin user created in DB
- [ ] Subscription plans seeded in DB
- [ ] Firewall: only ports 80, 443, 22 open externally

---

## Monitoring & Logs

### Log locations (systemd deployment)

| Log | Path |
|---|---|
| Backend access | `/var/log/hms/gunicorn-access.log` |
| Backend errors | `/var/log/hms/gunicorn-error.log` |
| Nginx access | `/var/log/nginx/access.log` |
| Nginx errors | `/var/log/nginx/error.log` |
| PostgreSQL | `/var/log/postgresql/` |

### View live logs

```bash
sudo journalctl -u hms-backend -f
sudo tail -f /var/log/hms/gunicorn-error.log
```

### Health endpoints

```
GET /health          → {"status":"healthy"}
GET /api/docs        → Swagger UI (disable in production: set docs_url=None)
```

---

## Backup Strategy

### Automated PostgreSQL backup (cron)

```bash
# /etc/cron.d/hms-backup
0 2 * * * www-data pg_dump -U hms_user hms_db | gzip > /backups/hms_$(date +\%Y\%m\%d).sql.gz
# Keep 30 days
0 3 * * * www-data find /backups -name "hms_*.sql.gz" -mtime +30 -delete
```

### Restore

```bash
gunzip -c /backups/hms_20260601.sql.gz | psql -U hms_user -d hms_db
```

### Uploads backup

```bash
# Sync uploads to S3 (or another location)
aws s3 sync /opt/hms/backend/uploads s3://your-bucket/uploads --delete
```

---

## Updating / Rolling Deploys

```bash
cd /opt/hms

# 1. Pull new code
git pull origin main

# 2. Backend: install new deps + restart
cd backend
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart hms-backend

# 3. Run any new DB migrations
psql -U hms_user -d hms_db -f database_hole/<new_migration>.sql

# 4. Frontend: rebuild and copy
cd ../frontend
npm install
npm run build
sudo cp -r dist/* /var/www/hms/
sudo chown -R www-data:www-data /var/www/hms
```