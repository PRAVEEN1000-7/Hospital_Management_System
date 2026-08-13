"""
Authentication service — works with new hms_db UUID/RBAC schema.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Tuple, Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import ProgrammingError
from ..models.user import User, UserRole, Role, RevokedToken
from ..utils.security import verify_password

logger = logging.getLogger(__name__)


def revoke_current_access_token(db: Session, user: User) -> None:
    """Blocklist the access token currently in use by `user` (SECURITY_AUDIT.md
    C1). Relies on `_jti`/`_token_exp` attached by whichever auth dependency
    authenticated this request — dependencies.get_current_user for the
    regular auth path, core.tenant.get_current_superadmin for the superadmin
    path. Shared here so both routers revoke tokens identically."""
    jti = getattr(user, "_jti", None)
    exp = getattr(user, "_token_exp", None)
    if not jti or not exp:
        return
    try:
        # SAVEPOINT, not the whole transaction — if revoked_tokens doesn't
        # exist yet, this rolls back only this operation so the caller's
        # other pending changes (e.g. a new password hash) still commit.
        with db.begin_nested():
            db.merge(RevokedToken(
                jti=uuid.UUID(jti),
                user_id=user.id,
                expires_at=datetime.fromtimestamp(exp, tz=timezone.utc),
            ))
            # Opportunistic cleanup — keeps the blocklist from growing
            # unbounded without needing a separate scheduled job.
            db.query(RevokedToken).filter(RevokedToken.expires_at < datetime.now(timezone.utc)).delete()
    except ProgrammingError:
        logger.critical(
            "revoked_tokens table is missing — this token could not be revoked. "
            "Run database_hole/security_token_revocation_combined.sql against this database."
        )

# Account lockout thresholds (per spec: 5→15min, 10→1hr, 20→indefinite)
_LOCKOUT_RULES = [
    (5, timedelta(minutes=15)),
    (10, timedelta(hours=1)),
]
_LOCKOUT_INDEFINITE_THRESHOLD = 20
_LOCKOUT_INDEFINITE_YEARS = 100  # effectively permanent


def _mask_username(username: str) -> str:
    """Truncate for the general application log (SECURITY_AUDIT.md M6)."""
    if not username:
        return "<empty>"
    return f"{username[:2]}***{username[-1]}" if len(username) > 3 else "***"


def clear_lockout(user: User) -> None:
    """Clear failed-attempt/lockout state. Call this whenever a password is
    reset through a channel OTHER than a successful login — e.g. the
    forgot-password email flow or an admin-initiated reset — since proving
    identity that way should also lift a lockout, not just change the
    password. Caller is responsible for db.commit()."""
    user.failed_login_attempts = 0
    user.locked_until = None


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
    Authenticate by username-or-email and password. Eagerly loads roles.
    `username` is whatever identifier the user typed in the login field — it
    may be their username or their email, matched case-insensitively against
    either column (both are unique, so there's no ambiguity either way).
    Returns (user, reason) where reason is:
      - 'success' if authenticated
      - 'invalid_username' if user not found
      - 'invalid_password' if password is wrong
      - 'account_inactive' if account is deactivated
      - 'account_locked' if account is temporarily locked
    """
    identifier = (username or "").strip().lower()
    matches = (
        db.query(User)
        .options(
            joinedload(User.user_roles).joinedload(UserRole.role),
            joinedload(User.hospital),
        )
        .filter(
            or_(func.lower(User.username) == identifier, func.lower(User.email) == identifier),
            User.is_deleted == False,
        )
        .order_by(User.created_at.asc())
        .all()
    )

    if not matches:
        logger.warning(f"AUTH: No user found with username='{_mask_username(username)}'")
        return None, "invalid_username"

    if len(matches) > 1:
        # Username/email are meant to be globally unique (see routers/users.py
        # and services/tenant_service.py) — the login form has no hospital to
        # scope by, so an ambiguous match here means duplicate accounts exist
        # across hospitals (pre-dating that check, or inserted outside the
        # app). Whichever row Postgres returned first would silently eat the
        # correct password for every account but one. Log it loudly so it's
        # fixed at the data layer instead of surfacing as a mysterious "wrong
        # password" for some other hospital's identical-username user — the
        # global UNIQUE(username)/UNIQUE(email) constraints that should
        # prevent this from ever happening again live in
        # database_hole/05_schema_structure.sql's "auth global uniqueness"
        # section; re-running it will refuse and report the exact duplicate
        # rows if any still exist.
        logger.error(
            "AUTH: AMBIGUOUS LOGIN — username/email '%s' matches %d users across hospitals %s. "
            "Re-run database_hole/05_schema_structure.sql to find and resolve the duplicate "
            "(its 'auth global uniqueness' section reports duplicate groups instead of applying "
            "the constraint if any still exist).",
            _mask_username(username), len(matches), [str(u.hospital_id) for u in matches],
        )
    user = matches[0]

    logger.info(f"AUTH: Found user '{_mask_username(username)}', is_active={user.is_active}, is_deleted={user.is_deleted}, locked_until={user.locked_until}")

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
