-- ─────────────────────────────────────────────────────────────────────────────
-- 09_common_medicines.sql
-- Platform-wide "common" medicines usable by hospitals that do NOT have the
-- inventory module (so they can still prescribe). Common/global medicines have
-- hospital_id = NULL and is_global = TRUE, and are managed by the super admin.
-- ─────────────────────────────────────────────────────────────────────────────

-- Allow medicines that are not owned by any single hospital.
ALTER TABLE medicines ALTER COLUMN hospital_id DROP NOT NULL;

-- Flag for the shared, cross-tenant formulary.
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;

-- Fast lookup of the global formulary.
CREATE INDEX IF NOT EXISTS idx_medicines_is_global ON medicines(is_global) WHERE is_global = TRUE;
