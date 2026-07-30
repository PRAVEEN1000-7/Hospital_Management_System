import logging
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError
from .config import settings

# ── Centralized Logging Setup ──────────────────────────────────────────────
# Initialise rotating-file + console logging BEFORE any other imports so that
# every module inherits the same format and handlers. See logging_config.py
# for full details on rotation policy (20 MB max, 1 backup).
from .logging_config import setup_backend_logging, get_logger
setup_backend_logging(level=logging.DEBUG if settings.DEBUG else logging.INFO)

# Import routers
from .routers import (
    auth, hospital, users, patients,
    appointments, schedules, appointment_settings, appointment_reports,
    departments, doctors, hospital_settings as hospital_settings_router,
    queue_screens, role_permissions,
    walk_ins, waitlist, prescriptions, pharmacy, pharmacy_dispensing,
    inventory, notifications, optical, lab,
    # Billing & Invoice module
    invoices, payments, refunds, settlements, tax_configurations,
    # Workforce Management module (Phase 1-5)
    employees, holidays, shifts, attendance, leave,
    workforce_reports, payroll,
)
from .routers import logs as logs_router  # frontend log ingestion endpoint
from .routers import public_queue  # unauthenticated public Queue Display

# Multi-tenant routers
from .routers import superadmin, tenant_admin
from .core.tenant_security import SubscriptionValidator
from .dependencies import get_current_active_user
from fastapi import Depends

logger = get_logger(__name__)

# Import models so they're registered with Base.metadata
from .models import user, patient, appointment, patient_id_sequence, department, hospital_settings, prescription, inventory as inventory_models, notification, optical as optical_models, lab as lab_models  # noqa: F401
# Ensure PasswordResetToken is registered with SQLAlchemy metadata
from .models import tax_config, invoice, payment, refund, settlement, insurance  # noqa: F401
from .models import tenant  # noqa: F401
from .models import employee, holiday  # noqa: F401
from .models import shift, attendance as attendance_models  # noqa: F401
from .models import leave as leave_models  # noqa: F401
from .models import payroll as payroll_models  # noqa: F401

# NOTE: We do NOT call Base.metadata.create_all() — the new hms_db schema
# is managed via the SQL migration files (01_schema.sql, 02_seed_data.sql).

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# Tenant Context Middleware (must be before CORS for proper header handling)
from .core.tenant import TenantMiddleware
app.add_middleware(TenantMiddleware)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for uploads.
# Create the directory (and common subfolders) up-front and mount unconditionally —
# otherwise, on a fresh checkout where ./uploads does not yet exist, the mount would
# be skipped at startup and every /uploads/* request (avatars, logos) returns 404
# even after files are later written.
uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
for _sub in ("photos", "hospital"):
    os.makedirs(os.path.join(uploads_dir, _sub), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
app.mount("/api/v1/uploads", StaticFiles(directory=uploads_dir), name="api_uploads")
logger.info(f"Mounted uploads directory: {uploads_dir}")


# ── Request Logging Middleware ───────────────────────────────────────────────
# Logs every incoming API request with method, path, and response status code.
import time

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    # Skip noisy health-check and static file requests
    path = request.url.path
    if path not in ("/health", "/") and not path.startswith("/uploads"):
        logger.info(
            "%s %s → %s (%.0fms)",
            request.method, path, response.status_code, duration_ms,
        )
    # Surface missing upload files distinctly from ordinary 404s — this is the
    # signal that lets ops tell a genuinely-missing file (deleted, never saved,
    # wrong DB path) apart from a misconfigured reverse proxy upstream of us.
    if response.status_code == 404 and "/uploads/" in path:
        relative = path.split("/uploads/", 1)[1]
        resolved = os.path.join(uploads_dir, relative)
        logger.warning(
            "Upload file not found: requested=%s resolved_path=%s exists_on_disk=%s",
            path, resolved, os.path.exists(resolved),
        )
    return response


# ── Audit Logging Middleware ─────────────────────────────────────────────────
# Persists every mutating (POST/PUT/PATCH/DELETE) API action to the cross-tenant
# audit_logs table so the super admin can review all activity across the site.
from starlette.concurrency import run_in_threadpool
from .core.audit_middleware import record_audit_event, AUDIT_METHODS, _client_ip


@app.middleware("http")
async def audit_mutations(request: Request, call_next):
    response = await call_next(request)
    if request.method in AUDIT_METHODS:
        # Snapshot request data before handing off — run the DB write in a
        # threadpool so it never blocks the event loop.
        try:
            await run_in_threadpool(
                record_audit_event,
                request.method,
                request.url.path,
                dict(request.headers),
                _client_ip(request),
                response.status_code,
            )
        except Exception:
            pass
    return response


# ── Rate Limiting Middleware ─────────────────────────────────────────────────
# Throttles authenticated API requests per-user (so one account can't hammer the
# API) using the configured limits. Fail-open: any limiter error allows the
# request. NOTE: the in-memory limiter is per-process — use a Redis-backed
# limiter when running multiple workers/instances.
import uuid as _uuid_rl
from .utils.security import decode_access_token as _decode_token_rl


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if settings.RATE_LIMIT_ENABLED:
        path = request.url.path
        # Skip auth (separately throttled), health, static uploads and non-API paths.
        if path.startswith("/api/v1/") and not path.startswith("/api/v1/auth/"):
            auth_header = request.headers.get("authorization", "")
            if auth_header.lower().startswith("bearer "):
                try:
                    payload = _decode_token_rl(auth_header[7:])
                    subject = (payload or {}).get("user_id") or (payload or {}).get("tenant_id")
                    if subject:
                        from .core.rate_limiter import get_rate_limiter
                        allowed, _stats = get_rate_limiter().check_limit(_uuid_rl.UUID(str(subject)))
                        if not allowed:
                            return JSONResponse(
                                status_code=429,
                                content={"detail": "Too many requests. Please slow down and try again shortly."},
                                headers={**_cors_headers(request), "Retry-After": "60"},
                            )
                except Exception:
                    pass  # fail-open — never block a request because of the limiter
    return await call_next(request)


# ── Security Headers Middleware ──────────────────────────────────────────────
# Baseline hardening headers on every response from this backend (JSON API
# responses and the printed prescription/optical/appointment HTML documents).
# Note: in production the SPA's index.html is served directly by nginx, not
# by this app (see deploy/nginx.conf) — these headers do NOT reach the SPA
# shell itself, only responses FastAPI returns directly. The SPA gets its own
# CSP via a <meta> tag in frontend/index.html, and nginx sets the headers
# that can only be delivered as real HTTP headers (X-Frame-Options, HSTS).
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
    # script-src deliberately excludes 'unsafe-inline'/'unsafe-eval' — this is
    # the directive that actually matters for stopping injected <script> tags
    # from executing (SECURITY_AUDIT.md M2). style-src needs 'unsafe-inline'
    # because the printed documents use inline style="" attributes throughout.
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "object-src 'none'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'"
    )
    return response


# ---------- Global Exception Handlers ----------
def _cors_headers(request: Request) -> dict:
    """Build CORS headers matching CORSMiddleware config so error responses include them."""
    origin = request.headers.get("origin", "")
    if origin in settings.CORS_ORIGINS:
        return {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
            "vary": "Origin",
        }
    return {}


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"Database error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "A database error occurred. Please try again later."},
        headers=_cors_headers(request),
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."},
        headers=_cors_headers(request),
    )


# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(public_queue.router, prefix="/api/v1")  # unauthenticated — see security notes in the router module
app.include_router(hospital.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(patients.router, prefix="/api/v1")
app.include_router(appointments.router, prefix="/api/v1")
app.include_router(schedules.router, prefix="/api/v1")
app.include_router(appointment_settings.router, prefix="/api/v1")
app.include_router(appointment_reports.router, prefix="/api/v1")
app.include_router(departments.router, prefix="/api/v1")
app.include_router(doctors.router, prefix="/api/v1")
app.include_router(hospital_settings_router.router, prefix="/api/v1")
app.include_router(queue_screens.router, prefix="/api/v1")
app.include_router(role_permissions.router, prefix="/api/v1")
app.include_router(walk_ins.router, prefix="/api/v1")
app.include_router(waitlist.router, prefix="/api/v1")
_require_prescriptions = [Depends(SubscriptionValidator.require_module_access('prescriptions'))]
_require_pharmacy      = [Depends(SubscriptionValidator.require_module_access('pharmacy'))]
_require_inventory     = [Depends(SubscriptionValidator.require_module_access('inventory'))]
_require_billing       = [Depends(SubscriptionValidator.require_module_access('billing'))]
_require_optical       = [Depends(SubscriptionValidator.require_module_access('optical'))]
_require_lab           = [Depends(SubscriptionValidator.require_module_access('lab'))]
_require_employees     = [Depends(SubscriptionValidator.require_module_access('employee_management'))]
_require_holidays      = [Depends(SubscriptionValidator.require_module_access('holiday_management'))]
_require_shifts        = [Depends(SubscriptionValidator.require_module_access('shift_management'))]
_require_attendance    = [Depends(SubscriptionValidator.require_module_access('attendance'))]
_require_leave         = [Depends(SubscriptionValidator.require_module_access('leave_management'))]
_require_payroll       = [Depends(SubscriptionValidator.require_module_access('payroll'))]

app.include_router(prescriptions.router, prefix="/api/v1", dependencies=_require_prescriptions)
app.include_router(prescriptions.medicines_router, prefix="/api/v1", dependencies=_require_prescriptions)
app.include_router(prescriptions.templates_router, prefix="/api/v1", dependencies=_require_prescriptions)
app.include_router(pharmacy.router, prefix="/api/v1", dependencies=_require_pharmacy)
app.include_router(pharmacy_dispensing.router, prefix="/api/v1", dependencies=_require_pharmacy)
app.include_router(logs_router.router, prefix="/api/v1")  # POST /api/v1/logs/frontend
app.include_router(notifications.router, prefix="/api/v1")

# Inventory module
app.include_router(inventory.router, prefix="/api/v1", dependencies=_require_inventory)
app.include_router(inventory.suppliers_router, prefix="/api/v1", dependencies=_require_inventory)
app.include_router(inventory.po_router, prefix="/api/v1", dependencies=_require_inventory)
app.include_router(inventory.grn_router, prefix="/api/v1", dependencies=_require_inventory)
app.include_router(inventory.movements_router, prefix="/api/v1", dependencies=_require_inventory)
app.include_router(inventory.adjustments_router, prefix="/api/v1", dependencies=_require_inventory)
# Cycle Counts disabled application-wide — router intentionally not mounted,
# so every endpoint 404s. All code (router, service, schemas, models) is
# untouched; uncomment this line to re-enable.
# app.include_router(inventory.cycle_counts_router, prefix="/api/v1", dependencies=_require_inventory)

# Optical Store module
app.include_router(optical.router, prefix="/api/v1", dependencies=_require_optical)

# Laboratory module
app.include_router(lab.router, prefix="/api/v1", dependencies=_require_lab)

# Billing & Invoice module
app.include_router(invoices.router, prefix="/api/v1", dependencies=_require_billing)
app.include_router(payments.router, prefix="/api/v1", dependencies=_require_billing)
app.include_router(refunds.router, prefix="/api/v1", dependencies=_require_billing)
app.include_router(settlements.router, prefix="/api/v1", dependencies=_require_billing)
app.include_router(tax_configurations.router, prefix="/api/v1", dependencies=_require_billing)

# Workforce Management module (Phase 1: Employee + Holiday; Phase 2: Shift + Attendance)
app.include_router(employees.router, prefix="/api/v1", dependencies=_require_employees)
app.include_router(holidays.router, prefix="/api/v1", dependencies=_require_holidays)
app.include_router(shifts.router, prefix="/api/v1", dependencies=_require_shifts)
app.include_router(attendance.router, prefix="/api/v1", dependencies=_require_attendance)
app.include_router(leave.router, prefix="/api/v1", dependencies=_require_leave)
app.include_router(payroll.router, prefix="/api/v1", dependencies=_require_payroll)
app.include_router(payroll.payslips_router, prefix="/api/v1", dependencies=_require_payroll)
# Reports gate module access per-endpoint (different reports need different
# modules) rather than one blanket dependency for the whole router.
app.include_router(workforce_reports.router, prefix="/api/v1")

# Multi-tenant management routes
app.include_router(superadmin.router, prefix="/api/v1")
app.include_router(tenant_admin.router, prefix="/api/v1")


# ── Startup / Shutdown events ──────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    logger.info("HMS Backend server started — %s v%s", settings.APP_NAME, settings.APP_VERSION)


@app.on_event("shutdown")
async def on_shutdown():
    logger.info("HMS Backend server shutting down")


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "operational",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/api/v1/config/hospital")
async def get_hospital_config(
    current_user=Depends(get_current_active_user),  # S10: require auth
):
    """Get hospital configuration (for ID cards, reports, etc.) — authenticated users only."""
    return {
        "hospital_name": settings.HOSPITAL_NAME,
        "hospital_address": settings.HOSPITAL_ADDRESS,
        "hospital_city": settings.HOSPITAL_CITY,
        "hospital_state": settings.HOSPITAL_STATE,
        "hospital_country": settings.HOSPITAL_COUNTRY,
        "hospital_pin_code": settings.HOSPITAL_PIN_CODE,
        "hospital_phone": settings.HOSPITAL_PHONE,
        "hospital_email": settings.HOSPITAL_EMAIL,
        "hospital_website": settings.HOSPITAL_WEBSITE,
    }
