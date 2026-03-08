"""
Users router — works with new hms_db UUID/RBAC schema.
"""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from ..database import get_db
from ..models.user import User, UserRole, Role
from ..models.appointment import Doctor
from ..dependencies import get_current_active_user, require_super_admin, require_admin_or_super_admin
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
    save_user_photo,
    get_user_by_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["User Management"])


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_new_user(
    user_data: UserCreate,
    send_email: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Create a new user (Admin or Super Admin)"""
    # Only super_admin can create other super_admins
    if user_data.role == "super_admin" and "super_admin" not in current_user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Super Admin can create Super Admin accounts",
        )
    try:
        # Check username uniqueness
        existing = db.query(User).filter(User.username == user_data.username.lower()).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists",
            )

        # Check email uniqueness
        existing = db.query(User).filter(User.email == user_data.email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already exists",
            )

        user = create_user(
            db,
            username=user_data.username,
            email=user_data.email,
            password=user_data.password,
            first_name=user_data.first_name,
            last_name=user_data.last_name,
            role_name=user_data.role,
            hospital_id=str(current_user.hospital_id),
            phone=user_data.phone_number,
            # Doctor-specific fields
            specialization=user_data.specialization,
            qualification=user_data.qualification,
            registration_number=user_data.registration_number,
            registration_authority=user_data.registration_authority,
            experience_years=user_data.experience_years,
            consultation_fee=user_data.consultation_fee,
            follow_up_fee=user_data.follow_up_fee,
            bio=user_data.bio,
            department_id=user_data.department_id,
            created_by_id=current_user.id,
        )

        # Send welcome email if requested
        if send_email:
            try:
                from ..services.email_service import send_welcome_email
                send_welcome_email(
                    to_email=user.email,
                    username=user.username,
                    password=user_data.password,
                    full_name=f"{user.first_name} {user.last_name}".strip(),
                )
            except Exception as email_err:
                logger.warning(f"Failed to send welcome email: {email_err}")

        return UserResponse.model_validate(user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating user: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {str(e)}",
        )


@router.get("", response_model=UserListResponse)
async def get_users(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """List all users (Admin or Super Admin)"""
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


@router.get("/check-username/{username}")
async def check_username_exists(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Check if a username already exists (for real-time form validation)"""
    existing = (
        db.query(User)
        .filter(User.username == username.lower(), User.is_deleted == False)
        .first()
    )
    return {"exists": existing is not None}


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Get user by ID (Admin or Super Admin)"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_existing_user(
    user_id: str,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Update user (Admin or Super Admin)"""
    try:
        target_user = get_user_by_id(db, user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        # Only super_admin can edit super_admin accounts
        if "super_admin" in target_user.roles and "super_admin" not in current_user.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Super Admin can modify Super Admin accounts",
            )

        # Check email uniqueness if email is being changed
        if user_data.email and user_data.email != target_user.email:
            existing = (
                db.query(User)
                .filter(User.email == user_data.email, User.id != target_user.id)
                .first()
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already exists",
                )

        update_fields = user_data.model_dump(exclude_unset=True)

        # Remove fields that don't map to User model columns
        update_fields.pop("full_name", None)
        update_fields.pop("employee_id", None)
        update_fields.pop("department", None)

        # Handle phone_number → phone mapping
        if "phone_number" in update_fields:
            update_fields["phone"] = update_fields.pop("phone_number")

        # Handle role change via user_roles junction table
        new_role_name = update_fields.pop("role", None)
        if new_role_name is not None:
            current_roles = target_user.roles
            if new_role_name not in current_roles:
                role_obj = db.query(Role).filter(
                    Role.name == new_role_name,
                    Role.hospital_id == target_user.hospital_id,
                ).first()
                # Fallback: try system-level role (hospital_id IS NULL)
                if not role_obj:
                    role_obj = db.query(Role).filter(
                        Role.name == new_role_name,
                        Role.hospital_id.is_(None),
                    ).first()
                if not role_obj:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Role '{new_role_name}' not found",
                    )
                # Remove existing user_roles and assign the new one
                db.query(UserRole).filter(UserRole.user_id == target_user.id).delete()
                new_user_role = UserRole(
                    user_id=target_user.id,
                    role_id=role_obj.id,
                    assigned_by=current_user.id,
                )
                db.add(new_user_role)

        # Handle doctor-specific fields
        doctor_fields = {}
        for field in ("specialization", "qualification", "registration_number"):
            if field in update_fields:
                doctor_fields[field] = update_fields.pop(field)

        if doctor_fields:
            doctor = db.query(Doctor).filter(
                Doctor.user_id == target_user.id,
                Doctor.is_deleted == False,
            ).first()
            if doctor:
                for key, value in doctor_fields.items():
                    if value is not None:
                        setattr(doctor, key, value)

        # Update remaining user fields
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
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Soft delete user (Admin or Super Admin)"""
    try:
        if str(current_user.id) == user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete your own account",
            )

        target_user = get_user_by_id(db, user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        # Prevent admin from deleting super_admin accounts
        if "super_admin" in target_user.roles and "super_admin" not in current_user.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Super Admin can delete Super Admin accounts",
            )

        # Prevent deleting the last super admin
        if "super_admin" in target_user.roles:
            super_admin_count = (
                db.query(User)
                .join(UserRole)
                .filter(UserRole.role.has(name="super_admin"), User.is_deleted == False)
                .count()
            )
            if super_admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot delete the last Super Admin account",
                )

        delete_user(db, user_id)
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


@router.post("/{user_id}/upload-photo", response_model=dict)
async def upload_user_photo(
    user_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Upload user profile photo (Admin or Super Admin)"""
    try:
        result = save_user_photo(db, user_id, file)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading photo for user {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload photo.",
        )


@router.post("/{user_id}/reset-password", response_model=dict)
async def reset_user_password(
    user_id: str,
    password_data: PasswordReset,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Reset user password (Admin or Super Admin)"""
    try:
        target_user = get_user_by_id(db, user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        reset_password(db, user_id, password_data.new_password)

        return {"message": "Password reset successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting password for user {user_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset password.",
        )

