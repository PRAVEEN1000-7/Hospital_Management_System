"""
Core security utilities — JWT creation/verification and password hashing.

Spec: JWT_SECRET_KEY, HS256, access token 30 min in JS memory,
      refresh token 7 days in httpOnly cookie + SHA-256 hash in DB.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from ..config import settings


# ──────────────────────────────────────────────────
# Password helpers
# ──────────────────────────────────────────────────

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a bcrypt-12 hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt with work factor 12 (per spec)."""
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=12),
    ).decode("utf-8")


# ──────────────────────────────────────────────────
# JWT helpers
# ──────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a short-lived JWT access token.
    Payload MUST contain: user_id, hospital_id, roles, permissions, iat/exp.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    })
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT access token. Returns None on any failure."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


# ──────────────────────────────────────────────────
# Refresh token helpers
# ──────────────────────────────────────────────────

def generate_refresh_token() -> str:
    """Generate a cryptographically secure opaque refresh token (64 bytes hex)."""
    return secrets.token_hex(64)


def hash_refresh_token(token: str) -> str:
    """Return the SHA-256 hex digest of a refresh token for safe DB storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
