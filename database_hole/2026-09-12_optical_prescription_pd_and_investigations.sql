-- ==============================================================================
-- 2026-09-12 — Optical prescription: single combined PD field, plus new
-- systemic investigation fields on the Eye Investigation section.
--
-- 1. `pd` — single Pupillary Distance (mm) covering both eyes, replacing the
--    4-field PD Distance/Near/Right/Left entry in the UI. The 4 legacy
--    columns are kept as-is (existing records still read/display them) —
--    this is purely additive, no data loss, no column removal.
--
-- 2. Systemic investigation fields shown in Eye Investigation (HIV, ECG,
--    VDRL, BP, Blood Sugar, SpO2, Others) — deliberately NOT split per eye
--    (systemic values apply to the whole patient, not per RE/OS), so each is
--    a single column, same shape as the existing vision/iop/nld fields but
--    without a left_/right_ prefix.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS pd NUMERIC(4,1);

ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS inv_hiv VARCHAR(20);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS inv_ecg VARCHAR(20);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS inv_vdrl VARCHAR(20);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS inv_bp VARCHAR(20);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS inv_blood_sugar VARCHAR(20);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS inv_spo2 VARCHAR(20);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS inv_others TEXT;
