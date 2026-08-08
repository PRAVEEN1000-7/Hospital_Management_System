"""
Dependencies for JWT auth and role-based access — new hms_db UUID/RBAC schema.
Includes comprehensive tenant and subscription validation for multi-tenant security.
"""
import logging
import uuid
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import ProgrammingError
from datetime import datetime, timezone
from .database import get_db
from .utils.security import decode_access_token
from .models.user import User, UserRole, RevokedToken
from .models import Hospital
from .core.tenant_security import TenantValidator, SubscriptionValidator, TenantScopeValidator
from .core.audit_logger import AuditLogger, AuditAction, AuditSeverity, get_client_ip

logger = logging.getLogger(__name__)

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
    request: Request = None,
) -> User:
    """
    Get current authenticated user from JWT token with full tenant validation.
    
    Security validations:
    1. JWT signature verification
    2. User exists and is active
    3. Hospital exists and is active
    4. Tenant exists and is active
    5. Hospital ID in JWT matches user's hospital
    6. Tenant status is not suspended
    
    Raises HTTPException 403/401 if any validation fails.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise credentials_exception

    # Blocklist check (SECURITY_AUDIT.md C1) — a logged-out or password-
    # changed token is cryptographically still "valid" (JWTs are stateless),
    # so revocation has to be enforced here on every request.
    jti = payload.get("jti")
    if jti:
        try:
            revoked = db.query(RevokedToken).filter(RevokedToken.jti == uuid.UUID(jti)).first()
        except (ValueError, TypeError):
            revoked = None
        except ProgrammingError:
            # `revoked_tokens` doesn't exist yet —
            # database_hole/security_token_revocation_combined.sql hasn't
            # been applied to this database. Fail open rather than 500
            # every authenticated request in the app; this is loud on purpose
            # so it's impossible to miss in the logs.
            db.rollback()
            logger.critical(
                "revoked_tokens table is missing — token revocation is NOT enforced. "
                "Run database_hole/security_token_revocation_combined.sql against this database."
            )
            revoked = None
        if revoked:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    user_id_str = payload.get("user_id")
    hospital_id_str = payload.get("hospital_id")
    
    if user_id_str is None:
        raise credentials_exception

    try:
        user_uuid = uuid.UUID(user_id_str)
        hospital_uuid = uuid.UUID(hospital_id_str) if hospital_id_str else None
    except (ValueError, TypeError):
        raise credentials_exception

    try:
        user = (
            db.query(User)
            .options(
                joinedload(User.user_roles).joinedload(UserRole.role),
                joinedload(User.hospital),
            )
            .filter(User.id == user_uuid, User.is_deleted == False)
            .first()
        )
    except Exception as e:
        logger.error(f"Database error fetching user {user_id_str}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not verify user",
        )

    if user is None:
        # Log failed authentication
        if request:
            AuditLogger.log_login(
                username=user_id_str,
                success=False,
                ip_address=get_client_ip(request),
                error="User not found"
            )
        raise credentials_exception

    if not user.is_active:
        # Log inactive account attempt
        if request:
            AuditLogger.log_login(
                username=user.username,
                success=False,
                ip_address=get_client_ip(request),
                error="Account inactive"
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )
    
    # ✅ CRITICAL FIX: Validate tenant status (via TenantValidator)
    is_super_admin = 'super_admin' in (user.roles or [])
    tenant = None

    if not is_super_admin:
        try:
            tenant = TenantValidator.get_tenant_for_user(user, db)
            # None means hospital has no SaaS tenant linked → standalone mode, allow full access.
            # get_tenant_for_user raises HTTPException 403 when tenant IS linked but suspended.
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error validating tenant for user {user.id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Could not verify tenant status",
            )
    
    # ✅ CRITICAL FIX: RE-VALIDATE hospital_id from JWT against DB
    if hospital_uuid and user.hospital_id != hospital_uuid:
        logger.critical(
            f"SECURITY ALERT: Hospital ID mismatch for user {user.id}. "
            f"JWT: {hospital_uuid}, DB: {user.hospital_id}"
        )
        
        # Log security breach attempt
        if request:
            AuditLogger.log_unauthorized_access_attempt(
                attempted_user_id=user.id,
                attempted_resource="user",
                attempted_resource_id=user.id,
                actual_tenant_id=tenant.id if tenant else None,
                claimed_tenant_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
                ip_address=get_client_ip(request)
            )
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid hospital context",
        )
    
    # Validate hospital is active
    if not is_super_admin and (not user.hospital or not user.hospital.is_active):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hospital is inactive",
        )
    
    # Store tenant info on user object for use in route handlers
    user._tenant_id = tenant.id if tenant else None
    user._hospital_id = user.hospital_id
    # Exposes the current token's identity to /auth/logout and
    # /auth/change-password so they can revoke this specific token.
    user._jti = jti
    user._token_exp = payload.get("exp")

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure user is active (redundant safety check)."""
    return current_user


def _has_role(user: User, *role_names: str) -> bool:
    """Check if user has any of the specified roles."""
    user_roles = {str(r).strip().lower() for r in (user.roles or [])}
    allowed_roles = {str(r).strip().lower() for r in role_names}

    # Support common aliases found across environments.
    role_aliases = {
        "administrator": "admin",
        "hospital_admin": "admin",
        "inventoryadmin": "inventory_manager",
        "inventory-admin": "inventory_manager",
    }
    normalized_user_roles = {role_aliases.get(r, r) for r in user_roles}
    normalized_allowed_roles = {role_aliases.get(r, r) for r in allowed_roles}

    return bool(normalized_user_roles & normalized_allowed_roles)


async def require_super_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Ensure user has super_admin role."""
    if not _has_role(current_user, "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin access required",
        )
    return current_user


async def require_admin_or_super_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Ensure user has admin or super_admin role."""
    if not _has_role(current_user, "admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Super Admin access required",
        )
    return current_user


def require_any_role(*role_names: str):
    """Return a dependency that ensures current user has at least one allowed role."""

    async def _role_dependency(
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        if not _has_role(current_user, *role_names):
            logger.warning(
                "RBAC deny user=%s roles=%s required_any=%s",
                getattr(current_user, "username", "unknown"),
                getattr(current_user, "roles", []),
                role_names,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role permissions",
            )
        return current_user

    return _role_dependency


# ✅ NEW SECURITY DEPENDENCIES FOR MULTI-TENANT


async def get_current_user_tenant(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get tenant for current user (via hospital relationship)"""
    from .models.tenant import Tenant

    tenant = TenantValidator.get_tenant_for_user(current_user, db)
    return tenant


async def require_authenticated_tenant(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Resolve the tenant strictly from the authenticated caller's own
    hospital via TenantValidator.get_tenant_for_user() — never from a
    client-supplied X-Tenant-ID header or Host subdomain.

    Use this (not core.tenant.require_tenant) for any endpoint that reads or
    writes tenant-level data (profile, subscription, usage, modules). That
    other dependency resolves the tenant from an unauthenticated header/
    subdomain fallback when no valid JWT is present — it exists only as a
    best-effort context for the tenant-resolution middleware, not as an
    access-control boundary, and using it directly on a router previously
    let anyone read/write another tenant's profile/subscription with zero
    credentials by just sending that tenant's UUID in a header.
    """
    tenant = TenantValidator.get_tenant_for_user(current_user, db)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tenant is associated with this account",
        )
    return tenant


async def require_tenant_subscription(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Ensure tenant has active subscription"""
    tenant = TenantValidator.get_tenant_for_user(current_user, db)
    SubscriptionValidator.validate_subscription_active(tenant, db)
    return tenant


async def validate_resource_access(
    resource_type: str,
    resource_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Validate that user's hospital owns the resource.
    Prevents cross-tenant/cross-hospital data access.
    
    Supported resource types: patient, appointment, prescription, invoice, inventory
    """
    from .models.patient import Patient
    from .models.appointment import Appointment
    from .models.prescription import Prescription
    from .models.inventory import InventoryItem
    
    validators = {
        "patient": lambda: TenantScopeValidator.validate_patient_access(resource_id, current_user.hospital_id, db),
        "appointment": lambda: TenantScopeValidator.validate_appointment_access(resource_id, current_user.hospital_id, db),
        "prescription": lambda: TenantScopeValidator.validate_prescription_access(resource_id, current_user.hospital_id, db),
        "inventory": lambda: TenantScopeValidator.validate_inventory_item_access(resource_id, current_user.hospital_id, db),
    }
    
    if resource_type not in validators:
        raise ValueError(f"Unknown resource type: {resource_type}")
    
    try:
        resource = validators[resource_type]()
        return resource
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating {resource_type} access: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not validate resource access"
        )




# NOTE: a `require_resource_access()` dependency factory used to live here.
# Its body was `pass` — it validated nothing while looking, from the call
# site, exactly like a real authorization check (SECURITY_AUDIT.md L5). It
# was never actually used anywhere (grep confirmed). Removed rather than
# fixed, since `validate_resource_access()` above already does this
# correctly for any route that wires it up explicitly per-resource.
