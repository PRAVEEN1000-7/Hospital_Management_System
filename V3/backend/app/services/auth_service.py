"""
Authentication service — works with new hms_db UUID/RBAC schema.
"""
import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session, joinedload
from ..models.user import User, UserRole, Role
from ..utils.security import verify_password

logger = logging.getLogger(__name__)


def authenticate_user(db: Session, username: str, password: str) -> User | None:
    """Authenticate by username and password. Eagerly loads roles."""
    user = (
        db.query(User)
        .options(
            joinedload(User.user_roles).joinedload(UserRole.role),
            joinedload(User.hospital),
        )
        .filter(User.username == username, User.is_deleted == False)
        .first()
    )
    
    # DEBUG logging
    if not user:
        logger.warning(f"AUTH: No user found with username='{username}'")
        return None
    
    logger.info(f"AUTH: Found user '{username}', is_active={user.is_active}, is_deleted={user.is_deleted}, locked_until={user.locked_until}")
    
    if not verify_password(password, user.password_hash):
        logger.warning(f"AUTH: Password verification FAILED for user '{username}'")
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        db.commit()
        return None
    
    if not user.is_active:
        logger.warning(f"AUTH: User '{username}' is not active")
        return None
    # Check if account is locked
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        logger.warning(f"AUTH: User '{username}' is locked until {user.locked_until}")
        return None
    # Reset failed attempts on success
    user.failed_login_attempts = 0
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    logger.info(f"AUTH: Login SUCCESS for user '{username}'")
    return user


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