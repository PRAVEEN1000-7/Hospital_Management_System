-- ============================================================================
-- 17_prescription_eye_side.sql
-- Eye Hospital Drug Prescription format — per-medicine "which eye" marker
-- (RE / LE / Both), distinct from the generic Frequency/Duration/Qty/Route
-- columns used by the normal hospital prescription format. Eye-hospital
-- feature pack only; null for general-hospital prescription items.
-- ============================================================================

ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS eye_side VARCHAR(10);
