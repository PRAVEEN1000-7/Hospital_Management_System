"""
Centralized Logging Configuration for HMS Backend
===================================================

How logging works:
- All backend modules import `get_logger(__name__)` from this module.
- The logger writes to two destinations: the console (stdout) and a rotating
  log file at `logs/be.log` (relative to the project root).

How log rotation works:
- Uses Python's RotatingFileHandler.
- When `be.log` reaches 20 MB, it is renamed to `be.log.1` (backup).
- Only 1 backup is kept; older backups are automatically deleted.
- This prevents logs from consuming unbounded disk space.

Where logs are stored:
- Backend logs  → <project_root>/logs/be.log
- Frontend logs → <project_root>/logs/fe.log  (written via /api/v1/logs/frontend endpoint)

Log format:
  2026-03-08 14:12:02 | INFO | module_name | message
"""

import logging
import os
from logging.handlers import RotatingFileHandler

# ── Constants ────────────────────────────────────────────────────────────────
# Resolve project root: backend/app/logging_config.py → ../../ → project root
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOG_DIR = os.path.join(_PROJECT_ROOT, "logs")
BE_LOG_FILE = os.path.join(LOG_DIR, "backend.log")
FE_LOG_FILE = os.path.join(LOG_DIR, "frontend.log")

# Rotation policy
MAX_BYTES = 20 * 1024 * 1024  # 20 MB
BACKUP_COUNT = 1               # Keep 1 backup → be.log + be.log.1

# Format: timestamp | level | module | message
LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def _ensure_log_dir() -> None:
    """Create the logs/ directory if it does not exist."""
    os.makedirs(LOG_DIR, exist_ok=True)


def setup_backend_logging(level: int = logging.INFO) -> None:
    """
    Configure the root logger for the entire backend application.

    Call this ONCE at startup (in main.py) before any other code runs.
    All modules that use `logging.getLogger(__name__)` will inherit these
    handlers and format automatically.
    """
    _ensure_log_dir()

    formatter = logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)

    # 1. Rotating file handler → logs/be.log (20 MB max, 1 backup)
    file_handler = RotatingFileHandler(
        BE_LOG_FILE,
        maxBytes=MAX_BYTES,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setLevel(level)
    file_handler.setFormatter(formatter)

    # 2. Console handler → stdout
    console_handler = logging.StreamHandler()
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)

    # Apply to root logger so every module inherits these handlers
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    # Remove any existing handlers to avoid duplicates on reload
    root_logger.handlers.clear()
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)


def get_logger(name: str) -> logging.Logger:
    """
    Return a named logger. Usage in any module:

        from app.logging_config import get_logger
        logger = get_logger(__name__)
        logger.info("Patient registered successfully")
    """
    return logging.getLogger(name)


def get_frontend_logger() -> logging.Logger:
    """
    Return a dedicated logger that writes to logs/fe.log.
    Uses its own RotatingFileHandler (20 MB max, 1 backup).
    """
    _ensure_log_dir()

    fe_logger = logging.getLogger("frontend")
    # Avoid adding duplicate handlers if called multiple times
    if not fe_logger.handlers:
        formatter = logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)
        fe_handler = RotatingFileHandler(
            FE_LOG_FILE,
            maxBytes=MAX_BYTES,
            backupCount=BACKUP_COUNT,
            encoding="utf-8",
        )
        fe_handler.setLevel(logging.DEBUG)
        fe_handler.setFormatter(formatter)
        fe_logger.addHandler(fe_handler)
        fe_logger.setLevel(logging.DEBUG)
        # Don't propagate to root logger (avoids writing FE logs to be.log)
        fe_logger.propagate = False

    return fe_logger
