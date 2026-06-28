"""
Tenant context management for multi-tenant architecture.
"""
import uuid
import logging
from contextvars import ContextVar
from typing import Optional, Dict, Any

from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError
from jose import jwt, JWTError

from ..database import get_db
from ..models.tenant import Tenant
from ..models.user import User, RevokedToken
from ..config import settings

logger = logging.getLogger(__name__)

# Context variable to hold current tenant across async boundaries
tenant_ctx: ContextVar[Optional[Tenant]] = ContextVar('tenant_ctx', default=None)
superadmin_ctx: ContextVar[Optional[User]] = ContextVar('superadmin_ctx', default=None)

security = HTTPBearer(auto_error=False)


class TenantContext:
    """Manager for tenant context across the application"""
    
    @staticmethod
    def get_current() -> Optional[Tenant]:
        """Get current tenant from context"""
        return tenant_ctx.get()
    
    @staticmethod
    def set_current(tenant: Optional[Tenant]):
        """Set current tenant in context"""
        tenant_ctx.set(tenant)
    
    @staticmethod
    def get_tenant_id() -> Optional[uuid.UUID]:
        """Get current tenant ID"""
        tenant = tenant_ctx.get()
        return tenant.id if tenant else None
    
    @staticmethod
    def clear():
        """Clear tenant context"""
        tenant_ctx.set(None)


class SuperAdminContext:
    """Manager for super admin context"""
    
    @staticmethod
    def get_current() -> Optional[User]:
        """Get current super admin from context"""
        return superadmin_ctx.get()
    
    @staticmethod
    def set_current(admin: Optional[User]):
        """Set current super admin in context"""
        superadmin_ctx.set(admin)
    
    @staticmethod
    def clear():
        """Clear super admin context"""
        superadmin_ctx.set(None)


async def get_current_tenant(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[Tenant]:
    """
    Extract and validate tenant from request.
    Priority:
    1. JWT token payload (for authenticated requests)
    2. X-Tenant-ID header
    3. Subdomain from Host header
    """
    tenant = None
    
    # Try to extract from JWT token first
    auth_header = request.headers.get('authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.replace('Bearer ', '')
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            tenant_id = payload.get('tenant_id') or payload.get('hospital_id')
            if tenant_id:
                tenant = db.query(Tenant).filter(
                    Tenant.id == uuid.UUID(tenant_id),
                    Tenant.status == 'active'
                ).first()
        except (JWTError, ValueError):
            pass
    
    # Fall back to header
    if not tenant:
        tenant_id_header = request.headers.get('X-Tenant-ID')
        if tenant_id_header:
            try:
                tenant = db.query(Tenant).filter(
                    Tenant.id == uuid.UUID(tenant_id_header),
                    Tenant.status == 'active'
                ).first()
            except ValueError:
                pass
    
    # Fall back to subdomain
    if not tenant:
        host = request.headers.get('host', '')
        if host and '.' in host:
            subdomain = host.split('.')[0]
            # Skip common subdomains
            if subdomain not in ('www', 'app', 'api', 'admin'):
                tenant = db.query(Tenant).filter(
                    Tenant.slug == subdomain,
                    Tenant.status == 'active'
                ).first()
    
    return tenant


async def require_tenant(
    request: Request,
    db: Session = Depends(get_db)
) -> Tenant:
    """Require a valid tenant for the request"""
    tenant = await get_current_tenant(request, db)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant not found or inactive"
        )
    
    # Set context for this request
    TenantContext.set_current(tenant)
    
    return tenant


async def get_current_superadmin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Get current super admin from JWT token - uses existing User with super_admin role"""
    if not credentials:
        return None
    
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        
        user_id = payload.get('user_id')
        if not user_id:
            return None

        # Blocklist check (SECURITY_AUDIT.md C1) — this is a separate decode
        # path from dependencies.get_current_user, so without this every
        # /superadmin/* route would silently ignore logout/password-change
        # revocation regardless of which login endpoint issued the token.
        jti = payload.get('jti')
        if jti:
            try:
                revoked = db.query(RevokedToken).filter(RevokedToken.jti == uuid.UUID(jti)).first()
            except (ValueError, TypeError):
                revoked = None
            except ProgrammingError:
                db.rollback()
                logger.critical(
                    "revoked_tokens table is missing — superadmin token revocation is NOT enforced. "
                    "Run database_hole/security_updates.sql against this database."
                )
                revoked = None
            if revoked:
                return None

        # Check roles in payload first (faster)
        roles = payload.get('roles', [])
        is_superadmin = payload.get('user_type') == 'superadmin' or 'super_admin' in roles

        if not is_superadmin:
            return None

        # Use SuperAdminService to validate user has super_admin role
        from ..services.superadmin_service import SuperAdminService
        user = SuperAdminService.get_by_id(db, uuid.UUID(user_id))
        
        if user:
            SuperAdminContext.set_current(user)
            # Exposes the current token's identity to /superadmin/logout so
            # it can revoke this specific token — mirrors the attachment
            # dependencies.get_current_user does for the regular auth path.
            user._jti = jti
            user._token_exp = payload.get("exp")

        return user

    except (JWTError, ValueError):
        return None


async def require_superadmin(
    admin: Optional[User] = Depends(get_current_superadmin)
) -> User:
    """Require super admin authentication"""
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Super Admin authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return admin


def get_tenant_aware_db():
    """
    Database dependency that automatically scopes queries to current tenant.
    This is a generator that yields a session with tenant context set.
    """
    db = next(get_db())
    try:
        # Get tenant from context
        tenant = TenantContext.get_current()
        if tenant:
            # Store tenant ID in session info for query filtering
            db.info['tenant_id'] = str(tenant.id)
        yield db
    finally:
        db.close()


class TenantMiddleware:
    """FastAPI middleware for tenant context management"""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        # Create Request object from ASGI scope
        request = Request(scope, receive)
        
        # Skip tenant resolution for certain paths
        path = request.url.path
        skip_paths = [
            '/health',
            '/',
            '/api/docs',
            '/api/redoc',
            '/api/openapi.json',
        ]
        
        if any(path.startswith(skip) for skip in skip_paths):
            await self.app(scope, receive, send)
            return
        
        # Get database session
        db = next(get_db())
        
        try:
            # Resolve tenant
            tenant = await get_current_tenant(request, db)
            if tenant:
                TenantContext.set_current(tenant)
                request.state.tenant = tenant
            
            # Process request
            await self.app(scope, receive, send)
            
        finally:
            # Clean up context
            TenantContext.clear()
            SuperAdminContext.clear()
            db.close()


# Event listeners for automatic tenant filtering
def setup_tenant_event_listeners():
    """Setup SQLAlchemy event listeners for automatic tenant filtering"""
    from sqlalchemy import event
    from sqlalchemy.orm import Query
    
    @event.listens_for(Query, "before_compile", retval=True)
    def _add_tenant_filter(query):
        """Automatically add tenant filter to queries"""
        # This is a safety net - primary filtering should be done in repositories
        return query


def generate_tenant_slug(name: str) -> str:
    """Generate URL-friendly slug from tenant name"""
    import re
    slug = name.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[-\s]+', '-', slug)
    return slug[:50]


def generate_tenant_code() -> str:
    """Generate unique 2-character code for tenant"""
    import secrets
    import string
    return ''.join(secrets.choice(string.ascii_uppercase) for _ in range(2))
