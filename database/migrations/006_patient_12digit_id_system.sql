-- ============================================================================
-- Migration 006: 12-Digit Patient ID System
-- Date: 2026-02-23
-- Description: Upgrades patient PRN from simple sequence to the 12-digit
--              HMS ID format: [HOSPITAL 2][GENDER 1][YY 2][MONTH 1][CHECK 1][SEQ 5]
--              Example: HCM262K00147
-- ============================================================================

BEGIN;

-- 1. Widen PRN column from 20 to 12 (already fits, but ensure consistency)
-- The column is already VARCHAR(20), which can hold 12 chars. No change needed.

-- 2. Create a monthly sequence table for per-hospital-per-month counters
CREATE TABLE IF NOT EXISTS patient_id_sequences (
    id SERIAL PRIMARY KEY,
    hospital_code VARCHAR(2) NOT NULL,
    year_month VARCHAR(4) NOT NULL,  -- e.g. '2602' for Feb 2026
    last_sequence INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(hospital_code, year_month)
);

CREATE INDEX IF NOT EXISTS idx_patient_id_seq_lookup
    ON patient_id_sequences(hospital_code, year_month);

-- 3. Create the hospital code registry table
CREATE TABLE IF NOT EXISTS hospital_code_registry (
    id SERIAL PRIMARY KEY,
    code VARCHAR(2) NOT NULL UNIQUE,
    hospital_name VARCHAR(200) NOT NULL,
    hospital_type VARCHAR(50) DEFAULT 'Branch',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default hospital codes from the spec
INSERT INTO hospital_code_registry (code, hospital_name, hospital_type) VALUES
    ('HC', 'HMS Core', 'Main Hospital'),
    ('HA', 'HMS Apollo', 'Branch'),
    ('HM', 'HMS Max', 'Branch'),
    ('HK', 'HMS KIMS', 'Branch'),
    ('HS', 'HMS Sparsh', 'Branch')
ON CONFLICT (code) DO NOTHING;

-- 4. Update hospital_details to have a proper 2-char code
-- Set default hospital_code to 'HC' if not already set
UPDATE hospital_details
SET hospital_code = 'HC'
WHERE hospital_code IS NULL OR hospital_code = '';

-- 5. Grant permissions to hospital_admin
GRANT ALL PRIVILEGES ON TABLE patient_id_sequences TO hospital_admin;
GRANT ALL PRIVILEGES ON TABLE hospital_code_registry TO hospital_admin;
GRANT USAGE, SELECT ON SEQUENCE patient_id_sequences_id_seq TO hospital_admin;
GRANT USAGE, SELECT ON SEQUENCE hospital_code_registry_id_seq TO hospital_admin;

-- 6. Add updated_at trigger for patient_id_sequences
DROP TRIGGER IF EXISTS update_patient_id_sequences_updated_at ON patient_id_sequences;
CREATE TRIGGER update_patient_id_sequences_updated_at
    BEFORE UPDATE ON patient_id_sequences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- ============================================================================
-- NOTE: Existing patient PRNs (e.g. HC2026000001) will continue to work.
-- New patients will get 12-digit IDs (e.g. HCM262K00147).
-- The system supports both old and new formats during transition.
-- ============================================================================
