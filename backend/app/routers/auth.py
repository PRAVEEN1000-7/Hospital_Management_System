"""
Auth router — login, logout, refresh for new hms_db UUID/RBAC schema.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
from ..database import get_db
from ..schemas.auth import LoginRequest, TokenResponse, UserResponse
from ..models.user import User
from ..services.auth_service import authenticate_user
from ..utils.security import create_access_token
from ..dependencies import get_current_active_user
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token with RBAC roles."""
    try:
        # DEBUG: Log incoming credentials (remove in production!)
        logger.info(f"LOGIN ATTEMPT: username='{credentials.username}', password_length={len(credentials.password)}")
        
        user = authenticate_user(db, credentials.username, credentials.password)

        if not user:
            logger.warning(f"LOGIN FAILED: username='{credentials.username}' - invalid credentials or user not found")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        roles = user.roles  # property returns list of role name strings

        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={
                "user_id": str(user.id),
                "username": user.username,
                "roles": roles,
                "hospital_id": str(user.hospital_id),
            },
            expires_delta=access_token_expires,
        )

        hospital_name = user.hospital.name if user.hospital else None

        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserResponse(
                id=str(user.id),
                username=user.username,
                email=user.email,
                first_name=user.first_name,
                last_name=user.last_name,
                roles=roles,
                hospital_id=str(user.hospital_id),
                hospital_name=hospital_name,
                reference_number=user.reference_number,
                avatar_url=user.avatar_url,
            ),
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
    """Logout user (client should discard token)."""
    return {"message": "Successfully logged out"}


@router.post("/refresh")
async def refresh_token(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Refresh access token."""
    roles = current_user.roles
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "user_id": str(current_user.id),
            "username": current_user.username,
            "roles": roles,
            "hospital_id": str(current_user.hospital_id),
        },
        expires_delta=access_token_expires,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user),
):
    """Get current authenticated user info."""
    hospital_name = current_user.hospital.name if current_user.hospital else None
    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        roles=current_user.roles,
        hospital_id=str(current_user.hospital_id),
        hospital_name=hospital_name,
        reference_number=current_user.reference_number,
        avatar_url=current_user.avatar_url,
    )
