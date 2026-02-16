import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from .config import settings
from .routers import auth, patients, users, hospital, chat

logger = logging.getLogger(__name__)

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


# ---------- Global Exception Handlers ----------
@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"Database error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "A database error occurred. Please try again later."},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."},
    )


# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(patients.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(hospital.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")  # AI Chat — remove this line to disable


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
