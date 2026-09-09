-- ==============================================================================
-- 2026-09-09 — DRS (Diabetic Retinopathy Screening) box, Nurse Login
--
-- New optional field on prescriptions, entered by the nurse below the Vitals
-- section (same eye-hospital-only gating and single-string shape as the
-- existing vitals_blood_sugar column) and shown read-only in the doctor's
-- consultation for the same patient/visit — no re-entry required.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS vitals_drs TEXT;
