-- =============================================================================
-- HMS: Complete saas_core schema bootstrap + hospitals.tenant_id fix
-- =============================================================================
-- Run when the server was set up with only 01_schema.sql (no multi-tenant schema).
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT DO NOTHING throughout.
--
-- What this does:
--   1. Creates the saas_core schema and required tables
--   2. Seeds the module registry
--   3. Creates a tenant for every existing hospital
--   4. Creates an active subscription for each tenant (unlimited plan)
--   5. Enables all modules for each tenant
--   6. Adds tenant_id column to hospitals and links them to their tenant
--
-- Usage:
--   psql -U <db_user> -d <db_name> -f 08_fix_hospitals_tenant_id.sql
-- =============================================================================

-- ─── 1. Schema ───────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS saas_core;

-- ─── 2. Core tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saas_core.tenants (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 VARCHAR(255) NOT NULL,
    slug                 VARCHAR(50)  NOT NULL UNIQUE,
    code                 VARCHAR(20)  NOT NULL UNIQUE,
    email                VARCHAR(255) NOT NULL DEFAULT 'admin@hospital.local',
    phone                VARCHAR(20),
    country              VARCHAR(3)   DEFAULT 'IN',
    timezone             VARCHAR(50)  DEFAULT 'Asia/Kolkata',
    default_currency     VARCHAR(3)   DEFAULT 'INR',
    status               VARCHAR(20)  DEFAULT 'active',
    is_verified          BOOLEAN      DEFAULT true,
    verified_at          TIMESTAMPTZ  DEFAULT NOW(),
    onboarding_completed BOOLEAN      DEFAULT true,
    onboarding_step      VARCHAR(50)  DEFAULT 'done',
    admin_user_id        UUID,
    created_at           TIMESTAMPTZ  DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug   ON saas_core.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON saas_core.tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_code   ON saas_core.tenants(code);

CREATE TABLE IF NOT EXISTS saas_core.subscription_plans (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code                     VARCHAR(50)  NOT NULL UNIQUE,
    name                     VARCHAR(100) NOT NULL,
    description              TEXT,
    billing_cycle            VARCHAR(20)  NOT NULL DEFAULT 'monthly',
    base_price               DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency                 VARCHAR(3)   DEFAULT 'INR',
    max_users                INTEGER,
    max_patients             INTEGER,
    max_storage_gb           INTEGER,
    max_appointments_monthly INTEGER,
    features_enabled         JSONB        DEFAULT '{}',
    modules_included         UUID[]       DEFAULT '{}',
    is_public                BOOLEAN      DEFAULT true,
    is_active                BOOLEAN      DEFAULT true,
    sort_order               INTEGER      DEFAULT 0,
    created_at               TIMESTAMPTZ  DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_core.tenant_subscriptions (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID         NOT NULL REFERENCES saas_core.tenants(id),
    plan_id              UUID         NOT NULL REFERENCES saas_core.subscription_plans(id),
    status               VARCHAR(20)  DEFAULT 'active',
    trial_ends_at        TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    current_period_end   TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '10 years'),
    cancel_at_period_end BOOLEAN      DEFAULT false,
    cancelled_at         TIMESTAMPTZ,
    cancellation_reason  VARCHAR(255),
    payment_method       VARCHAR(20),
    billing_email        VARCHAR(255),
    custom_features      JSONB        DEFAULT '{}',
    custom_limits        JSONB        DEFAULT '{}',
    created_at           TIMESTAMPTZ  DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_unique
    ON saas_core.tenant_subscriptions(tenant_id)
    WHERE status IN ('trialing', 'active', 'past_due');

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant     ON saas_core.tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status     ON saas_core.tenant_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON saas_core.tenant_subscriptions(current_period_end);

CREATE TABLE IF NOT EXISTS saas_core.modules (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code                   VARCHAR(50) NOT NULL UNIQUE,
    name                   VARCHAR(100) NOT NULL,
    description            TEXT,
    category               VARCHAR(50) NOT NULL DEFAULT 'clinical',
    frontend_route_prefix  VARCHAR(50),
    api_prefix             VARCHAR(50),
    icon                   VARCHAR(50),
    required_modules       VARCHAR(50)[] DEFAULT '{}',
    default_permissions    JSONB        DEFAULT '{}',
    is_core                BOOLEAN      DEFAULT false,
    is_active              BOOLEAN      DEFAULT true,
    created_at             TIMESTAMPTZ  DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_core.tenant_modules (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES saas_core.tenants(id),
    module_id   UUID        NOT NULL REFERENCES saas_core.modules(id),
    is_enabled  BOOLEAN     DEFAULT true,
    enabled_at  TIMESTAMPTZ DEFAULT NOW(),
    enabled_by  UUID,
    feature_config JSONB   DEFAULT '{}',
    custom_limits  JSONB   DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant  ON saas_core.tenant_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_enabled ON saas_core.tenant_modules(tenant_id, is_enabled);

-- ─── 3. Seed module registry ─────────────────────────────────────────────────

INSERT INTO saas_core.modules (code, name, category, is_core) VALUES
    ('patients',      'Patient Management',    'core',     true),
    ('appointments',  'Appointments',          'clinical', false),
    ('prescriptions', 'Prescriptions',         'clinical', false),
    ('pharmacy',      'Pharmacy',              'pharmacy', false),
    ('inventory',     'Inventory',             'pharmacy', false),
    ('billing',       'Billing & Invoicing',   'finance',  false),
    ('analytics',     'Analytics & Reports',   'admin',    false),
    ('optical',       'Optical Store',         'clinical', false)
ON CONFLICT (code) DO NOTHING;

-- ─── 4. Seed default unlimited plan ──────────────────────────────────────────

INSERT INTO saas_core.subscription_plans
    (code, name, description, billing_cycle, base_price, currency, is_public, is_active)
VALUES
    ('unlimited', 'Unlimited', 'All modules included, no limits', 'monthly', 0, 'INR', false, true)
ON CONFLICT (code) DO NOTHING;

-- ─── 5. Create tenant + subscription + modules for each hospital ─────────────

DO $$
DECLARE
    rec            RECORD;
    v_plan_id      UUID;
    v_tenant_id    UUID;
    v_sub_id       UUID;
    v_module_id    UUID;
    v_module       RECORD;
BEGIN
    SELECT id INTO v_plan_id FROM saas_core.subscription_plans WHERE code = 'unlimited';

    FOR rec IN SELECT id, name, code, email, phone FROM public.hospitals WHERE is_deleted = false LOOP

        -- Derive a safe slug from the hospital code (lowercase, no spaces)
        v_tenant_id := NULL;

        -- Check if tenant already exists for this code
        SELECT id INTO v_tenant_id FROM saas_core.tenants WHERE code = rec.code;

        IF v_tenant_id IS NULL THEN
            INSERT INTO saas_core.tenants
                (name, slug, code, email, phone, status, is_verified, verified_at,
                 onboarding_completed, onboarding_step)
            VALUES (
                rec.name,
                lower(regexp_replace(rec.code, '[^a-zA-Z0-9]', '-', 'g')),
                rec.code,
                COALESCE(rec.email, 'admin@hospital.local'),
                rec.phone,
                'active', true, NOW(), true, 'done'
            )
            RETURNING id INTO v_tenant_id;
            RAISE NOTICE 'Created tenant % for hospital %', v_tenant_id, rec.name;
        ELSE
            RAISE NOTICE 'Tenant already exists for hospital % (code: %)', rec.name, rec.code;
        END IF;

        -- Create subscription if not already present
        SELECT id INTO v_sub_id
        FROM saas_core.tenant_subscriptions
        WHERE tenant_id = v_tenant_id
          AND status IN ('active', 'trialing', 'past_due');

        IF v_sub_id IS NULL THEN
            INSERT INTO saas_core.tenant_subscriptions
                (tenant_id, plan_id, status, current_period_start, current_period_end)
            VALUES (v_tenant_id, v_plan_id, 'active', NOW(), NOW() + INTERVAL '10 years')
            RETURNING id INTO v_sub_id;
            RAISE NOTICE 'Created subscription for tenant %', v_tenant_id;
        END IF;

        -- Enable all modules for this tenant
        FOR v_module IN SELECT id, code FROM saas_core.modules WHERE is_active = true LOOP
            INSERT INTO saas_core.tenant_modules
                (tenant_id, module_id, is_enabled, enabled_at)
            VALUES (v_tenant_id, v_module.id, true, NOW())
            ON CONFLICT (tenant_id, module_id) DO NOTHING;
        END LOOP;
        RAISE NOTICE 'Enabled all modules for tenant %', v_tenant_id;

    END LOOP;
END $$;

-- ─── 6. Add tenant_id to hospitals and link ───────────────────────────────────

DO $$
DECLARE
    v_rows_updated INTEGER;
BEGIN
    -- Add column if not present
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'hospitals'
          AND column_name  = 'tenant_id'
    ) THEN
        ALTER TABLE public.hospitals ADD COLUMN tenant_id UUID;
        RAISE NOTICE 'Added tenant_id column to hospitals';
    ELSE
        RAISE NOTICE 'tenant_id column already exists';
    END IF;

    -- Backfill: link each hospital to its matching tenant by code
    UPDATE public.hospitals h
    SET    tenant_id = t.id
    FROM   saas_core.tenants t
    WHERE  t.code = h.code
      AND  h.tenant_id IS NULL;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    RAISE NOTICE 'Linked % hospital row(s) to their tenant', v_rows_updated;

    -- Add FK constraint if not already present
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname    = 'hospitals_tenant_id_fkey'
          AND conrelid   = 'public.hospitals'::regclass
    ) THEN
        ALTER TABLE public.hospitals
        ADD CONSTRAINT hospitals_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id);
        RAISE NOTICE 'Added FK constraint hospitals_tenant_id_fkey';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hospitals_tenant_id
    ON public.hospitals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hospitals_tenant_active
    ON public.hospitals(tenant_id, is_active);

-- ─── Verify ───────────────────────────────────────────────────────────────────

SELECT
    h.id          AS hospital_id,
    h.name        AS hospital_name,
    h.code        AS hospital_code,
    h.tenant_id,
    t.name        AS tenant_name,
    t.status      AS tenant_status,
    (SELECT COUNT(*) FROM saas_core.tenant_modules tm WHERE tm.tenant_id = t.id AND tm.is_enabled = true)
                  AS modules_enabled
FROM  public.hospitals h
LEFT JOIN saas_core.tenants t ON t.id = h.tenant_id;
