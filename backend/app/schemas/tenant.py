"""
Pydantic schemas for tenant and SaaS models.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
import uuid


# ============================================================================
# Tenant Schemas
# ============================================================================

class TenantBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    address_line_1: Optional[str] = Field(None, max_length=255)
    address_line_2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state_province: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    country: str = Field(default="IND", max_length=3)
    timezone: str = Field(default="Asia/Kolkata", max_length=50)
    default_currency: str = Field(default="INR", max_length=3)
    
    model_config = ConfigDict(from_attributes=True)


class TenantCreate(TenantBase):
    """Schema for creating a new tenant"""
    admin_email: str
    admin_username: Optional[str] = Field(default=None, max_length=50)
    admin_first_name: str
    admin_last_name: str
    admin_password: str = Field(..., min_length=8)
    

class TenantUpdate(BaseModel):
    """Schema for updating tenant"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = Field(None, min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    address_line_1: Optional[str] = Field(None, max_length=255)
    address_line_2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state_province: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    country: Optional[str] = Field(None, max_length=3)
    timezone: Optional[str] = Field(None, max_length=50)
    default_currency: Optional[str] = Field(None, max_length=3)
    logo_url: Optional[str] = Field(None, max_length=500)
    primary_color: Optional[str] = Field(None, max_length=7)
    secondary_color: Optional[str] = Field(None, max_length=7)
    status: Optional[str] = Field(None, max_length=20)
    
    model_config = ConfigDict(from_attributes=True)


class TenantResponse(TenantBase):
    """Schema for tenant response"""
    id: uuid.UUID
    slug: str
    code: str
    registration_number: Optional[str] = None
    logo_url: Optional[str]
    primary_color: str
    secondary_color: str
    status: str
    is_verified: bool
    verified_at: Optional[datetime]
    onboarding_completed: bool
    onboarding_step: str
    admin_user_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    # Computed fields
    admin_username: Optional[str] = None
    admin_email: Optional[str] = None
    admin_name: Optional[str] = None
    display_status: Optional[str] = None
    subscription_status: Optional[str] = None
    plan_name: Optional[str] = None
    plan_code: Optional[str] = None
    current_period_end: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


class TenantListResponse(BaseModel):
    """Schema for tenant list response"""
    total: int
    page: int
    limit: int
    total_pages: int
    data: List[TenantResponse]

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Usage Tracking Schemas (moved here to fix forward reference)
# ============================================================================

class UsageTrackingBase(BaseModel):
    tenant_id: uuid.UUID
    resource_type: str = Field(..., max_length=50)
    period_year: int
    period_month: int
    usage_count: int = 0
    
    model_config = ConfigDict(from_attributes=True)


class UsageTrackingResponse(UsageTrackingBase):
    id: uuid.UUID
    limit_reached_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class UsageQuotaResponse(BaseModel):
    """Response for current usage vs limits"""
    resource_type: str
    current_usage: int
    max_limit: Optional[int]
    percentage_used: float
    period: str  # "YYYY-MM"
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Tenant Module Schemas (moved here to fix forward reference)
# ============================================================================

class TenantModuleBase(BaseModel):
    tenant_id: uuid.UUID
    module_id: uuid.UUID
    is_enabled: bool = True
    feature_config: Dict[str, Any] = Field(default_factory=dict)
    custom_limits: Dict[str, Any] = Field(default_factory=dict)
    
    model_config = ConfigDict(from_attributes=True)


class TenantModuleCreate(TenantModuleBase):
    pass


class TenantModuleUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    feature_config: Optional[Dict[str, Any]] = None
    custom_limits: Optional[Dict[str, Any]] = None
    
    model_config = ConfigDict(from_attributes=True)


class TenantModuleResponse(TenantModuleBase):
    id: uuid.UUID
    enabled_at: Optional[datetime]
    enabled_by: Optional[uuid.UUID] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Module info
    module_code: Optional[str] = None
    module_name: Optional[str] = None
    module_description: Optional[str] = None
    category: Optional[str] = None
    is_core: Optional[bool] = None
    icon: Optional[str] = None
    frontend_route_prefix: Optional[str] = None
    api_prefix: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class TenantDetailResponse(TenantResponse):
    """Extended tenant response with modules and usage"""
    modules: List[TenantModuleResponse] = []
    usage: List[UsageTrackingResponse] = []
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Subscription Plan Schemas
# ============================================================================

class SubscriptionPlanBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    billing_cycle: str = Field(default="monthly", max_length=20)
    base_price: Decimal = Field(default=Decimal("0.00"))
    currency: str = Field(default="INR", max_length=3)
    max_users: Optional[int] = None
    max_patients: Optional[int] = None
    max_storage_gb: Optional[int] = None
    max_appointments_monthly: Optional[int] = None
    features_enabled: Dict[str, Any] = Field(default_factory=dict)
    is_public: bool = True
    is_active: bool = True
    sort_order: int = 0
    
    model_config = ConfigDict(from_attributes=True)


class SubscriptionPlanCreate(SubscriptionPlanBase):
    modules_included: List[uuid.UUID] = Field(default_factory=list)


class SubscriptionPlanUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    base_price: Optional[Decimal] = None
    max_users: Optional[int] = None
    max_patients: Optional[int] = None
    max_storage_gb: Optional[int] = None
    max_appointments_monthly: Optional[int] = None
    features_enabled: Optional[Dict[str, Any]] = None
    modules_included: Optional[List[uuid.UUID]] = None
    is_public: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    
    model_config = ConfigDict(from_attributes=True)


class SubscriptionPlanResponse(SubscriptionPlanBase):
    id: uuid.UUID
    modules_included: List[uuid.UUID]
    created_at: datetime
    updated_at: datetime
    # Number of hospitals currently enrolled on this plan (active/trialing/past_due).
    subscriber_count: int = 0

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Tenant Subscription Schemas
# ============================================================================

class TenantSubscriptionBase(BaseModel):
    tenant_id: uuid.UUID
    plan_id: uuid.UUID
    status: str = Field(default="trialing", max_length=20)
    trial_ends_at: Optional[datetime] = None
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = False
    billing_email: Optional[str] = Field(None, max_length=255)
    custom_features: Dict[str, Any] = Field(default_factory=dict)
    custom_limits: Dict[str, Any] = Field(default_factory=dict)
    
    model_config = ConfigDict(from_attributes=True)


class TenantSubscriptionCreate(TenantSubscriptionBase):
    pass


class TenantSubscriptionUpdate(BaseModel):
    plan_id: Optional[uuid.UUID] = None
    status: Optional[str] = Field(None, max_length=20)
    trial_ends_at: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: Optional[bool] = None
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = Field(None, max_length=255)
    custom_features: Optional[Dict[str, Any]] = None
    custom_limits: Optional[Dict[str, Any]] = None
    
    model_config = ConfigDict(from_attributes=True)


class TenantSubscriptionResponse(TenantSubscriptionBase):
    id: uuid.UUID
    cancelled_at: Optional[datetime]
    cancellation_reason: Optional[str]
    payment_method: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    # Plan info
    plan_name: Optional[str] = None
    plan_code: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Module Schemas
# ============================================================================

class ModuleBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    category: str = Field(..., max_length=50)
    frontend_route_prefix: Optional[str] = Field(None, max_length=50)
    api_prefix: Optional[str] = Field(None, max_length=50)
    icon: Optional[str] = Field(None, max_length=50)
    required_modules: List[str] = Field(default_factory=list)
    default_permissions: Dict[str, Any] = Field(default_factory=dict)
    is_core: bool = False
    is_active: bool = True
    
    model_config = ConfigDict(from_attributes=True)


class ModuleCreate(ModuleBase):
    pass


class ModuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=50)
    icon: Optional[str] = Field(None, max_length=50)
    required_modules: Optional[List[str]] = None
    default_permissions: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    
    model_config = ConfigDict(from_attributes=True)


class ModuleResponse(ModuleBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)




class ModuleConfigurationRequest(BaseModel):
    """Request to configure modules for a tenant"""
    modules: Dict[str, bool] = Field(..., description="Module code -> enabled status")
    
    model_config = ConfigDict(from_attributes=True)




# ============================================================================
# Super Admin Schemas (uses existing User model with super_admin role)
# ============================================================================

class SuperAdminBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=1, max_length=255)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    is_active: bool = True
    
    model_config = ConfigDict(from_attributes=True)
    
    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class SuperAdminCreate(SuperAdminBase):
    password: str = Field(..., min_length=8)


class SuperAdminUpdate(BaseModel):
    email: Optional[str] = Field(None, min_length=1, max_length=255)
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None
    
    model_config = ConfigDict(from_attributes=True)


class SuperAdminResponse(SuperAdminBase):
    id: uuid.UUID
    avatar_url: Optional[str]
    last_login_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class SuperAdminLoginRequest(BaseModel):
    username: str
    password: str
    
    model_config = ConfigDict(from_attributes=True)


class SuperAdminLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: SuperAdminResponse
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# System Settings Schemas
# ============================================================================

class SystemSettingBase(BaseModel):
    setting_key: str = Field(..., max_length=100)
    setting_value: Optional[str] = None
    setting_type: str = Field(default="string", max_length=20)
    description: Optional[str] = None
    is_editable: bool = True
    
    model_config = ConfigDict(from_attributes=True)


class SystemSettingUpdate(BaseModel):
    setting_value: Optional[str] = None
    description: Optional[str] = None
    is_editable: Optional[bool] = None
    
    model_config = ConfigDict(from_attributes=True)


class SystemSettingResponse(SystemSettingBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    
    # Computed
    typed_value: Any = None
    
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Dashboard & Analytics Schemas
# ============================================================================

class DashboardStatsResponse(BaseModel):
    """Super Admin dashboard statistics"""
    total_tenants: int
    active_tenants: int
    trial_tenants: int
    past_due_tenants: int
    suspended_tenants: int
    pending_tenants: int

    total_users: int
    total_patients: int

    mrr: Decimal  # Monthly Recurring Revenue

    plan_distribution: Dict[str, int]

    recent_signups: int
    recent_churn: int

    model_config = ConfigDict(from_attributes=True)


class TenantOnboardingRequest(BaseModel):
    """Simplified schema for hospital onboarding"""
    # Hospital identity
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    registration_number: Optional[str] = Field(None, max_length=100)
    # Location
    address_line_1: Optional[str] = Field(None, max_length=255)
    address_line_2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state_province: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    country: str = Field(default="USA", max_length=3)
    timezone: str = Field(default="UTC", max_length=50)
    # Admin account
    admin_email: str
    admin_username: Optional[str] = Field(default=None, min_length=3, max_length=50)
    admin_first_name: str
    admin_last_name: str
    admin_password: str = Field(..., min_length=8)
    # Subscription
    plan_id: Optional[uuid.UUID] = None
    trial_days: int = Field(default=14, ge=0)

    model_config = ConfigDict(from_attributes=True)


class ImpersonateRequest(BaseModel):
    """Request to impersonate a tenant admin"""
    tenant_id: uuid.UUID
    reason: str = Field(..., min_length=10)
    
    model_config = ConfigDict(from_attributes=True)


class AssignPlanRequest(BaseModel):
    """Schema for assigning a plan to a hospital"""
    hospital_code: str = Field(..., description="The unique 2-character hospital code")
    plan_id: uuid.UUID
    modules: Optional[Dict[str, bool]] = Field(None, description="Optional explicit module toggles")
    
    model_config = ConfigDict(from_attributes=True)
