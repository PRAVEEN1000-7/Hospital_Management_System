"""
Tenant Admin API routes for hospital-level management.
"""
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..core.tenant import require_tenant, TenantContext
from ..models.tenant import Tenant
from ..schemas.tenant import (
    TenantResponse, TenantUpdate,
    UsageQuotaResponse,
    TenantModuleResponse
)
from ..services.tenant_service import TenantService
from ..services.subscription_service import SubscriptionService

router = APIRouter(prefix="/tenant", tags=["Tenant Admin"])


@router.get("/profile", response_model=TenantResponse)
def get_tenant_profile(
    tenant: Tenant = Depends(require_tenant),
    db: Session = Depends(get_db)
):
    """Get current tenant profile"""
    # Enrich with subscription info
    sub = tenant.active_subscription
    if sub:
        tenant.subscription_status = sub.status
        tenant.plan_name = sub.plan.name if sub.plan else None
        tenant.plan_code = sub.plan.code if sub.plan else None
        tenant.current_period_end = sub.current_period_end
    
    return tenant


@router.put("/profile", response_model=TenantResponse)
def update_tenant_profile(
    request: TenantUpdate,
    tenant: Tenant = Depends(require_tenant),
    db: Session = Depends(get_db)
):
    """Update tenant profile"""
    update_data = request.model_dump(exclude_unset=True)
    
    # Prevent updating sensitive fields
    restricted = ['id', 'slug', 'code', 'status', 'admin_user_id']
    for field in restricted:
        update_data.pop(field, None)
    
    updated = TenantService.update_tenant(db, tenant.id, **update_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    return updated


@router.get("/modules", response_model=List[TenantModuleResponse])
def get_available_modules(
    tenant: Tenant = Depends(require_tenant),
    db: Session = Depends(get_db)
):
    """Get modules available to this tenant (read-only for tenant admin)"""
    modules = TenantService.get_tenant_modules(db, tenant.id)
    
    # Filter to only enabled modules for tenant view
    return [m for m in modules if m.get('is_enabled')]


@router.get("/subscription", response_model=dict)
def get_subscription_details(
    tenant: Tenant = Depends(require_tenant),
    db: Session = Depends(get_db)
):
    """Get current subscription details (read-only)"""
    subscription = SubscriptionService.get_active_subscription(db, tenant.id)
    
    if not subscription:
        return {"status": "none", "message": "No active subscription"}
    
    plan = subscription.plan
    
    return {
        "id": str(subscription.id),
        "plan": {
            "id": str(plan.id) if plan else None,
            "code": plan.code if plan else None,
            "name": plan.name if plan else None,
            "description": plan.description if plan else None
        },
        "status": subscription.status,
        "trial_ends_at": subscription.trial_ends_at,
        "current_period_start": subscription.current_period_start,
        "current_period_end": subscription.current_period_end,
        "cancel_at_period_end": subscription.cancel_at_period_end,
        "features": {**subscription.effective_features, **subscription.effective_limits}
    }


@router.get("/usage", response_model=List[UsageQuotaResponse])
def get_usage_quotas(
    tenant: Tenant = Depends(require_tenant),
    db: Session = Depends(get_db)
):
    """Get current usage vs limits"""
    quotas = SubscriptionService.get_all_quotas(db, tenant.id)
    return [UsageQuotaResponse(**q) for q in quotas]


@router.post("/upgrade-request")
def request_upgrade(
    requested_plan: str,
    reason: str,
    tenant: Tenant = Depends(require_tenant),
    db: Session = Depends(get_db)
):
    """Submit upgrade request to Super Admin"""
    from ..models.tenant import AuditLog
    
    audit = AuditLog(
        tenant_id=tenant.id,
        action='upgrade_requested',
        entity_type='Subscription',
        entity_name=requested_plan,
        new_values={'reason': reason}
    )
    db.add(audit)
    db.commit()
    
    return {
        "message": "Upgrade request submitted",
        "requested_plan": requested_plan,
        "status": "pending_review"
    }


@router.get("/check-limit/{resource_type}")
def check_resource_limit(
    resource_type: str,
    tenant: Tenant = Depends(require_tenant),
    db: Session = Depends(get_db)
):
    """Check if tenant has hit their limit for a resource"""
    has_capacity = SubscriptionService.check_limit(db, tenant.id, resource_type)
    quota = SubscriptionService.get_usage_quota(db, tenant.id, resource_type)
    
    return {
        "resource_type": resource_type,
        "has_capacity": has_capacity,
        "current": quota['current_usage'],
        "limit": quota['max_limit'],
        "percentage": quota['percentage_used']
    }
