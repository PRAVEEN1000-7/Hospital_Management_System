import os
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
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/hospital_management"
    DB_ECHO: bool = False

    # Security
    SECRET_KEY: str = "your-secret-key-min-32-characters-long-change-in-production"
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

    # AI Chat (Groq)
    GROQ_API_KEY: str = ""


settings = Settings()
