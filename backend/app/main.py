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
    walk_ins, waitlist, prescriptions, pharmacy, pharmacy_dispensing,
    inventory, notifications,
    walk_ins, waitlist, prescriptions,
    # Billing & Invoice module
    invoices, payments, refunds, settlements, tax_configurations,
)
from .routers import logs as logs_router  # frontend log ingestion endpoint

logger = get_logger(__name__)

# Import models so they're registered with Base.metadata
from .models import user, patient, appointment, patient_id_sequence, department, hospital_settings, prescription, inventory as inventory_models, notification  # noqa: F401
from .models import user, patient, appointment, patient_id_sequence, department, hospital_settings, prescription  # noqa: F401
from .models import tax_config, invoice, payment, refund, settlement, insurance  # noqa: F401  — billing models

# NOTE: We do NOT call Base.metadata.create_all() — the new hms_db schema
# is managed via the SQL migration files (01_schema.sql, 02_seed_data.sql).

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for uploads
uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
if os.path.exists(uploads_dir):
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
    logger.info(f"Mounted uploads directory: {uploads_dir}")
else:
    logger.warning(f"Uploads directory not found: {uploads_dir}")


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
app.include_router(walk_ins.router, prefix="/api/v1")
app.include_router(waitlist.router, prefix="/api/v1")
app.include_router(prescriptions.router, prefix="/api/v1")
app.include_router(prescriptions.medicines_router, prefix="/api/v1")
app.include_router(prescriptions.templates_router, prefix="/api/v1")
app.include_router(pharmacy.router, prefix="/api/v1")
app.include_router(pharmacy_dispensing.router, prefix="/api/v1")
app.include_router(logs_router.router, prefix="/api/v1")  # POST /api/v1/logs/frontend
app.include_router(notifications.router, prefix="/api/v1")

# Inventory module
app.include_router(inventory.router, prefix="/api/v1")
app.include_router(inventory.suppliers_router, prefix="/api/v1")
app.include_router(inventory.po_router, prefix="/api/v1")
app.include_router(inventory.grn_router, prefix="/api/v1")
app.include_router(inventory.movements_router, prefix="/api/v1")
app.include_router(inventory.adjustments_router, prefix="/api/v1")
app.include_router(inventory.cycle_counts_router, prefix="/api/v1")


# ── Startup / Shutdown events ──────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    logger.info("HMS Backend server started — %s v%s", settings.APP_NAME, settings.APP_VERSION)


@app.on_event("shutdown")
async def on_shutdown():
    logger.info("HMS Backend server shutting down")

# ── Billing & Invoice module ──
app.include_router(invoices.router, prefix="/api/v1")
app.include_router(payments.router, prefix="/api/v1")
app.include_router(refunds.router, prefix="/api/v1")
app.include_router(settlements.router, prefix="/api/v1")
app.include_router(tax_configurations.router, prefix="/api/v1")


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
async def get_hospital_config():
    """Get hospital configuration (for ID cards, reports, etc.)"""
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
