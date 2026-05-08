"""
Tenant security utilities for multi-tenant isolation and validation.
Ensures row-level security, cross-tenant prevention, and subscription enforcement.
"""
import logging
import uuid
from typing import Optional, Dict, Any
from datetime import datetime

from fastapi import HTTPException, status, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..database import get_db
from ..models.user import User
from ..models.tenant import Tenant, TenantSubscription, TenantModule
from ..models.hospital import Hospital
from ..config import settings

logger = logging.getLogger(__name__)


class TenantValidator:
    """Validates tenant relationships and data isolation"""
    
    @staticmethod
    def validate_user_tenant(
        user: User,
        hospital_id: Optional[uuid.UUID],
        tenant_id: Optional[uuid.UUID],
        db: Session
    ) -> tuple[User, Hospital, Tenant]:
        """
        Validate that user belongs to the hospital/tenant.
        
        Args:
            user: Authenticated user
            hospital_id: Hospital ID from JWT or request
            tenant_id: Tenant ID from JWT or request
            db: Database session
            
        Returns:
            Tuple of (user, hospital, tenant) if valid
            
        Raises:
            HTTPException 403 if validation fails
        """
        # Re-validate user still exists and is active
        current_user = db.query(User).filter(
            User.id == user.id,
            User.is_deleted == False,
            User.is_active == True
        ).first()
        
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive or deleted"
            )
        
        # Verify hospital_id matches user's hospital_id
        if hospital_id and current_user.hospital_id != hospital_id:
            logger.warning(
                f"SECURITY: Hospital ID mismatch for user {user.id}. "
                f"JWT: {hospital_id}, DB: {current_user.hospital_id}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid hospital context"
            )
        
        # Get hospital and verify it's active
        hospital = db.query(Hospital).filter(
            Hospital.id == current_user.hospital_id,
            Hospital.is_active == True
        ).first()
        
        if not hospital:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hospital is inactive or not found"
            )
        
        # Get tenant (via hospital) and verify it's active
        from ..models.tenant import Tenant
        tenant = db.query(Tenant).filter(
            Tenant.id == hospital.tenant_id,
            Tenant.status == 'active'
        ).first()
        
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant is inactive or suspended"
            )
        
        # Verify tenant_id in JWT matches
        if tenant_id and tenant.id != tenant_id:
            logger.warning(
                f"SECURITY: Tenant ID mismatch for user {user.id}. "
                f"JWT: {tenant_id}, DB: {tenant.id}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid tenant context"
            )
        
        return current_user, hospital, tenant
    
    @staticmethod
    def get_tenant_for_user(user: User, db: Session) -> Tenant:
        """Get tenant for a user (via hospital relationship)"""
        hospital = db.query(Hospital).filter(
            Hospital.id == user.hospital_id,
            Hospital.is_active == True
        ).first()
        
        if not hospital:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hospital not found or inactive"
            )
        
        tenant = db.query(Tenant).filter(
            Tenant.id == hospital.tenant_id,
            Tenant.status == 'active'
        ).first()
        
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant not found or inactive"
            )
        
        return tenant


class SubscriptionValidator:
    """Validates subscription and module access"""
    
    @staticmethod
    def get_active_subscription(tenant: Tenant, db: Session) -> Optional[TenantSubscription]:
        """Get tenant's active subscription"""
        subscription = db.query(TenantSubscription).filter(
            TenantSubscription.tenant_id == tenant.id,
            TenantSubscription.status.in_(["trialing", "active", "past_due"]),
            TenantSubscription.billing_period_end >= datetime.utcnow()
        ).first()
        
        return subscription
    
    @staticmethod
    def is_module_enabled(tenant: Tenant, module_name: str, db: Session) -> bool:
        """Check if module is enabled for tenant's current subscription"""
        subscription = SubscriptionValidator.get_active_subscription(tenant, db)
        
        if not subscription:
            return False
        
        # Check if module is enabled in subscription
        tenant_module = db.query(TenantModule).filter(
            TenantModule.tenant_id == tenant.id,
            TenantModule.module_name == module_name,
            TenantModule.is_active == True
        ).first()
        
        if not tenant_module:
            return False
        
        # Verify subscription plan includes this module
        plan = subscription.plan
        if plan and hasattr(plan, 'features_enabled'):
            enabled_modules = plan.features_enabled or {}
            if module_name not in enabled_modules:
                return False
        
        return True
    
    @staticmethod
    def require_module_access(module_name: str):
        """FastAPI dependency to enforce module access"""
        async def _check(
            current_user: User = Depends(lambda: None),  # Will be injected
            db: Session = Depends(get_db)
        ) -> bool:
            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )
            
            tenant = TenantValidator.get_tenant_for_user(current_user, db)
            
            if not SubscriptionValidator.is_module_enabled(tenant, module_name, db):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Module '{module_name}' is not available for your subscription plan"
                )
            
            return True
        
        return _check
    
    @staticmethod
    def validate_subscription_active(tenant: Tenant, db: Session):
        """Ensure tenant has active subscription"""
        subscription = SubscriptionValidator.get_active_subscription(tenant, db)
        
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No active subscription found"
            )
        
        return subscription


class TenantScopeValidator:
    """Validates data belongs to correct tenant before CRUD operations"""
    
    @staticmethod
    def scope_query_by_hospital(query, hospital_id: uuid.UUID):
        """Add hospital_id filter to query"""
        return query.filter(getattr(query.column_descriptions[0]['entity'], 'hospital_id') == hospital_id)
    
    @staticmethod
    def validate_patient_access(patient_id: uuid.UUID, hospital_id: uuid.UUID, db: Session):
        """Verify patient belongs to hospital"""
        from ..models.patient import Patient
        
        patient = db.query(Patient).filter(
            Patient.id == patient_id,
            Patient.hospital_id == hospital_id,
            Patient.is_deleted == False
        ).first()
        
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found"
            )
        
        return patient
    
    @staticmethod
    def validate_appointment_access(appointment_id: uuid.UUID, hospital_id: uuid.UUID, db: Session):
        """Verify appointment belongs to hospital"""
        from ..models.appointment import Appointment
        
        appointment = db.query(Appointment).filter(
            Appointment.id == appointment_id,
            Appointment.hospital_id == hospital_id,
            Appointment.is_deleted == False
        ).first()
        
        if not appointment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Appointment not found"
            )
        
        return appointment
    
    @staticmethod
    def validate_prescription_access(prescription_id: uuid.UUID, hospital_id: uuid.UUID, db: Session):
        """Verify prescription belongs to hospital"""
        from ..models.prescription import Prescription
        
        prescription = db.query(Prescription).filter(
            Prescription.id == prescription_id,
            Prescription.hospital_id == hospital_id,
            Prescription.is_deleted == False
        ).first()
        
        if not prescription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Prescription not found"
            )
        
        return prescription
    
    @staticmethod
    def validate_inventory_item_access(item_id: uuid.UUID, hospital_id: uuid.UUID, db: Session):
        """Verify inventory item belongs to hospital"""
        from ..models.inventory import InventoryItem
        
        item = db.query(InventoryItem).filter(
            InventoryItem.id == item_id,
            InventoryItem.hospital_id == hospital_id,
            InventoryItem.is_deleted == False
        ).first()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Inventory item not found"
            )
        
        return item


class UsageTracker:
    """Track usage for subscription enforcement"""
    
    @staticmethod
    def check_user_capacity(tenant_id: uuid.UUID, db: Session) -> tuple[int, int]:
        """
        Check current user count vs subscription limit.
        Returns: (current_count, max_allowed)
        """
        from ..models.user import User
        
        subscription = db.query(TenantSubscription).filter(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.status.in_(["trialing", "active", "past_due"])
        ).first()
        
        if not subscription or not subscription.plan:
            return 0, 0
        
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            return 0, 0
        
        # Count active users in tenant's hospitals
        hospital_ids = db.query(Hospital.id).filter(
            Hospital.tenant_id == tenant_id
        ).all()
        
        current_count = db.query(User).filter(
            User.hospital_id.in_([h[0] for h in hospital_ids]),
            User.is_deleted == False,
            User.is_active == True
        ).count()
        
        max_allowed = subscription.plan.max_users or float('inf')
        
        return current_count, max_allowed
    
    @staticmethod
    def check_patient_capacity(tenant_id: uuid.UUID, db: Session) -> tuple[int, int]:
        """Check current patient count vs subscription limit"""
        from ..models.patient import Patient
        
        subscription = db.query(TenantSubscription).filter(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.status.in_(["trialing", "active", "past_due"])
        ).first()
        
        if not subscription or not subscription.plan:
            return 0, 0
        
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            return 0, 0
        
        hospital_ids = db.query(Hospital.id).filter(
            Hospital.tenant_id == tenant_id
        ).all()
        
        current_count = db.query(Patient).filter(
            Patient.hospital_id.in_([h[0] for h in hospital_ids]),
            Patient.is_deleted == False
        ).count()
        
        max_allowed = subscription.plan.max_patients or float('inf')
        
        return current_count, max_allowed


# Module dependency graph - ensures dependencies are met
MODULE_DEPENDENCIES = {
    "pharmacy": ["patients", "users"],
    "inventory": ["suppliers", "appointments"],
    "optical": ["patients", "prescriptions"],
    "billing": ["invoices", "insurance", "patients"],
    "reports": ["patients", "appointments"],
}


def validate_module_dependencies(module_name: str, enabled_modules: list) -> bool:
    """Check if all dependencies for a module are enabled"""
    required = MODULE_DEPENDENCIES.get(module_name, [])
    return all(dep in enabled_modules for dep in required)
