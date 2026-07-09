"""
Tenant and SaaS models for multi-tenant architecture.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer, Text, ForeignKey,
    ARRAY, Numeric, JSON, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class Tenant(Base):
    """Hospital/Tenant entity in SaaS platform"""
    __tablename__ = "tenants"
    __table_args__ = {"schema": "saas_core"}
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Organization details
    name = Column(String(255), nullable=False)
    slug = Column(String(50), unique=True, nullable=False, index=True)
    code = Column(String(20), unique=True, nullable=False)
    
    # Branding
    logo_url = Column(String(500))
    primary_color = Column(String(7), default="#1E40AF")
    secondary_color = Column(String(7), default="#3B82F6")
    
    # Contact
    email = Column(String(255), nullable=False)
    phone = Column(String(20))
    address_line_1 = Column(String(255))
    address_line_2 = Column(String(255))
    city = Column(String(100))
    state_province = Column(String(100))
    postal_code = Column(String(20))
    country = Column(String(3), default="USA")
    timezone = Column(String(50), default="UTC")
    default_currency = Column(String(3), default="USD")
    
    # Registration info
    registration_number = Column(String(100))
    tax_id = Column(String(50))
    specialty = Column(String(50), default="general")
    
    # Status
    status = Column(String(20), default="pending")
    is_verified = Column(Boolean, default=False)
    verified_at = Column(DateTime(timezone=True))
    
    # Onboarding
    onboarding_completed = Column(Boolean, default=False)
    onboarding_step = Column(String(50), default="profile")
    
    # Admin user reference
    admin_user_id = Column(UUID(as_uuid=True))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    subscriptions = relationship("TenantSubscription", back_populates="tenant", lazy="dynamic")
    modules = relationship("TenantModule", back_populates="tenant", lazy="dynamic")
    usage_records = relationship("UsageTracking", back_populates="tenant", lazy="dynamic")
    
    @property
    def active_subscription(self) -> Optional["TenantSubscription"]:
        """Get the currently active subscription"""
        # `self.subscriptions` is a dynamic relationship (AppenderQuery) at the
        # instance level, so reference the mapped class directly (resolved from the
        # module namespace at call time) instead of `.property.mapper.class_`,
        # which only exists on the class-level relationship descriptor.
        return self.subscriptions.filter(
            TenantSubscription.status.in_(["trialing", "active", "past_due"])
        ).first()
    
    @property
    def display_status(self) -> str:
        """Human-readable status"""
        status_map = {
            "pending": "Pending",
            "active": "Active",
            "suspended": "Suspended",
            "cancelled": "Cancelled"
        }
        return status_map.get(self.status, "Unknown")


class SubscriptionPlan(Base):
    """Subscription tier definition"""
    __tablename__ = "subscription_plans"
    __table_args__ = {"schema": "saas_core"}
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    
    # Billing
    billing_cycle = Column(String(20), nullable=False, default="monthly")
    base_price = Column(Numeric(12, 2), nullable=False, default=0)
    currency = Column(String(3), default="USD")
    
    # Limits
    max_users = Column(Integer)
    max_patients = Column(Integer)
    max_storage_gb = Column(Integer)
    max_appointments_monthly = Column(Integer)
    
    # Feature flags
    features_enabled = Column(JSONB, default=dict)
    modules_included = Column(ARRAY(UUID(as_uuid=True)), default=list)
    
    # Availability
    is_public = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    subscriptions = relationship("TenantSubscription", back_populates="plan", lazy="dynamic")
    
    def get_feature(self, feature_name: str, default: bool = False) -> bool:
        """Check if a feature is enabled in this plan"""
        if not self.features_enabled:
            return default
        return self.features_enabled.get(feature_name, default)
    
    def get_limit(self, resource_type: str) -> Optional[int]:
        """Get limit for a resource type"""
        limit_map = {
            "users": self.max_users,
            "patients": self.max_patients,
            "storage": self.max_storage_gb,
            "appointments": self.max_appointments_monthly
        }
        return limit_map.get(resource_type)


class TenantSubscription(Base):
    """Active subscription for a tenant"""
    __tablename__ = "tenant_subscriptions"
    __table_args__ = {"schema": "saas_core"}
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("saas_core.tenants.id"), nullable=False)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("saas_core.subscription_plans.id"), nullable=False)
    
    # Subscription period
    status = Column(String(20), default="trialing")
    trial_ends_at = Column(DateTime(timezone=True))
    current_period_start = Column(DateTime(timezone=True), nullable=False)
    current_period_end = Column(DateTime(timezone=True), nullable=False)
    
    # Cancellation
    cancel_at_period_end = Column(Boolean, default=False)
    cancelled_at = Column(DateTime(timezone=True))
    cancellation_reason = Column(String(255))
    
    # Payment
    payment_method = Column(String(20))
    billing_email = Column(String(255))
    
    # Custom overrides
    custom_features = Column(JSONB, default=dict)
    custom_limits = Column(JSONB, default=dict)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    tenant = relationship("Tenant", back_populates="subscriptions")
    plan = relationship("SubscriptionPlan", back_populates="subscriptions")
    invoices = relationship("BillingInvoice", back_populates="subscription", lazy="dynamic")
    
    def is_active(self) -> bool:
        """Check if subscription is currently active"""
        return self.status in ["trialing", "active", "past_due"]
    
    def is_trial_active(self) -> bool:
        """Check if trial period is still valid"""
        if self.status != "trialing" or not self.trial_ends_at:
            return False
        # trial_ends_at is a timestamptz column — psycopg2 returns it tz-aware,
        # so comparing against naive datetime.now() raises TypeError the moment
        # a tenant is actually in "trialing" status. Must compare aware-to-aware.
        return datetime.now(timezone.utc) < self.trial_ends_at
    
    @property
    def effective_features(self) -> Dict[str, Any]:
        """Get all features considering plan defaults and custom overrides"""
        features = {}
        if self.plan and self.plan.features_enabled:
            features.update(self.plan.features_enabled)
        if self.custom_features:
            features.update(self.custom_features)
        return features

    @property
    def effective_limits(self) -> Dict[str, Any]:
        """Get all limits considering plan defaults and custom overrides"""
        limits = {
            "max_users": self.plan.max_users if self.plan else None,
            "max_patients": self.plan.max_patients if self.plan else None,
            "max_storage_gb": self.plan.max_storage_gb if self.plan else None,
            "max_appointments_monthly": self.plan.max_appointments_monthly if self.plan else None
        }
        if self.custom_limits:
            limits.update(self.custom_limits)
        return limits

    def get_effective_feature(self, feature_name: str, default: bool = False) -> bool:
        """Get feature value considering custom overrides"""
        # Check custom features first
        if self.custom_features and feature_name in self.custom_features:
            return self.custom_features[feature_name]
        # Fall back to plan features
        if self.plan:
            return self.plan.get_feature(feature_name, default)
        return default
    
    def get_effective_limit(self, resource_type: str) -> Optional[int]:
        """Get limit considering custom overrides"""
        # Check custom limits first
        if self.custom_limits and resource_type in self.custom_limits:
            return self.custom_limits[resource_type]
        # Fall back to plan limits
        if self.plan:
            return self.plan.get_limit(resource_type)
        return None


class Module(Base):
    """Available system modules/features"""
    __tablename__ = "modules"
    __table_args__ = {"schema": "saas_core"}
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    category = Column(String(50), nullable=False)
    
    # Technical
    frontend_route_prefix = Column(String(50))
    api_prefix = Column(String(50))
    icon = Column(String(50))
    
    # Dependencies
    required_modules = Column(ARRAY(String), default=list)
    
    # Default permissions
    default_permissions = Column(JSONB, default=dict)
    
    # Status
    is_core = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    tenant_modules = relationship("TenantModule", back_populates="module", lazy="dynamic")
    
    def get_required_module_codes(self) -> List[str]:
        """Get list of required module codes"""
        return self.required_modules or []


class TenantModule(Base):
    """Module enabled/disabled status per tenant"""
    __tablename__ = "tenant_modules"
    __table_args__ = (
        UniqueConstraint("tenant_id", "module_id"),
        {"schema": "saas_core"}
    )
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("saas_core.tenants.id"), nullable=False)
    module_id = Column(UUID(as_uuid=True), ForeignKey("saas_core.modules.id"), nullable=False)
    
    # Configuration
    is_enabled = Column(Boolean, default=True)
    enabled_at = Column(DateTime(timezone=True))
    enabled_by = Column(UUID(as_uuid=True))
    
    # Feature flags within module
    feature_config = Column(JSONB, default=dict)
    
    # Custom limits
    custom_limits = Column(JSONB, default=dict)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    tenant = relationship("Tenant", back_populates="modules")
    module = relationship("Module", back_populates="tenant_modules")
    
    def is_feature_enabled(self, feature_name: str, default: bool = True) -> bool:
        """Check if a specific feature within this module is enabled"""
        if not self.feature_config:
            return default
        return self.feature_config.get(feature_name, default)


class UsageTracking(Base):
    """Track resource usage per tenant for limit enforcement"""
    __tablename__ = "usage_tracking"
    __table_args__ = (
        UniqueConstraint("tenant_id", "resource_type", "period_year", "period_month"),
        {"schema": "saas_core"}
    )
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("saas_core.tenants.id"), nullable=False)
    resource_type = Column(String(50), nullable=False)
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=False)
    
    usage_count = Column(Integer, default=0)
    limit_reached_at = Column(DateTime(timezone=True))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    tenant = relationship("Tenant", back_populates="usage_records")
    
    def increment(self, amount: int = 1):
        """Increment usage count"""
        self.usage_count += amount
        self.updated_at = datetime.now(timezone.utc)


class BillingInvoice(Base):
    """Subscription billing invoices"""
    __tablename__ = "billing_invoices"
    __table_args__ = {"schema": "saas_core"}
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("saas_core.tenants.id"), nullable=False)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("saas_core.tenant_subscriptions.id"))
    
    invoice_number = Column(String(30), unique=True, nullable=False)
    status = Column(String(20), default="draft")
    
    # Amounts
    subtotal = Column(Numeric(12, 2), nullable=False)
    tax_amount = Column(Numeric(12, 2), default=0)
    total = Column(Numeric(12, 2), nullable=False)
    amount_paid = Column(Numeric(12, 2), default=0)
    amount_due = Column(Numeric(12, 2), nullable=False)
    
    # Dates
    invoice_date = Column(DateTime(timezone=True), nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=False)
    paid_at = Column(DateTime(timezone=True))
    
    # Line items as JSON
    line_items = Column(JSONB, nullable=False, default=list)
    
    # Payment
    payment_method = Column(String(20))
    payment_reference = Column(String(100))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    subscription = relationship("TenantSubscription", back_populates="invoices")


class AuditLog(Base):
    """Cross-tenant audit logs for super admin visibility"""
    __tablename__ = "audit_logs"
    __table_args__ = {"schema": "saas_core"}
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("saas_core.tenants.id"))
    user_id = Column(UUID(as_uuid=True))
    user_type = Column(String(20), default="hospital")
    
    action = Column(String(50), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(UUID(as_uuid=True))
    entity_name = Column(String(200))
    
    old_values = Column(JSONB)
    new_values = Column(JSONB)
    
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    request_path = Column(String(255))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SystemSetting(Base):
    """Global system configuration"""
    __tablename__ = "system_settings"
    __table_args__ = {"schema": "saas_core"}
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    setting_key = Column(String(100), unique=True, nullable=False)
    setting_value = Column(Text)
    setting_type = Column(String(20), default="string")
    description = Column(Text)
    is_editable = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def get_value(self):
        """Get typed value"""
        if self.setting_type == "boolean":
            return self.setting_value.lower() == "true"
        elif self.setting_type == "number":
            return float(self.setting_value) if self.setting_value else 0
        elif self.setting_type == "integer":
            return int(self.setting_value) if self.setting_value else 0
        elif self.setting_type == "json":
            import json
            return json.loads(self.setting_value) if self.setting_value else {}
        return self.setting_value
