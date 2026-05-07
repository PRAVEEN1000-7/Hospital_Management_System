"""
Authentication service — works with new hms_db UUID/RBAC schema.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Tuple, Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session, joinedload
from ..models.user import User, UserRole, Role
from ..utils.security import verify_password

logger = logging.getLogger(__name__)

# Account lockout thresholds (per spec: 5→15min, 10→1hr, 20→indefinite)
_LOCKOUT_RULES = [
    (5, timedelta(minutes=15)),
    (10, timedelta(hours=1)),
]
_LOCKOUT_INDEFINITE_THRESHOLD = 20
_LOCKOUT_INDEFINITE_YEARS = 100  # effectively permanent


def _apply_lockout(user: User) -> None:
    """Update locked_until based on failed_login_attempts thresholds."""
    attempts = user.failed_login_attempts or 0
    if attempts >= _LOCKOUT_INDEFINITE_THRESHOLD:
        user.locked_until = datetime.now(timezone.utc) + timedelta(
            days=_LOCKOUT_INDEFINITE_YEARS * 365
        )
    else:
        for threshold, duration in reversed(_LOCKOUT_RULES):
            if attempts >= threshold:
                user.locked_until = datetime.now(timezone.utc) + duration
                break


def authenticate_user(db: Session, username: str, password: str) -> tuple:
    """
    Authenticate by username and password. Eagerly loads roles.
    Returns (user, reason) where reason is:
      - 'success' if authenticated
      - 'invalid_username' if user not found
      - 'invalid_password' if password is wrong
      - 'account_inactive' if account is deactivated
      - 'account_locked' if account is temporarily locked
    """
    user = (
        db.query(User)
        .options(
            joinedload(User.user_roles).joinedload(UserRole.role),
            joinedload(User.hospital),
        )
        .filter(User.username == username, User.is_deleted == False)
        .first()
    )

    if not user:
        logger.warning(f"AUTH: No user found with username='{username}'")
        return None, "invalid_username"

    logger.info(f"AUTH: Found user '{username}', is_active={user.is_active}, is_deleted={user.is_deleted}, locked_until={user.locked_until}")

    # Check lockout BEFORE password verification to prevent timing attacks
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        logger.warning(f"AUTH: Blocked login for locked account id={user.id}")
        return None, "account_locked"

    if not user.is_active:
        logger.warning(f"AUTH: Login attempt on inactive account id={user.id}")
        return None, "account_inactive"

    if not verify_password(password, user.password_hash):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        _apply_lockout(user)
        db.commit()
        logger.warning(
            f"AUTH: Failed login attempt #{user.failed_login_attempts} for user id={user.id}"
        )
        return None, "invalid_password"

    # Successful login — reset counters
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    logger.info(f"AUTH: Login SUCCESS for user id={user.id}")
    return user, "success"


def get_user_by_id(db: Session, user_id: str | uuid.UUID) -> User | None:
    """Get user by UUID, eagerly loading roles."""
    if isinstance(user_id, str):
        try:
            user_id = uuid.UUID(user_id)
        except ValueError:
            return None
    return (
        db.query(User)
        .options(
            joinedload(User.user_roles).joinedload(UserRole.role),
            joinedload(User.hospital),
        )
        .filter(User.id == user_id, User.is_deleted == False)
        .first()
    )


def get_user_by_username(db: Session, username: str) -> User | None:
    return (
        db.query(User)
        .options(
            joinedload(User.user_roles).joinedload(UserRole.role),
            joinedload(User.hospital),
        )
        .filter(User.username == username, User.is_deleted == False)
        .first()
    )
