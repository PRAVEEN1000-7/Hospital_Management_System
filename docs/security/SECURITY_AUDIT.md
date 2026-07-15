# 🔒 HMS Multi-Tenant — Security & Code Audit Report

> **Scope:** Full-stack audit of the multi-tenant Hospital Management System
> (FastAPI backend + React/TypeScript frontend) on branch `multi-tenant`.
> **Date:** 2026-06-24
> **Auditor:** End-to-end code review (auth, multi-tenant isolation, routers,
> services, financial & inventory models, frontend auth flow, XSS sinks).

---

## 📌 Update — 2026-06-28

A fresh full-codebase re-scan (auth/session, multi-tenant isolation across
every router, frontend XSS/redirect sinks, secrets/headers) verified each
finding below against current code and fixed everything practical to fix
without a larger infra/architecture change. Status markers added inline
below (✅ Fixed · ⚠️ Still open). New findings from this pass:

- **C1/C2 status correction**: a prior commit claimed to fix these but only
  added the `revoked_tokens` migration and this document — **zero
  enforcement code** was written. Now actually implemented: `jti` claim on
  every access token, blocklist checked in `dependencies.get_current_user`
  on every request, real rotating refresh tokens (`/auth/refresh` no longer
  accepts the access token), revocation wired into `/auth/logout` and
  `/auth/change-password`.
- **C1 gap found while fixing it**: `routers/superadmin.py` (tenant/hospital
  management, audit logs, subscription plans — the entire `/superadmin/*`
  surface) authenticates via a **separate** decode path
  (`core.tenant.get_current_superadmin`) that never went through the
  blocklist check above, and `SuperAdminService.create_access_token()`
  minted tokens with no `jti` at all — so superadmin tokens were
  unrevokable regardless of which login endpoint issued them. Fixed: that
  token creation now delegates to the shared `core.security.create_access_token()`
  (gets a `jti` for free), `get_current_superadmin` now runs the same
  blocklist check, and a `POST /superadmin/logout` endpoint was added.
- **New H finding — IDOR in `routers/waitlist.py`**: `GET/PATCH/DELETE
  /waitlist/{id}` and `POST /waitlist/{id}/book` fetched the entry by ID
  alone, no hospital scoping — same root cause as H1/H2 below, different
  router. Fixed: `get_waitlist_entry`/`update_waitlist_entry`/
  `cancel_waitlist_entry` now take and filter on `hospital_id`.
- **M2 fixed**: every value derived from user input (diagnosis, clinical/
  opthal notes, advice, medicine fields, patient/doctor names, free-typed
  symptoms, chief complaint) is now `html.escape()`d before interpolation
  in `routers/prescriptions.py`, `routers/optical.py`, and
  `routers/appointments.py`'s PDF-HTML generation, closing the stored-XSS
  sink described below.
- **M3 fixed**: `NotificationContainer.tsx` now validates `actionUrl` is a
  same-origin relative path (`/^\/(?!\/)/`) before navigating — rejects
  `javascript:`, `data:`, absolute URLs, and protocol-relative `//host` URLs.
- **New — baseline security headers**: previously **none** were set at all.
  Added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, and a `Content-Security-Policy` (no
  `'unsafe-inline'`/`'unsafe-eval'` in `script-src`) via FastAPI middleware
  (`main.py`) for backend-rendered responses, a matching CSP `<meta>` tag in
  `frontend/index.html` for the SPA shell (works in dev and prod, since prod
  serves `index.html` from nginx, not FastAPI), and `X-Frame-Options`/HSTS/
  `Referrer-Policy` as real HTTP headers in `deploy/nginx.conf` (HSTS is a
  no-op until TLS is enabled, included so it activates automatically then).
- **Verified still accurate, not yet fixed**: C3 (token in localStorage —
  blocked on migrating to HttpOnly cookies, which itself is blocked on TLS
  per L2), M4 (in-memory per-process rate limiter), M5 (`X-Tenant-ID` header
  trust). See their sections below for current detail.
- **Re-verified as not actually exploitable**: the `UserUpdate.is_active`
  mass-assignment concern raised during this pass — `PUT /users/{id}`
  already requires `require_admin_or_super_admin` *and* scopes the target
  user by `hospital_id=current_user.hospital_id`, so this is admin-only,
  same-hospital-only behavior working as intended, not a privilege-escalation
  path.

---

## Table of Contents

- [Architecture Summary](#-architecture-summary)
- [Critical Findings](#-critical)
- [High Findings](#-high)
- [Medium Findings](#-medium)
- [Low Findings](#-low)
- [Things Done Right](#-things-done-right)
- [Recommended Fix Order](#-recommended-fix-order)
- [Severity Legend](#-severity-legend)

---

## 🏗️ Architecture Summary

| Layer | Stack | Notes |
|-------|-------|-------|
| **Backend** | FastAPI + SQLAlchemy ORM + PostgreSQL | Multi-tenant via `hospital_id` on every row |
| **SaaS layer** | `Tenant` → `Hospital` → `User` | Subscription/module gating on top of tenancy |
| **Auth** | Signed JWTs (HS256) | Stateless; `Authorization: Bearer` header |
| **Frontend** | React + TypeScript (Vite) | SPA, token in `localStorage` |
| **Money types** | `Numeric(12,2)` (Decimal) | Correct — not float |
| **ID generation** | `id_sequences` table + `with_for_update()` | Correct — atomic |
| **Stock** | Batches decremented with row locks | Correct |

**Key architectural risk:** Tenant isolation is enforced *manually* in each
route by filtering on `current_user.hospital_id`. There is **no DB-level
row-level security** and **no global SQLAlchemy event listener that auto-injects
the filter** (`backend/app/core/tenant.py:261-270` — the `before_compile`
listener is a no-op `return query`). Isolation correctness therefore depends on
**every single query remembering the filter** — and a few don't.

---

## 🔴 Critical

### C1. JWT logout is a no-op — tokens cannot be revoked ✅ FIXED

| | |
|---|---|
| **Files** | `backend/app/routers/auth.py:187-195`, `frontend/src/services/authService.ts:15-23` |
| **OWASP** | A07: Identification & Authentication Failures |

```python
# backend/app/routers/auth.py:187-195
@router.post("/logout")
async def logout(current_user, request=None):
    """Logout user — client must discard the access token."""
    ip_address = get_client_ip(request) if request else None
    logger.info(f"LOGOUT: user={current_user.username} from {ip_address}")
    return {"success": True, "message": "Successfully logged out"}  # token still valid!
```

```ts
// frontend/src/services/authService.ts:15-23
async logout(): Promise<void> {
  try { await api.post('/auth/logout'); } catch { /* no-op */ }
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
}
```

**Exploit:** JWTs are stateless with no server-side blocklist. A token stolen
via XSS / logs / MITM stays fully valid until expiry (60 min, and `/refresh`
extends it). "Logout" only clears the current browser — an attacker who already
grabbed the token is unaffected. `must_change_password` and account deactivation
also do **not** invalidate an outstanding token.

**Fix:** Add a `jti` claim + a Redis/DB blocklist; `/logout` adds the current
`jti`. `decode_access_token` rejects blocklisted `jti`s. Shorten access-token
lifetime once refresh is fixed (see C2).

---

### C2. `/auth/refresh` accepts the access token itself — no real refresh-token rotation ✅ FIXED

| | |
|---|---|
| **File** | `backend/app/routers/auth.py:198-263` |
| **OWASP** | A07: Identification & Authentication Failures |

```python
# /auth/refresh uses get_current_active_user — i.e. the ACCESS token — to mint a new one
async def refresh_token(current_user: User = Depends(get_current_active_user), ...):
    access_token = create_access_token(data={...})  # re-issued from the *access* token
```

**Exploit:** There is no separate, rotating, one-time-use refresh token. A
captured access token can be renewed indefinitely via `/refresh` as long as it
is valid, defeating the purpose of a short access-token lifetime. The codebase
*generates* opaque refresh tokens (`backend/app/core/security.py:81-88`) and
hashes them (`hash_refresh_token`) but **never uses them**.

**Fix:** Issue a real refresh token (HttpOnly cookie, SHA-256 hash stored in DB,
rotated on each use, single-use enforced). `/refresh` must accept **only** the
refresh token, not the access token.

---

### C3. Access token stored in `localStorage` (XSS → full account takeover) ⚠️ STILL OPEN

| | |
|---|---|
| **Files** | `frontend/src/services/api.ts:56`, `frontend/src/services/authService.ts:9-10` |
| **OWASP** | A05: Security Misconfiguration / A03: Injection (XSS chain) |

```ts
// frontend/src/services/authService.ts:9-10
localStorage.setItem('access_token', data.access_token);
localStorage.setItem('user', JSON.stringify(data.user));

// frontend/src/services/api.ts:56
let token = localStorage.getItem('access_token');
```

**Exploit:** Any XSS anywhere in the SPA (and there are several sinks — see C4,
M2) can read `localStorage` and exfiltrate the bearer token. Combined with C1
and C2, that is permanent account takeover, including of `super_admin`.

**Fix:** Move the token to an `HttpOnly; Secure; SameSite=Strict` cookie set by
the backend; use `withCredentials: true` on axios instead of manually attaching
the `Authorization` header. Keep at most a minimal in-memory copy.

---

### C4. Unauthenticated frontend-log endpoint → log injection / log flooding / exfil channel ✅ FIXED

| | |
|---|---|
| **File** | `backend/app/routers/logs.py:53-70` (registered without auth in `main.py:226`) |
| **OWASP** | A01: Broken Access Control, A09: Security Logging Failures |

```python
# backend/app/routers/logs.py:53-70
@router.post("/frontend", status_code=204)
async def receive_frontend_logs(batch: FrontendLogBatch, request: Request):  # no auth
    client_ip = request.client.host if request.client else "unknown"
    for entry in batch.logs:
        level = _LEVEL_MAP.get(entry.level.upper(), logging.INFO)
        fe_logger.log(level, f"{entry.component} | {entry.message}{extra_ctx} [ip={client_ip}]")
    return None
```

**Exploit:**
- (a) **Log forging** — arbitrary strings (up to 2000 chars × 50/batch) can be
  injected into `logs/fe.log`, poisoning the audit trail.
- (b) **Disk-fill DoS** — the in-memory rate limiter keys on the JWT subject,
  which **does not apply here** (no token), so the endpoint is effectively
  unthrottled.
- (c) **Exfiltration channel** — XSS payloads can smuggle stolen data out via
  this endpoint.
- (d) **CRLF injection** — `message` is not sanitized for newlines.

**Fix:** Require auth except for a tightly-scoped pre-login allowlist; cap
requests per IP; strip newlines/control chars from `message`; bound total
payload size.

---

## 🟠 High

### H1. IDOR in walk-in consultation-notes GET (cross-tenant clinical data) ✅ FIXED

| | |
|---|---|
| **File** | `backend/app/routers/walk_ins.py:674-702` |
| **OWASP** | A01: Broken Access Control (IDOR) |

```python
# backend/app/routers/walk_ins.py:674-702
@router.get("/queue/{queue_id}/notes")
async def get_consultation_notes(queue_id, db, current_user):
    qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == q_uuid).first()  # no scope!
    ...
    appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
    return {... "clinical_notes", "diagnosis", "prescription", "vitals"}  # PHI!
```

**Exploit:** `AppointmentQueue` has no `hospital_id` column. The POST version
(`save_consultation_notes`, line 629) calls `_require_queue_actor(...)` which
checks the doctor's hospital — but **this GET skips that check entirely**. Any
authenticated user in Hospital A can read Hospital B's clinical notes, vitals,
diagnosis, and prescription by guessing/enumerating a `queue_id`.

**Fix:** Add `_require_queue_actor(db, current_user, qe)` immediately after
fetching `qe` (around line 688).

---

### H2. Several IDOR sinks in walk-ins where `AppointmentQueue`/`Appointment` are fetched by id alone ✅ FIXED (walk_ins.py + waitlist.py)

| | |
|---|---|
| **File** | `backend/app/routers/walk_ins.py:625, 686, 720, 725, 912-936, 999-1009` |
| **OWASP** | A01: Broken Access Control (IDOR) |

```python
qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == q_uuid).first()
appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
doctor = db.query(Doctor).filter(Doctor.id == doctor_uuid).first()
```

**Exploit:** Same root cause as H1 — `AppointmentQueue` lacks `hospital_id`,
and not every code path routes through `_require_queue_actor`. Assign-doctor /
transfer / status-mutation endpoints fetch related entities by raw id without
verifying they belong to the caller's hospital.

**Fix:** Either add `hospital_id` to `AppointmentQueue` (preferred — defense in
depth), or make `_require_queue_actor` mandatory on **every** endpoint that
touches a queue entry. Centralize it as a FastAPI dependency rather than ad-hoc
calls, so it cannot be forgotten.

---

### H3. `.env.production` is committed to git ⚠️ PARTIALLY FIXED (gitignored going forward; still tracked)

| | |
|---|---|
| **File** | `frontend/.env.production` (git-tracked). `.gitignore` only ignores `.env` and `.env.*.local`. |
| **OWASP** | A05: Security Misconfiguration |

**Exploit:** Currently benign (`VITE_API_BASE_URL=/api/v1`), but the pattern
guarantees the next secret added there (Sentry DSN, payment-gateway key,
third-party API key) will ship inside the `dist` bundle and into git history —
where it persists even after deletion.

**Fix:**
```bash
git rm --cached frontend/.env.production
# add to .gitignore:
#   .env.production
```
Inject the value at deploy time via the hosting environment.

---

### H4. Client-side role/permission checks are the only gate for some UX paths ⚠️ STILL OPEN

| | |
|---|---|
| **Files** | `frontend/src/components/common/ProtectedRoute.tsx:36-38`, `frontend/src/contexts/AuthContext.tsx:108-132` |
| **OWASP** | A01: Broken Access Control |

```tsx
// frontend/src/components/common/ProtectedRoute.tsx:36-38
if (allowedRoles && user && !user.roles?.some(r => allowedRoles.includes(r)))
    return <Navigate to="/dashboard" replace />;
```

The `user` object is read verbatim from `localStorage`, so an attacker can run:
```js
localStorage.user = '{"roles":["super_admin"], ...}';
```
…and the UI instantly unlocks every admin route, the SuperAdmin layout, and all
module gating. This is acceptable **only if 100% of backend routes enforce
RBAC** independently. The backend mostly derives authority from the DB-loaded
user (good), but module-gating relies on the `roles` claim embedded in the JWT
(`backend/app/routers/auth.py:153`).

**Fix:**
- Confirm every backend route enforces RBAC server-side (never trust the
  client-supplied `roles` claim for escalation beyond what the DB says).
- Add integration tests that hit each admin endpoint with a low-privilege token
  and assert 403.

---

## 🟡 Medium

### M1. Hospital logo upload allows `.svg` → stored XSS ✅ FIXED

| | |
|---|---|
| **File** | `backend/app/services/hospital_service.py:13, 90-97` |
| **OWASP** | A03: Injection (stored XSS) |

```python
# backend/app/services/hospital_service.py:13
ALLOWED_LOGO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".svg"}
```

Logos are served from `StaticFiles` at `/uploads/hospital/...`
(`backend/app/main.py:73`). SVG can carry executable `<script>`. The validation
is **extension-only** (no content-type or magic-byte sniff), so a `logo.html`
renamed `logo.png` also passes — and user photos use the same pattern
(`user_service.py:252`).

**Exploit:** An admin uploads `<svg onload=alert(document.cookie)>` as the logo;
any staff member viewing the logo runs script in the app origin → token theft
(see C3).

**Fix:**
- Remove `.svg` from the allowlist, or sanitize it server-side
  (e.g. rasterize with `cairosvg`).
- Validate by **content magic bytes**, not extension.
- Serve uploads with `Content-Disposition: attachment` or from a sandbox origin.

---

### M2. `document.write` of server HTML into print windows ✅ FIXED

| | |
|---|---|
| **Files** | `frontend/src/pages/PrescriptionDetail.tsx:88-97`, `frontend/src/pages/optical/OpticalPrescriptionDetail.tsx:33-35`, `frontend/src/pages/MyAppointments.tsx:92-93` |
| **OWASP** | A03: Injection (XSS) |

```ts
// frontend/src/pages/PrescriptionDetail.tsx:88-97
const html = await prescriptionService.getPrescriptionPdfUrl(id, lang || printLang);
const win = window.open('', '_blank');
if (win) {
  win.document.write(html);   // raw HTML from server, inherits opener origin
  win.document.close();
}
```

No `dangerouslySetInnerHTML` exists in the SPA (good), but this is the
equivalent sink: if any patient/doctor-controlled field rendered in the backend
HTML template isn't escaped, it executes here.

**Fix:** Return a real `application/pdf` from the backend. If HTML must be used,
ensure Jinja2 autoescape is on and explicitly escape every interpolation.

---

### M3. Notification `actionUrl` navigated without validation (open redirect / data-URI) ✅ FIXED

| | |
|---|---|
| **Files** | `frontend/src/components/common/NotificationContainer.tsx:64-71`, `frontend/src/contexts/NotificationContext.tsx:130-140, 248-264` |
| **OWASP** | A01: Broken Access Control (open redirect) |

```ts
// frontend/src/components/common/NotificationContainer.tsx:64-71
const handleClick = () => {
  if (!notification.read) markAsRead(notification.id);
  if (notification.actionUrl) {
    window.location.href = notification.actionUrl;   // stored value, no validation
  }
};
```

Notifications are also deserialized from `localStorage` without schema
validation, so a tampered entry (see H4) can carry a hostile URL.

**Fix:** Only navigate if `actionUrl` matches `^/[^/]` (same-origin relative);
reject absolute, `javascript:`, and `data:` schemes.

---

### M4. Rate limiter is in-memory, per-process → ineffective behind multiple workers ⚠️ STILL OPEN

| | |
|---|---|
| **Files** | `backend/app/main.py:139-165` (comment admits it), `backend/app/core/rate_limiter.py` |
| **OWASP** | A07: Identification & Authentication Failures |

**Exploit:** With N uvicorn workers, the real request rate is N× the per-process
cap. Login brute-force protection (`backend/app/routers/auth.py:71-84`) is also
best-effort and **silently disabled** on any exception (`except Exception: pass`)
— a flaky limiter means **no brute-force protection**.

**Fix:** Use a Redis-backed limiter (the code already keys on `uuid`, easy
swap). Make login limiting fail-closed, or at least alert, on limiter errors.

---

### M5. Tenant resolution trusts `X-Tenant-ID` header and subdomain ⚠️ STILL OPEN

| | |
|---|---|
| **File** | `backend/app/core/tenant.py:101-122` |
| **OWASP** | A01: Broken Access Control |

```python
# backend/app/core/tenant.py:101-122
tenant_id_header = request.headers.get('X-Tenant-ID')   # client-supplied!
if tenant_id_header:
    tenant = db.query(Tenant).filter(Tenant.id == uuid.UUID(tenant_id_header), ...).first()
...
subdomain = host.split('.')[0]
tenant = db.query(Tenant).filter(Tenant.slug == subdomain, ...).first()
```

**Exploit:** A client can set `X-Tenant-ID` to any tenant UUID. This is partly
mitigated because most data routes use `current_user.hospital_id` (from the JWT,
re-validated in `dependencies.py:125`) rather than the middleware's
`TenantContext`. But anything that reads `TenantContext.get_current()` instead
of `current_user.hospital_id` inherits the spoofable value.

**Fix:** Derive tenant **only** from the verified JWT (`hospital_id`/`tenant_id`
claim cross-checked against the DB in `get_current_user`). Remove the
`X-Tenant-ID` fallback for authenticated routes; keep subdomain only as a UI
hint.

---

### M6. PII (usernames) logged to backend on every login attempt ✅ FIXED

| | |
|---|---|
| **Files** | `backend/app/routers/auth.py:68, 89, 194, 248`; `frontend/src/pages/Login.tsx:28, 41` (ships usernames into `fe.log` via C4) |
| **OWASP** | A09: Security Logging Failures (PHI exposure) |

```python
logger.info(f"LOGIN ATTEMPT: username='{credentials.username}' from {ip_address}")
```

**Exploit:** Credential-adjacent PHI accumulates in log files with no retention
or scrubbing policy — a HIPAA-relevant concern.

**Fix:** Log a user-id hash or truncated identifier, not the raw username.
Define and enforce a log retention policy.

---

## 🟢 Low

### L1. Rate limiter keys on JWT `user_id`/`tenant_id` without verifying the user exists ⚠️ STILL OPEN

`backend/app/main.py:152-156` — a token with a bogus `user_id` still produces a
stable key but no real per-user fairness. Minor.

### L2. CORS includes a raw HTTP IP and allows credentials with wildcard methods/headers ⚠️ STILL OPEN

`backend/.env:17`, `backend/app/main.py:57-63`. Origins are explicit (good),
but the `http://139.59.62.156` origin over plain HTTP with `allow_credentials:
true` and `methods/headers: ["*"]` is a sniffing risk. Use HTTPS hostnames only
and scope methods/headers to what is actually needed.

### L3. `generate_tenant_code()` uses `random` (not `secrets`) for a 2-char code ✅ FIXED

`backend/app/core/tenant.py:282-286` — only 676 possible codes (collision-prone)
and not cryptographically random.

```python
import random, string
return ''.join(random.choices(string.ascii_uppercase, k=2))
```

**Fix:** Use `secrets.choice` and handle collisions.

### L4. Global `Exception` handler logs `exc_info=True` ⚠️ STILL OPEN

`backend/app/main.py:191-198` — fine for debugging, but ensure the production
log level does not dump full tracebacks containing patient IDs into a
world-readable file.

### L5. `require_resource_access` dependency is a stub ✅ FIXED (removed)

`backend/app/dependencies.py:339-361` — advertised in docstrings as the
cross-tenant guard, but the inner function body is `pass`. Anyone relying on it
gets **no protection**.

```python
def require_resource_access(resource_type: str, resource_id_param_name: str = "resource_id"):
    async def _validate(current_user, db):
        # Note: This is a simplified version...
        pass          # ← does nothing
    return _validate
```

**Fix:** Either implement it, or delete it so nobody trusts it.

---

## ✅ Things Done Right

So you don't accidentally "fix" these:

- **No SQL injection / order-by injection** — all queries use the ORM; sort
  columns use allowlist dicts (`patient_service.py:162-169`,
  `pharmacy_service.py:706-713`).
- **Money is `Numeric`, not float** (`backend/app/models/invoice.py`).
- **Patient/staff ID sequence** uses `with_for_update()` row lock
  (`patient_id_service.py:181`).
- **Stock decrements** (dispensing / invoice / pharmacy / optical) use
  `with_for_update()` + `batch.quantity < qty` checks + expired-batch blocking.
- **Password reset** uses hashed (SHA-256) single-use tokens, 2-hour expiry, no
  email enumeration, invalidates prior tokens.
- **JWT `hospital_id` is re-validated against the DB** on every request
  (`dependencies.py:125`) with a security alert.
- `.env` is **not** git-tracked; `config.py` refuses to boot with the default
  `SECRET_KEY` or `CHANGE_ME` DB URL in production.
- Most data routes (invoices, payments) correctly filter
  `invoice.hospital_id == current_user.hospital_id`.
- **No `dangerouslySetInnerHTML`, `eval(`, or `new Function(`** anywhere in
  `frontend/src`.
- Concurrent token refresh is de-duplicated via a shared `refreshPromise`
  (`api.ts:31-67`).
- The 401 interceptor avoids redirect loops on `/auth/login` and `/auth/refresh`.

---

## 📋 Recommended Fix Order

✅ = done as of the 2026-06-28 pass. Remaining items, in priority order:

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| ~~1~~ | ~~C1 + C2 — token revocation + real refresh rotation~~ | ~~Medium~~ | ✅ Done (including the superadmin-path gap found while fixing it) |
| ~~2~~ | ~~H1 + H2 — hospital_id scoping on walk-in/waitlist IDOR sinks~~ | ~~Low~~ | ✅ Done |
| ~~3~~ | ~~C4 + M6 — auth + sanitize log endpoint; stop logging usernames~~ | ~~Low~~ | ✅ Done |
| ~~4~~ | ~~M1 — drop `.svg` uploads; magic-byte content validation~~ | ~~Low~~ | ✅ Done |
| ~~5~~ | ~~H3 — gitignore `.env.production`~~ | ~~Trivial~~ | ⚠️ Partial — still git-tracked, run `git rm --cached` yourself |
| ~~6~~ | ~~L5 — delete the stub guard~~ | ~~Trivial~~ | ✅ Done |
| ~~7~~ | ~~M2 + M3 — escape PDF HTML; validate notification redirects~~ | ~~Low~~ | ✅ Done |
| ~~8~~ | ~~L3 — `secrets` instead of `random` for tenant codes~~ | ~~Trivial~~ | ✅ Done |
| ~~9~~ | ~~Baseline security headers (CSP/X-Frame-Options/etc., previously none)~~ | ~~Low~~ | ✅ Done |
| **1** | **C3** — migrate token storage to HttpOnly cookies | Medium | Blocked on TLS (L2) — a `Secure` cookie wouldn't be sent over the current plain-HTTP production deploy |
| 2 | **M5** — JWT-only tenant resolution; remove the `X-Tenant-ID` header fallback | Medium | Removes spoofable tenant context |
| 3 | **M4** — Redis-backed rate limiter | Medium | Needed before running multiple backend workers/instances |
| 4 | **H4** — integration tests asserting 403 for low-privilege tokens on every admin route | Medium | Defense in depth for SPA-only gating |
| 5 | **L1, L2, L4** — remaining hardening items | Low | Cleanup |
| 6 | Dead/risky `/superadmin/login` refresh-token path | Low | It mints a `refresh_token` that's never persisted server-side — currently unredeemable. Either wire it up properly or remove it; not used by the live UI today |

---

## 🏷️ Severity Legend

| Severity | Meaning |
|----------|---------|
| 🔴 **Critical** | Directly exploitable; leads to account takeover, PHI breach, or data loss. Fix immediately. |
| 🟠 **High** | Exploitable with some preconditions; serious confidentiality/integrity impact. Fix before next release. |
| 🟡 **Medium** | Requires specific conditions or chains with another issue; meaningful impact. Fix soon. |
| 🟢 **Low** | Defense-in-depth / hardening; limited standalone impact. Fix when convenient. |

---

*End of report.*
