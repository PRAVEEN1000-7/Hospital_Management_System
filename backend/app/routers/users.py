import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_super_admin
from ..schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserListResponse,
    PasswordReset,
)
from ..services.user_service import (
    create_user,
    update_user,
    reset_password,
    delete_user,
    list_users,
)
from ..services.email_service import send_password_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["User Management"])


@router.get("", response_model=UserListResponse)
async def get_users(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """List all users (Super Admin only)"""
    try:
        result = list_users(db, page, limit, search)
        return UserListResponse(
            total=result["total"],
            page=result["page"],
            limit=result["limit"],
            total_pages=result["total_pages"],
            data=[UserResponse.model_validate(u) for u in result["data"]],
        )
    except Exception as e:
        logger.error(f"Error listing users: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve users.",
        )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_new_user(
    user_data: UserCreate,
    send_email: bool = Query(False, description="Send credentials via email"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Create a new user (Super Admin only)"""
    try:
        # Check username uniqueness
        existing = (
            db.query(User)
            .filter(User.username == user_data.username.lower())
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists",
            )

        # Check email uniqueness
        existing_email = (
            db.query(User).filter(User.email == user_data.email).first()
        )
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already exists",
            )

        # Check employee_id uniqueness if provided
        if user_data.employee_id:
            existing_emp_id = (
                db.query(User).filter(User.employee_id == user_data.employee_id).first()
            )
            if existing_emp_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Employee ID already exists",
                )

        user = create_user(
            db=db,
            username=user_data.username.lower(),
            email=user_data.email,
            password=user_data.password,
            first_name=user_data.first_name,
            last_name=user_data.last_name,
            full_name=user_data.full_name,
            role=user_data.role,
            employee_id=user_data.employee_id,
            department=user_data.department,
            phone_number=user_data.phone_number,
        )

        # Send password via email if requested
        if send_email:
            send_password_email(
                to_email=user_data.email,
                username=user_data.username.lower(),
                password=user_data.password,
                full_name=user.full_name,
            )

        return UserResponse.model_validate(user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating user: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user.",
        )


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Get user by ID (Super Admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_existing_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Update user (Super Admin only)"""
    try:
        target_user = db.query(User).filter(User.id == user_id).first()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        # Check email uniqueness if email is being changed
        if user_data.email and user_data.email != target_user.email:
            existing = (
                db.query(User)
                .filter(User.email == user_data.email, User.id != user_id)
                .first()
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already exists",
                )

        update_fields = user_data.model_dump(exclude_unset=True)
        user = update_user(db, user_id, **update_fields)

        return UserResponse.model_validate(user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update user.",
        )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_existing_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Soft delete user (Super Admin only)"""
    try:
        if user_id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete your own account",
            )

        target_user = db.query(User).filter(User.id == user_id).first()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        if target_user.role == "super_admin":
            # Prevent deleting the last super admin
            super_admin_count = (
                db.query(User)
                .filter(User.role == "super_admin", User.is_active == True)
                .count()
            )
            if super_admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot delete the last Super Admin account",
                )

        user = delete_user(db, user_id)
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user {user_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete user.",
        )


@router.post("/{user_id}/reset-password", response_model=dict)
async def reset_user_password(
    user_id: int,
    password_data: PasswordReset,
    send_email_flag: bool = Query(
        False, alias="send_email", description="Send new password via email"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Reset user password (Super Admin only)"""
    try:
        target_user = db.query(User).filter(User.id == user_id).first()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        reset_password(db, user_id, password_data.new_password)

        email_sent = False
        if send_email_flag:
            email_sent = send_password_email(
                to_email=target_user.email,
                username=target_user.username,
                password=password_data.new_password,
                full_name=target_user.full_name,
            )

        return {
            "message": "Password reset successfully",
            "email_sent": email_sent,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting password for user {user_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset password.",
        )


@router.post("/{user_id}/send-password", response_model=dict)
async def send_password_to_user(
    user_id: int,
    password_data: PasswordReset,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Set a new password and send it via email (Super Admin only)"""
    try:
        target_user = db.query(User).filter(User.id == user_id).first()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        # Reset the password
        reset_password(db, user_id, password_data.new_password)

        # Send email
        email_sent = send_password_email(
            to_email=target_user.email,
            username=target_user.username,
            password=password_data.new_password,
            full_name=target_user.full_name,
        )

        if not email_sent:
            return {
                "message": "Password updated but email could not be sent. SMTP may not be configured.",
                "email_sent": False,
            }

        return {"message": "Password updated and sent via email", "email_sent": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending password for user {user_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send password.",
        )
