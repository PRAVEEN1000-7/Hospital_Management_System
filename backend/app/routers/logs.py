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
- No authentication is required for logging (to capture pre-login errors).

Security notes (SECURITY_AUDIT.md C4):
- This is the one unauthenticated POST endpoint in the API, so the app-wide
  per-user rate limiter (which keys on the JWT subject) never applies to it.
  A dedicated per-IP limiter is enforced below instead.
- `message`/`component`/`url` are attacker-controlled free text written
  straight into a log file — control characters (CR/LF, etc.) are stripped
  so a crafted value can't forge fake log lines (log injection).

Where logs are stored:
- logs/fe.log  (rotates to fe.log.1 at 20 MB, older backups deleted)
"""

import logging
import re
import time
from typing import List, Optional, Dict
from fastapi import APIRouter, HTTPException, Request, status
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

# Strips ASCII control characters (CR, LF, tabs, etc.) so a hostile message
# can't inject fake log lines into fe.log.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")


def _sanitize(value: str) -> str:
    return _CONTROL_CHARS_RE.sub(" ", value)


# Per-IP sliding-window limiter, separate from the app-wide rate limiter
# (which only ever sees authenticated/bearer-token requests). In-memory and
# per-process — acceptable here since this is a best-effort abuse guard on a
# non-critical logging sink, not an auth control.
_MAX_REQUESTS_PER_WINDOW = 20
_WINDOW_SECONDS = 60
_ip_request_log: Dict[str, list] = {}


def _check_ip_rate_limit(client_ip: str) -> bool:
    now = time.time()
    cutoff = now - _WINDOW_SECONDS
    attempts = [t for t in _ip_request_log.get(client_ip, []) if t > cutoff]
    if len(attempts) >= _MAX_REQUESTS_PER_WINDOW:
        _ip_request_log[client_ip] = attempts
        return False
    attempts.append(now)
    _ip_request_log[client_ip] = attempts
    return True


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

    if not _check_ip_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many log requests. Please slow down.",
            headers={"Retry-After": str(_WINDOW_SECONDS)},
        )

    for entry in batch.logs:
        level = _LEVEL_MAP.get(entry.level.upper(), logging.INFO)
        component = _sanitize(entry.component)
        message = _sanitize(entry.message)
        # Include the page URL for context when available
        extra_ctx = f" [url={_sanitize(entry.url)}]" if entry.url else ""
        fe_logger.log(level, f"{component} | {message}{extra_ctx} [ip={client_ip}]")

    return None
