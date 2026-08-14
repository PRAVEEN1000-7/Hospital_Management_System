-- ==============================================================================
-- 2026-08-14 — LAB TEST PACKAGES (MHC / HHC)
--
-- A named bundle of existing lab_tests catalog rows (e.g. "MHC — Master
-- Health Checkup") that a doctor can pick as one unit from the Prescription
-- Builder, expanding into every member test on the order. test_ids is a
-- plain UUID array (no FK — arrays can't carry one), same accepted tradeoff
-- already used by saas_core.subscription_plans.modules_included.
--
-- Safe to run against an existing DB — idempotent (CREATE TABLE IF NOT EXISTS).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS lab_test_panels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id),
    name        VARCHAR(200) NOT NULL,
    code        VARCHAR(30) NOT NULL,
    test_ids    UUID[] NOT NULL DEFAULT '{}',
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

CREATE INDEX IF NOT EXISTS idx_lab_test_panels_hospital ON lab_test_panels(hospital_id);
