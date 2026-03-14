-- ============================================================================
-- HMS — Hospital Management System
-- Migration: Add optical prescription fields to prescriptions table
-- ============================================================================
-- This migration adds optical/eye-care fields directly to the prescriptions
-- table with a discriminator column (prescription_type) instead of using
-- a separate optical_prescriptions table, keeping the architecture simple.
-- ============================================================================

-- 1. Add prescription_type discriminator
ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS prescription_type VARCHAR(20) DEFAULT 'general';

-- 2. Add right eye (OD) refraction fields
ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS right_sphere   VARCHAR(20),
    ADD COLUMN IF NOT EXISTS right_cylinder VARCHAR(20),
    ADD COLUMN IF NOT EXISTS right_axis     VARCHAR(20),
    ADD COLUMN IF NOT EXISTS right_add      VARCHAR(20),
    ADD COLUMN IF NOT EXISTS right_va       VARCHAR(20),
    ADD COLUMN IF NOT EXISTS right_ipd      VARCHAR(20);

-- 3. Add left eye (OS) refraction fields
ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS left_sphere   VARCHAR(20),
    ADD COLUMN IF NOT EXISTS left_cylinder VARCHAR(20),
    ADD COLUMN IF NOT EXISTS left_axis     VARCHAR(20),
    ADD COLUMN IF NOT EXISTS left_add      VARCHAR(20),
    ADD COLUMN IF NOT EXISTS left_va       VARCHAR(20),
    ADD COLUMN IF NOT EXISTS left_ipd      VARCHAR(20);

-- 4. Add lens recommendation fields
ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS lens_type     VARCHAR(50),
    ADD COLUMN IF NOT EXISTS lens_material VARCHAR(50),
    ADD COLUMN IF NOT EXISTS lens_coating  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS optical_notes TEXT;

-- 5. Add index for filtering by type
CREATE INDEX IF NOT EXISTS idx_prescriptions_type ON prescriptions(prescription_type);

-- 6. Update existing rows to have 'general' type (safety net)
UPDATE prescriptions SET prescription_type = 'general' WHERE prescription_type IS NULL;
