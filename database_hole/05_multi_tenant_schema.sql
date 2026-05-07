-- ============================================================================
-- HMS Multi-Tenant SaaS Schema Extension
-- Creates tables for tenant management, subscriptions, and module registry
-- ============================================================================

-- Create schema for SaaS core tables
CREATE SCHEMA IF NOT EXISTS saas_core;

-- ============================================================================
-- 1. TENANTS (Hospitals in SaaS context)
-- ============================================================================
CREATE TABLE saas_core.tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Organization details
    name                VARCHAR(255) NOT NULL,
    slug                VARCHAR(50) NOT NULL UNIQUE,
    code                VARCHAR(20) NOT NULL UNIQUE,
    
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
    
    -- Registration info
    registration_number VARCHAR(100),
    tax_id              VARCHAR(50),
    
    -- Status
    status              VARCHAR(20) DEFAULT 'pending',
    is_verified         BOOLEAN DEFAULT false,
    verified_at         TIMESTAMPTZ,
    
    -- Onboarding
    onboarding_completed BOOLEAN DEFAULT false,
    onboarding_step     VARCHAR(50) DEFAULT 'profile',
    
    -- Admin user (first admin created for this tenant)
    admin_user_id       UUID,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON saas_core.tenants(slug);
CREATE INDEX idx_tenants_status ON saas_core.tenants(status);

-- ============================================================================
-- 2. SUBSCRIPTION PLANS
-- ============================================================================
CREATE TABLE saas_core.subscription_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(50) NOT NULL UNIQUE,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    
    -- Billing
    billing_cycle       VARCHAR(20) NOT NULL DEFAULT 'monthly',
    base_price          DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency            VARCHAR(3) DEFAULT 'USD',
    
    -- Limits
    max_users           INTEGER,
    max_patients        INTEGER,
    max_storage_gb      INTEGER,
    max_appointments_monthly INTEGER,
    
    -- Feature flags as JSONB
    features_enabled    JSONB DEFAULT '{}',
    
    -- Module access
    modules_included    UUID[] DEFAULT '{}',
    
    -- Availability
    is_public           BOOLEAN DEFAULT true,
    is_active           BOOLEAN DEFAULT true,
    sort_order          INTEGER DEFAULT 0,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. TENANT SUBSCRIPTIONS
-- ============================================================================
CREATE TABLE saas_core.tenant_subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES saas_core.tenants(id),
    plan_id             UUID NOT NULL REFERENCES saas_core.subscription_plans(id),
    
    -- Subscription period
    status              VARCHAR(20) DEFAULT 'trialing',
    trial_ends_at       TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end  TIMESTAMPTZ NOT NULL,
    
    -- Cancellation
    cancel_at_period_end BOOLEAN DEFAULT false,
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason VARCHAR(255),
    
    -- Payment
    payment_method      VARCHAR(20),
    billing_email       VARCHAR(255),
    
    -- Custom overrides
    custom_features     JSONB DEFAULT '{}',
    custom_limits       JSONB DEFAULT '{}',
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index: only one active subscription per tenant
CREATE UNIQUE INDEX idx_subscriptions_active_unique 
ON saas_core.tenant_subscriptions(tenant_id) 
WHERE status IN ('trialing', 'active', 'past_due');

CREATE INDEX idx_subscriptions_tenant ON saas_core.tenant_subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON saas_core.tenant_subscriptions(status);
CREATE INDEX idx_subscriptions_period_end ON saas_core.tenant_subscriptions(current_period_end);

-- ============================================================================
-- 4. MODULE REGISTRY
-- ============================================================================
CREATE TABLE saas_core.modules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(50) NOT NULL UNIQUE,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    category            VARCHAR(50) NOT NULL,
    
    -- Technical
    frontend_route_prefix VARCHAR(50),
    api_prefix          VARCHAR(50),
    icon                VARCHAR(50),
    
    -- Dependencies (array of module codes)
    required_modules    VARCHAR(50)[] DEFAULT '{}',
    
    -- Default permissions
    default_permissions JSONB DEFAULT '{}',
    
    -- Status
    is_core             BOOLEAN DEFAULT false,
    is_active           BOOLEAN DEFAULT true,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_modules_category ON saas_core.modules(category);
CREATE INDEX idx_modules_core ON saas_core.modules(is_core);

-- ============================================================================
-- 5. TENANT MODULE CONFIGURATION
-- ============================================================================
CREATE TABLE saas_core.tenant_modules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES saas_core.tenants(id),
    module_id           UUID NOT NULL REFERENCES saas_core.modules(id),
    
    -- Configuration
    is_enabled          BOOLEAN DEFAULT true,
    enabled_at          TIMESTAMPTZ,
    enabled_by          UUID,
    
    -- Feature flags within module
    feature_config      JSONB DEFAULT '{}',
    
    -- Custom limits for this tenant
    custom_limits       JSONB DEFAULT '{}',
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, module_id)
);

CREATE INDEX idx_tenant_modules_tenant ON saas_core.tenant_modules(tenant_id);
CREATE INDEX idx_tenant_modules_enabled ON saas_core.tenant_modules(tenant_id, is_enabled);

-- ============================================================================
-- 6. USAGE TRACKING
-- ============================================================================
CREATE TABLE saas_core.usage_tracking (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES saas_core.tenants(id),
    resource_type       VARCHAR(50) NOT NULL,
    period_year         INTEGER NOT NULL,
    period_month        INTEGER NOT NULL,
    
    usage_count         INTEGER DEFAULT 0,
    limit_reached_at    TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, resource_type, period_year, period_month)
);

CREATE INDEX idx_usage_tenant ON saas_core.usage_tracking(tenant_id);
CREATE INDEX idx_usage_period ON saas_core.usage_tracking(period_year, period_month);

-- ============================================================================
-- 7. BILLING INVOICES
-- ============================================================================
CREATE TABLE saas_core.billing_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES saas_core.tenants(id),
    subscription_id     UUID REFERENCES saas_core.tenant_subscriptions(id),
    
    invoice_number      VARCHAR(30) NOT NULL UNIQUE,
    status              VARCHAR(20) DEFAULT 'draft',
    
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
    
    -- Line items
    line_items          JSONB NOT NULL,
    
    -- Payment
    payment_method      VARCHAR(20),
    payment_reference   VARCHAR(100),
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_tenant ON saas_core.billing_invoices(tenant_id);
CREATE INDEX idx_invoices_status ON saas_core.billing_invoices(status);

-- ============================================================================
-- 8. AUDIT LOGS (Cross-tenant for Super Admin visibility)
-- ============================================================================
CREATE TABLE saas_core.audit_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID REFERENCES saas_core.tenants(id),
    user_id             UUID,
    user_type           VARCHAR(20) NOT NULL DEFAULT 'hospital',
    
    action              VARCHAR(50) NOT NULL,
    entity_type         VARCHAR(50) NOT NULL,
    entity_id           UUID,
    entity_name         VARCHAR(200),
    
    old_values          JSONB,
    new_values          JSONB,
    
    ip_address          VARCHAR(45),
    user_agent          VARCHAR(500),
    request_path        VARCHAR(255),
    
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON saas_core.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_user ON saas_core.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON saas_core.audit_logs(entity_type, entity_id);

-- ============================================================================
-- 10. SYSTEM SETTINGS (Global configuration)
-- ============================================================================
CREATE TABLE saas_core.system_settings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key         VARCHAR(100) NOT NULL UNIQUE,
    setting_value       TEXT,
    setting_type        VARCHAR(20) NOT NULL DEFAULT 'string',
    description         TEXT,
    is_editable         BOOLEAN DEFAULT true,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Note: Super Admin is managed through existing users table with role='super_admin'

-- Seed Subscription Plans
INSERT INTO saas_core.subscription_plans (code, name, description, billing_cycle, base_price, max_users, max_patients, features_enabled) VALUES
('free', 'Free', 'Basic features for single-doctor clinics', 'monthly', 0, 5, 500, 
 '{"appointments": true, "patients": true, "prescriptions": true, "billing_basic": true}'),

('starter', 'Starter', 'Essential features for growing practices', 'monthly', 49, 15, 2000,
 '{"appointments": true, "patients": true, "prescriptions": true, "pharmacy": true, "billing_full": true}'),

('professional', 'Professional', 'Full feature set for multi-specialty clinics', 'monthly', 149, 50, 10000,
 '{"appointments": true, "patients": true, "prescriptions": true, "pharmacy": true, "inventory": true, "billing_full": true, "insurance": true, "analytics": true}'),

('enterprise', 'Enterprise', 'Unlimited everything for hospital chains', 'monthly', 499, NULL, NULL,
 '{"all_modules": true, "custom_api": true, "dedicated_support": true, "multi_branch": true}');

-- Seed Modules
INSERT INTO saas_core.modules (code, name, description, category, frontend_route_prefix, api_prefix, icon, is_core, required_modules) VALUES
('auth', 'Authentication', 'Login, logout, password management', 'core', '/auth', '/api/v1/auth', 'shield', true, '{}'),
('hospital_profile', 'Hospital Profile', 'Hospital branding, settings, departments', 'core', '/hospital', '/api/v1/hospital', 'building', true, '{}'),
('patients', 'Patient Management', 'Patient registration and records', 'core', '/patients', '/api/v1/patients', 'users', true, '{}'),
('doctors', 'Doctor Management', 'Doctor profiles and schedules', 'core', '/doctors', '/api/v1/doctors', 'stethoscope', true, '{}'),
('appointments', 'Appointments', 'Scheduling and queue management', 'core', '/appointments', '/api/v1/appointments', 'calendar', true, '{}'),
('prescriptions', 'Prescriptions', 'Prescription creation and management', 'clinical', '/prescriptions', '/api/v1/prescriptions', 'file-text', false, '{"patients","doctors"}'),
('pharmacy', 'Pharmacy', 'Medicine catalog and dispensing', 'clinical', '/pharmacy', '/api/v1/pharmacy', 'pill', false, '{"prescriptions"}'),
('billing', 'Billing', 'Invoices, payments, refunds', 'financial', '/billing', '/api/v1/billing', 'credit-card', false, '{"patients"}'),
('inventory', 'Inventory', 'Stock management and procurement', 'inventory', '/inventory', '/api/v1/inventory', 'package', false, '{}'),
('optical', 'Optical Store', 'Optical prescriptions and products', 'clinical', '/optical', '/api/v1/optical', 'glasses', false, '{"patients","inventory"}'),
('analytics', 'Analytics', 'Reports and insights', 'analytics', '/analytics', '/api/v1/analytics', 'bar-chart', false, '{}'),
('insurance', 'Insurance', 'Claims and provider management', 'financial', '/insurance', '/api/v1/insurance', 'umbrella', false, '{"billing"}');

-- Seed System Settings
INSERT INTO saas_core.system_settings (setting_key, setting_value, setting_type, description) VALUES
('platform_name', 'HMS Platform', 'string', 'Platform display name'),
('default_timezone', 'UTC', 'string', 'Default timezone for new hospitals'),
('default_currency', 'USD', 'string', 'Default currency for new hospitals'),
('trial_days', '14', 'number', 'Default trial period in days'),
('maintenance_mode', 'false', 'boolean', 'Platform maintenance mode'),
('max_file_upload_mb', '10', 'number', 'Maximum file upload size in MB'),
('session_timeout_minutes', '60', 'number', 'User session timeout');

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON saas_core.tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON saas_core.subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON saas_core.tenant_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_modules_updated_at BEFORE UPDATE ON saas_core.modules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_modules_updated_at BEFORE UPDATE ON saas_core.tenant_modules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_updated_at BEFORE UPDATE ON saas_core.usage_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON saas_core.billing_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS FOR CONVENIENCE
-- ============================================================================

-- View: Active tenants with subscription info
CREATE VIEW saas_core.v_active_tenants AS
SELECT 
    t.*,
    sp.name as plan_name,
    sp.code as plan_code,
    ts.status as subscription_status,
    ts.current_period_end,
    CASE 
        WHEN ts.status = 'trialing' THEN 'Trial'
        WHEN ts.status = 'active' THEN 'Active'
        WHEN ts.status = 'past_due' THEN 'Past Due'
        WHEN ts.status = 'suspended' THEN 'Suspended'
        ELSE 'Unknown'
    END as display_status
FROM saas_core.tenants t
LEFT JOIN saas_core.tenant_subscriptions ts ON t.id = ts.tenant_id 
    AND ts.status IN ('trialing', 'active', 'past_due')
LEFT JOIN saas_core.subscription_plans sp ON ts.plan_id = sp.id
WHERE t.status = 'active';

-- View: Tenant modules with details
CREATE VIEW saas_core.v_tenant_modules AS
SELECT 
    tm.*,
    m.code as module_code,
    m.name as module_name,
    m.description as module_description,
    m.category,
    m.is_core,
    m.icon,
    m.frontend_route_prefix,
    m.api_prefix
FROM saas_core.tenant_modules tm
JOIN saas_core.modules m ON tm.module_id = m.id;

-- ============================================================================
-- DONE
-- ============================================================================
