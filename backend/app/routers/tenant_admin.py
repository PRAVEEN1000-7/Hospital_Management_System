"""
Tenant Admin API routes for hospital-level management.
"""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_authenticated_tenant, require_any_role
from ..core.module_roles import edit_roles
from ..models.tenant import Tenant
from ..models.user import User
from ..schemas.tenant import (
    TenantResponse, TenantUpdate,
    UsageQuotaResponse,
)
from ..services.tenant_service import TenantService
from ..services.subscription_service import SubscriptionService
from ..core.tenant_security import SubscriptionValidator

router = APIRouter(prefix="/tenant", tags=["Tenant Admin"])

# Only gates GET /tenant/subscription — the one endpoint uniquely used by the
# admin-only "Subscription" page (system.subscription in the shared matrix).
# /tenant/modules, /profile, /usage, /check-limit are load-bearing plumbing
# used by every authenticated role (e.g. isModuleEnabled()) and stay ungated.
subscription_role_guard = require_any_role(*edit_roles("system.subscription"))


@router.get("/profile", response_model=TenantResponse)
def get_tenant_profile(
    tenant: Tenant = Depends(require_authenticated_tenant),
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
    tenant: Tenant = Depends(require_authenticated_tenant),
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


@router.get("/modules")
def get_available_modules(
    tenant: Tenant = Depends(require_authenticated_tenant),
    db: Session = Depends(get_db)
):
    """Get enabled modules for this tenant.

    Returns raw dicts from get_tenant_modules so the 'code' field is preserved.
    Using a typed response_model (TenantModuleResponse) would silently rename
    'code' -> 'module_code' and null it out, breaking the frontend module check.

    CORE modules are always included as enabled even if no TenantModule record
    exists yet (e.g. tenant created before plan assignment).
    """
    from ..models.tenant import Module as ModuleModel

    modules = TenantService.get_tenant_modules(db, tenant.id)
    enabled = [m for m in modules if m.get('is_enabled')]

    # Ensure all active CORE modules appear regardless of TenantModule records
    # — but only while the tenant actually has an active subscription.
    # SubscriptionValidator.is_module_enabled() (the real per-request gate
    # every module-scoped endpoint uses, e.g. GET /prescriptions/*) returns
    # False for every module, core or not, once the subscription isn't
    # trialing/active/past_due. Unconditionally listing core modules as
    # enabled here — regardless of subscription state — made this endpoint
    # lie to the frontend: it would show prescriptions/patients/etc. as
    # available and let the UI call their APIs, which then 403'd because the
    # real gate disagreed. Checking the same active-subscription condition
    # here keeps the two in sync.
    if SubscriptionValidator.get_active_subscription(tenant, db):
        enabled_codes = {m['code'] for m in enabled}
        core_modules = db.query(ModuleModel).filter(
            ModuleModel.is_core == True,
            ModuleModel.is_active == True
        ).all()
        for cm in core_modules:
            if cm.code not in enabled_codes:
                enabled.append({
                    'code': cm.code,
                    'name': cm.name,
                    'is_enabled': True,
                    'is_core': True,
                })

    return enabled


@router.get("/subscription", response_model=dict)
def get_subscription_details(
    tenant: Tenant = Depends(require_authenticated_tenant),
    current_user: User = Depends(subscription_role_guard),
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
    tenant: Tenant = Depends(require_authenticated_tenant),
    db: Session = Depends(get_db)
):
    """Get current usage vs limits"""
    quotas = SubscriptionService.get_all_quotas(db, tenant.id)
    return [UsageQuotaResponse(**q) for q in quotas]


@router.post("/upgrade-request")
def request_upgrade(
    requested_plan: str,
    reason: str,
    tenant: Tenant = Depends(require_authenticated_tenant),
    db: Session = Depends(get_db)
):
    """Legacy: submit a plain text upgrade request (no payment tracking)"""
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
    return {"message": "Upgrade request submitted", "requested_plan": requested_plan, "status": "pending_review"}


@router.get("/check-limit/{resource_type}")
def check_resource_limit(
    resource_type: str,
    tenant: Tenant = Depends(require_authenticated_tenant),
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
