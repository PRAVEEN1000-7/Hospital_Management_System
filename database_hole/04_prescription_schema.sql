-- ============================================================================
-- HMS — Prescription System Migration  (ADDITIVE ONLY — safe to run anytime)
-- Adds: prescriptions, prescription_items, prescription_templates,
--        prescription_versions, medicines (if not exists)
-- ============================================================================
-- PREREQUISITES: 01_schema.sql + 02_seed_data.sql must already be applied.
-- SAFE FOR EXISTING DATA:
--   • All CREATE TABLE use IF NOT EXISTS — won't touch existing tables
--   • All CREATE INDEX use IF NOT EXISTS — won't duplicate indexes
--   • Permissions INSERT uses ON CONFLICT DO NOTHING — won't duplicate rows
--   • NO ALTER, DROP, UPDATE, or DELETE — existing data is never modified
--   • Existing user passwords & records remain untouched
-- 
-- FOR EXISTING TEAMS: Just run this one file against your database:
--   psql -U <user> -d <db> -f 04_prescription_schema.sql
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.1 medicines (created before prescription_items so FK works)
--     Only create if not already present from 01_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medicines (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id           UUID          NOT NULL REFERENCES hospitals(id),
    name                  VARCHAR(200)  NOT NULL,
    generic_name          VARCHAR(200)  NOT NULL,
    category              VARCHAR(50),
    manufacturer          VARCHAR(200),
    composition           TEXT,
    strength              VARCHAR(50),
    unit_of_measure       VARCHAR(20)   NOT NULL,
    units_per_pack        INTEGER       DEFAULT 1,
    hsn_code              VARCHAR(20),
    sku                   VARCHAR(50),
    barcode               VARCHAR(50),
    requires_prescription BOOLEAN       DEFAULT true,
    is_controlled         BOOLEAN       DEFAULT false,
    selling_price         DECIMAL(12,2) NOT NULL,
    purchase_price        DECIMAL(12,2),
    tax_config_id         UUID          REFERENCES tax_configurations(id),
    reorder_level         INTEGER       DEFAULT 10,
    max_stock_level       INTEGER,
    storage_instructions  VARCHAR(255),
    is_active             BOOLEAN       DEFAULT true,
    created_at            TIMESTAMPTZ   DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.1 prescriptions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescriptions (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id           UUID        NOT NULL REFERENCES hospitals(id),
    prescription_number   VARCHAR(30) NOT NULL UNIQUE,
    appointment_id        UUID        REFERENCES appointments(id),
    patient_id            UUID        NOT NULL REFERENCES patients(id),
    doctor_id             UUID        NOT NULL REFERENCES doctors(id),
    diagnosis             TEXT,
    clinical_notes        TEXT,
    advice                TEXT,
    version               INTEGER     DEFAULT 1,
    status                VARCHAR(20) DEFAULT 'draft',
    is_finalized          BOOLEAN     DEFAULT false,
    finalized_at          TIMESTAMPTZ,
    valid_until           DATE,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    created_by            UUID        REFERENCES users(id),
    is_deleted            BOOLEAN     DEFAULT false
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.2 prescription_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescription_items (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id     UUID         NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    medicine_id         UUID         REFERENCES medicines(id),
    medicine_name       VARCHAR(200) NOT NULL,
    generic_name        VARCHAR(200),
    dosage              VARCHAR(50)  NOT NULL,
    frequency           VARCHAR(50)  NOT NULL,
    duration_value      INTEGER,
    duration_unit       VARCHAR(10),
    route               VARCHAR(30),
    instructions        TEXT,
    quantity            INTEGER,
    allow_substitution  BOOLEAN      DEFAULT true,
    is_dispensed        BOOLEAN      DEFAULT false,
    dispensed_quantity  INTEGER      DEFAULT 0,
    display_order       INTEGER      DEFAULT 0,
    created_at          TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.3 prescription_templates
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescription_templates (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id   UUID         NOT NULL REFERENCES doctors(id),
    name        VARCHAR(100) NOT NULL,
    diagnosis   VARCHAR(255),
    items       JSONB        NOT NULL,
    advice      TEXT,
    is_active   BOOLEAN      DEFAULT true,
    usage_count INTEGER      DEFAULT 0,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.4 prescription_versions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescription_versions (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID    NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    snapshot        JSONB   NOT NULL,
    changed_by      UUID    REFERENCES users(id),
    change_reason   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes for performance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient     ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor      ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment ON prescriptions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status      ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_created     ON prescriptions(created_at);
CREATE INDEX IF NOT EXISTS idx_prescription_items_rx     ON prescription_items(prescription_id);
CREATE INDEX IF NOT EXISTS idx_medicines_hospital        ON medicines(hospital_id);
CREATE INDEX IF NOT EXISTS idx_medicines_name            ON medicines(name);
CREATE INDEX IF NOT EXISTS idx_prescription_templates_doctor ON prescription_templates(doctor_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Permissions seed for prescription module
-- ─────────────────────────────────────────────────────────────────────────────
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
