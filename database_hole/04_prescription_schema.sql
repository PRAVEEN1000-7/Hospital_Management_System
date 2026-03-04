-- ============================================================================
-- HMS — Prescription Module: Indexes & Permissions  (ADDITIVE ONLY)
-- ============================================================================
-- NOTE: All prescription tables (medicines, prescriptions, prescription_items,
--       prescription_templates, prescription_versions) are ALREADY created by
--       01_schema.sql. This file only adds missing indexes and permissions.
--
-- Safe to run anytime — uses IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Indexes for prescription queries (not present in 01_schema.sql)
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient     ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor      ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment ON prescriptions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status      ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_created     ON prescriptions(created_at);
CREATE INDEX IF NOT EXISTS idx_prescription_items_rx     ON prescription_items(prescription_id);
CREATE INDEX IF NOT EXISTS idx_prescription_templates_doctor ON prescription_templates(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescription_versions_rx  ON prescription_versions(prescription_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Permissions seed for prescription module
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO permissions (module, action, resource, description)
VALUES
    ('prescription', 'create', 'prescription', 'Create prescriptions'),
    ('prescription', 'read',   'prescription', 'View prescriptions'),
    ('prescription', 'update', 'prescription', 'Update prescriptions'),
    ('prescription', 'delete', 'prescription', 'Delete prescriptions'),
    ('prescription', 'finalize', 'prescription', 'Finalize prescriptions'),
    ('medicine', 'create', 'medicine', 'Create medicines'),
    ('medicine', 'read',   'medicine', 'View medicines'),
    ('medicine', 'update', 'medicine', 'Update medicines')
ON CONFLICT (module, action, resource) DO NOTHING;
