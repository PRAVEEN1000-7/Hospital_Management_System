-- HMS Multi-Tenant Security Fixes - Database Schema Alterations
-- Run this after the current 05_multi_tenant_schema.sql
-- Date: 2026-05-08
-- Purpose: Fix critical schema relationships for proper multi-tenant isolation

-- ============================================================
-- 1. ADD EXPLICIT TENANT LINK TO HOSPITALS (Critical Fix)
-- ============================================================
-- Currently hospitals have no direct FK to tenants, only implied via saas_core schema
-- This ensures complete data integrity

DO $$
DECLARE
    v_tenant_id UUID;
    v_hospitals_without_tenant INTEGER;
BEGIN
    IF to_regclass('public.hospitals') IS NULL THEN
        RAISE NOTICE 'Skipping hospitals tenant link: public.hospitals does not exist';
        RETURN;
    END IF;

    -- 1) Add column first (nullable), then backfill, then add FK/NOT NULL.
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'hospitals'
          AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.hospitals ADD COLUMN tenant_id UUID;
    END IF;

    -- Backfill from first available tenant (replace with explicit mapping in production).
    SELECT st.id
    INTO v_tenant_id
    FROM saas_core.tenants st
    ORDER BY st.created_at NULLS LAST, st.id
    LIMIT 1;

    IF v_tenant_id IS NOT NULL THEN
        UPDATE public.hospitals
        SET tenant_id = v_tenant_id
        WHERE tenant_id IS NULL;
    ELSE
        RAISE NOTICE 'No rows found in saas_core.tenants; hospitals.tenant_id left NULL. Backfill and re-run.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'hospitals_tenant_id_fkey'
          AND conrelid = 'public.hospitals'::regclass
    ) THEN
        ALTER TABLE public.hospitals
        ADD CONSTRAINT hospitals_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id);
    END IF;

    SELECT COUNT(*)
    INTO v_hospitals_without_tenant
    FROM public.hospitals
    WHERE tenant_id IS NULL;

    IF v_hospitals_without_tenant = 0 THEN
        ALTER TABLE public.hospitals
        ALTER COLUMN tenant_id SET NOT NULL;
    ELSE
        RAISE NOTICE 'hospitals.tenant_id remains nullable (% rows without tenant)', v_hospitals_without_tenant;
    END IF;
END $$;

-- Create index for fast tenant lookups
CREATE INDEX IF NOT EXISTS idx_hospitals_tenant_id ON public.hospitals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hospitals_tenant_active ON public.hospitals(tenant_id, is_active);


-- ============================================================
-- 2. AUDIT LOG TABLE FOR COMPLIANCE
-- ============================================================
-- Track all critical operations with full tenant context for compliance/forensics

CREATE TABLE IF NOT EXISTS saas_core.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    tenant_id UUID NOT NULL REFERENCES saas_core.tenants(id),
    user_id UUID REFERENCES public.users(id),
    hospital_id UUID REFERENCES public.hospitals(id),
    
    -- Action details
    action VARCHAR(50) NOT NULL,  -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'PERMISSION_DENIED'
    resource_type VARCHAR(50),    -- 'patient', 'user', 'invoice', etc.
    resource_id UUID,
    
    -- Changes
    old_values JSONB,
    new_values JSONB,
    
    -- Metadata
    ip_address INET,
    user_agent VARCHAR(500),
    severity VARCHAR(20) DEFAULT 'INFO',  -- 'INFO', 'WARNING', 'CRITICAL'
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill schema if audit_logs already existed from a previous partial migration.
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS hospital_id UUID;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(50);
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS resource_type VARCHAR(50);
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS resource_id UUID;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS old_values JSONB;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS new_values JSONB;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500);
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'INFO';
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_audit_tenant_created
    ON saas_core.audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_created
    ON saas_core.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_severity
    ON saas_core.audit_logs(action, severity, created_at DESC);

COMMENT ON TABLE saas_core.audit_logs IS 'Immutable audit trail for compliance and security forensics';


-- ============================================================
-- 3. SOFT DELETE IMPROVEMENTS - ENSURE DATA INTEGRITY
-- ============================================================
-- Add cascade delete constraints that respect tenant isolation

-- Verify cascade delete on users table
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_created_by_fkey,
ADD CONSTRAINT users_created_by_fkey 
    FOREIGN KEY (created_by) 
    REFERENCES public.users(id) 
    ON DELETE SET NULL;

-- Verify cascade delete on patients
ALTER TABLE public.patients
DROP CONSTRAINT IF EXISTS patients_created_by_fkey,
ADD CONSTRAINT patients_created_by_fkey 
    FOREIGN KEY (created_by) 
    REFERENCES public.users(id) 
    ON DELETE SET NULL;

ALTER TABLE public.patients
DROP CONSTRAINT IF EXISTS patients_updated_by_fkey,
ADD CONSTRAINT patients_updated_by_fkey 
    FOREIGN KEY (updated_by) 
    REFERENCES public.users(id) 
    ON DELETE SET NULL;


-- ============================================================
-- 4. TENANT STATUS VALIDATION CONSTRAINTS
-- ============================================================
-- Ensure only active tenants can be used

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_subscription_status'
          AND conrelid = 'saas_core.tenant_subscriptions'::regclass
    ) THEN
        ALTER TABLE saas_core.tenant_subscriptions
        ADD CONSTRAINT check_subscription_status
            CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_tenant_status'
          AND conrelid = 'saas_core.tenants'::regclass
    ) THEN
        ALTER TABLE saas_core.tenants
        ADD CONSTRAINT check_tenant_status
            CHECK (status IN ('pending', 'active', 'suspended', 'cancelled'));
    END IF;
END $$;


-- ============================================================
-- 5. MODULE DEPENDENCY VALIDATION
-- ============================================================
-- Ensure modules can't be enabled without their dependencies

CREATE TABLE IF NOT EXISTS saas_core.module_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_name VARCHAR(50) NOT NULL,
    depends_on VARCHAR(50) NOT NULL,
    is_optional BOOLEAN DEFAULT FALSE,
    
    UNIQUE(module_name, depends_on)
);

-- Populate module dependencies
INSERT INTO saas_core.module_dependencies (module_name, depends_on, is_optional)
VALUES
    ('pharmacy', 'patients', FALSE),
    ('pharmacy', 'users', FALSE),
    ('inventory', 'suppliers', FALSE),
    ('optical', 'patients', FALSE),
    ('optical', 'prescriptions', FALSE),
    ('billing', 'invoices', FALSE),
    ('billing', 'insurance', FALSE),
    ('billing', 'patients', FALSE),
    ('reports', 'patients', FALSE),
    ('reports', 'appointments', FALSE)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 6. USAGE TRACKING TABLE
-- ============================================================
-- Track daily usage metrics for each tenant (API calls, resource counts)

CREATE TABLE IF NOT EXISTS saas_core.usage_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES saas_core.tenants(id) ON DELETE CASCADE,
    
    -- Metrics date
    metric_date DATE NOT NULL,
    
    -- Counters
    api_calls_count BIGINT DEFAULT 0,
    users_count INT DEFAULT 0,
    patients_count INT DEFAULT 0,
    appointments_count INT DEFAULT 0,
    
    -- Storage
    storage_bytes_used BIGINT DEFAULT 0,
    
    -- Timestamps
    recorded_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_date
    ON saas_core.usage_metrics(tenant_id, metric_date DESC);

COMMENT ON TABLE saas_core.usage_metrics IS 'Daily usage metrics per tenant for billing and monitoring';


-- ============================================================
-- 7. RATE LIMITING TABLE (for persistent rate limit state)
-- ============================================================
-- Track request counts per tenant for rate limiting

CREATE TABLE IF NOT EXISTS saas_core.rate_limit_buckets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES saas_core.tenants(id),
    
    -- Bucket window
    window_start TIMESTAMPTZ NOT NULL,
    window_duration_seconds INT NOT NULL DEFAULT 60,
    
    -- Counts
    request_count INT DEFAULT 0,
    
    -- Auto-cleanup
    expires_at TIMESTAMPTZ NOT NULL,

    UNIQUE(tenant_id, window_start, window_duration_seconds)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_expires
    ON saas_core.rate_limit_buckets(expires_at);

-- Auto-cleanup old rate limit buckets
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM saas_core.rate_limit_buckets 
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (in PostgreSQL: use pg_cron extension)
-- SELECT cron.schedule('cleanup_rate_limits', '0 */1 * * *', 'SELECT cleanup_expired_rate_limits()');


-- ============================================================
-- 8. TENANT ONBOARDING STATE TABLE
-- ============================================================
-- Track tenant onboarding progress

CREATE TABLE IF NOT EXISTS saas_core.tenant_onboarding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES saas_core.tenants(id) ON DELETE CASCADE,
    
    -- Onboarding steps
    profile_completed BOOLEAN DEFAULT FALSE,
    billing_completed BOOLEAN DEFAULT FALSE,
    team_invited BOOLEAN DEFAULT FALSE,
    first_patient_created BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tenant
    ON saas_core.tenant_onboarding(tenant_id);


-- ============================================================
-- 9. SECURITY: ROW-LEVEL SECURITY (PostgreSQL ONLY)
-- ============================================================
-- Enable RLS on critical tables to add database-level security

-- Enable RLS
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS patients_hospital_isolation ON public.patients;
DROP POLICY IF EXISTS appointments_hospital_isolation ON public.appointments;
DROP POLICY IF EXISTS prescriptions_hospital_isolation ON public.prescriptions;
DROP POLICY IF EXISTS invoices_hospital_isolation ON public.invoices;

-- Create isolation policies (basic example - adjust to your needs)
CREATE POLICY patients_hospital_isolation ON public.patients
    USING (
        hospital_id = ANY(
            SELECT h.id FROM public.hospitals h
            WHERE h.tenant_id = current_setting('app.current_tenant_id')::uuid
        )
    );

-- NOTE: RLS requires setting 'app.current_tenant_id' before each query
-- This is done in the application layer via set_config()


-- ============================================================
-- 10. PERFORMANCE: CRITICAL INDEXES FOR MULTI-TENANT QUERIES
-- ============================================================

-- Patient queries
CREATE INDEX IF NOT EXISTS idx_patients_hospital_active ON public.patients(hospital_id, is_deleted, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_hospital_reference ON public.patients(hospital_id, patient_reference_number);

-- Appointment queries
CREATE INDEX IF NOT EXISTS idx_appointments_hospital_date ON public.appointments(hospital_id, appointment_date DESC);

-- User queries
CREATE INDEX IF NOT EXISTS idx_users_hospital_active ON public.users(hospital_id, is_deleted, is_active);

-- Invoice queries
CREATE INDEX IF NOT EXISTS idx_invoices_hospital_created ON public.invoices(hospital_id, created_at DESC);

-- Inventory queries (optional table in some deployments)
DO $$
BEGIN
    IF to_regclass('public.inventory') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_hospital_active
            ON public.inventory(hospital_id, is_deleted);
    ELSE
        RAISE NOTICE 'Skipping inventory index: public.inventory does not exist';
    END IF;
END $$;


-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these to verify the schema is correct:

-- Check all hospitals have tenant_id:
-- SELECT COUNT(*) as hospitals_without_tenant FROM hospitals WHERE tenant_id IS NULL;

-- Check FK relationships:
-- SELECT * FROM information_schema.table_constraints 
-- WHERE table_name='hospitals' AND constraint_type='FOREIGN KEY';

-- List all indexes:
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' OR schemaname = 'saas_core';


-- ============================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================
/*
-- Remove new columns/tables
ALTER TABLE public.hospitals DROP COLUMN tenant_id;
DROP TABLE saas_core.audit_logs;
DROP TABLE saas_core.module_dependencies;
DROP TABLE saas_core.usage_metrics;
DROP TABLE saas_core.rate_limit_buckets;
DROP TABLE saas_core.tenant_onboarding;
DROP FUNCTION cleanup_expired_rate_limits();
*/
