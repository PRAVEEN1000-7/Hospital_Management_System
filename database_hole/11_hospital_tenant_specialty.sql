-- ============================================================================
-- 11_hospital_tenant_specialty.sql
-- Hospital specialty classification — gates the BRD v1.1 "eye hospital"
-- feature pack (Patient History block, Queue Display, Prescription Opthal
-- toggle + dual letterhead, Pharmacy Queue + payment tracking, Optical/
-- Opthal Billing), enforced in backend/app/core/tenant_security.py
-- (is_eye_hospital_feature_enabled).
-- ============================================================================

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS specialty VARCHAR(30) NOT NULL DEFAULT 'general';
ALTER TABLE hospitals DROP CONSTRAINT IF EXISTS hospitals_specialty_check;
ALTER TABLE hospitals ADD CONSTRAINT hospitals_specialty_check
    CHECK (specialty IN ('general', 'eye_hospital', 'multi_specialty'));

-- Mirrored at the tenant/billing level (saas_core) so it's visible/editable
-- from the Super Admin tenant screens without joining to hospitals.
ALTER TABLE saas_core.tenants ADD COLUMN IF NOT EXISTS specialty VARCHAR(50) DEFAULT 'general';

-- Backfill tenant specialty from its hospital where not already set.
UPDATE saas_core.tenants t
SET specialty = h.specialty
FROM hospitals h
WHERE h.tenant_id = t.id
  AND t.specialty = 'general'
  AND h.specialty != 'general';
