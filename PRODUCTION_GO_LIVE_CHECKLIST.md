# HMS — Production Go-Live Checklist & Service Scripts Plan

**Status: PROPOSAL ONLY — nothing in this document has been applied yet.**
Everything below is what I found by auditing the repo, plus what I propose to build/fix.
Review it, tell me what to change, and I'll implement only after you approve.

---

## 0. How to read this document

- **§1–5** cover the five things you explicitly asked for (Start/Stop/Find/Logs/Flush), each with
  *what exists today*, *what's broken or missing*, and *what I propose*.
- **§6** is everything else this audit surfaced that could bite you on a production go-live.
- **§7** is decisions only you can make — I've stopped and listed them rather than guessing.
- **§8** splits remaining work into *what I can script from here* vs *what only you can do*
  (server access, DNS, buying a domain/cert, etc.).

---

## Executive summary — what I actually found

Your repo already has **two different, inconsistent deployment stories**, and neither is fully
production-safe yet:

1. **`deploy/` directory** (`deploy.sh`, `hms-backend.service`, `nginx.conf`) — the more correct
   path: systemd-managed uvicorn behind nginx, serving a real production Vite build. But it has
   real bugs (below).
2. **`linux_setup_detailed.md` §12 "Category F"** — a simpler guide that starts the backend with
   `nohup uvicorn ... &` and, critically, **starts the frontend with `npm run dev`** (Vite's *dev
   server*, not a production build) via `nohup`. Running a dev server in production is a real risk:
   no minification/caching, exposes dev-only behavior, weaker, and it's not what nginx.conf expects
   to serve.

**These two can't both be "the" production setup.** I'm proposing we standardize on option 1
(systemd + nginx + real build) and fix its bugs, and retire option 2's frontend approach. Flagged
as a decision in §7.

**The most urgent finding:** `deploy/deploy.sh` only runs migrations `01_full_schema.sql` and
`02_eye_hospital_updates.sql`. Every other file in `database_hole/` (03 through the current
highest number) — role/permission overrides, queue display config, GRN/OPD updates, the lab test
catalog additions, and (once merged) the entire Workforce Management schema — **would silently
not exist on a fresh production database** if you ran today's `deploy.sh` as-is. This needs fixing
before go-live, not after.

---

## 1. Start Service

### What exists today
- `deploy/hms-backend.service` (systemd unit) — `ExecStart=.../venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2`, `Restart=always`.
- `deploy/deploy.sh` installs it once, then does `sudo systemctl restart hms-backend` + `sudo systemctl restart nginx`.
- `linux_setup_detailed.md` §12 has a *different*, non-systemd `start.sh` (nohup + PID files, binds `0.0.0.0:8000` and `0.0.0.0:3000` directly, no nginx).

### Problem found
`--workers 2` in the systemd unit conflicts with a real limitation already commented in
`backend/app/main.py` (lines ~140-141): the rate limiter is **in-memory, per-process**. With 2
worker processes, rate limits are tracked separately per worker — a client's requests may land on
either worker, so the effective limit becomes inconsistent (roughly up to 2x, or under-enforced
depending on load balancing). This is a real correctness gap for a production security control,
not cosmetic.

### Proposed script: `deploy/start.sh`
```bash
#!/bin/bash
set -e
echo "Starting HMS services..."
sudo systemctl start postgresql
sudo systemctl start hms-backend
sudo systemctl start nginx
sleep 2
sudo systemctl --no-pager status postgresql hms-backend nginx
```
Thin wrapper — systemd already does the real work (auto-restart on crash, auto-start on reboot via
`enable`). Decision needed on worker count (see §7).

---

## 2. Stop Service

### What exists today
Only the non-systemd `pkill -f "uvicorn app.main:app"` / `pkill -f "npm run dev"` approach in
`linux_setup_detailed.md`. No systemd-based stop script exists yet.

### Proposed script: `deploy/stop.sh`
```bash
#!/bin/bash
echo "Stopping HMS services..."
sudo systemctl stop hms-backend
sudo systemctl stop nginx
echo "Stopped. (PostgreSQL left running — it's a shared system service.)"
```
Deliberately does **not** stop PostgreSQL — that's a shared system service other things could
depend on, and accidentally taking down the DB along with "the app" is a classic footgun.

---

## 3. Service Find (status)

### What exists today
`linux_setup_detailed.md` has `sudo ss -tlnp | grep -E '3000|8000|5432'` (port-based check only —
doesn't tell you *why* something's down, just that a port isn't listening).

### Proposed script: `deploy/status.sh`
```bash
#!/bin/bash
echo "=== HMS Service Status ==="
echo ""
echo "--- systemd ---"
sudo systemctl --no-pager status postgresql hms-backend nginx | grep -E "●|Active:"
echo ""
echo "--- Ports ---"
sudo ss -tlnp | grep -E ':5432|:8000|:80|:443' || echo "  (none of the expected ports are listening)"
echo ""
echo "--- Backend health ---"
curl -sf http://127.0.0.1:8000/health && echo " → Backend OK" || echo " → Backend DOWN"
echo ""
echo "--- Database ---"
psql -h localhost -U hms_user -d hms_db -c "SELECT 1;" > /dev/null 2>&1 && echo "DB: OK" || echo "DB: DOWN"
```

### Bug found in the existing health check
`deploy/deploy.sh`'s own post-deploy check curls `http://127.0.0.1:8000/api/v1/health` — the real
endpoint (`backend/app/main.py`) is mounted at plain **`/health`**, not under `/api/v1/`. That curl
has been silently checking a URL that 404s since the script was written. Also, `deploy/nginx.conf`
only proxies `location ^~ /api/` — a bare `curl https://yourdomain/health` from *outside* the
server falls through to the SPA's `try_files` and returns `index.html` with a `200`, which looks
healthy but isn't actually hitting the backend. I'll add a dedicated `location = /health { proxy_pass ...; }`
block to `nginx.conf` so external health checks (e.g. a monitoring service) hit the real endpoint.

---

## 4. Logs

### What exists today — and a real duplication/rotation gap
- **The Python app itself** (`backend/app/logging_config.py`) writes to `logs/backend.log`
  (repo-root-relative) via a `RotatingFileHandler`: 20 MB max, **only 1 backup kept**. Frontend
  error logs land separately in `logs/frontend.log` (fed by `POST /api/v1/logs/frontend`), same
  rotation policy, `propagate=False` so they never mix.
- **systemd** (`deploy/hms-backend.service`) *also* redirects the process's raw stdout/stderr to a
  **second, different file**: `backend/backend.log` (append-only). Since the app's own console
  handler prints the same lines the file handler writes, this file ends up with largely the same
  content as `logs/backend.log` — except systemd's `append:` **never rotates it**, so it grows
  unbounded forever unless something else (logrotate) manages it. Nothing currently does.
- `docs/deployment/DEPLOYMENT.md` describes yet a **third** location
  (`/var/log/hms/gunicorn-access.log` / `gunicorn-error.log`) that doesn't match either of the
  above — that section of the doc was written for a gunicorn-based setup that was never actually
  wired up (no gunicorn in `requirements.txt`).

### Proposed fix
1. Drop the `StandardOutput=append:.../backend.log` / `StandardError=append:...` lines from
   `hms-backend.service` entirely — let systemd's default journald capture handle it instead
   (`journalctl -u hms-backend`), which rotates automatically and needs no extra care. The app's
   own `logs/backend.log`/`logs/frontend.log` remain the source of truth for application-level
   logging (already rotates, already has the right format).
2. Add a small `/etc/logrotate.d/hms` entry for `logs/backend.log` / `logs/frontend.log` anyway —
   1 backup (current setting) means you lose history fast under real production traffic; I'd
   recommend keeping e.g. 14 daily rotations instead of just 1. **Your call in §7.**
3. Fix the stale `DEPLOYMENT.md` reference to gunicorn log paths that were never real.

### Proposed script: `deploy/logs.sh`
```bash
#!/bin/bash
# Usage: ./logs.sh [backend|frontend|nginx|system]
case "$1" in
  backend)  tail -f "$HOME"/*/backend/logs/backend.log ;;
  frontend) tail -f "$HOME"/*/backend/logs/frontend.log ;;
  nginx)    sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log ;;
  system|"") sudo journalctl -u hms-backend -f ;;
  *) echo "Usage: $0 [backend|frontend|nginx|system]" ;;
esac
```

---

## 5. Flush Particular Hospital Data

### What exists today — **nothing**. This has to be built from scratch.
I searched the entire Super Admin area (`backend/app/routers/superadmin.py`, tenant/hospital
services) and found tenant lifecycle actions (`suspend`, `activate`, `cancel`, `reactivate`,
`change-plan`), but **no operation deletes or resets a single hospital's clinical/operational
data.** `database_hole/99_drop_database.sql` is the only destructive script that exists, and it
drops the **entire database, every hospital, irreversibly** — its own README already marks it
"never run against production."

Since this is destructive and entirely new, I want to walk through the design with you rather
than silently pick one, so I'm not just proposing a script — I'm proposing the shape of it. If a
hospital cancels their subscription (or you need to reset a demo/test tenant), what should
"flush" actually mean?

### Design proposal (for your review, not yet built)
- **Scope**: delete only the *operational/clinical* data for one `hospital_id` — patients,
  appointments, prescriptions, invoices/payments, inventory, lab orders, workforce data, etc. —
  while leaving the `hospitals` row, its `saas_core.tenants`/subscription row, its module toggles,
  and its `users` (staff accounts) intact, so the hospital itself still exists and can be used
  again with a clean slate. (Tell me if you actually want staff/users wiped too — different
  request entirely.)
- **Guardrails** (this is the part I don't want to get wrong):
  1. Requires `super_admin` role, same as every other Super Admin action.
  2. Hospital must be in a non-active subscription state (`suspended`/`cancelled`) before flush is
     allowed — prevents fat-fingering a live, paying hospital's data away.
  3. A **dry-run mode** first: `GET /superadmin/tenants/{id}/flush-preview` returns row counts per
     table that *would* be deleted, no writes.
  4. The real flush (`POST /superadmin/tenants/{id}/flush`) requires the caller to re-type the
     hospital's exact name/code as confirmation (same pattern most SaaS "delete my account" flows
     use) — protects against a stray click.
  5. **Mandatory pre-flush backup**: the endpoint triggers (or requires proof of) a `pg_dump`
     scoped to that hospital's rows before proceeding, or refuses to run.
  6. Every flush is written to `saas_core.audit_logs` (cross-tenant, already exists) with who/when/
     what was deleted — this is exactly what that table is for.
- **Order of deletion** matters because of FK constraints — children before parents (e.g.
  `payments` → `invoices` → ... down to `patients`), all scoped by `hospital_id =`.
- A CLI/script variant (`scripts/flush_hospital.py --hospital-id ... --confirm <code>`) in addition
  to the API endpoint, for when you need to do this directly on the server without going through
  the UI.

**I have not written any code for this yet — it's genuinely new, destructive, and worth getting
the guardrails right before anything is built.** See §7 for the specific questions I need answered
before I implement it.

---

## 6. Broader pre-go-live checklist (found during this audit)

| # | Item | Current state | Risk if unaddressed |
|---|------|----------------|----------------------|
| 1 | **Migrations run by `deploy.sh`** | Only runs `01` + `02` | Production DB missing RBAC overrides, queue display config, GRN/OPD updates, lab catalog additions, and Workforce Management entirely |
| 2 | `SECRET_KEY` / `DATABASE_URL` | Code already **refuses to start** with placeholders when `DEBUG=false` (`backend/app/config.py:86-106`) — good, real guardrail already in place | Low — just make sure real values are set in the server's `.env` |
| 3 | `CORS_ORIGINS` | Defaults to `localhost:3000`/`5173`; `deploy.sh` auto-appends the server's bare IP | Must be your real domain(s) over HTTPS, not an IP, once DNS/SSL are up |
| 4 | API docs exposed | `/api/docs` and `/api/redoc` are always mounted, never disabled for prod | Swagger UI + schema publicly browsable; low risk but easy to close (`docs_url=None` when `not DEBUG`) |
| 5 | SSL/HTTPS | `nginx.conf` sends an HSTS header but has **no actual TLS/certbot block** — it's plain HTTP on port 80 only | Everything (including login) currently would be sent in the clear until a cert is installed |
| 6 | Health check bug | See §3 — `/api/v1/health` vs real `/health`, and nginx doesn't proxy `/health` at all | Automated health checks silently always "fail" or silently always "pass" against the wrong thing |
| 7 | Rate limiter vs multi-worker | See §1 — in-memory limiter, `--workers 2` | Rate limiting under-enforced |
| 8 | Log rotation | 1 backup kept for `logs/backend.log`/`frontend.log`; a second, never-rotated `backend/backend.log` from systemd | Disk fills slowly over time; short log history for incident investigation |
| 9 | Backups | Documented in `DEPLOYMENT.md` (cron `pg_dump`) but **no cron file actually exists** in the repo | No real backup running today |
| 10 | Firewall | Documented (`ufw allow 80,443,22`) but nothing to verify from the repo — depends on the actual server | Depends entirely on server-side setup, not code |
| 11 | Two conflicting deploy paths | `deploy/` (systemd+nginx+build) vs `linux_setup_detailed.md` (nohup + `npm run dev`) | Risk of someone following the wrong guide and running a dev server in production |
| 12 | Redis | `DEPLOYMENT.md`/checklist mentions Redis rate-limiting, but `config.py` has no `REDIS_URL` field at all — documented, never implemented | Not a blocker (in-memory works for `--workers 1`), just a stale doc reference to clean up |
| 13 | Super admin + subscription plans seeded | `DEPLOYMENT.md` checklist item, unverified from repo | Must confirm on the actual production DB before go-live |
| 14 | `frontend/vite.config.ts` `outDir` | Hardcoded to `/var/www/hms` (Linux absolute path) | Confirms build must run **on the Linux server itself**, not on this Windows dev machine — can't `npm run build` here and copy over |

---

## 7. Decisions I need from you before I implement anything

1. **Target production OS**: every piece of deployment tooling in this repo (systemd, nginx,
   `apt-get`, the hardcoded `/var/www/hms` build path) assumes **Linux**. Confirm that's really
   where this is deploying — if it's a Windows server instead, the Start/Stop/Find scripts need to
   be a Windows Service (nssm) approach instead, and the frontend build path needs to change first.
2. **Which deployment story do we keep**: the `deploy/` systemd+nginx+real-build path, or the
   `linux_setup_detailed.md` nohup+`npm run dev` path? I recommend the former and would retire/
   relabel the latter as "local testing only," not production guidance.
3. **Uvicorn worker count**: keep `--workers 2` and accept the rate-limiter caveat (fine if traffic
   is currently light), drop to `--workers 1` for correctness now, or is a Redis-backed limiter
   worth building before go-live? (That's more work, not a quick fix.)
4. **Log rotation depth**: keep 1 backup (current), or move to something like 14 daily rotations?
5. **"Flush Particular Hospital Data" exact scope**: confirm the design in §5 — specifically:
   should staff `users` accounts be wiped too, or only clinical/operational data (patients,
   appointments, billing, inventory, workforce, etc.) while keeping the hospital shell and its
   staff logins intact for reuse?
6. **Who can trigger a flush**: Super Admin only (as I assumed), or also a hospital's own `admin`
   for their own hospital (self-service reset)?

---

## 8. Who does what

### Things I can script/build here, once you approve the above
- `deploy/start.sh`, `stop.sh`, `status.sh`, `logs.sh`
- Fix `deploy/deploy.sh`'s health-check URL and migration list (run every `database_hole/*.sql`
  file in order, not just 01+02)
- Fix `deploy/nginx.conf` to proxy `/health` correctly
- Remove the duplicate systemd stdout/stderr log redirect; add a logrotate config
- Build the Flush Particular Hospital Data endpoint + confirmation flow + audit logging, per
  whatever scope you confirm in §7
- Clean up the stale/incorrect references in `docs/deployment/DEPLOYMENT.md` (gunicorn log paths,
  Redis, `frontend/dist/` output path that no longer matches `vite.config.ts`)
- A cron-based backup script (`/etc/cron.d/hms-backup`) if you want it committed to the repo as a
  template you then install on the server

### Things only you can do (need real server/domain access I don't have)
- Provision the actual production server (or confirm the one you already have)
- Point DNS at it, obtain the SSL certificate (certbot) — I can write the commands, you run them
- Put real values into the server's `backend/.env` (`SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGINS`,
  SMTP credentials) — I should never see or generate your production secrets for you
- Actually run `deploy.sh` (or the fixed version) on the server, since I have no access to it from
  this Windows dev machine
- Configure the server firewall (ufw / cloud provider security group)
- Set up off-server backup storage (S3 or similar) if you want uploads backed up off-box
- Confirm the super admin user + subscription plans are seeded on the real production DB

---

## Status
- [ ] §7 decisions answered
- [ ] Start/Stop/Status/Logs scripts written (pending §7.1–§7.2)
- [ ] `deploy.sh` migration list + health-check URL fixed
- [ ] `nginx.conf` `/health` proxy + SSL block added
- [ ] Logging duplication resolved + logrotate added
- [ ] Flush Particular Hospital Data built (pending §7.5–§7.6)
- [ ] Stale deployment docs corrected
- [ ] Backup cron template added
