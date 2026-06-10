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
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql://hms_user:HMS%402026@localhost:5432/hms_db"
    DB_ECHO: bool = False

    # Security — MUST be overridden via backend/.env (never commit real keys)
    SECRET_KEY: str = "CHANGE-ME-generate-with-secrets-token-hex-32"
    # Generate: python -c "import secrets; print(secrets.token_hex(32))"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

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

    # Rate Limiting (per tenant)
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 100  # Per tenant
    RATE_LIMIT_REQUESTS_PER_HOUR: int = 5000  # Per tenant
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
if settings.SECRET_KEY == _INSECURE_KEY:
    if not settings.DEBUG:
        raise RuntimeError(
            "SECRET_KEY is the insecure default. "
            "Generate one: python -c \"import secrets; print(secrets.token_hex(32))\" "
            "and set it in backend/.env"
        )
    logging.getLogger(__name__).warning(
        "SECRET_KEY is using the insecure default — set a real value in .env before production."
    )
