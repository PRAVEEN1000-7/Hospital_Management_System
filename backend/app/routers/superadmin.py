"""
Super Admin API routes for platform management.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..core.tenant import require_superadmin
from ..models.user import User
from ..schemas.tenant import (
    SuperAdminLoginRequest, SuperAdminLoginResponse,
    DashboardStatsResponse,
    TenantCreate, TenantUpdate, TenantResponse, TenantListResponse, TenantDetailResponse,
    SubscriptionPlanResponse, SubscriptionPlanCreate, SubscriptionPlanUpdate,
    ModuleResponse, ModuleConfigurationRequest, TenantModuleResponse,
    TenantOnboardingRequest, TenantSubscriptionResponse,
    UsageQuotaResponse, AssignPlanRequest
)
from ..services.superadmin_service import SuperAdminService
from ..services.tenant_service import TenantService
from ..services.subscription_service import SubscriptionService

router = APIRouter(prefix="/superadmin", tags=["Super Admin"])


# ============================================================================
# Authentication
# ============================================================================

@router.post("/login", response_model=SuperAdminLoginResponse)
def superadmin_login(
    request: SuperAdminLoginRequest,
    db: Session = Depends(get_db)
):
    """Super Admin login endpoint"""
    admin = SuperAdminService.authenticate(db, request.username, request.password)
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Update last login
    SuperAdminService.update_last_login(db, admin.id)
    
    # Generate tokens
    access_token = SuperAdminService.create_access_token(admin)
    refresh_token, refresh_hash = SuperAdminService.create_refresh_token(admin)
    
    return SuperAdminLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=60,  # minutes
        user=admin
    )


@router.get("/me", response_model=dict)
def get_current_superadmin_info(
    admin: User = Depends(require_superadmin)
):
    """Get current super admin info"""
    return {
        "id": str(admin.id),
        "username": admin.username,
        "email": admin.email,
        "full_name": f"{admin.first_name} {admin.last_name}".strip(),
        "is_active": admin.is_active
    }


# ============================================================================
# Dashboard
# ============================================================================

@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics"""
    stats = TenantService.get_dashboard_stats(db)
    
    return DashboardStatsResponse(**stats)


# ============================================================================
# Tenant Management
# ============================================================================

@router.get("/tenants", response_model=TenantListResponse)
def list_tenants(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    search: Optional[str] = None,
    plan_code: Optional[str] = None,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """List all tenants with filtering"""
    result = TenantService.list_tenants(
        db=db,
        page=page,
        limit=limit,
        status=status,
        search=search,
        plan_code=plan_code
    )
    
    return TenantListResponse(**result)


@router.post("/tenants", response_model=TenantResponse)
def create_tenant(
    request: TenantOnboardingRequest,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Create new tenant/hospital"""
    tenant = TenantService.create_tenant(
        db=db,
        name=request.name,
        email=request.email,
        admin_user_data={
            'email': request.admin_email,
            'first_name': request.admin_first_name,
            'last_name': request.admin_last_name,
            'password': request.admin_password
        },
        phone=request.phone,
        city=request.city,
        country=request.country,
        trial_days=request.trial_days,
        plan_id=request.plan_id,
        created_by_admin_id=admin.id,
    )
    
    return tenant


@router.get("/tenants/{tenant_id}", response_model=TenantDetailResponse)
def get_tenant(
    tenant_id: uuid.UUID,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Get tenant details"""
    tenant = TenantService.get_by_id(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Enrich with modules
    modules = TenantService.get_tenant_modules(db, tenant_id)
    
    # Build response
    response = TenantDetailResponse.model_validate(tenant)
    response.modules = [TenantModuleResponse.model_validate(m) for m in modules]
    
    return response


@router.put("/tenants/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: uuid.UUID,
    request: TenantUpdate,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Update tenant details"""
    update_data = request.model_dump(exclude_unset=True)
    tenant = TenantService.update_tenant(db, tenant_id, **update_data)
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    return tenant


@router.post("/tenants/{tenant_id}/suspend")
def suspend_tenant(
    tenant_id: uuid.UUID,
    reason: str,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Suspend a tenant"""
    tenant = TenantService.update_tenant(
        db, tenant_id, status='suspended'
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    return {"message": "Tenant suspended", "reason": reason}


@router.post("/tenants/{tenant_id}/activate")
def activate_tenant(
    tenant_id: uuid.UUID,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Activate a suspended tenant"""
    tenant = TenantService.update_tenant(
        db, tenant_id, status='active'
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    return {"message": "Tenant activated"}


# ============================================================================
# Module Configuration
# ============================================================================

@router.get("/tenants/{tenant_id}/modules", response_model=list)
def get_tenant_modules(
    tenant_id: uuid.UUID,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Get module configuration for tenant"""
    modules = TenantService.get_tenant_modules(db, tenant_id)
    return modules


@router.put("/tenants/{tenant_id}/modules")
def configure_tenant_modules(
    tenant_id: uuid.UUID,
    request: ModuleConfigurationRequest,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Configure modules for tenant"""
    TenantService.configure_modules(
        db, tenant_id, request.modules, admin.id
    )
    return {"message": "Module configuration updated"}


@router.get("/modules", response_model=list[ModuleResponse])
def list_modules(
    category: Optional[str] = None,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """List all available modules"""
    from ..models.tenant import Module
    
    query = db.query(Module)
    if category:
        query = query.filter(Module.category == category)
    
    modules = query.all()
    return modules


# ============================================================================
# Subscription Plans
# ============================================================================

@router.get("/plans", response_model=list[SubscriptionPlanResponse])
def list_plans(
    include_inactive: bool = False,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """List subscription plans"""
    plans = SubscriptionService.list_plans(db, include_inactive)
    return plans


@router.post("/plans", response_model=SubscriptionPlanResponse)
def create_plan(
    request: SubscriptionPlanCreate,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Create new subscription plan"""
    plan = SubscriptionService.create_plan(
        db=db,
        code=request.code,
        name=request.name,
        description=request.description or "",
        base_price=request.base_price,
        billing_cycle=request.billing_cycle,
        max_users=request.max_users,
        max_patients=request.max_patients,
        max_storage_gb=request.max_storage_gb,
        max_appointments_monthly=request.max_appointments_monthly,
        features_enabled=request.features_enabled,
        modules_included=request.modules_included,
        is_public=request.is_public,
        sort_order=request.sort_order
    )
    return plan


@router.post("/plans/assign", response_model=TenantSubscriptionResponse)
def assign_plan_to_hospital(
    request: AssignPlanRequest,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Assign a subscription plan and modules to a hospital using its code"""
    subscription = TenantService.assign_plan_to_tenant(
        db=db,
        hospital_code=request.hospital_code,
        plan_id=request.plan_id,
        modules=request.modules,
        admin_id=admin.id
    )
    return subscription


@router.put("/plans/{plan_id}", response_model=SubscriptionPlanResponse)
def update_plan(
    plan_id: uuid.UUID,
    request: SubscriptionPlanUpdate,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Update subscription plan"""
    update_data = request.model_dump(exclude_unset=True)
    plan = SubscriptionService.update_plan(db, plan_id, **update_data)
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    return plan


# ============================================================================
# Subscription Management
# ============================================================================

@router.get("/tenants/{tenant_id}/subscription", response_model=TenantSubscriptionResponse)
def get_tenant_subscription(
    tenant_id: uuid.UUID,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Get tenant's active subscription"""
    subscription = SubscriptionService.get_active_subscription(db, tenant_id)
    if not subscription:
        raise HTTPException(status_code=404, detail="No active subscription")
    
    return subscription


@router.post("/tenants/{tenant_id}/change-plan")
def change_tenant_plan(
    tenant_id: uuid.UUID,
    new_plan_id: uuid.UUID,
    immediate: bool = False,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Change tenant's subscription plan"""
    subscription = SubscriptionService.change_plan(
        db, tenant_id, new_plan_id, admin.id, immediate
    )
    return {
        "message": "Plan change processed",
        "subscription_id": str(subscription.id),
        "new_plan": subscription.plan.code if subscription.plan else None
    }


@router.post("/tenants/{tenant_id}/cancel")
def cancel_subscription(
    tenant_id: uuid.UUID,
    reason: str,
    at_period_end: bool = True,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Cancel tenant subscription"""
    subscription = SubscriptionService.cancel_subscription(
        db, tenant_id, reason, admin.id, at_period_end
    )
    return {
        "message": "Subscription cancelled",
        "at_period_end": at_period_end,
        "effective_date": subscription.current_period_end if at_period_end else None
    }


@router.post("/tenants/{tenant_id}/reactivate")
def reactivate_subscription(
    tenant_id: uuid.UUID,
    new_plan_id: Optional[uuid.UUID] = None,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Reactivate a suspended/cancelled subscription"""
    subscription = SubscriptionService.reactivate_subscription(
        db, tenant_id, new_plan_id, admin.id
    )
    return {
        "message": "Subscription reactivated",
        "plan": subscription.plan.code if subscription.plan else None,
        "status": subscription.status
    }


# ============================================================================
# Usage & Quotas
# ============================================================================

@router.get("/tenants/{tenant_id}/usage", response_model=list[UsageQuotaResponse])
def get_tenant_usage(
    tenant_id: uuid.UUID,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Get usage quotas for tenant"""
    quotas = SubscriptionService.get_all_quotas(db, tenant_id)
    return [UsageQuotaResponse(**q) for q in quotas]


# ============================================================================
# Audit Logs
# ============================================================================

@router.get("/audit-logs")
def get_audit_logs(
    tenant_id: Optional[uuid.UUID] = None,
    action: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    """Get audit logs"""
    from ..models.tenant import AuditLog
    
    query = db.query(AuditLog)
    
    if tenant_id:
        query = query.filter(AuditLog.tenant_id == tenant_id)
    
    if action:
        query = query.filter(AuditLog.action == action)
    
    logs = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    
    return {
        "total": len(logs),
        "logs": [
            {
                "id": str(log.id),
                "tenant_id": str(log.tenant_id) if log.tenant_id else None,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_name": log.entity_name,
                "created_at": log.created_at
            }
            for log in logs
        ]
    }
