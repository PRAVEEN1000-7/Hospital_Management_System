"""
Frontend Logging Router
========================

Provides a POST endpoint that the React frontend calls to persist
browser-side logs into logs/fe.log on the server.

How it works:
- The frontend sends JSON log entries (level, component, message) via
  POST /api/v1/logs/frontend.
- This router writes each entry through the dedicated frontend logger,
  which uses a RotatingFileHandler (20 MB max, 1 backup).
- No authentication is required for logging (to capture pre-login errors),
  but requests are rate-limited to prevent abuse.

Where logs are stored:
- logs/fe.log  (rotates to fe.log.1 at 20 MB, older backups deleted)
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from ..logging_config import get_frontend_logger

router = APIRouter(prefix="/logs", tags=["Logging"])

fe_logger = get_frontend_logger()

# Map string levels to Python logging levels
_LEVEL_MAP = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "WARN": logging.WARNING,
    "ERROR": logging.ERROR,
}


class FrontendLogEntry(BaseModel):
    """Single log entry sent from the browser."""
    level: str = Field(..., description="Log level: DEBUG | INFO | WARNING | ERROR")
    component: str = Field(..., max_length=100, description="UI component or module name")
    message: str = Field(..., max_length=2000, description="Log message")
    url: Optional[str] = Field(None, max_length=500, description="Page URL where log originated")


class FrontendLogBatch(BaseModel):
    """Batch of log entries (reduce HTTP calls)."""
    logs: List[FrontendLogEntry] = Field(..., max_length=50)


@router.post("/frontend", status_code=204)
async def receive_frontend_logs(batch: FrontendLogBatch, request: Request):
    """
    Receive a batch of frontend log entries and write them to fe.log.

    The frontend buffers logs and sends them periodically or on page unload.
    Each entry is written with the format:
      timestamp | level | component | message
    """
    client_ip = request.client.host if request.client else "unknown"

    for entry in batch.logs:
        level = _LEVEL_MAP.get(entry.level.upper(), logging.INFO)
        # Include the page URL for context when available
        extra_ctx = f" [url={entry.url}]" if entry.url else ""
        fe_logger.log(level, f"{entry.component} | {entry.message}{extra_ctx} [ip={client_ip}]")

    return None
