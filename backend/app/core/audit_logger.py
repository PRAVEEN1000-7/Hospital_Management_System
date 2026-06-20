"""
Audit logging system for multi-tenant security and compliance.
Logs all critical operations with full tenant context.
"""
import logging
import json
import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum

from sqlalchemy.orm import Session
from ..models.user import User
from ..models.tenant import Tenant


logger = logging.getLogger("audit")


class AuditAction(str, Enum):
    """Audit action types"""
    # Authentication
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    TOKEN_REFRESH = "TOKEN_REFRESH"
    FAILED_LOGIN = "FAILED_LOGIN"
    
    # User management
    USER_CREATE = "USER_CREATE"
    USER_UPDATE = "USER_UPDATE"
    USER_DELETE = "USER_DELETE"
    USER_ROLE_ASSIGN = "USER_ROLE_ASSIGN"
    USER_ROLE_REMOVE = "USER_ROLE_REMOVE"
    
    # Data operations
    PATIENT_CREATE = "PATIENT_CREATE"
    PATIENT_UPDATE = "PATIENT_UPDATE"
    PATIENT_DELETE = "PATIENT_DELETE"
    APPOINTMENT_CREATE = "APPOINTMENT_CREATE"
    APPOINTMENT_UPDATE = "APPOINTMENT_UPDATE"
    APPOINTMENT_DELETE = "APPOINTMENT_DELETE"
    PRESCRIPTION_CREATE = "PRESCRIPTION_CREATE"
    PRESCRIPTION_DISPENSE = "PRESCRIPTION_DISPENSE"
    INVOICE_CREATE = "INVOICE_CREATE"
    PAYMENT_PROCESS = "PAYMENT_PROCESS"
    INVENTORY_ADJUST = "INVENTORY_ADJUST"
    
    # Tenant management
    SUBSCRIPTION_CHANGE = "SUBSCRIPTION_CHANGE"
    MODULE_ENABLE = "MODULE_ENABLE"
    MODULE_DISABLE = "MODULE_DISABLE"
    TENANT_STATUS_CHANGE = "TENANT_STATUS_CHANGE"
    
    # Security
    PERMISSION_DENIED = "PERMISSION_DENIED"
    UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS"
    DATA_BREACH_ATTEMPT = "DATA_BREACH_ATTEMPT"
    
    # Admin actions
    ADMIN_ACTION = "ADMIN_ACTION"


class AuditSeverity(str, Enum):
    """Log severity levels"""
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class AuditLogger:
    """Structured audit logging for compliance and security"""
    
    @staticmethod
    def log(
        action: AuditAction,
        user: Optional[User],
        tenant: Optional[Tenant],
        resource_type: str,
        resource_id: Optional[uuid.UUID] = None,
        old_values: Optional[Dict[str, Any]] = None,
        new_values: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        severity: AuditSeverity = AuditSeverity.INFO,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Log an audit event with full context.
        
        Args:
            action: Type of action performed
            user: User performing the action (optional for failed logins)
            tenant: Tenant context
            resource_type: Type of resource affected (e.g., 'patient', 'user', 'invoice')
            resource_id: ID of resource affected
            old_values: Previous values (for updates)
            new_values: New values (for create/update)
            ip_address: IP address of requester
            severity: Log severity
            error: Error message if applicable
            metadata: Additional context
        """
        
        audit_record = {
            "timestamp": datetime.utcnow().isoformat(),
            "action": action.value,
            "severity": severity.value,
            "user_id": str(user.id) if user else None,
            "user_username": user.username if user else None,
            "tenant_id": str(tenant.id) if tenant else None,
            "tenant_name": tenant.name if tenant else None,
            "hospital_id": str(user.hospital_id) if user else None,
            "resource_type": resource_type,
            "resource_id": str(resource_id) if resource_id else None,
            "ip_address": ip_address,
            "old_values": old_values,
            "new_values": new_values,
            "error": error,
            "metadata": metadata or {}
        }
        
        # Log to standard logger
        log_message = json.dumps(audit_record)
        
        if severity == AuditSeverity.CRITICAL:
            logger.critical(log_message)
        elif severity == AuditSeverity.WARNING:
            logger.warning(log_message)
        else:
            logger.info(log_message)

        # Persist to the queryable audit_logs table so login/security events are
        # visible in the super-admin audit view. Best-effort and on its OWN session
        # so it never interferes with (or commits) the caller's transaction.
        try:
            from ..database import SessionLocal
            from ..models.tenant import AuditLog

            roles = getattr(user, "roles", None) or []
            user_type = "superadmin" if "super_admin" in roles else "hospital"

            new_vals = dict(new_values or {})
            if metadata:
                new_vals.update(metadata)
            if error:
                new_vals["error"] = error

            _audit_db = SessionLocal()
            try:
                _audit_db.add(AuditLog(
                    tenant_id=getattr(tenant, "id", None),
                    user_id=getattr(user, "id", None),
                    user_type=user_type,
                    action=str(action.value)[:50],
                    entity_type=(resource_type or "system")[:50],
                    entity_id=resource_id,
                    old_values=old_values or None,
                    new_values=new_vals or None,
                    ip_address=ip_address,
                ))
                _audit_db.commit()
            finally:
                _audit_db.close()
        except Exception:
            # Auditing must never break the operation it is recording.
            pass
    
    @staticmethod
    def log_login(
        username: str,
        success: bool,
        tenant: Optional[Tenant] = None,
        ip_address: Optional[str] = None,
        error: Optional[str] = None,
        user: Optional[User] = None,
    ):
        """Log login attempt"""
        action = AuditAction.LOGIN if success else AuditAction.FAILED_LOGIN
        severity = AuditSeverity.INFO if success else AuditSeverity.WARNING

        AuditLogger.log(
            action=action,
            user=user,
            tenant=tenant,
            resource_type="authentication",
            ip_address=ip_address,
            severity=severity,
            error=error,
            metadata={"username": username}
        )
    
    @staticmethod
    def log_user_action(
        action: AuditAction,
        current_user: User,
        tenant: Tenant,
        target_user_id: uuid.UUID,
        old_values: Optional[Dict] = None,
        new_values: Optional[Dict] = None,
        ip_address: Optional[str] = None
    ):
        """Log user management action"""
        AuditLogger.log(
            action=action,
            user=current_user,
            tenant=tenant,
            resource_type="user",
            resource_id=target_user_id,
            old_values=old_values,
            new_values=new_values,
            ip_address=ip_address
        )
    
    @staticmethod
    def log_data_operation(
        action: AuditAction,
        current_user: User,
        tenant: Tenant,
        resource_type: str,
        resource_id: uuid.UUID,
        old_values: Optional[Dict] = None,
        new_values: Optional[Dict] = None,
        ip_address: Optional[str] = None
    ):
        """Log patient/appointment/prescription data operation"""
        AuditLogger.log(
            action=action,
            user=current_user,
            tenant=tenant,
            resource_type=resource_type,
            resource_id=resource_id,
            old_values=old_values,
            new_values=new_values,
            ip_address=ip_address
        )
    
    @staticmethod
    def log_permission_denied(
        current_user: Optional[User],
        tenant: Optional[Tenant],
        resource_type: str,
        reason: str,
        ip_address: Optional[str] = None
    ):
        """Log permission denied event"""
        AuditLogger.log(
            action=AuditAction.PERMISSION_DENIED,
            user=current_user,
            tenant=tenant,
            resource_type=resource_type,
            severity=AuditSeverity.WARNING,
            error=reason,
            ip_address=ip_address
        )
    
    @staticmethod
    def log_unauthorized_access_attempt(
        attempted_user_id: Optional[uuid.UUID],
        attempted_resource: str,
        attempted_resource_id: uuid.UUID,
        actual_tenant_id: uuid.UUID,
        claimed_tenant_id: uuid.UUID,
        ip_address: Optional[str] = None
    ):
        """Log potential security breach - unauthorized access attempt"""
        AuditLogger.log(
            action=AuditAction.DATA_BREACH_ATTEMPT,
            user=None,
            tenant=None,
            resource_type=attempted_resource,
            resource_id=attempted_resource_id,
            severity=AuditSeverity.CRITICAL,
            error="Cross-tenant access attempt detected",
            ip_address=ip_address,
            metadata={
                "attempted_user_id": str(attempted_user_id) if attempted_user_id else None,
                "actual_tenant_id": str(actual_tenant_id),
                "claimed_tenant_id": str(claimed_tenant_id)
            }
        )
    
    @staticmethod
    def log_subscription_change(
        super_admin_id: uuid.UUID,
        tenant_id: uuid.UUID,
        tenant_name: str,
        old_plan: Optional[str],
        new_plan: str,
        reason: Optional[str] = None
    ):
        """Log subscription plan change by super admin"""
        AuditLogger.log(
            action=AuditAction.SUBSCRIPTION_CHANGE,
            user=None,
            tenant=None,
            resource_type="subscription",
            severity=AuditSeverity.INFO,
            metadata={
                "admin_id": str(super_admin_id),
                "tenant_id": str(tenant_id),
                "tenant_name": tenant_name,
                "old_plan": old_plan,
                "new_plan": new_plan,
                "reason": reason
            }
        )
    
    @staticmethod
    def log_tenant_status_change(
        super_admin_id: uuid.UUID,
        tenant_id: uuid.UUID,
        tenant_name: str,
        old_status: str,
        new_status: str,
        reason: Optional[str] = None
    ):
        """Log tenant status change by super admin"""
        severity = AuditSeverity.CRITICAL if new_status == "suspended" else AuditSeverity.INFO
        
        AuditLogger.log(
            action=AuditAction.TENANT_STATUS_CHANGE,
            user=None,
            tenant=None,
            resource_type="tenant",
            severity=severity,
            metadata={
                "admin_id": str(super_admin_id),
                "tenant_id": str(tenant_id),
                "tenant_name": tenant_name,
                "old_status": old_status,
                "new_status": new_status,
                "reason": reason
            }
        )


def get_client_ip(request) -> str:
    """Extract client IP from request"""
    if request.headers.get("x-forwarded-for"):
        return request.headers.get("x-forwarded-for").split(",")[0].strip()
    elif request.headers.get("x-real-ip"):
        return request.headers.get("x-real-ip")
    elif hasattr(request, "client") and request.client:
        return request.client.host
    return "unknown"
