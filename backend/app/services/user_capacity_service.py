"""
User management service with subscription capacity validation.
Prevents exceeding subscription limits for users and resources.
"""
import logging
import uuid
from datetime import datetime
from typing import Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from ..models.user import User
from ..models import Hospital
from ..models.tenant import Tenant, TenantSubscription
from ..models.patient import Patient
from ..core.tenant_security import UsageTracker, TenantValidator

logger = logging.getLogger(__name__)


class UserService:
    """Service for user management with subscription enforcement"""
    
    @staticmethod
    def check_can_create_user(tenant_id: uuid.UUID, db: Session) -> Tuple[bool, str, dict]:
        """
        Check if tenant can create new user based on subscription limits.
        
        Returns:
            (can_create: bool, reason: str, usage: {current, limit})
        """
        current_count, max_allowed = UsageTracker.check_user_capacity(tenant_id, db)
        
        if max_allowed == float('inf'):
            return True, "", {"current": current_count, "limit": "unlimited"}
        
        if current_count >= max_allowed:
            return False, (
                f"User limit reached ({current_count}/{max_allowed}). "
                f"Please upgrade your subscription plan."
            ), {"current": current_count, "limit": int(max_allowed)}
        
        return True, "", {"current": current_count, "limit": int(max_allowed)}
    
    @staticmethod
    def check_can_create_patient(tenant_id: uuid.UUID, db: Session) -> Tuple[bool, str, dict]:
        """
        Check if tenant can create new patient based on subscription limits.
        
        Returns:
            (can_create: bool, reason: str, usage: {current, limit})
        """
        current_count, max_allowed = UsageTracker.check_patient_capacity(tenant_id, db)
        
        if max_allowed == float('inf'):
            return True, "", {"current": current_count, "limit": "unlimited"}
        
        if current_count >= max_allowed:
            return False, (
                f"Patient limit reached ({current_count}/{max_allowed}). "
                f"Please upgrade your subscription plan."
            ), {"current": current_count, "limit": int(max_allowed)}
        
        return True, "", {"current": current_count, "limit": int(max_allowed)}
    
    @staticmethod
    def get_tenant_user_count(tenant_id: uuid.UUID, db: Session) -> int:
        """Get total active users for a tenant"""
        # Find hospitals linked to tenant by matching code
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        hospital_ids = db.query(Hospital.id).filter(
            Hospital.code == tenant.code
        ).all() if tenant else []
        
        user_count = db.query(User).filter(
            User.hospital_id.in_([h[0] for h in hospital_ids]),
            User.is_deleted == False,
            User.is_active == True
        ).count()
        
        return user_count
    
    @staticmethod
    def get_tenant_patient_count(tenant_id: uuid.UUID, db: Session) -> int:
        """Get total active patients for a tenant"""
        # Find hospitals linked to tenant by matching code
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        hospital_ids = db.query(Hospital.id).filter(
            Hospital.code == tenant.code
        ).all() if tenant else []
        
        patient_count = db.query(Patient).filter(
            Patient.hospital_id.in_([h[0] for h in hospital_ids]),
            Patient.is_deleted == False
        ).count()
        
        return patient_count
    
    @staticmethod
    def enforce_subscription_limits(current_user: User, db: Session) -> dict:
        """
        Get subscription usage stats for current user's tenant.
        Used for UI to show usage bars, warnings, etc.
        """
        tenant = TenantValidator.get_tenant_for_user(current_user, db)
        
        if not tenant:
            return {}
        
        subscription = db.query(TenantSubscription).filter(
            TenantSubscription.tenant_id == tenant.id,
            TenantSubscription.status.in_(["trialing", "active", "past_due"])
        ).first()
        
        if not subscription or not subscription.plan:
            return {}
        
        plan = subscription.plan
        user_count = UserService.get_tenant_user_count(tenant.id, db)
        patient_count = UserService.get_tenant_patient_count(tenant.id, db)
        
        usage_stats = {
            "plan_name": plan.name,
            "plan_code": plan.code,
            "subscription_status": subscription.status,
            "billing_period_start": subscription.current_period_start.isoformat() if subscription.current_period_start else None,
            "billing_period_end": subscription.current_period_end.isoformat() if subscription.current_period_end else None,
            "users": {
                "current": user_count,
                "limit": plan.max_users or None,
                "percentage": (user_count / plan.max_users * 100) if plan.max_users else 0,
                "warning": user_count >= (plan.max_users * 0.8) if plan.max_users else False
            },
            "patients": {
                "current": patient_count,
                "limit": plan.max_patients or None,
                "percentage": (patient_count / plan.max_patients * 100) if plan.max_patients else 0,
                "warning": patient_count >= (plan.max_patients * 0.8) if plan.max_patients else False
            },
            "appointments_monthly": {
                "limit": plan.max_appointments_monthly or None
            },
            "storage_gb": {
                "limit": plan.max_storage_gb or None
            }
        }
        
        return usage_stats


class UserCapacityValidator:
    """Validates user actions against subscription limits"""
    
    @staticmethod
    def validate_user_creation(tenant_id: uuid.UUID, db: Session):
        """Raise exception if user cannot be created"""
        can_create, reason, usage = UserService.check_can_create_user(tenant_id, db)
        
        if not can_create:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=reason,
                headers={"X-Usage-Current": str(usage['current']), "X-Usage-Limit": str(usage['limit'])}
            )
    
    @staticmethod
    def validate_patient_creation(tenant_id: uuid.UUID, db: Session):
        """Raise exception if patient cannot be created"""
        can_create, reason, usage = UserService.check_can_create_patient(tenant_id, db)
        
        if not can_create:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=reason,
                headers={"X-Usage-Current": str(usage['current']), "X-Usage-Limit": str(usage['limit'])}
            )
