-- ==============================================================================
-- OPTICAL PRESCRIPTION — EXAM FIELDS (Vision, IOP/Tension, NLD)
--
-- Adds three more per-eye eye-exam measurements to optical_prescriptions,
-- alongside the existing SPH/CYL/Axis/Add/VA — requested for the nurse's
-- pre-consultation Optical entry screen (NewOpticalPrescription.tsx), same
-- record the doctor's embedded "Add Optical" section in Prescription
-- Builder reads/edits:
--   - vision      — presenting/unaided vision (distinct from the existing
--                   right_va/left_va, which records vision WITH this
--                   prescription's correction)
--   - iop         — intra-ocular pressure / tension, taken via Schiotz
--                   tonometer
--   - nld         — nasolacrimal duct patency finding
--
-- All three are free-text (VARCHAR), matching the existing right_va/left_va
-- columns — clinical shorthand ("6/9", "16 mmHg", "Patent") doesn't fit a
-- strict numeric column, same reasoning already applied to VA.
--
-- Safe to run against an existing DB — idempotent (ADD COLUMN IF NOT EXISTS).
-- ==============================================================================

ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS right_vision VARCHAR(20);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS left_vision VARCHAR(20);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS right_iop VARCHAR(20);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS left_iop VARCHAR(20);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS right_nld VARCHAR(50);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS left_nld VARCHAR(50);
