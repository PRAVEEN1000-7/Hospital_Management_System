# HMS Architecture Analysis Report
## Multi-Tenant + Module-Flexible (Plug & Play) Transformation Plan

---

## 1. Executive Summary

### Current Architecture
| Component | Technology |
|-----------|------------|
| **Backend** | FastAPI + SQLAlchemy ORM + PostgreSQL |
| **Frontend** | React 19 + TypeScript + Vite + Tailwind CSS |
| **State Management** | Zustand |
| **Database** | 62+ tables, UUID-based, RBAC-enabled |
| **Current Modules** | Appointments, Patients, Doctors, Prescriptions, Pharmacy, Inventory, Billing, Insurance |

### Transformation Goals
1. **Multi-Tenancy**: Data isolation across hospitals/tenants
2. **Module Plug & Play**: Dynamic feature enabling/disabling
3. **Subscription Management**: Plans, billing, usage tracking
4. **Zero-downtime migrations**: Existing data preservation

---

## 2. Current Database Architecture Analysis

### 2.1 Schema Overview
```
PHASE 0 - FOUNDATION (hospitals, departments, users, roles, permissions)
PHASE 1 - CORE (patients, doctors, appointments, schedules)
PHASE 2 - CLINICAL (prescriptions, pharmacy, optical)
PHASE 3 - BILLING (invoices, payments, refunds, insurance)
PHASE 4 - INVENTORY (suppliers, PO, GRN, stock movements)
PHASE 5 - SUPPORT (notifications, audit logs, ID system)
```

### 2.2 Key Architectural Strengths
- ✅ **Hospital-scoped tables**: Most tables have `hospital_id` FK
- ✅ **RBAC system**: roles, permissions, user_roles junction tables
- ✅ **Soft deletes**: `is_deleted` + `deleted_at` pattern
- ✅ **Audit trail**: `created_at`, `updated_at`, `created_by`, `updated_by`
- ✅ **UUID primary keys**: `gen_random_uuid()` for all entities

### 2.3 Gaps for Multi-Tenancy
| Gap | Impact | Priority |
|-----|--------|----------|
| No tenant isolation beyond `hospital_id` | Cannot support SaaS model | HIGH |
| No module/feature registry | Cannot enable/disable features | HIGH |
| No subscription/plan tables | Cannot monetize by feature | HIGH |
| No usage tracking | Cannot enforce limits | MEDIUM |
| No tenant onboarding flow | Manual setup required | MEDIUM |

---

## 3. Proposed Architecture: Multi-Tenant + Module-Flexible

### 3.1 Tenant Model (SaaS Foundation)

```
┌─────────────────────────────────────────────────────────────┐
│                    TENANT ISOLATION MODEL                    │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Tenant A    │  │  Tenant B    │  │  Tenant C    │      │
│  │  Hospital 1  │  │  Hospital 2  │  │  Hospital 3  │      │
│  │  [Free Plan] │  │  [Pro Plan]  │  │ [Ent Plan]   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │             │
│         └─────────────────┴──────────────────┘             │
│                           │                                 │
│                    ┌──────┴──────┐                         │
│                    │   SHARED    │                         │
│                    │   SCHEMA    │                         │
│                    │  (metadata) │                         │
│                    └─────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 New Core Tables for Multi-Tenancy

```sql
-- ============================================================
-- SAAS_CORE SCHEMA (Shared across all tenants)
-- ============================================================

-- 1. TENANTS (Replaces/extends hospitals table)
CREATE TABLE tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Organization details
    name                VARCHAR(255) NOT NULL,
    slug                VARCHAR(50) NOT NULL UNIQUE,  -- subdomain: hospital.hms.com
    code                VARCHAR(20) NOT NULL UNIQUE,  -- 2-char code for ID generation
    
    -- Branding
    logo_url            VARCHAR(500),
    primary_color       VARCHAR(7) DEFAULT '#1E40AF',
    secondary_color     VARCHAR(7) DEFAULT '#3B82F6',
    
    -- Contact
    email               VARCHAR(255) NOT NULL,
    phone               VARCHAR(20),
    address_line_1      VARCHAR(255),
    address_line_2      VARCHAR(255),
    city                VARCHAR(100),
    state_province      VARCHAR(100),
    postal_code         VARCHAR(20),
    country             VARCHAR(3) DEFAULT 'USA',
    timezone            VARCHAR(50) DEFAULT 'UTC',
    default_currency    VARCHAR(3) DEFAULT 'USD',
    
    -- Status
    status              VARCHAR(20) DEFAULT 'active', -- 'pending', 'active', 'suspended', 'cancelled'
    is_verified         BOOLEAN DEFAULT false,
    verified_at         TIMESTAMPTZ,
    
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SUBSCRIPTION PLANS (Defines feature tiers)
CREATE TABLE subscription_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(50) NOT NULL UNIQUE,  -- 'free', 'starter', 'professional', 'enterprise'
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    
    -- Billing
    billing_cycle       VARCHAR(20) NOT NULL, -- 'monthly', 'quarterly', 'yearly'
    base_price          DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency            VARCHAR(3) DEFAULT 'USD',
    
    -- Limits
    max_users           INTEGER, -- NULL = unlimited
    max_patients        INTEGER,
    max_storage_gb      INTEGER,
    max_appointments_monthly INTEGER,
    
    -- Feature flags JSON (override module permissions)
    features_enabled    JSONB DEFAULT '{}',
    
    -- Availability
    is_public           BOOLEAN DEFAULT true, -- show in pricing page
    is_active           BOOLEAN DEFAULT true,
    sort_order          INTEGER DEFAULT 0,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TENANT SUBSCRIPTIONS (Current plan for each tenant)
CREATE TABLE tenant_subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    plan_id             UUID NOT NULL REFERENCES subscription_plans(id),
    
    -- Subscription period
    status              VARCHAR(20) DEFAULT 'active', -- 'trialing', 'active', 'past_due', 'cancelled', 'expired'
    trial_ends_at       TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end  TIMESTAMPTZ NOT NULL,
    
    -- Cancellation
    cancel_at_period_end BOOLEAN DEFAULT false,
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason VARCHAR(255),
    
    -- Payment
    payment_method      VARCHAR(20), -- 'card', 'bank_transfer', 'upi'
    billing_email       VARCHAR(255),
    
    -- Override features for this specific subscription
    custom_features     JSONB DEFAULT '{}',
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, status) WHERE status IN ('trialing', 'active', 'past_due')
);

-- 4. MODULE REGISTRY (Available modules/features)
CREATE TABLE modules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(50) NOT NULL UNIQUE, -- 'appointments', 'pharmacy', 'inventory'
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    category            VARCHAR(50), -- 'core', 'clinical', 'financial', 'inventory', 'analytics'
    
    -- Technical
    frontend_route_prefix VARCHAR(50), -- '/appointments', '/pharmacy'
    api_prefix          VARCHAR(50), -- '/api/v1/appointments', '/api/v1/pharmacy'
    
    -- Dependencies (other modules required)
    required_modules    UUID[] DEFAULT '{}',
    
    -- Default permissions
    default_permissions JSONB DEFAULT '{}',
    
    -- Status
    is_core             BOOLEAN DEFAULT false, -- cannot be disabled
    is_active           BOOLEAN DEFAULT true,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TENANT MODULE CONFIGURATION (Enabled/disabled per tenant)
CREATE TABLE tenant_modules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    module_id           UUID NOT NULL REFERENCES modules(id),
    
    -- Configuration
    is_enabled          BOOLEAN DEFAULT true,
    enabled_at          TIMESTAMPTZ,
    enabled_by          UUID,
    
    -- Feature flags within module
    feature_config      JSONB DEFAULT '{}', -- { "walk_ins": true, "telemedicine": false }
    
    -- Custom limits for this tenant
    custom_limits       JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, module_id)
);

-- 6. USAGE TRACKING (For enforcing limits)
CREATE TABLE usage_tracking (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    resource_type       VARCHAR(50) NOT NULL, -- 'user', 'patient', 'appointment', 'invoice'
    period_year         INTEGER NOT NULL,
    period_month        INTEGER NOT NULL,
    
    usage_count         INTEGER DEFAULT 0,
    limit_reached_at    TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, resource_type, period_year, period_month)
);

-- 7. BILLING HISTORY
CREATE TABLE billing_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    subscription_id     UUID REFERENCES tenant_subscriptions(id),
    
    invoice_number      VARCHAR(30) NOT NULL UNIQUE,
    status              VARCHAR(20) DEFAULT 'draft', -- 'draft', 'open', 'paid', 'void'
    
    -- Amounts
    subtotal            DECIMAL(12,2) NOT NULL,
    tax_amount          DECIMAL(12,2) DEFAULT 0,
    total               DECIMAL(12,2) NOT NULL,
    amount_paid         DECIMAL(12,2) DEFAULT 0,
    amount_due          DECIMAL(12,2) NOT NULL,
    
    -- Dates
    invoice_date        DATE NOT NULL,
    due_date            DATE NOT NULL,
    paid_at             TIMESTAMPTZ,
    
    -- Line items (stored as JSON for flexibility)
    line_items          JSONB NOT NULL,
    
    -- Payment
    payment_method      VARCHAR(20),
    payment_reference   VARCHAR(100),
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 Database Migration Strategy

```sql
-- ============================================================
-- MIGRATION: Existing Hospital → Tenant Model
-- ============================================================

-- Step 1: Create tenants from existing hospitals
INSERT INTO tenants (
    id, name, slug, code, logo_url, 
    address_line_1, city, state_province, postal_code, country,
    timezone, default_currency, email, phone,
    status, is_verified, verified_at, created_at, updated_at
)
SELECT 
    id, name, LOWER(code), code, logo_url,
    address_line_1, city, state_province, postal_code, country,
    timezone, default_currency, email, phone,
    CASE WHEN is_active THEN 'active' ELSE 'suspended' END,
    true, NOW(), created_at, updated_at
FROM hospitals;

-- Step 2: Seed default subscription plans
INSERT INTO subscription_plans (code, name, description, billing_cycle, base_price, features_enabled) VALUES
('free', 'Free', 'Basic features for small clinics', 'monthly', 0, 
 '{"appointments": true, "patients": true, "prescriptions": true, "billing_basic": true, "users_max": 5, "patients_max": 500}'),

('starter', 'Starter', 'Essential features for growing practices', 'monthly', 49,
 '{"appointments": true, "patients": true, "prescriptions": true, "pharmacy": true, "billing_full": true, "users_max": 15, "patients_max": 2000}'),

('professional', 'Professional', 'Full feature set with priority support', 'monthly', 149,
 '{"appointments": true, "patients": true, "prescriptions": true, "pharmacy": true, "inventory": true, "billing_full": true, "insurance": true, "analytics": true, "users_max": 50, "patients_max": 10000}'),

('enterprise', 'Enterprise', 'Unlimited everything with custom integrations', 'monthly', 499,
 '{"all_modules": true, "users_max": null, "patients_max": null, "custom_api": true, "dedicated_support": true}');

-- Step 3: Create default subscriptions for existing hospitals
INSERT INTO tenant_subscriptions (
    tenant_id, plan_id, status, current_period_start, current_period_end
)
SELECT 
    t.id,
    (SELECT id FROM subscription_plans WHERE code = 'professional'),
    'active',
    NOW(),
    NOW() + INTERVAL '1 year'
FROM tenants t;

-- Step 4: Seed module registry
INSERT INTO modules (code, name, description, category, frontend_route_prefix, api_prefix, is_core) VALUES
('patients', 'Patient Management', 'Patient registration, records, and history', 'core', '/patients', '/api/v1/patients', true),
('appointments', 'Appointments', 'Scheduling, walk-ins, and queue management', 'core', '/appointments', '/api/v1/appointments', true),
('doctors', 'Doctor Management', 'Doctor profiles, schedules, and assignments', 'core', '/doctors', '/api/v1/doctors', true),
('prescriptions', 'Prescriptions', 'Prescription creation and management', 'clinical', '/prescriptions', '/api/v1/prescriptions', false),
('pharmacy', 'Pharmacy', 'Medicine management and dispensing', 'clinical', '/pharmacy', '/api/v1/pharmacy', false),
('inventory', 'Inventory', 'Stock management, suppliers, and procurement', 'inventory', '/inventory', '/api/v1/inventory', false),
('billing', 'Billing & Invoicing', 'Invoices, payments, and refunds', 'financial', '/billing', '/api/v1/invoices', false),
('insurance', 'Insurance', 'Claims and provider management', 'financial', '/insurance', '/api/v1/insurance', false),
('analytics', 'Analytics', 'Reports and insights', 'analytics', '/analytics', '/api/v1/analytics', false);

-- Step 5: Enable all modules for existing tenants (backward compatibility)
INSERT INTO tenant_modules (tenant_id, module_id, is_enabled, enabled_at)
SELECT t.id, m.id, true, NOW()
FROM tenants t
CROSS JOIN modules m;
```

---

## 4. Backend Architecture Changes

### 4.1 Tenant Context Middleware

```python
# backend/app/core/tenant.py
from contextvars import ContextVar
from typing import Optional
from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session
from ..models.tenant import Tenant

tenant_ctx: ContextVar[Optional[Tenant]] = ContextVar('tenant_ctx', default=None)

class TenantContext:
    """Tenant isolation context manager"""
    
    @staticmethod
    def get_current() -> Optional[Tenant]:
        return tenant_ctx.get()
    
    @staticmethod
    def set_current(tenant: Tenant):
        tenant_ctx.set(tenant)
    
    @staticmethod
    def get_tenant_id() -> Optional[uuid.UUID]:
        tenant = tenant_ctx.get()
        return tenant.id if tenant else None

# Middleware for extracting tenant from request
async def tenant_middleware(request: Request, call_next):
    """
    Extract tenant from:
    1. Subdomain (hospital-slug.hms.com)
    2. Header (X-Tenant-ID)
    3. JWT token (for authenticated routes)
    """
    host = request.headers.get('host', '')
    subdomain = host.split('.')[0] if '.' in host else None
    
    tenant = None
    db = next(get_db())
    
    try:
        # Try subdomain first
        if subdomain and subdomain not in ('www', 'app', 'api'):
            tenant = db.query(Tenant).filter(
                Tenant.slug == subdomain,
                Tenant.status == 'active'
            ).first()
        
        # Fall back to header
        if not tenant:
            tenant_id = request.headers.get('X-Tenant-ID')
            if tenant_id:
                tenant = db.query(Tenant).filter(
                    Tenant.id == uuid.UUID(tenant_id),
                    Tenant.status == 'active'
                ).first()
        
        # Set context
        if tenant:
            TenantContext.set_current(tenant)
            request.state.tenant = tenant
        
        response = await call_next(request)
        
        # Add tenant header to response
        if tenant:
            response.headers['X-Tenant-ID'] = str(tenant.id)
        
        return response
        
    finally:
        db.close()
        tenant_ctx.set(None)
```

### 4.2 Module Registry Service

```python
# backend/app/services/module_service.py
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from ..models.module import Module, TenantModule
from ..core.tenant import TenantContext

class ModuleService:
    """
    Dynamic module management for plug-and-play architecture
    """
    
    # In-memory registry for fast lookups
    _registry: Dict[str, dict] = {}
    
    @classmethod
    def register_module(cls, module_code: str, config: dict):
        """Register a module at application startup"""
        cls._registry[module_code] = {
            'config': config,
            'router': config.get('router'),
            'models': config.get('models', []),
            'services': config.get('services', []),
            'dependencies': config.get('dependencies', [])
        }
    
    @classmethod
    def get_module(cls, module_code: str) -> Optional[dict]:
        return cls._registry.get(module_code)
    
    @classmethod
    def list_available_modules(cls) -> List[dict]:
        """List all registered modules"""
        return [
            {
                'code': code,
                'name': info['config'].get('name'),
                'description': info['config'].get('description'),
                'category': info['config'].get('category'),
                'is_core': info['config'].get('is_core', False)
            }
            for code, info in cls._registry.items()
        ]
    
    @staticmethod
    def get_tenant_modules(db: Session, tenant_id: uuid.UUID) -> List[TenantModule]:
        """Get all modules enabled for a tenant"""
        return db.query(TenantModule).filter(
            TenantModule.tenant_id == tenant_id,
            TenantModule.is_enabled == True
        ).all()
    
    @staticmethod
    def is_module_enabled(db: Session, tenant_id: uuid.UUID, module_code: str) -> bool:
        """Check if a module is enabled for the tenant"""
        module = db.query(Module).filter(Module.code == module_code).first()
        if not module:
            return False
        
        # Core modules are always enabled
        if module.is_core:
            return True
        
        tenant_module = db.query(TenantModule).filter(
            TenantModule.tenant_id == tenant_id,
            TenantModule.module_id == module.id
        ).first()
        
        return tenant_module.is_enabled if tenant_module else False
    
    @staticmethod
    def check_feature_access(db: Session, tenant_id: uuid.UUID, 
                            module_code: str, feature: str) -> bool:
        """Check if a specific feature within a module is accessible"""
        if not ModuleService.is_module_enabled(db, tenant_id, module_code):
            return False
        
        tenant_module = db.query(TenantModule).join(Module).filter(
            TenantModule.tenant_id == tenant_id,
            Module.code == module_code
        ).first()
        
        if not tenant_module or not tenant_module.feature_config:
            return True  # Default allow if no config
        
        return tenant_module.feature_config.get(feature, True)


# Decorator for module-protected routes
from functools import wraps
from fastapi import Depends, HTTPException

def require_module(module_code: str):
    """Decorator to require a module to be enabled"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, db: Session = Depends(get_db), **kwargs):
            tenant = TenantContext.get_current()
            if not tenant:
                raise HTTPException(status_code=400, detail="Tenant not found")
            
            if not ModuleService.is_module_enabled(db, tenant.id, module_code):
                raise HTTPException(
                    status_code=403, 
                    detail=f"Module '{module_code}' is not enabled for this tenant"
                )
            
            return await func(*args, db=db, **kwargs)
        return wrapper
    return decorator


def require_feature(module_code: str, feature: str):
    """Decorator to require a specific feature to be enabled"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, db: Session = Depends(get_db), **kwargs):
            tenant = TenantContext.get_current()
            if not tenant:
                raise HTTPException(status_code=400, detail="Tenant not found")
            
            if not ModuleService.check_feature_access(db, tenant.id, module_code, feature):
                raise HTTPException(
                    status_code=403,
                    detail=f"Feature '{feature}' is not enabled in module '{module_code}'"
                )
            
            return await func(*args, db=db, **kwargs)
        return wrapper
    return decorator
```

### 4.3 Subscription & Usage Service

```python
# backend/app/services/subscription_service.py
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..models.subscription import (
    SubscriptionPlan, TenantSubscription, UsageTracking
)
from ..core.tenant import TenantContext

class SubscriptionService:
    """
    Manages subscription tiers, usage tracking, and limit enforcement
    """
    
    @staticmethod
    def get_active_subscription(db: Session, tenant_id: uuid.UUID) -> Optional[TenantSubscription]:
        """Get the currently active subscription for a tenant"""
        return db.query(TenantSubscription).filter(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.status.in_(['trialing', 'active', 'past_due']),
            TenantSubscription.current_period_end > datetime.utcnow()
        ).first()
    
    @staticmethod
    def get_plan_limits(db: Session, tenant_id: uuid.UUID) -> Dict[str, Any]:
        """Get effective limits for a tenant (plan + custom overrides)"""
        subscription = SubscriptionService.get_active_subscription(db, tenant_id)
        if not subscription:
            return {'max_users': 0, 'max_patients': 0}  # Fallback
        
        plan = subscription.plan
        limits = {
            'max_users': plan.max_users,
            'max_patients': plan.max_patients,
            'max_storage_gb': plan.max_storage_gb,
            'max_appointments_monthly': plan.max_appointments_monthly,
        }
        
        # Apply custom overrides from subscription
        if subscription.custom_features:
            for key, value in subscription.custom_features.items():
                if key.startswith('max_'):
                    limits[key] = value
        
        return limits
    
    @staticmethod
    def check_limit(db: Session, tenant_id: uuid.UUID, resource_type: str) -> bool:
        """Check if tenant has exceeded their limit for a resource"""
        limits = SubscriptionService.get_plan_limits(db, tenant_id)
        limit_key = f'max_{resource_type}'
        max_allowed = limits.get(limit_key)
        
        if max_allowed is None:
            return True  # Unlimited
        
        # Get current usage
        current_count = db.query(func.count()).filter(
            # Dynamic model lookup based on resource_type
        ).scalar()
        
        return current_count < max_allowed
    
    @staticmethod
    def track_usage(db: Session, tenant_id: uuid.UUID, resource_type: str, 
                   quantity: int = 1):
        """Track resource usage for billing and limits"""
        now = datetime.utcnow()
        
        usage = db.query(UsageTracking).filter(
            UsageTracking.tenant_id == tenant_id,
            UsageTracking.resource_type == resource_type,
            UsageTracking.period_year == now.year,
            UsageTracking.period_month == now.month
        ).first()
        
        if not usage:
            usage = UsageTracking(
                tenant_id=tenant_id,
                resource_type=resource_type,
                period_year=now.year,
                period_month=now.month,
                usage_count=0
            )
            db.add(usage)
        
        usage.usage_count += quantity
        
        # Check if limit reached
        limits = SubscriptionService.get_plan_limits(db, tenant_id)
        max_allowed = limits.get(f'max_{resource_type}')
        
        if max_allowed and usage.usage_count >= max_allowed:
            usage.limit_reached_at = now
        
        db.commit()
    
    @staticmethod
    def get_feature_access_map(db: Session, tenant_id: uuid.UUID) -> Dict[str, bool]:
        """Get all feature access for a tenant's subscription"""
        subscription = SubscriptionService.get_active_subscription(db, tenant_id)
        if not subscription:
            return {}
        
        # Merge plan features with custom overrides
        features = subscription.plan.features_enabled or {}
        custom = subscription.custom_features or {}
        
        return {**features, **custom}
```

### 4.4 Dynamic Router Registration

```python
# backend/app/main.py (Modified for module system)
from fastapi import FastAPI, Depends
from .services.module_service import ModuleService, require_module

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# Register core modules (always available)
CORE_MODULES = [
    {'code': 'auth', 'router': auth.router, 'prefix': '/api/v1'},
    {'code': 'hospital', 'router': hospital.router, 'prefix': '/api/v1'},
    {'code': 'users', 'router': users.router, 'prefix': '/api/v1'},
    {'code': 'patients', 'router': patients.router, 'prefix': '/api/v1'},
    {'code': 'appointments', 'router': appointments.router, 'prefix': '/api/v1'},
]

# Register optional modules
OPTIONAL_MODULES = [
    {'code': 'pharmacy', 'router': pharmacy.router, 'prefix': '/api/v1'},
    {'code': 'inventory', 'router': inventory.router, 'prefix': '/api/v1'},
    {'code': 'billing', 'router': invoices.router, 'prefix': '/api/v1'},
    {'code': 'insurance', 'router': insurance.router, 'prefix': '/api/v1'},
]

# Register all modules with the service
for module in CORE_MODULES + OPTIONAL_MODULES:
    ModuleService.register_module(module['code'], module)
    
    # Include router (access control happens at route level)
    app.include_router(
        module['router'],
        prefix=module['prefix'],
        # Add dependencies for module check
        dependencies=[Depends(require_module_dependency(module['code']))]
    )

def require_module_dependency(module_code: str):
    """Create a dependency that checks if module is enabled"""
    async def check_module(
        db: Session = Depends(get_db),
        tenant: Tenant = Depends(get_current_tenant)
    ):
        if not ModuleService.is_module_enabled(db, tenant.id, module_code):
            raise HTTPException(
                status_code=403,
                detail=f"Module '{module_code}' is not enabled"
            )
    return check_module
```

---

## 5. Frontend Architecture Changes

### 5.1 Module Registry & Dynamic Loading

```typescript
// frontend/src/services/ModuleRegistry.ts
export interface ModuleConfig {
  code: string;
  name: string;
  description: string;
  icon: string;
  category: 'core' | 'clinical' | 'financial' | 'inventory' | 'analytics';
  routes: RouteConfig[];
  isCore: boolean;
  requiredRoles?: string[];
}

export interface RouteConfig {
  path: string;
  component: React.LazyExoticComponent<React.ComponentType>;
  exact?: boolean;
  requiredRoles?: string[];
  requiredFeature?: string;
}

class ModuleRegistry {
  private modules: Map<string, ModuleConfig> = new Map();
  private enabledModules: Set<string> = new Set();

  register(config: ModuleConfig): void {
    this.modules.set(config.code, config);
  }

  enable(moduleCode: string): void {
    this.enabledModules.add(moduleCode);
  }

  disable(moduleCode: string): void {
    if (!this.modules.get(moduleCode)?.isCore) {
      this.enabledModules.delete(moduleCode);
    }
  }

  isEnabled(moduleCode: string): boolean {
    const module = this.modules.get(moduleCode);
    if (!module) return false;
    if (module.isCore) return true;
    return this.enabledModules.has(moduleCode);
  }

  getEnabledModules(): ModuleConfig[] {
    return Array.from(this.modules.values()).filter(m => this.isEnabled(m.code));
  }

  getNavigationItems(): NavigationItem[] {
    return this.getEnabledModules().flatMap(module => 
      module.routes
        .filter(r => !r.path.includes(':')) // Exclude param routes
        .map(route => ({
          name: module.name,
          path: route.path,
          icon: module.icon,
          category: module.category,
          moduleCode: module.code
        }))
    );
  }

  getRoutes(): JSX.Element[] {
    return this.getEnabledModules().flatMap(module =>
      module.routes.map(route => (
        <Route
          key={`${module.code}-${route.path}`}
          path={route.path}
          element={
            <ProtectedRoute 
              allowedRoles={route.requiredRoles || module.requiredRoles}
              requiredFeature={route.requiredFeature}
              moduleCode={module.code}
            >
              <Suspense fallback={<ModuleLoading />}>
                <route.component />
              </Suspense>
            </ProtectedRoute>
          }
        />
      ))
    );
  }
}

export const moduleRegistry = new ModuleRegistry();
```

### 5.2 Tenant Context Provider

```typescript
// frontend/src/contexts/TenantContext.tsx
interface Tenant {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  timezone: string;
  currency: string;
  subscription: {
    plan: string;
    status: string;
    features: Record<string, boolean>;
    limits: Record<string, number>;
  };
  enabledModules: string[];
  moduleConfig: Record<string, Record<string, boolean>>;
}

interface TenantContextType {
  tenant: Tenant | null;
  isLoading: boolean;
  refreshTenant: () => Promise<void>;
  checkFeatureAccess: (module: string, feature: string) => boolean;
  checkLimit: (resource: string) => { allowed: boolean; current: number; max: number };
}

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const { user } = useAuth();

  // Extract tenant from subdomain
  const getTenantFromSubdomain = () => {
    const host = window.location.host;
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
      return subdomain;
    }
    return localStorage.getItem('tenant_slug');
  };

  const fetchTenant = async () => {
    const slug = getTenantFromSubdomain();
    if (!slug) return;

    try {
      const response = await api.get(`/api/v1/tenants/by-slug/${slug}`);
      const tenantData = response.data;
      setTenant(tenantData);

      // Update module registry
      tenantData.enabledModules.forEach((code: string) => {
        moduleRegistry.enable(code);
      });

      // Update tenant-specific module configs
      Object.entries(tenantData.moduleConfig).forEach(([module, config]) => {
        // Store config for feature checking
      });

    } catch (error) {
      console.error('Failed to fetch tenant:', error);
    }
  };

  const checkFeatureAccess = (module: string, feature: string): boolean => {
    if (!tenant) return false;
    
    // Check if module is enabled
    if (!tenant.enabledModules.includes(module)) return false;
    
    // Check feature-specific config
    const moduleConfig = tenant.moduleConfig[module];
    if (moduleConfig && feature in moduleConfig) {
      return moduleConfig[feature];
    }
    
    // Fall back to subscription features
    return tenant.subscription.features[feature] ?? true;
  };

  useEffect(() => {
    if (user) {
      fetchTenant();
    }
  }, [user]);

  return (
    <TenantContext.Provider value={{ 
      tenant, 
      isLoading: !tenant, 
      refreshTenant: fetchTenant,
      checkFeatureAccess,
      checkLimit 
    }}>
      {children}
    </TenantContext.Provider>
  );
};
```

### 5.3 Dynamic Navigation Based on Enabled Modules

```typescript
// frontend/src/components/Navigation/DynamicSidebar.tsx
export const DynamicSidebar: React.FC = () => {
  const { tenant } = useTenant();
  const [navigationItems, setNavigationItems] = useState<NavigationItem[]>([]);

  useEffect(() => {
    if (tenant) {
      // Rebuild navigation based on enabled modules
      const items = moduleRegistry.getNavigationItems();
      setNavigationItems(items);
    }
  }, [tenant]);

  // Group by category
  const grouped = navigationItems.reduce((acc, item) => {
    acc[item.category] = acc[item.category] || [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, NavigationItem[]>);

  return (
    <aside className="sidebar">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="nav-section">
          <h4 className="nav-category">{category}</h4>
          <ul>
            {items.map(item => (
              <li key={item.path}>
                <NavLink to={item.path}>
                  <Icon name={item.icon} />
                  <span>{item.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      
      {/* Show upgrade prompt for disabled features */}
      <UpgradePrompt />
    </aside>
  );
};
```

### 5.4 Module Loading with Feature Gates

```typescript
// frontend/src/components/common/FeatureGate.tsx
interface FeatureGateProps {
  module: string;
  feature?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  module,
  feature,
  fallback = <FeatureLocked />,
  children
}) => {
  const { checkFeatureAccess, tenant } = useTenant();
  const hasAccess = checkFeatureAccess(module, feature || 'base');

  if (!tenant) return <Loading />;
  if (!hasAccess) return <>{fallback}</>;

  return <>{children}</>;
};

// Usage example
<FeatureGate module="pharmacy" feature="batch_tracking">
  <BatchTrackingView />
</FeatureGate>

<FeatureGate 
  module="analytics" 
  fallback={<UpgradePrompt feature="analytics" />}
>
  <AnalyticsDashboard />
</FeatureGate>
```

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)
**Database & Core Backend**

| Task | Effort | Dependencies |
|------|--------|--------------|
| Create new `saas_core` schema tables | 3 days | None |
| Migration script: hospitals → tenants | 2 days | Schema ready |
| Seed subscription plans | 1 day | Schema ready |
| Tenant context middleware | 3 days | Schema ready |
| Module registry backend | 4 days | Tenant context |

### Phase 2: Backend Transformation (Weeks 4-6)

| Task | Effort | Dependencies |
|------|--------|--------------|
| Update all models with tenant_id enforcement | 5 days | Phase 1 |
| Subscription service + usage tracking | 4 days | Phase 1 |
| Module-enabled route decorators | 3 days | Module registry |
| API endpoints for subscription management | 3 days | Subscription service |
| Tenant onboarding API | 3 days | All above |

### Phase 3: Frontend Transformation (Weeks 7-9)

| Task | Effort | Dependencies |
|------|--------|--------------|
| Module registry (frontend) | 3 days | None |
| Tenant context provider | 2 days | None |
| Dynamic navigation system | 4 days | Module registry |
| FeatureGate component | 2 days | Tenant context |
| Subscription/upgrade UI | 4 days | Tenant context |
| Module loading refactoring | 5 days | All above |

### Phase 4: Testing & Launch (Weeks 10-12)

| Task | Effort | Dependencies |
|------|--------|--------------|
| Multi-tenant data isolation tests | 4 days | Phase 2,3 |
| Module enable/disable E2E tests | 3 days | Phase 3 |
| Subscription flow testing | 3 days | Phase 2,3 |
| Data migration dry-run | 3 days | All above |
| Production deployment | 3 days | All above |

---

## 7. Key Changes by File

### Backend Files to Modify

| File | Changes |
|------|---------|
| `main.py` | Add tenant middleware, dynamic router registration |
| `database.py` | Add tenant-aware session handling |
| `dependencies.py` | Add tenant context extraction |
| `models/*.py` | Ensure all models use `tenant_id` (currently `hospital_id`) |
| `routers/*.py` | Add `@require_module` decorators to optional routes |
| `services/*.py` | Inject tenant context, check subscription limits |
| `config.py` | Add SaaS-specific settings |

### New Backend Files

```
backend/app/
├── core/
│   ├── tenant.py              # Tenant context management
│   └── module_registry.py     # Module registration system
├── models/
│   ├── tenant.py               # Tenant, Subscription models
│   ├── module.py               # Module, TenantModule models
│   └── subscription.py         # Subscription-related models
├── services/
│   ├── tenant_service.py       # Tenant CRUD operations
│   ├── subscription_service.py # Subscription management
│   ├── module_service.py       # Module enable/disable
│   └── usage_service.py        # Usage tracking
├── routers/
│   ├── tenant_admin.py         # Tenant management (super_admin)
│   ├── subscription.py         # Subscription management
│   └── modules.py              # Module configuration
└── middleware/
    └── tenant_middleware.py    # Tenant extraction
```

### Frontend Files to Modify

| File | Changes |
|------|---------|
| `App.tsx` | Dynamic route generation based on modules |
| `components/common/Layout.tsx` | Dynamic navigation |
| `contexts/AuthContext.tsx` | Add tenant context integration |
| `services/api.ts` | Add tenant headers |

### New Frontend Files

```
frontend/src/
├── contexts/
│   └── TenantContext.tsx       # Tenant state management
├── services/
│   ├── ModuleRegistry.ts       # Module registration
│   └── subscriptionService.ts  # Subscription API
├── components/
│   ├── common/
│   │   ├── FeatureGate.tsx     # Feature access control
│   │   ├── ModuleLoading.tsx   # Module lazy loading
│   │   └── UpgradePrompt.tsx   # Upgrade CTA
│   └── navigation/
│       └── DynamicSidebar.tsx  # Module-based navigation
└── pages/
    └── admin/
        ├── SubscriptionManagement.tsx
        ├── ModuleConfiguration.tsx
        └── TenantSettings.tsx
```

---

## 8. Database Migration Script

```sql
-- ============================================================
-- COMPLETE MIGRATION: Single Hospital → Multi-Tenant SaaS
-- ============================================================

BEGIN;

-- 1. Create new schema for SaaS core
CREATE SCHEMA IF NOT EXISTS saas_core;

-- 2. Create tables (see section 3.2 for full DDL)
-- [tables creation SQL from section 3.2]

-- 3. Migrate hospitals to tenants
INSERT INTO saas_core.tenants (...)
SELECT ... FROM hospitals;

-- 4. Update all existing tables to reference tenant_id
-- Most tables already have hospital_id, just need to:
-- - Rename hospital_id to tenant_id where appropriate
-- - OR keep both for backward compatibility

-- 5. Seed default data
INSERT INTO saas_core.subscription_plans ...;
INSERT INTO saas_core.modules ...;

-- 6. Create default subscriptions for existing hospitals
INSERT INTO saas_core.tenant_subscriptions ...;

-- 7. Enable all modules for existing tenants
INSERT INTO saas_core.tenant_modules ...;

COMMIT;
```

---

## 9. API Changes Summary

### New Endpoints

```yaml
# Tenant Management
GET    /api/v1/tenant                    # Get current tenant info
PUT    /api/v1/tenant                    # Update tenant settings
GET    /api/v1/tenants                   # List all tenants (super_admin)

# Subscription
GET    /api/v1/subscription              # Get current subscription
GET    /api/v1/subscription/plans      # List available plans
POST   /api/v1/subscription/upgrade      # Upgrade subscription
POST   /api/v1/subscription/cancel      # Cancel subscription
GET    /api/v1/subscription/usage        # Get usage stats

# Modules
GET    /api/v1/modules                   # List available modules
GET    /api/v1/modules/enabled          # Get enabled modules for tenant
POST   /api/v1/modules/:code/enable      # Enable module (admin)
POST   /api/v1/modules/:code/disable     # Disable module (admin)
PUT    /api/v1/modules/:code/config     # Update module config

# Onboarding
POST   /api/v1/onboarding/tenant         # Create new tenant
POST   /api/v1/onboarding/verify        # Verify tenant domain
```

---

## 10. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data migration failure | Full backup, dry-run migration, rollback script |
| Performance degradation | Tenant-aware query optimization, connection pooling |
| Feature regression | Comprehensive E2E testing, feature flags |
| Tenant data leakage | Row-level security policies, strict tenant validation |
| Subscription billing errors | Idempotency keys, webhook retries, manual reconciliation |

---

## 11. Cost Estimates

### Infrastructure (Monthly)

| Component | Current | Multi-Tenant |
|-----------|---------|--------------|
| Database (RDS) | $200 | $500 (larger instance) |
| Application Server | $100 | $300 (containerized, auto-scaling) |
| CDN/Static Hosting | $50 | $100 |
| Monitoring | $30 | $80 |
| **Total** | **$380** | **$980** |

### Development Effort

| Phase | Weeks | Engineers | Cost |
|-------|-------|-----------|------|
| 1. Foundation | 3 | 2 | $12,000 |
| 2. Backend | 3 | 3 | $18,000 |
| 3. Frontend | 3 | 2 | $12,000 |
| 4. Testing | 3 | 2 | $12,000 |
| **Total** | **12** | **-** | **$54,000** |

---

## 12. Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Tenants onboarded | 1 | 50 (6 months) |
| Module adoption rate | N/A | 70% enable optional modules |
| Upgrade conversion | N/A | 30% free → paid |
| API response time | 200ms | <300ms (with tenant checks) |
| Data isolation | N/A | 100% (zero cross-tenant leaks) |

---

## Conclusion

The HMS application has a solid foundation for transformation:
- ✅ Existing `hospital_id` provides natural tenant boundary
- ✅ RBAC system can extend to module permissions
- ✅ Modular code structure in both backend and frontend

The transformation requires:
1. **New SaaS core schema** for tenant/subscription management
2. **Tenant context middleware** for request isolation
3. **Module registry system** for plug-and-play features
4. **Subscription service** for billing and limits
5. **Frontend dynamic loading** for module-based UI

**Recommended priority**: Start with Phase 1 (database foundation) as it provides the structural foundation for all subsequent work.
