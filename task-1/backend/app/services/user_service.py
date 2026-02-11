import logging
from sqlalchemy.orm import Session
from sqlalchemy import or_
from math import ceil
from typing import Optional
from ..models.user import User
from ..utils.security import get_password_hash

logger = logging.getLogger(__name__)


def create_user(
    db: Session, username: str, email: str, password: str, full_name: str, role: str
) -> User:
    """Create a new user"""
    password_hash = get_password_hash(password)
    user = User(
        username=username,
        email=email,
        password_hash=password_hash,
        full_name=full_name,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user_id: int, **kwargs) -> Optional[User]:
    """Update user fields"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    for key, value in kwargs.items():
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
