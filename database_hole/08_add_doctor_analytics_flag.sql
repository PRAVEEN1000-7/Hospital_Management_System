-- ==============================================================================
-- 08 — Per-doctor analytics visibility flag (BUG-16)
--
-- Analytics should be available only to in-house doctors, not guest doctors.
-- A checkbox at staff creation/edit toggles this per doctor. Defaults TRUE so
-- every existing doctor keeps the access they have today — admins then
-- untick it for guest doctors.
-- ==============================================================================

ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS analytics_enabled BOOLEAN DEFAULT TRUE;
