"""
User service — works with new hms_db UUID/RBAC schema.
"""
import logging
import os
import shutil
import uuid
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from math import ceil
from typing import Optional
from datetime import datetime
from fastapi import UploadFile, HTTPException, status
from ..models.user import User, UserRole, Role, Hospital
from ..utils.security import get_password_hash
from ..services.patient_id_service import generate_staff_id

logger = logging.getLogger(__name__)

# Upload directory configuration
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "photos")
ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif"}
MAX_PHOTO_SIZE_MB = 2


def ensure_upload_directory():
    """Create upload directory if it doesn't exist"""
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR, exist_ok=True)


def list_users(
    db: Session, page: int = 1, limit: int = 10, search: Optional[str] = None
):
    """List users with pagination and search"""
    query = (
        db.query(User)
        .options(
            joinedload(User.user_roles).joinedload(UserRole.role),
            joinedload(User.hospital),
        )
        .filter(User.is_deleted == False)
    )

    if search:
        search_term = search.strip()
        if search_term:
            search_filter = or_(
                User.username.ilike(f"%{search_term}%"),
                User.first_name.ilike(f"%{search_term}%"),
                User.last_name.ilike(f"%{search_term}%"),
                User.email.ilike(f"%{search_term}%"),
            )
            query = query.filter(search_filter)

    total = query.count()
    offset = (page - 1) * limit
    users = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    total_pages = ceil(total / limit) if limit > 0 else 0

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "data": users,
    }


def get_user_by_id(db: Session, user_id: str | uuid.UUID) -> Optional[User]:
    """Get user by UUID"""
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


def create_user(
    db: Session,
    username: str,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    role_name: str,
    hospital_id: str | uuid.UUID,
    phone: Optional[str] = None,
) -> User:
    """Create a new user with role assignment"""
    password_hash = get_password_hash(password)
    
    if isinstance(hospital_id, str):
        hospital_id = uuid.UUID(hospital_id)
    
    # Generate 12-char HMS reference number: [HH][RoleCode][YY][M][Checksum][#####]
    reference_number = generate_staff_id(db, hospital_id, role_name)

    user = User(
        hospital_id=hospital_id,
        username=username.lower(),
        email=email,
        password_hash=password_hash,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        reference_number=reference_number,
    )
    db.add(user)
    db.flush()  # Get the user.id
    
    # Find or create the role and assign it
    role = db.query(Role).filter(Role.name == role_name).first()
    if role:
        user_role = UserRole(user_id=user.id, role_id=role.id)
        db.add(user_role)
    
    db.commit()
    db.refresh(user)
    
    logger.info(f"Created user: {username}")
    return user


def update_user(db: Session, user_id: str | uuid.UUID, **kwargs) -> Optional[User]:
    """Update user fields"""
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    
    for key, value in kwargs.items():
        if hasattr(user, key) and value is not None:
            setattr(user, key, value)
    
    db.commit()
    db.refresh(user)
    return user


def reset_password(db: Session, user_id: str | uuid.UUID, new_password: str) -> Optional[User]:
    """Reset user password"""
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    user.password_hash = get_password_hash(new_password)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: str | uuid.UUID) -> Optional[User]:
    """Soft delete a user"""
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    
    user.is_deleted = True
    user.deleted_at = datetime.now()
    db.commit()
    
    logger.info(f"Soft deleted user: {user.username}")
    return user


def save_user_photo(db: Session, user_id: str | uuid.UUID, file: UploadFile) -> dict:
    """Save user photo file and update database"""
    ensure_upload_directory()
    
    # Validate file extension
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_PHOTO_EXTENSIONS)}"
        )
    
    # Check file size
    file.file.seek(0, 2)
    file_size_bytes = file.file.tell()
    file.file.seek(0)
    
    file_size_mb = file_size_bytes / (1024 * 1024)
    if file_size_mb > MAX_PHOTO_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_PHOTO_SIZE_MB}MB"
        )
    
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    # Delete old photo if exists
    if user.avatar_url:
        old_photo_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), user.avatar_url.lstrip('/'))
        if os.path.exists(old_photo_path):
            try:
                os.remove(old_photo_path)
            except Exception:
                pass
    
    # Generate unique filename
    filename = f"user_{user.id}_{int(datetime.now().timestamp())}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save photo: {str(e)}"
        )
    
    user.avatar_url = f"/uploads/photos/{filename}"
    db.commit()
    db.refresh(user)
    
    logger.info(f"Saved photo for user {user.id}: {filename}")
    
    return {
        "message": "Photo uploaded successfully",
        "photo_url": user.avatar_url,
        "filename": filename
    }

