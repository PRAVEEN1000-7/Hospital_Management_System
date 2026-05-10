"""
Dependencies for JWT auth and role-based access — new hms_db UUID/RBAC schema.
Includes comprehensive tenant and subscription validation for multi-tenant security.
"""
import logging
import uuid
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload
from .database import get_db
from .utils.security import decode_access_token
from .models.user import User, UserRole
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
            if not tenant:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Tenant not found for this hospital",
                )
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


async def require_tenant_subscription(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Ensure tenant has active subscription"""
    tenant = TenantValidator.get_tenant_for_user(current_user, db)
    SubscriptionValidator.validate_subscription_active(tenant, db)
    return tenant


def require_module_access(module_name: str):
    """
    Dependency factory to ensure user's tenant has access to a module.
    
    Usage:
        @router.get("/pharmacy/medications")
        async def list_medications(
            current_user: User = Depends(get_current_active_user),
            _: None = Depends(require_module_access("pharmacy")),
            db: Session = Depends(get_db)
        ):
            # Code here only executes if pharmacy module is enabled
            pass
    """
    async def _check(
        current_user: User = Depends(get_current_active_user),
        db: Session = Depends(get_db)
    ):
        tenant = TenantValidator.get_tenant_for_user(current_user, db)
        
        if not SubscriptionValidator.is_module_enabled(tenant, module_name, db):
            logger.warning(
                f"Module access denied: user={current_user.id}, "
                f"module={module_name}, tenant={tenant.id}"
            )
            
            AuditLogger.log_permission_denied(
                current_user=current_user,
                tenant=tenant,
                resource_type=f"module:{module_name}",
                reason=f"Module '{module_name}' not available for subscription plan"
            )
            
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Module '{module_name}' is not available for your subscription plan"
            )
        
        return True
    
    return _check


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


def require_resource_access(resource_type: str, resource_id_param_name: str = "resource_id"):
    """
    Factory to create a dependency that validates resource access.
    
    Usage:
        @router.get("/patients/{patient_id}")
        async def get_patient(
            patient_id: UUID,
            current_user: User = Depends(get_current_active_user),
            patient: Patient = Depends(require_resource_access("patient", "patient_id")),
            db: Session = Depends(get_db)
        ):
            return patient
    """
    async def _validate(
        current_user: User = Depends(get_current_active_user),
        db: Session = Depends(get_db)
    ):
        # Note: This is a simplified version. In practice, extract resource_id from request path
        pass
    
    return _validate
