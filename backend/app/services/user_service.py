import logging
from sqlalchemy.orm import Session
from sqlalchemy import or_, text
from math import ceil
from typing import Optional
from datetime import datetime
from ..models.user import User
from ..utils.security import get_password_hash

logger = logging.getLogger(__name__)


def generate_employee_id(db: Session, role: str) -> str:
    """
    Generate unique employee ID in format: ROLE-YYYY-NNNN
    Examples: DOC-2026-0001, NUR-2026-0042, ADM-2026-0003
    """
    # Map roles to prefixes
    role_prefix_map = {
        'doctor': 'DOC',
        'nurse': 'NUR',
        'admin': 'ADM',
        'super_admin': 'ADM',
        'pharmacist': 'PHA',
        'receptionist': 'REC',
        'cashier': 'CSH',
        'inventory_manager': 'INV',
        'staff': 'STF'
    }
    
    prefix = role_prefix_map.get(role, 'STF')
    year = datetime.now().year
    
    # Get next sequence number for this role
    sequence_name = f"seq_employee_{role.lower()}"
    
    try:
        result = db.execute(text(f"SELECT nextval('{sequence_name}')"))
        seq_num = result.scalar()
        
        # Format: PREFIX-YYYY-NNNN (e.g., DOC-2026-0001)
        employee_id = f"{prefix}-{year}-{seq_num:04d}"
        
        logger.info(f"Generated employee_id: {employee_id} for role: {role}")
        return employee_id
        
    except Exception as e:
        logger.error(f"Error generating employee_id for role {role}: {e}")
        # Fallback to timestamp-based ID if sequence fails
        import time
        timestamp = int(time.time() * 1000) % 100000
        return f"{prefix}-{year}-{timestamp:05d}"


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
    """Soft delete a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    user.is_active = False
    db.commit()
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
