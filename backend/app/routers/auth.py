"""
Auth router — login, logout, refresh, me, change-password.
Spec: POST /auth/login, POST /auth/logout, POST /auth/refresh,
      GET /auth/me, PUT /auth/me, POST /auth/change-password
"""
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
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
from ..services.auth_service import authenticate_user
from ..core.security import create_access_token, get_password_hash, verify_password
from ..dependencies import get_current_active_user
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _build_user_response(user: User) -> UserResponse:
    """Build the UserResponse including roles and permissions."""
    hospital_name = user.hospital.name if user.hospital else None
    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        roles=user.roles,
        permissions=user.permissions,
        hospital_id=str(user.hospital_id),
        hospital_name=hospital_name,
        reference_number=user.reference_number,
        avatar_url=user.avatar_url,
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate user and return access token.
    JWT payload includes: user_id, hospital_id, roles, permissions.
    """
    try:
        # DEBUG: Log incoming credentials (remove in production!)
        logger.info(f"LOGIN ATTEMPT: username='{credentials.username}', password_length={len(credentials.password)}")

        user, reason = authenticate_user(db, credentials.username, credentials.password)

        if not user:
            logger.warning(f"LOGIN FAILED: username='{credentials.username}' - {reason}")
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

        permissions = user.permissions  # module:action:resource strings

        access_token = create_access_token(
            data={
                "user_id": str(user.id),
                "username": user.username,
                "roles": user.roles,
                "permissions": permissions,
                "hospital_id": str(user.hospital_id),
            },
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
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
async def logout(current_user: User = Depends(get_current_active_user)):
    """Logout user — client must discard the access token."""
    return {"success": True, "message": "Successfully logged out"}


@router.post("/refresh")
async def refresh_token(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Re-issue an access token using the current (still-valid) token."""
    permissions = current_user.permissions
    access_token = create_access_token(
        data={
            "user_id": str(current_user.id),
            "username": current_user.username,
            "roles": current_user.roles,
            "permissions": permissions,
            "hospital_id": str(current_user.hospital_id),
        },
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


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

