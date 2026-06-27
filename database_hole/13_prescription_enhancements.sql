-- ============================================================================
-- 13_prescription_enhancements.sql
-- Prescription module changes (BRD v1.1 §4): dual-letterhead institution
-- selector, Opthal toggle + notes, and Patient History blood-sugar carry-
-- over at consultation time. Eye-hospital feature pack only.
-- ============================================================================

ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES hospitals(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS is_opthal BOOLEAN DEFAULT FALSE;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS opthal_notes TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS vitals_blood_sugar VARCHAR(20);
