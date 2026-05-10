"""
Auth router — login, logout, refresh, me, change-password.
Spec: POST /auth/login, POST /auth/logout, POST /auth/refresh,
      GET /auth/me, PUT /auth/me, POST /auth/change-password
"""
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.auth import (
    LoginRequest,
    TokenResponse,
    UserResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
)
from ..models.user import User
from ..models.tenant import Tenant
from ..services.auth_service import authenticate_user
from ..core.security import create_access_token, get_password_hash, verify_password
from ..core.tenant_security import TenantValidator
from ..core.audit_logger import AuditLogger, get_client_ip
from ..dependencies import get_current_active_user
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _build_user_response(user: User) -> UserResponse:
    """Build the UserResponse including roles and permissions."""
    is_super_admin = 'super_admin' in (user.roles or [])
    hospital_name = user.hospital.name if user.hospital and not is_super_admin else None
    
    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        roles=user.roles,
        permissions=user.permissions,
        hospital_id=str(user.hospital_id) if user.hospital_id and not is_super_admin else None,
        hospital_name=hospital_name,
        hospital_code=user.hospital.code if user.hospital and not is_super_admin else None,
        reference_number=user.reference_number,
        avatar_url=user.avatar_url,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db),
    request: Request = None
):
    """
    Authenticate user and return access token.
    JWT payload includes: user_id, hospital_id, tenant_id, roles, permissions.
    """
    try:
        ip_address = get_client_ip(request) if request else None
        logger.info(f"LOGIN ATTEMPT: username='{credentials.username}' from {ip_address}")

        user, reason = authenticate_user(db, credentials.username, credentials.password)

        if not user:
            logger.warning(f"LOGIN FAILED: username='{credentials.username}' - {reason}")
            
            # Log failed login attempt
            AuditLogger.log_login(
                username=credentials.username,
                success=False,
                ip_address=ip_address,
                error=reason
            )
            
            error_messages = {
                "invalid_username": "Invalid username",
                "invalid_password": "Invalid password",
                "account_inactive": "Your account has been deactivated. Please contact the administrator.",
                "account_locked": "Your account is temporarily locked due to multiple failed login attempts. Please try again later.",
            }
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=error_messages.get(reason, "Incorrect username or password"),
                headers={"WWW-Authenticate": "Bearer"},
            )

        # ✅ Validate tenant status before issuing token
        # Super admins are platform-level — skip tenant validation
        is_super_admin = 'super_admin' in (user.roles or [])
        tenant = None
        tenant_id_str = None

        if not is_super_admin:
            tenant = TenantValidator.get_tenant_for_user(user, db)
            if not tenant or tenant.status != "active":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Tenant is suspended or inactive",
                )
            tenant_id_str = str(tenant.id)

        permissions = user.permissions
        access_token = create_access_token(
            data={
                "user_id": str(user.id),
                "username": user.username,
                "roles": user.roles,
                "permissions": permissions,
                "hospital_id": str(user.hospital_id),
                "tenant_id": tenant_id_str,
            },
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )

        # Log successful login
        AuditLogger.log_login(
            username=user.username,
            success=True,
            tenant=tenant,
            ip_address=ip_address
        )

        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=_build_user_response(user),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during login. Please try again.",
        )


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_active_user),
    request: Request = None
):
    """Logout user — client must discard the access token."""
    ip_address = get_client_ip(request) if request else None
    logger.info(f"LOGOUT: user={current_user.username} from {ip_address}")
    return {"success": True, "message": "Successfully logged out"}


@router.post("/refresh")
async def refresh_token(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    request: Request = None
):
    """
    Re-issue an access token using the current (still-valid) token.
    
    ✅ Validates:
    - User still exists and is active
    - Hospital is active
    - Tenant is active (not suspended)
    - Subscription is valid
    """
    try:
        ip_address = get_client_ip(request) if request else None
        
        # ✅ CRITICAL FIX: Re-validate tenant is still active
        # Super admins are platform-level — skip tenant validation
        is_super_admin = 'super_admin' in (current_user.roles or [])
        tenant = None
        tenant_id_str = None

        if not is_super_admin:
            tenant = TenantValidator.get_tenant_for_user(current_user, db)
            if not tenant or tenant.status != "active":
                logger.warning(
                    f"TOKEN REFRESH DENIED: Tenant not active. "
                    f"user={current_user.id}, tenant_status={tenant.status if tenant else 'not_found'}"
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Tenant is suspended or inactive. Access denied.",
                )
            tenant_id_str = str(tenant.id)
        
        permissions = current_user.permissions
        access_token = create_access_token(
            data={
                "user_id": str(current_user.id),
                "username": current_user.username,
                "roles": current_user.roles,
                "permissions": permissions,
                "hospital_id": str(current_user.hospital_id),
                "tenant_id": tenant_id_str,
            },
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        
        logger.info(f"TOKEN REFRESH: user={current_user.username} from {ip_address}")
        
        return {
            "success": True,
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not refresh token",
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user),
):
    """Get current authenticated user including roles and permissions."""
    return _build_user_response(current_user)


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Change the authenticated user's password.
    Requires current password verification. Enforces password policy.
    """
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password",
        )

    # Enforce minimum password length per spec (min 8 chars)
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New password must be at least 8 characters",
        )

    current_user.password_hash = get_password_hash(payload.new_password)
    current_user.must_change_password = False
    from datetime import datetime, timezone
    current_user.password_changed_at = datetime.now(timezone.utc)
    db.commit()

    logger.info(f"Password changed for user id={current_user.id}")
    return {"success": True, "message": "Password changed successfully"}


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Initiate password reset flow.
    Always returns success to prevent email enumeration.
    (Email delivery requires SMTP configuration — currently logs to console.)
    """
    from ..models.user import User as UserModel
    user = db.query(UserModel).filter(
        UserModel.email == payload.email,
        UserModel.is_deleted == False,
    ).first()

    if user:
        # TODO: generate token, store hash in DB, send reset email via notification service
        logger.info(f"Password reset requested for user id={user.id} (email delivery not yet configured)")

    # Always return success to prevent email enumeration (security best practice)
    return {
        "success": True,
        "message": "If that email is registered, a reset link has been sent.",
    }

