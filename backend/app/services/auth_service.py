from sqlalchemy.orm import Session
from ..models.user import User
from ..utils.security import verify_password, get_password_hash


def authenticate_user(db: Session, username: str, password: str):
    """Authenticate a user by username and password"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def get_user_by_id(db: Session, user_id: int):
    """Get user by ID"""
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_username(db: Session, username: str):
    """Get user by username"""
    return db.query(User).filter(User.username == username).first()
