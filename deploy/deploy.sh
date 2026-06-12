#!/bin/bash
# =============================================================================
# HMS Deployment Script
# Run this on the server after: git pull
# Usage: bash deploy/deploy.sh   (run from the project root)
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

psql -U hms_user -d hms_db -f database_hole/08_fix_hospitals_tenant_id.sql
echo "  Migration complete"

# ── 4. Frontend build ────────────────────────────────────────────────────────
echo ""
echo "[4/7] Building frontend..."

cd "$FRONTEND_DIR"
npm install --silent
npm run build
echo "  Build complete → dist/"
cd "$PROJECT_DIR"

# ── 5. Nginx install + config ────────────────────────────────────────────────
echo ""
echo "[5/7] Configuring Nginx..."

sudo apt-get install -y nginx -qq

sudo cp "$PROJECT_DIR/deploy/nginx.conf" /etc/nginx/sites-available/hms
sudo ln -sf /etc/nginx/sites-available/hms /etc/nginx/sites-enabled/hms
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
echo "  Nginx config valid"

# ── 6. Deploy frontend to web root ───────────────────────────────────────────
echo ""
echo "[6/7] Deploying frontend to $WEB_ROOT..."

sudo mkdir -p "$WEB_ROOT"
sudo cp -r "$FRONTEND_DIR/dist/." "$WEB_ROOT/"
echo "  Frontend deployed"

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
