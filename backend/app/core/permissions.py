"""
RBAC permission checker.

Permission format: "module:action:resource"
Examples: "patients:create:patient", "billing:read:invoice"

Usage in routes:
    from ..core.permissions import require_permission

    @router.get("/invoices")
    async def list_invoices(
        _: User = Depends(require_permission("billing:read:invoice")),
    ): ...
"""
from fastapi import Depends, HTTPException, status
from ..dependencies import get_current_active_user
from ..models.user import User


def require_permission(permission: str):
    """
    FastAPI dependency factory that enforces a specific permission.
    Super admins bypass all permission checks.
    """
    async def _check(current_user: User = Depends(get_current_active_user)) -> User:
        # Super admins have all permissions
        if "super_admin" in current_user.roles:
            return current_user

        # Read permissions from the user's token (cached on user object by get_current_user)
        user_perms: list[str] = getattr(current_user, "_permissions", [])
        if permission not in user_perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: '{permission}' required",
            )
        return current_user

    return _check


def require_any_permission(*permissions: str):
    """
    FastAPI dependency factory that passes if user has ANY of the listed permissions.
    """
    async def _check(current_user: User = Depends(get_current_active_user)) -> User:
        if "super_admin" in current_user.roles:
            return current_user

        user_perms: list[str] = getattr(current_user, "_permissions", [])
        if not any(p in user_perms for p in permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied. Required one of: {', '.join(permissions)}",
            )
        return current_user

    return _check
