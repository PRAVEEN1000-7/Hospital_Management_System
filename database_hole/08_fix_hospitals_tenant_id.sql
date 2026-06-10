-- Safe targeted fix: add tenant_id to hospitals table
-- Extracted from 07_security_schema_fixes.sql (Section 1 only)
-- DO NOT run 07_security_schema_fixes.sql directly — Section 9 enables RLS
-- which requires app-level SET app.current_tenant_id and will break all queries.
--
-- Run this on the server:
--   psql -h <host> -U <user> -d <dbname> -f 08_fix_hospitals_tenant_id.sql

DO $$
DECLARE
    v_tenant_id UUID;
    v_hospitals_without_tenant INTEGER;
BEGIN
    IF to_regclass('public.hospitals') IS NULL THEN
        RAISE NOTICE 'Skipping: public.hospitals does not exist';
        RETURN;
    END IF;

    -- Add column if missing
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'hospitals'
          AND column_name  = 'tenant_id'
    ) THEN
        ALTER TABLE public.hospitals ADD COLUMN tenant_id UUID;
        RAISE NOTICE 'Added tenant_id column to hospitals';
    ELSE
        RAISE NOTICE 'tenant_id column already exists — skipping ADD COLUMN';
    END IF;

    -- Backfill from first tenant (single-tenant deployments have exactly one)
    SELECT id INTO v_tenant_id
    FROM saas_core.tenants
    ORDER BY created_at NULLS LAST, id
    LIMIT 1;

    IF v_tenant_id IS NOT NULL THEN
        UPDATE public.hospitals
        SET tenant_id = v_tenant_id
        WHERE tenant_id IS NULL;
        RAISE NOTICE 'Backfilled tenant_id = % on all hospitals', v_tenant_id;
    ELSE
        RAISE NOTICE 'No tenants found in saas_core.tenants — tenant_id left NULL';
    END IF;

    -- Add FK constraint (idempotent)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'hospitals_tenant_id_fkey'
          AND conrelid = 'public.hospitals'::regclass
    ) THEN
        ALTER TABLE public.hospitals
        ADD CONSTRAINT hospitals_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id);
        RAISE NOTICE 'Added FK constraint hospitals_tenant_id_fkey';
    END IF;

    -- Make NOT NULL only when all rows are filled
    SELECT COUNT(*) INTO v_hospitals_without_tenant
    FROM public.hospitals
    WHERE tenant_id IS NULL;

    IF v_hospitals_without_tenant = 0 THEN
        ALTER TABLE public.hospitals ALTER COLUMN tenant_id SET NOT NULL;
        RAISE NOTICE 'Set tenant_id NOT NULL (all rows filled)';
    ELSE
        RAISE NOTICE 'WARNING: % hospital row(s) still have tenant_id = NULL — NOT NULL not applied', v_hospitals_without_tenant;
    END IF;
END $$;

-- Indexes for fast tenant-scoped lookups
CREATE INDEX IF NOT EXISTS idx_hospitals_tenant_id     ON public.hospitals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hospitals_tenant_active ON public.hospitals(tenant_id, is_active);

-- Verify
SELECT
    h.id,
    h.name,
    h.tenant_id,
    t.name AS tenant_name
FROM public.hospitals h
LEFT JOIN saas_core.tenants t ON t.id = h.tenant_id;
