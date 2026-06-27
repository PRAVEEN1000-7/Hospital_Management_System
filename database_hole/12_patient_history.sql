-- ============================================================================
-- 12_patient_history.sql
-- Patient History block (BRD v1.1 §2) — captured at registration, auto-fills
-- into the Prescription form. Eye-hospital feature pack only (general
-- hospitals never set these — see backend/app/routers/patients.py).
-- ============================================================================

ALTER TABLE patients ADD COLUMN IF NOT EXISTS reason_for_visit TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS symptoms JSONB;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS blood_sugar_value NUMERIC(10, 2);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS blood_sugar_unit VARCHAR(10);
