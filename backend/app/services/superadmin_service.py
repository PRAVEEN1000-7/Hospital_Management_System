"""
Super Admin authentication and management service.
Uses existing users table with super_admin role.
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict, Any

from sqlalchemy.orm import Session, joinedload

from ..models.user import User, UserRole, Role
from ..utils.security import verify_password, get_password_hash
from ..config import settings


class SuperAdminService:
    """Service for super admin authentication using existing user system"""
    
    @staticmethod
    def authenticate(db: Session, username: str, password: str) -> Optional[User]:
        """Authenticate super admin credentials using existing users table"""
        # Query user with roles loaded
        user = (
            db.query(User)
            .options(joinedload(User.user_roles).joinedload(UserRole.role))
            .filter(
                User.username == username,
                User.is_active == True
            )
            .first()
        )
        
        if not user:
            return None
        
        # Check if user has super_admin role
        role_names = [ur.role.name for ur in user.user_roles if ur.role]
        if 'super_admin' not in role_names:
            return None
        
        if not verify_password(password, user.password_hash):
            return None
        
        return user
    
    @staticmethod
    def create_access_token(user: User) -> str:
        """Create JWT access token for super admin.

        Delegates to the shared core.security.create_access_token() rather
        than encoding the JWT directly — that function adds a `jti` claim,
        which is what lets /auth/logout and /auth/change-password actually
        revoke a token (SECURITY_AUDIT.md C1). This endpoint used to mint
        tokens with no jti at all, silently bypassing revocation regardless
        of which login path issued them.
        """
        from ..core.security import create_access_token as _create_access_token

        return _create_access_token(
            data={
                "user_id": str(user.id),
                "user_type": "superadmin",
                "username": user.username,
                "email": user.email,
                "roles": ["super_admin"],
            },
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
    
    @staticmethod
    def create_refresh_token(user: User) -> Tuple[str, str]:
        """Create refresh token and its hash"""
        import secrets
        import hashlib
        
        # Generate opaque token
        token = secrets.token_hex(64)
        # Create hash for storage
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        return token, token_hash
    
    @staticmethod
    def update_last_login(db: Session, user_id: uuid.UUID):
        """Update last login timestamp"""
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.last_login_at = datetime.utcnow()
            db.commit()
    
    @staticmethod
    def get_by_id(db: Session, user_id: uuid.UUID) -> Optional[User]:
        """Get super admin by ID - checks for super_admin role"""
        user = (
            db.query(User)
            .options(joinedload(User.user_roles).joinedload(UserRole.role))
            .filter(User.id == user_id, User.is_active == True)
            .first()
        )
        
        if not user:
            return None
        
        # Verify super_admin role
        role_names = [ur.role.name for ur in user.user_roles if ur.role]
        if 'super_admin' not in role_names:
            return None
        
        return user
    
    @staticmethod
    def is_super_admin(user: User) -> bool:
        """Check if user has super_admin role"""
        role_names = [ur.role.name for ur in user.user_roles if ur.role]
        return 'super_admin' in role_names


# Note: Super admin creation is handled through existing user management
# Ensure a user has the 'super_admin' role to grant platform-wide access
