#!/bin/bash
# =============================================================================
# HMS Deployment Script
# Run this on the server after: git pull
# Usage: bash deploy/deploy.sh   (run from the project root)
#
# NOTE: vite.config.ts builds to frontend/dist (Vite's normal default).
#       Nginx is pointed at that path directly — no cp step needed. Read
#       traversal for nginx (www-data) up to frontend/dist is granted
#       automatically in step 4 on every run (idempotent).
# =============================================================================

set -e  # stop on any error

PROJECT_DIR="$HOME/projects/Hospital_Management_System"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
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

# Every file here is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING
# throughout) — safe to re-run on every deploy, on a database that already
# has data. This used to be just 01_full_schema.sql + 02_eye_hospital_updates.sql,
# which meant every dated/numbered migration added since (05 through the
# newest 2026-* file) never reached production through this script — a real
# incident (Lab Test Packages shipped in code+committed, but never appeared
# live because its migration was never applied). New migration files MUST be
# added to this list — nothing here discovers them automatically.
#
# Deliberately excluded: 99_drop_database.sql (destructive), and
# workforce_attendance_module_combined.sql / security_token_revocation_combined.sql
# (one-time patches for pre-01_full_schema.sql databases only — see
# database_hole/README.md; NOT meant for routine replay here).
for f in \
    01_full_schema.sql \
    02_eye_hospital_updates.sql \
    05_schema_structure.sql \
    07_queue_display_screens.sql \
    08_role_permission_overrides.sql \
    09_grn_edit_and_opd_assignment.sql \
    10_lab_test_templates_batch2.sql \
    11_lab_technician_role.sql \
    12_lab_test_templates_batch3.sql \
    13_lab_test_fasting_blood_sugar.sql \
    14_optional_doctor_id.sql \
    15_clinical_note_ngrams.sql \
    16_ngram_field_type_and_medicine_columns.sql \
    2026-08-09_medicine_bulk_upload_fields.sql \
    2026-08-12_appointment_followup_label.sql \
    2026-08-12_gst_purchase_order.sql \
    2026-08-13_general_billing_module.sql \
    2026-08-14_lab_test_panels.sql \
    2026-08-15_medicine_batch_mrp_column.sql \
    2026-08-17_lab_order_item_billed_name.sql \
; do
    echo "  Applying $f..."
    psql -U hms_user -d hms_db -f "database_hole/$f"
done
echo "  Migration complete"

# ── 4. Grant nginx read access into the project directory ───────────────────
echo ""
echo "[4/7] Preparing frontend/dist permissions..."

# nginx (runs as www-data, not in your user's group) needs execute ("traverse")
# permission on every directory from $HOME down to frontend/dist, plus
# read+execute on frontend/dist itself so it can serve the built files.
# $HOME defaults to 750 on most distros, which would otherwise block www-data
# entirely. This only opens *traversal*, not write access — same pattern
# already used for backend/uploads served the same way. Idempotent.
chmod o+rx "$HOME" "$PROJECT_DIR" "$FRONTEND_DIR" 2>/dev/null || true
echo "  Traversal permission granted: $HOME -> $FRONTEND_DIR"

# ── 5. Frontend build ────────────────────────────────────────────────────────
echo ""
echo "[5/7] Building frontend..."
# vite.config.ts has outDir: 'dist' (Vite's default) — builds into
# frontend/dist, same directory nginx is configured to serve from directly.

cd "$FRONTEND_DIR"
npm install --silent
npm run build
chmod -R o+rX "$FRONTEND_DIR/dist"
echo "  Build complete → $FRONTEND_DIR/dist"
cd "$PROJECT_DIR"

# ── 6. Nginx install + config ────────────────────────────────────────────────
echo ""
echo "[6/7] Configuring Nginx..."

sudo apt-get install -y nginx -qq

# nginx.conf ships with a __FRONTEND_DIST__ placeholder instead of a hardcoded
# path, since frontend/dist now lives under this deploy's own $HOME rather
# than a fixed system path like /var/www/hms.
sed "s|__FRONTEND_DIST__|$FRONTEND_DIR/dist|g" "$PROJECT_DIR/deploy/nginx.conf" | sudo tee /etc/nginx/sites-available/hms > /dev/null
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
