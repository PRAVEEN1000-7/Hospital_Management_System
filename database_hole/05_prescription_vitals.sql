-- =====================================================================
-- 05: Add vitals & follow_up_date to prescriptions table
-- Purpose: Prescription page doubles as the consultation page.
--          Vitals + follow-up are captured directly on the prescription.
-- =====================================================================

-- Vitals columns (all varchar — handles varied formats like "120/80")
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS vitals_bp       VARCHAR(20);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS vitals_pulse    VARCHAR(10);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS vitals_temp     VARCHAR(10);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS vitals_weight   VARCHAR(10);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS vitals_spo2     VARCHAR(10);

-- Follow-up date
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS follow_up_date  DATE;

-- Queue reference (optional — links prescription to a walk-in queue entry)
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS queue_id        UUID REFERENCES appointment_queue(id);
