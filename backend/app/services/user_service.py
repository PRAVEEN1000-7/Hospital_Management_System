import logging
import os
import shutil
from sqlalchemy.orm import Session
from sqlalchemy import or_, text
from math import ceil
from typing import Optional
from datetime import datetime
from fastapi import UploadFile, HTTPException, status
from ..models.user import User
from ..models.hospital import HospitalDetails
from ..utils.security import get_password_hash

logger = logging.getLogger(__name__)

# Upload directory configuration
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "photos")
ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif"}
MAX_PHOTO_SIZE_MB = 2


def ensure_upload_directory():
    """Create upload directory if it doesn't exist"""
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_hospital_prefix(db: Session) -> str:
    """
    Get hospital prefix from hospital name by taking first letter of each word.
    Examples:
    - "HMS Core" -> "HC"
    - "Apollo Hospital" -> "AH"
    - "Max Super Speciality Hospital" -> "MSSH"
    """
    hospital = db.query(HospitalDetails).first()
    if hospital and hospital.hospital_name:
        # Extract first letter of each word and convert to uppercase
        words = hospital.hospital_name.strip().split()
        prefix = ''.join(word[0].upper() for word in words if word)
        return prefix if prefix else 'HC'  # Default to HC if empty
    return 'HC'  # Default for "HMS Core"


def generate_employee_id(db: Session, role: str) -> str:
    """
    Generate unique employee ID in format: [HOSPITAL_PREFIX][ROLE][YEAR][NUMBER]
    Examples: HCDOC2026001, AHNUR2026042, HCADM2026003
    """
    # Get hospital prefix
    hospital_prefix = get_hospital_prefix(db)
    
    # Map roles to prefixes
    role_prefix_map = {
        'doctor': 'DOC',
        'nurse': 'NUR',
        'admin': 'ADM',
        'super_admin': 'SADM',
        'pharmacist': 'PHA',
        'receptionist': 'REC',
        'cashier': 'CSH',
        'inventory_manager': 'INV',
        'staff': 'STF'
    }
    
    role_prefix = role_prefix_map.get(role, 'STF')
    year = datetime.now().year
    
    # Get next sequence number for this role
    sequence_name = f"seq_employee_{role.lower()}"
    
    try:
        result = db.execute(text(f"SELECT nextval('{sequence_name}')"))
        seq_num = result.scalar()
        
        # Format: [HOSPITAL][ROLE][YEAR][NUMBER] (e.g., HCDOC2026001)
        employee_id = f"{hospital_prefix}{role_prefix}{year}{seq_num:04d}"
        
        logger.info(f"Generated employee_id: {employee_id} for role: {role}")
        return employee_id
        
    except Exception as e:
        logger.error(f"Error generating employee_id for role {role}: {e}")
        # Fallback to timestamp-based ID if sequence fails
        import time
        timestamp = int(time.time() * 1000) % 100000
        return f"{hospital_prefix}{role_prefix}{year}{timestamp:05d}"


def create_user(
    db: Session,
    username: str,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    role: str,
    full_name: Optional[str] = None,
    employee_id: Optional[str] = None,
    department: Optional[str] = None,
    phone_number: Optional[str] = None,
) -> User:
    """Create a new user"""
    password_hash = get_password_hash(password)
    
    # Auto-generate full_name if not provided
    if not full_name:
        full_name = f"{first_name} {last_name}".strip()
    
    # Auto-generate employee_id if not provided
    if not employee_id:
        employee_id = generate_employee_id(db, role)
    
    user = User(
        username=username,
        email=email,
        password_hash=password_hash,
        first_name=first_name,
        last_name=last_name,
        full_name=full_name,
        role=role,
        employee_id=employee_id,
        department=department,
        phone_number=phone_number,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    logger.info(f"Created user: {username} with employee_id: {employee_id}")
    return user


def update_user(db: Session, user_id: int, **kwargs) -> Optional[User]:
    """Update user fields"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    
    # Auto-generate full_name if first_name or last_name is being updated
    if 'first_name' in kwargs or 'last_name' in kwargs:
        first = kwargs.get('first_name', user.first_name)
        last = kwargs.get('last_name', user.last_name)
        if first and last:
            kwargs['full_name'] = f"{first} {last}".strip()
    
    for key, value in kwargs.items():
        if hasattr(user, key):  # Only set if attribute exists in model
            if value is not None:
                setattr(user, key, value)
    
    db.commit()
    db.refresh(user)
    return user


def reset_password(db: Session, user_id: int, new_password: str) -> Optional[User]:
    """Reset user password"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    user.password_hash = get_password_hash(new_password)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int) -> Optional[User]:
    """Permanently delete a user from database"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    
    # Store user info for logging before deletion
    username = user.username
    
    # Hard delete from database
    db.delete(user)
    db.commit()
    
    logger.info(f"Permanently deleted user: {username} (ID: {user_id})")
    return user


def list_users(
    db: Session, page: int = 1, limit: int = 10, search: Optional[str] = None
):
    """List users with pagination and search"""
    query = db.query(User)

    if search:
        search_term = search.strip()
        if search_term:
            search_filter = or_(
                User.username.ilike(f"%{search_term}%"),
                User.full_name.ilike(f"%{search_term}%"),
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


def save_user_photo(db: Session, user_id: int, file: UploadFile) -> dict:
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
    file.file.seek(0, 2)  # Seek to end
    file_size_bytes = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    file_size_mb = file_size_bytes / (1024 * 1024)
    if file_size_mb > MAX_PHOTO_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_PHOTO_SIZE_MB}MB"
        )
    
    # Get user record
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Delete old photo if exists
    if user.photo_url:
        old_photo_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), user.photo_url.lstrip('/'))
        if os.path.exists(old_photo_path):
            try:
                os.remove(old_photo_path)
            except Exception:
                pass  # Ignore deletion errors
    
    # Generate unique filename
    filename = f"user_{user_id}_{int(datetime.now().timestamp())}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save photo: {str(e)}"
        )
    
    # Update database - store relative path
    user.photo_url = f"/uploads/photos/{filename}"
    db.commit()
    db.refresh(user)
    
    logger.info(f"Saved photo for user {user_id}: {filename}")
    
    return {
        "message": "Photo uploaded successfully",
        "photo_url": user.photo_url,
        "filename": filename
    }
