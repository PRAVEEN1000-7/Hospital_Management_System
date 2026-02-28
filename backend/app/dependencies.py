"""
Dependencies for JWT auth and role-based access — new hms_db UUID/RBAC schema.
"""
import logging
import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload
from .database import get_db
from .utils.security import decode_access_token
from .models.user import User, UserRole

logger = logging.getLogger(__name__)

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Get current authenticated user from JWT token (UUID-based)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise credentials_exception

    user_id_str = payload.get("user_id")
    if user_id_str is None:
        raise credentials_exception

    try:
        user_uuid = uuid.UUID(user_id_str)
    except (ValueError, TypeError):
        raise credentials_exception

    try:
        user = (
            db.query(User)
            .options(
                joinedload(User.user_roles).joinedload(UserRole.role),
                joinedload(User.hospital),
            )
            .filter(User.id == user_uuid, User.is_deleted == False)
            .first()
        )
    except Exception as e:
        logger.error(f"Database error fetching user {user_id_str}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not verify user",
        )

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure user is active (redundant safety check)."""
    return current_user


def _has_role(user: User, *role_names: str) -> bool:
    """Check if user has any of the specified roles."""
    return any(r in role_names for r in user.roles)


async def require_super_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Ensure user has super_admin role."""
    if not _has_role(current_user, "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin access required",
        )
    return current_user


async def require_admin_or_super_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Ensure user has admin or super_admin role."""
    if not _has_role(current_user, "admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Super Admin access required",
        )
    return current_user
