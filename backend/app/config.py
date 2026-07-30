import os
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

# Resolve .env path relative to this file's directory (backend/app/) -> backend/.env
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(BASE_DIR, ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Application
    APP_NAME: str = "Hospital Management System"
    APP_VERSION: str = "1.0.0"
    # Production-safe default. Set DEBUG=true in backend/.env for local development.
    DEBUG: bool = False

    # Database — MUST be provided via backend/.env (no real credentials in source).
    DATABASE_URL: str = "postgresql://hms_user:CHANGE_ME@localhost:5432/hms_db"
    DB_ECHO: bool = False

    # Security — MUST be overridden via backend/.env (never commit real keys)
    SECRET_KEY: str = "CHANGE-ME-generate-with-secrets-token-hex-32"
    # Generate: python -c "import secrets; print(secrets.token_hex(32))"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Content-Security-Policy — narrow, space-separated source-list additions
    # appended to the fixed baseline built in main.py's security_headers
    # middleware. Only these get env-driven extensions: default-src,
    # script-src's own 'self', object-src, frame-ancestors and base-uri are
    # never overridable from .env, so a misconfigured environment can't
    # weaken the directives that actually stop injected scripts / clickjacking.
    # Defaults cover Google-hosted profile photos (the one external image host
    # this app renders today via a user's stored avatar_url); leave the others
    # empty until a real need exists (e.g. add accounts.google.com to
    # CSP_SCRIPT_SRC_EXTRA / CSP_FRAME_SRC_EXTRA only if Google Sign-In is
    # ever wired in — no such login flow exists in this codebase today).
    CSP_IMG_SRC_EXTRA: str = "https://lh3.googleusercontent.com"
    CSP_CONNECT_SRC_EXTRA: str = ""
    CSP_FRAME_SRC_EXTRA: str = ""
    CSP_SCRIPT_SRC_EXTRA: str = ""

    # Pagination
    DEFAULT_PAGE_SIZE: int = 10
    MAX_PAGE_SIZE: int = 100

    # PRN (Patient Reference Number)
    PRN_PREFIX: str = "HMS"

    # SMTP Email Configuration
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@hospital.com"
    SMTP_FROM_NAME: str = "Hospital Management System"
    # Explicit connection mode — falls back to SMTP_PORT == 465 inference in
    # email_service.py when left at these defaults, but honors .env when set
    # (e.g. STARTTLS on a non-587 port, or implicit SSL on a non-465 port).
    SMTP_USE_SSL: bool = False
    SMTP_USE_TLS: bool = True

    # Rate Limiting (per tenant)
    RATE_LIMIT_ENABLED: bool = True
    # 100/min was tripping during normal use once multiple auto-polling
    # widgets existed (Pharmacy/Optical queue boards every 15s, Queue Display
    # every 10s) on top of a page load's usual handful of parallel requests.
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 300  # Per tenant
    RATE_LIMIT_REQUESTS_PER_HOUR: int = 10000  # Per tenant
    RATE_LIMIT_LOGIN_ATTEMPTS: int = 5  # Per 5 minutes
    RATE_LIMIT_API_BURST: int = 50  # Per 30 seconds for burst protection

    # Hospital Details (used for ID cards, reports, emails)
    HOSPITAL_NAME: str = "City General Hospital"
    HOSPITAL_ADDRESS: str = "123 Medical Center Road"
    HOSPITAL_CITY: str = "Mumbai"
    HOSPITAL_STATE: str = "Maharashtra"
    HOSPITAL_COUNTRY: str = "India"
    HOSPITAL_PIN_CODE: str = "400001"
    HOSPITAL_PHONE: str = "+91 22 1234 5678"
    HOSPITAL_EMAIL: str = "info@hospital.com"
    HOSPITAL_WEBSITE: str = "www.hospital.com"


settings = Settings()

_INSECURE_KEY = "CHANGE-ME-generate-with-secrets-token-hex-32"
_log = logging.getLogger(__name__)

if settings.SECRET_KEY == _INSECURE_KEY:
    if not settings.DEBUG:
        raise RuntimeError(
            "SECRET_KEY is the insecure default. "
            "Generate one: python -c \"import secrets; print(secrets.token_hex(32))\" "
            "and set it in backend/.env"
        )
    _log.warning(
        "SECRET_KEY is using the insecure default — set a real value in .env before production."
    )

# Refuse to run in production with the placeholder DB credential left in source.
if "CHANGE_ME" in settings.DATABASE_URL:
    if not settings.DEBUG:
        raise RuntimeError(
            "DATABASE_URL still contains the placeholder credential. "
            "Set a real DATABASE_URL in backend/.env"
        )
    _log.warning(
        "DATABASE_URL is using the placeholder credential — set a real value in .env before production."
    )
