#!/bin/bash
# =============================================================================
# HMS Deployment Script
# Run this on the server after: git pull
# Usage: bash deploy/deploy.sh   (run from the project root)
#
# NOTE: vite.config.ts builds directly to /var/www/hms — no cp step needed.
#       Permissions are set automatically in step 4 on every run (idempotent).
# =============================================================================

set -e  # stop on any error

PROJECT_DIR="$HOME/projects/Hospital_Management_System"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
WEB_ROOT="/var/www/hms"
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo "============================================"
echo " HMS Deploy — $(date)"
echo " Server IP: $SERVER_IP"
echo "============================================"

cd "$PROJECT_DIR"

# ── 1. Backend .env — update CORS to include this server's IP ────────────────
echo ""
echo "[1/7] Updating backend .env..."

if [ ! -f "$BACKEND_DIR/.env" ]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    echo "  Created .env from .env.example — set your SECRET_KEY and DATABASE_URL!"
fi

# Add server IP to CORS_ORIGINS if not already present
if ! grep -q "$SERVER_IP" "$BACKEND_DIR/.env"; then
    sed -i "s|CORS_ORIGINS=\[|CORS_ORIGINS=[\"http://$SERVER_IP\",|" "$BACKEND_DIR/.env"
    echo "  Added http://$SERVER_IP to CORS_ORIGINS"
else
    echo "  CORS already includes $SERVER_IP — skipping"
fi

# ── 2. Backend dependencies ──────────────────────────────────────────────────
echo ""
echo "[2/7] Installing backend dependencies..."

cd "$BACKEND_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "  Created Python virtualenv"
fi
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r requirements.txt
echo "  Dependencies up to date"
cd "$PROJECT_DIR"

# ── 3. Database migration ────────────────────────────────────────────────────
echo ""
echo "[3/7] Running database migration..."

# Both files are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING throughout)
# — safe to re-run on every deploy, on a database that already has data.
psql -U hms_user -d hms_db -f database_hole/01_full_schema.sql
psql -U hms_user -d hms_db -f database_hole/02_eye_hospital_updates.sql
echo "  Migration complete"

# ── 4. Prepare web root ──────────────────────────────────────────────────────
echo ""
echo "[4/7] Preparing web root permissions..."

# Create directory if it doesn't exist (first deploy only)
sudo mkdir -p "$WEB_ROOT"

# root owns the directory; hmsadmin group gets full write access.
# nginx (runs as www-data) gets read+execute via the "others" bit (775).
# This is idempotent — safe to run on every deploy.
sudo chown -R root:$(whoami) "$WEB_ROOT"
sudo chmod -R 775 "$WEB_ROOT"
echo "  $WEB_ROOT — owner: root:$(whoami), mode: 775"

# ── 5. Frontend build ────────────────────────────────────────────────────────
echo ""
echo "[5/7] Building frontend..."
# vite.config.ts has outDir: '/var/www/hms' + emptyOutDir: true
# The build writes directly to the web root — no cp needed.

cd "$FRONTEND_DIR"
npm install --silent
npm run build
echo "  Build complete → $WEB_ROOT"
cd "$PROJECT_DIR"

# ── 6. Nginx install + config ────────────────────────────────────────────────
echo ""
echo "[6/7] Configuring Nginx..."

sudo apt-get install -y nginx -qq

sudo cp "$PROJECT_DIR/deploy/nginx.conf" /etc/nginx/sites-available/hms
sudo ln -sf /etc/nginx/sites-available/hms /etc/nginx/sites-enabled/hms
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
echo "  Nginx config valid"

# ── 7. Start / restart services ──────────────────────────────────────────────
echo ""
echo "[7/7] Starting services..."

# Install systemd service if not already registered
if [ ! -f /etc/systemd/system/hms-backend.service ]; then
    sudo cp "$PROJECT_DIR/deploy/hms-backend.service" /etc/systemd/system/hms-backend.service
    sudo systemctl daemon-reload
    sudo systemctl enable hms-backend
    echo "  Installed hms-backend systemd service"
fi

sudo systemctl restart hms-backend
sudo systemctl restart nginx

echo ""
echo "============================================"
echo " Deploy complete!"
echo " Open: http://$SERVER_IP"
echo "============================================"
echo ""

# Quick health check
sleep 2
if curl -sf http://127.0.0.1:8000/api/v1/health > /dev/null 2>&1; then
    echo " Backend: OK"
else
    echo " Backend: not responding yet — check: sudo journalctl -u hms-backend -n 30"
fi

if curl -sf http://127.0.0.1> /dev/null 2>&1; then
    echo " Frontend: OK"
else
    echo " Frontend (nginx): not responding — check: sudo nginx -t"
fi
