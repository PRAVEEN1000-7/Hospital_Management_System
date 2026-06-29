-- ############################################################################
-- HMS Multi-Tenant — COMPLETE DATABASE SCHEMA (consolidated, base structure)
-- ############################################################################
-- First-time deploy on a FRESH database. Run INSIDE the target database
-- (hms_db) as its owner:
--     psql -U hms_user -d hms_db -f 01_full_schema.sql
--
-- This is the general (non-eye-hospital) base structure — every hospital
-- needs this. Eye-hospital-specific additions (BRD v1.1) are intentionally
-- kept separate — see 04_eye_hospital_updates.sql, applied AFTER this file.
--
-- Consolidates, in the correct dependency order:
--   1. Core HMS schema (public)            ← 01_schema.sql
--   2. Multi-tenant SaaS core (saas_core)  ← 05_multi_tenant_schema.sql
--   3. Tenant links / security / RLS       ← 07_security_schema_fixes.sql
--   4. Supplier categories adjustment      ← inventory_alter.sql
--   5. Common (global) medicines           ← 09_common_medicines.sql
--   6. Optical Store batch tracking        ← 10_optical_batches.sql
--   7. Access-token revocation (security)  ← security_updates.sql
-- Superseded/recovery/retrofit-only scripts (06, 08, local_new_update.sql,
-- multi_01_schema.sql) are intentionally NOT included — their one-time
-- backfill logic doesn't apply to a fresh install, and everything they
-- structurally added is already folded in above.
-- ############################################################################

-- ==============================================================================
-- SECTION 1 — CORE HMS SCHEMA (public)
-- Source: 01_schema.sql
-- ==============================================================================

-- ============================================================================
-- HMS — Hospital Management System
-- Complete Database Schema (PostgreSQL 15+)
-- ============================================================================
-- Version : 1.0
-- ID Format : 12-digit [HH][G][YY][M][C][#####]
-- Conventions:
--   • UUID primary keys via gen_random_uuid()
--   • TIMESTAMPTZ for all timestamps (UTC)
--   • Soft deletes: is_deleted + deleted_at
--   • Audit cols : created_by, updated_by → users(id)
--   • Monetary   : DECIMAL(12,2)
--   • Phone      : E.164 format
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Extensions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 0 — FOUNDATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.1 hospitals
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE hospitals (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    code                VARCHAR(20)  NOT NULL UNIQUE,
    logo_url            VARCHAR(500),
    address_line_1      VARCHAR(255),
    address_line_2      VARCHAR(255),
    city                VARCHAR(100),
    state_province      VARCHAR(100),
    postal_code         VARCHAR(20),
    country             VARCHAR(3)   NOT NULL DEFAULT 'USA',        -- ISO 3166-1 alpha-3
    phone               VARCHAR(20),                                 -- E.164
    email               VARCHAR(255),
    website             VARCHAR(255),
    timezone            VARCHAR(50)  NOT NULL DEFAULT 'UTC',         -- IANA timezone
    default_currency    VARCHAR(3)   NOT NULL DEFAULT 'USD',         -- ISO 4217
    tax_id              VARCHAR(50),
    registration_number VARCHAR(100),
    is_active           BOOLEAN      DEFAULT true,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.2 departments  (head_doctor_id FK deferred — added after doctors table)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE departments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID        NOT NULL REFERENCES hospitals(id),
    name            VARCHAR(100) NOT NULL,
    code            VARCHAR(20)  NOT NULL,
    description     TEXT,
    head_doctor_id  UUID,                      -- FK added later via ALTER TABLE
    is_active       BOOLEAN     DEFAULT true,
    display_order   INTEGER     DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.3 hospital_settings  (1-to-1 with hospitals)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE hospital_settings (
    id                                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id                         UUID        NOT NULL UNIQUE REFERENCES hospitals(id),
    hospital_code                       CHAR(2)     NOT NULL,            -- 2-char code for 12-digit ID
    patient_id_start_number             INTEGER     DEFAULT 1,
    patient_id_sequence                 INTEGER     DEFAULT 0,
    staff_id_start_number               INTEGER     DEFAULT 1,
    staff_id_sequence                   INTEGER     DEFAULT 0,
    invoice_prefix                      VARCHAR(10) DEFAULT 'INV',
    invoice_sequence                    INTEGER     DEFAULT 0,
    prescription_prefix                 VARCHAR(10) DEFAULT 'RX',
    prescription_sequence               INTEGER     DEFAULT 0,
    appointment_slot_duration_minutes   INTEGER     DEFAULT 15,
    appointment_buffer_minutes          INTEGER     DEFAULT 5,
    max_daily_appointments_per_doctor   INTEGER     DEFAULT 40,
    allow_walk_in                       BOOLEAN     DEFAULT true,
    allow_emergency_bypass              BOOLEAN     DEFAULT true,
    allow_opd_credit                    BOOLEAN     DEFAULT true,
    enable_sms_notifications            BOOLEAN     DEFAULT false,
    enable_email_notifications          BOOLEAN     DEFAULT true,
    enable_whatsapp_notifications       BOOLEAN     DEFAULT false,
    consultation_fee_default            DECIMAL(12,2) DEFAULT 0,
    follow_up_validity_days             INTEGER     DEFAULT 7,
    data_retention_years                INTEGER     DEFAULT 7,
    branding_primary_color              VARCHAR(7)  DEFAULT '#1E40AF',
    branding_secondary_color            VARCHAR(7)  DEFAULT '#3B82F6',
    print_header_text                   TEXT,
    print_footer_text                   TEXT,
    created_at                          TIMESTAMPTZ DEFAULT NOW(),
    updated_at                          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.4 tax_configurations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE tax_configurations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID        NOT NULL REFERENCES hospitals(id),
    name            VARCHAR(100) NOT NULL,
    code            VARCHAR(20)  NOT NULL,
    rate_percentage DECIMAL(5,2) NOT NULL,
    applies_to      VARCHAR(20)  NOT NULL,          -- 'product','service','both'
    category        VARCHAR(50),
    is_compound     BOOLEAN     DEFAULT false,
    is_active       BOOLEAN     DEFAULT true,
    effective_from  DATE        NOT NULL,
    effective_to    DATE,                            -- NULL = no end date
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.1 users
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id             UUID        NOT NULL REFERENCES hospitals(id),
    reference_number        VARCHAR(12) NOT NULL UNIQUE,                -- HMS 12-digit ID
    email                   VARCHAR(255) NOT NULL,
    username                VARCHAR(50)  NOT NULL,
    password_hash           VARCHAR(255) NOT NULL,                      -- bcrypt
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    phone                   VARCHAR(20),
    avatar_url              VARCHAR(500),
    preferred_locale        VARCHAR(10) DEFAULT 'en',
    preferred_timezone      VARCHAR(50),
    is_active               BOOLEAN     DEFAULT true,
    is_mfa_enabled          BOOLEAN     DEFAULT false,
    mfa_secret              VARCHAR(255),
    last_login_at           TIMESTAMPTZ,
    password_changed_at     TIMESTAMPTZ,
    failed_login_attempts   INTEGER     DEFAULT 0,
    locked_until            TIMESTAMPTZ,
    must_change_password    BOOLEAN     DEFAULT true,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    created_by              UUID        REFERENCES users(id),           -- self-ref
    is_deleted              BOOLEAN     DEFAULT false,
    deleted_at              TIMESTAMPTZ,
    UNIQUE (hospital_id, email),
    UNIQUE (hospital_id, username)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.2 roles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE roles (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id  UUID        REFERENCES hospitals(id),                  -- NULL = system-wide
    name         VARCHAR(50) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description  TEXT,
    is_system    BOOLEAN     DEFAULT false,
    is_active    BOOLEAN     DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (hospital_id, name)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.3 permissions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE permissions (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module      VARCHAR(50)  NOT NULL,
    action      VARCHAR(20)  NOT NULL,
    resource    VARCHAR(50)  NOT NULL,
    description VARCHAR(255),
    UNIQUE (module, action, resource)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.4 user_roles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE user_roles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id),
    role_id     UUID        NOT NULL REFERENCES roles(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID        REFERENCES users(id),
    UNIQUE (user_id, role_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.5 role_permissions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE role_permissions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id       UUID NOT NULL REFERENCES roles(id),
    permission_id UUID NOT NULL REFERENCES permissions(id),
    UNIQUE (role_id, permission_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.6 refresh_tokens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id),
    token_hash  VARCHAR(255) NOT NULL UNIQUE,       -- SHA-256 hash
    device_info VARCHAR(255),
    ip_address  VARCHAR(45),
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked_at  TIMESTAMPTZ,                         -- NULL = valid
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 1 — CORE (Patients, Doctors, Appointments)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.1 patients
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE patients (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id                 UUID        NOT NULL REFERENCES hospitals(id),
    patient_reference_number    VARCHAR(12) NOT NULL,                   -- HMS 12-digit PRN
    title                       VARCHAR(10),                              -- 'Mr.','Mrs.','Ms.','Master','Dr.','Prof.','Baby'
    first_name                  VARCHAR(100) NOT NULL,
    last_name                   VARCHAR(100) NOT NULL,
    date_of_birth               DATE,
    age_years                   INTEGER,
    age_months                  INTEGER,
    gender                      VARCHAR(20) NOT NULL,                   -- 'male','female','other','prefer_not_to_say'
    blood_group                 VARCHAR(5),                              -- 'A+','A-','B+','B-','AB+','AB-','O+','O-'
    marital_status              VARCHAR(20),
    phone_country_code          VARCHAR(5)  NOT NULL DEFAULT '+1',
    phone_number                VARCHAR(15) NOT NULL,
    secondary_phone             VARCHAR(20),
    email                       VARCHAR(255),
    national_id_type            VARCHAR(30),
    national_id_number          VARCHAR(50),
    address_line_1              VARCHAR(255),
    address_line_2              VARCHAR(255),
    city                        VARCHAR(100),
    state_province              VARCHAR(100),
    postal_code                 VARCHAR(20),
    country                     VARCHAR(100) DEFAULT 'India',
    photo_url                   VARCHAR(500),
    emergency_contact_name      VARCHAR(200),
    emergency_contact_phone     VARCHAR(20),
    emergency_contact_country_code VARCHAR(5) DEFAULT '+91',
    emergency_contact_relation  VARCHAR(50),
    known_allergies             TEXT,
    chronic_conditions          TEXT,
    notes                       TEXT,
    preferred_language          VARCHAR(10) DEFAULT 'en',
    is_active                   BOOLEAN     DEFAULT true,
    registered_at               TIMESTAMPTZ DEFAULT NOW(),
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW(),
    created_by                  UUID        REFERENCES users(id),
    updated_by                  UUID        REFERENCES users(id),
    is_deleted                  BOOLEAN     DEFAULT false,
    deleted_at                  TIMESTAMPTZ,
    UNIQUE (hospital_id, patient_reference_number)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2 patient_consents
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE patient_consents (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    UUID         NOT NULL REFERENCES patients(id),
    consent_type  VARCHAR(50)  NOT NULL,     -- 'registration','treatment','data_sharing','photo'
    consent_text  TEXT         NOT NULL,
    is_accepted   BOOLEAN      NOT NULL,
    signature_url VARCHAR(500),
    consented_at  TIMESTAMPTZ  NOT NULL,
    ip_address    VARCHAR(45),
    created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.3 patient_documents
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE patient_documents (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id     UUID         NOT NULL REFERENCES patients(id),
    document_type  VARCHAR(50)  NOT NULL,    -- 'id_proof','insurance_card','lab_report','other'
    title          VARCHAR(200) NOT NULL,
    file_url       VARCHAR(500) NOT NULL,
    file_type      VARCHAR(20)  NOT NULL,    -- 'pdf','jpeg','png'
    file_size_bytes INTEGER,
    uploaded_by    UUID         REFERENCES users(id),
    created_at     TIMESTAMPTZ  DEFAULT NOW(),
    is_deleted     BOOLEAN      DEFAULT false
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.1 doctors
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE doctors (
    id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID          NOT NULL UNIQUE REFERENCES users(id),
    hospital_id            UUID          NOT NULL REFERENCES hospitals(id),
    department_id          UUID          REFERENCES departments(id),
    employee_id            VARCHAR(30),
    specialization         VARCHAR(100)  NOT NULL,
    qualification          VARCHAR(255)  NOT NULL,
    registration_number    VARCHAR(50)   NOT NULL,
    registration_authority VARCHAR(100),
    experience_years       INTEGER,
    bio                    TEXT,
    doctor_sequence        INTEGER,           -- 1, 2, or 3 for workflow
    consultation_fee       DECIMAL(12,2) DEFAULT 0,
    follow_up_fee          DECIMAL(12,2) DEFAULT 0,
    is_available           BOOLEAN       DEFAULT true,
    is_active              BOOLEAN       DEFAULT true,
    created_at             TIMESTAMPTZ   DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   DEFAULT NOW(),
    created_by             UUID          REFERENCES users(id),
    is_deleted             BOOLEAN       DEFAULT false
);

-- Deferred FK: departments.head_doctor_id → doctors
ALTER TABLE departments
    ADD CONSTRAINT fk_departments_head_doctor
    FOREIGN KEY (head_doctor_id) REFERENCES doctors(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.2 doctor_schedules
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE doctor_schedules (
    id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id             UUID    NOT NULL REFERENCES doctors(id),
    day_of_week           INTEGER NOT NULL,             -- 0=Sunday, 6=Saturday
    shift_name            VARCHAR(50) DEFAULT 'default',
    start_time            TIME    NOT NULL,
    end_time              TIME    NOT NULL,
    break_start_time      TIME,
    break_end_time        TIME,
    slot_duration_minutes INTEGER NOT NULL DEFAULT 15,
    max_patients          INTEGER DEFAULT 20,
    is_active             BOOLEAN DEFAULT true,
    effective_from        DATE    NOT NULL,
    effective_to          DATE,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (doctor_id, day_of_week, shift_name, effective_from)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.3 doctor_leaves
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE doctor_leaves (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id   UUID        NOT NULL REFERENCES doctors(id),
    leave_date  DATE        NOT NULL,
    leave_type  VARCHAR(30) DEFAULT 'full_day',  -- 'full_day','morning','afternoon'
    reason      VARCHAR(255),
    approved_by UUID        REFERENCES users(id),
    status      VARCHAR(20) DEFAULT 'approved',  -- 'pending','approved','rejected'
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (doctor_id, leave_date, leave_type)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.4 doctor_fees
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE doctor_fees (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id      UUID          NOT NULL REFERENCES doctors(id),
    fee_type       VARCHAR(30)   NOT NULL,          -- 'consultation','follow_up','procedure'
    service_name   VARCHAR(100)  NOT NULL,
    amount         DECIMAL(12,2) NOT NULL,
    currency       VARCHAR(3)    DEFAULT 'USD',
    effective_from DATE          NOT NULL,
    effective_to   DATE,
    is_active      BOOLEAN       DEFAULT true,
    created_at     TIMESTAMPTZ   DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.1 appointments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE appointments (
    id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id              UUID          NOT NULL REFERENCES hospitals(id),
    appointment_number       VARCHAR(30)   NOT NULL UNIQUE,
    patient_id               UUID          NOT NULL REFERENCES patients(id),
    doctor_id                UUID          NOT NULL REFERENCES doctors(id),
    department_id            UUID          REFERENCES departments(id),
    appointment_date         DATE          NOT NULL,
    start_time               TIME          NOT NULL,
    end_time                 TIME,
    appointment_type         VARCHAR(20)   NOT NULL,                 -- 'scheduled','walk_in','emergency','follow_up'
    visit_type               VARCHAR(20)   DEFAULT 'new',            -- 'new','follow_up'
    priority                 VARCHAR(10)   DEFAULT 'normal',         -- 'normal','urgent','emergency'
    status                   VARCHAR(20)   NOT NULL DEFAULT 'scheduled',
    current_doctor_sequence  INTEGER       DEFAULT 1,
    parent_appointment_id    UUID          REFERENCES appointments(id),
    chief_complaint          TEXT,
    cancel_reason            VARCHAR(255),
    reschedule_reason        VARCHAR(255),
    reschedule_count         INTEGER       DEFAULT 0,
    check_in_at              TIMESTAMPTZ,
    consultation_start_at    TIMESTAMPTZ,
    consultation_end_at      TIMESTAMPTZ,
    notes                    TEXT,
    consultation_fee         DECIMAL(12,2),
    created_at               TIMESTAMPTZ   DEFAULT NOW(),
    updated_at               TIMESTAMPTZ   DEFAULT NOW(),
    created_by               UUID          REFERENCES users(id),
    is_deleted               BOOLEAN       DEFAULT false
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.2 appointment_status_log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE appointment_status_log (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID        NOT NULL REFERENCES appointments(id),
    from_status    VARCHAR(20),
    to_status      VARCHAR(20) NOT NULL,
    changed_by     UUID        REFERENCES users(id),
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.3 appointment_queue
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE appointment_queue (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID        NOT NULL REFERENCES appointments(id),
    doctor_id      UUID        NOT NULL REFERENCES doctors(id),
    queue_date     DATE        NOT NULL,
    queue_number   INTEGER     NOT NULL,
    position       INTEGER     NOT NULL,
    status         VARCHAR(20) DEFAULT 'waiting',   -- 'waiting','called','in_consultation','completed','skipped'
    called_at      TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (doctor_id, queue_date, queue_number)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.4 waitlists  (overflow when doctor slots are full)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE waitlists (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id             UUID        NOT NULL REFERENCES hospitals(id),
    patient_id              UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id               UUID        NOT NULL REFERENCES doctors(id),
    department_id           UUID        REFERENCES departments(id),
    preferred_date          DATE        NOT NULL,
    preferred_time          TIME,
    appointment_type        VARCHAR(20) NOT NULL DEFAULT 'walk-in',   -- walk-in, scheduled
    priority                VARCHAR(10) DEFAULT 'normal',             -- normal, urgent, emergency
    chief_complaint         TEXT,
    reason                  TEXT,
    status                  VARCHAR(20) DEFAULT 'waiting',            -- waiting, notified, booked, cancelled, expired
    position                INTEGER     NOT NULL DEFAULT 0,
    booked_appointment_id   UUID        REFERENCES appointments(id),
    notified_at             TIMESTAMPTZ,
    expires_at              TIMESTAMPTZ,
    created_by              UUID        REFERENCES users(id),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    is_deleted              BOOLEAN     DEFAULT false
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 2 — CLINICAL (Prescriptions, Pharmacy, Optical)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.1 medicines  (created before prescription_items so FK works)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE medicines (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id           UUID          NOT NULL REFERENCES hospitals(id),
    name                  VARCHAR(200)  NOT NULL,
    generic_name          VARCHAR(200)  NOT NULL,
    category              VARCHAR(50),           -- 'tablet','capsule','syrup','injection','cream','drops'
    manufacturer          VARCHAR(200),
    composition           TEXT,
    strength              VARCHAR(50),
    unit_of_measure       VARCHAR(20)   NOT NULL, -- 'strip','bottle','tube','vial','box'
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
CREATE TABLE prescriptions (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id           UUID        NOT NULL REFERENCES hospitals(id),
    prescription_number   VARCHAR(30) NOT NULL UNIQUE,
    appointment_id        UUID        REFERENCES appointments(id),
    patient_id            UUID        NOT NULL REFERENCES patients(id),
    doctor_id             UUID        NOT NULL REFERENCES doctors(id),
    diagnosis             TEXT,
    clinical_notes        TEXT,
    advice                TEXT,
    vitals_bp             VARCHAR(20),
    vitals_pulse          VARCHAR(10),
    vitals_temp           VARCHAR(10),
    vitals_weight         VARCHAR(10),
    vitals_spo2           VARCHAR(10),
    follow_up_date        DATE,
    queue_id              UUID        REFERENCES appointment_queue(id),
    version               INTEGER     DEFAULT 1,
    status                VARCHAR(20) DEFAULT 'draft',  -- 'draft','finalized','dispensed','partially_dispensed'
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
CREATE TABLE prescription_items (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id     UUID         NOT NULL REFERENCES prescriptions(id),
    medicine_id         UUID         REFERENCES medicines(id),
    medicine_name       VARCHAR(200) NOT NULL,
    generic_name        VARCHAR(200),
    dosage              VARCHAR(50)  NOT NULL,
    frequency           VARCHAR(50)  NOT NULL,        -- e.g., '1-0-1'
    duration_value      INTEGER,
    duration_unit       VARCHAR(10),                   -- 'days','weeks','months'
    route               VARCHAR(30),                   -- 'oral','topical','injection','inhalation'
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
CREATE TABLE prescription_templates (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id   UUID         NOT NULL REFERENCES doctors(id),
    name        VARCHAR(100) NOT NULL,
    diagnosis   VARCHAR(255),
    items       JSONB        NOT NULL,          -- Array of item definitions
    advice      TEXT,
    is_active   BOOLEAN      DEFAULT true,
    usage_count INTEGER      DEFAULT 0,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.4 prescription_versions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE prescription_versions (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID    NOT NULL REFERENCES prescriptions(id),
    version         INTEGER NOT NULL,
    snapshot        JSONB   NOT NULL,
    changed_by      UUID    REFERENCES users(id),
    change_reason   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.5 lab_orders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE lab_orders (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID         NOT NULL REFERENCES prescriptions(id),
    patient_id      UUID         NOT NULL REFERENCES patients(id),
    doctor_id       UUID         NOT NULL REFERENCES doctors(id),
    test_name       VARCHAR(200) NOT NULL,
    test_code       VARCHAR(30),
    instructions    TEXT,
    urgency         VARCHAR(20)  DEFAULT 'routine',   -- 'routine','urgent','stat'
    status          VARCHAR(20)  DEFAULT 'ordered',    -- 'ordered','collected','processing','completed'
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.1 optical_products
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE optical_products (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID          NOT NULL REFERENCES hospitals(id),
    name            VARCHAR(200)  NOT NULL,
    category        VARCHAR(50)   NOT NULL, -- 'frame','lens','contact_lens','accessory','solution'
    brand           VARCHAR(100),
    model_number    VARCHAR(50),
    color           VARCHAR(30),
    material        VARCHAR(50),
    size            VARCHAR(20),
    gender          VARCHAR(10),            -- 'unisex','male','female','kids'
    sku             VARCHAR(50),
    barcode         VARCHAR(50),
    selling_price   DECIMAL(12,2) NOT NULL,
    purchase_price  DECIMAL(12,2),
    tax_config_id   UUID          REFERENCES tax_configurations(id),
    current_stock   INTEGER       DEFAULT 0,
    reorder_level   INTEGER       DEFAULT 5,
    lens_type       VARCHAR(30),            -- 'single_vision','bifocal','progressive','tinted'
    lens_index      VARCHAR(10),
    lens_coating    VARCHAR(50),
    image_url       VARCHAR(500),
    is_active       BOOLEAN       DEFAULT true,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.2 optical_prescriptions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE optical_prescriptions (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id         UUID          NOT NULL REFERENCES hospitals(id),
    prescription_number VARCHAR(30)   NOT NULL UNIQUE,
    patient_id          UUID          NOT NULL REFERENCES patients(id),
    doctor_id           UUID          NOT NULL REFERENCES doctors(id),
    appointment_id      UUID          REFERENCES appointments(id),
    right_sph           DECIMAL(5,2),
    right_cyl           DECIMAL(5,2),
    right_axis          INTEGER,              -- 0-180 degrees
    right_add           DECIMAL(4,2),
    right_va            VARCHAR(20),
    left_sph            DECIMAL(5,2),
    left_cyl            DECIMAL(5,2),
    left_axis           INTEGER,
    left_add            DECIMAL(4,2),
    left_va             VARCHAR(20),
    pd_distance         DECIMAL(4,1),
    pd_near             DECIMAL(4,1),
    pd_right            DECIMAL(4,1),
    pd_left             DECIMAL(4,1),
    notes               TEXT,
    is_finalized        BOOLEAN       DEFAULT false,
    valid_until         DATE,
    created_at          TIMESTAMPTZ   DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 3 — BILLING & PAYMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.1 invoices  (insurance_claim_id FK deferred)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE invoices (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id        UUID          NOT NULL REFERENCES hospitals(id),
    invoice_number     VARCHAR(30)   NOT NULL UNIQUE,
    patient_id         UUID          NOT NULL REFERENCES patients(id),
    appointment_id     UUID          REFERENCES appointments(id),
    invoice_type       VARCHAR(20)   NOT NULL,          -- 'opd','pharmacy','optical','combined'
    invoice_date       DATE          NOT NULL,
    due_date           DATE,
    subtotal           DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount    DECIMAL(12,2) DEFAULT 0,
    discount_reason    VARCHAR(255),
    tax_amount         DECIMAL(12,2) DEFAULT 0,
    total_amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_amount        DECIMAL(12,2) DEFAULT 0,
    balance_amount     DECIMAL(12,2) DEFAULT 0,
    currency           VARCHAR(3)    DEFAULT 'USD',
    status             VARCHAR(20)   DEFAULT 'draft',   -- 'draft','issued','partially_paid','paid','overdue','cancelled','void'
    notes              TEXT,
    insurance_claim_id UUID,                             -- FK added after insurance_claims
    created_at         TIMESTAMPTZ   DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   DEFAULT NOW(),
    created_by         UUID          REFERENCES users(id),
    is_deleted         BOOLEAN       DEFAULT false
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.2 invoice_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE invoice_items (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id       UUID          NOT NULL REFERENCES invoices(id),
    item_type        VARCHAR(20)   NOT NULL,             -- 'consultation','medicine','optical_product','service','procedure'
    reference_id     UUID,                                -- FK to source table
    description      VARCHAR(255)  NOT NULL,
    quantity         DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price       DECIMAL(12,2) NOT NULL,
    discount_percent DECIMAL(5,2)  DEFAULT 0,
    discount_amount  DECIMAL(12,2) DEFAULT 0,
    tax_config_id    UUID          REFERENCES tax_configurations(id),
    tax_rate         DECIMAL(5,2)  DEFAULT 0,
    tax_amount       DECIMAL(12,2) DEFAULT 0,
    total_price      DECIMAL(12,2) NOT NULL,
    display_order    INTEGER       DEFAULT 0,
    batch_number     VARCHAR(50),
    created_at       TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.3 payments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE payments (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id       UUID          NOT NULL REFERENCES hospitals(id),
    payment_number    VARCHAR(30)   NOT NULL UNIQUE,
    invoice_id        UUID          NOT NULL REFERENCES invoices(id),
    patient_id        UUID          NOT NULL REFERENCES patients(id),
    amount            DECIMAL(12,2) NOT NULL,
    currency          VARCHAR(3)    DEFAULT 'USD',
    payment_mode      VARCHAR(20)   NOT NULL,            -- 'cash','card','upi','wallet','bank_transfer','online','cheque','insurance'
    payment_reference VARCHAR(100),
    payment_date      DATE          NOT NULL,
    payment_time      TIME,
    status            VARCHAR(20)   DEFAULT 'completed', -- 'pending','completed','failed','reversed'
    received_by       UUID          REFERENCES users(id),
    notes             TEXT,
    created_at        TIMESTAMPTZ   DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.4 refunds
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE refunds (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id      UUID          NOT NULL REFERENCES hospitals(id),
    refund_number    VARCHAR(30)   NOT NULL UNIQUE,
    invoice_id       UUID          NOT NULL REFERENCES invoices(id),
    payment_id       UUID          NOT NULL REFERENCES payments(id),
    patient_id       UUID          NOT NULL REFERENCES patients(id),
    amount           DECIMAL(12,2) NOT NULL,
    reason_code      VARCHAR(50)   NOT NULL,     -- 'service_not_provided','billing_error','patient_request','duplicate','other'
    reason_detail    TEXT,
    status           VARCHAR(20)   DEFAULT 'pending',    -- 'pending','approved','processed','rejected'
    refund_mode      VARCHAR(20),
    refund_reference VARCHAR(100),
    requested_by     UUID          REFERENCES users(id),
    approved_by      UUID          REFERENCES users(id),
    processed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ   DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.5 credit_notes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE credit_notes (
    id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id            UUID          NOT NULL REFERENCES hospitals(id),
    credit_note_number     VARCHAR(30)   NOT NULL UNIQUE,
    invoice_id             UUID          NOT NULL REFERENCES invoices(id),
    patient_id             UUID          NOT NULL REFERENCES patients(id),
    amount                 DECIMAL(12,2) NOT NULL,
    reason                 TEXT          NOT NULL,
    status                 VARCHAR(20)   DEFAULT 'issued', -- 'issued','applied','expired'
    applied_to_invoice_id  UUID          REFERENCES invoices(id),
    valid_until            DATE,
    created_by             UUID          REFERENCES users(id),
    created_at             TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.6 daily_settlements
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE daily_settlements (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID          NOT NULL REFERENCES hospitals(id),
    settlement_date DATE          NOT NULL,
    cashier_user_id UUID          NOT NULL REFERENCES users(id),
    total_cash      DECIMAL(12,2) DEFAULT 0,
    total_card      DECIMAL(12,2) DEFAULT 0,
    total_online    DECIMAL(12,2) DEFAULT 0,
    total_other     DECIMAL(12,2) DEFAULT 0,
    total_collected DECIMAL(12,2) DEFAULT 0,
    total_refunds   DECIMAL(12,2) DEFAULT 0,
    net_amount      DECIMAL(12,2) DEFAULT 0,
    status          VARCHAR(20)   DEFAULT 'open',   -- 'open','closed','verified'
    verified_by     UUID          REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (hospital_id, settlement_date, cashier_user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10.1 insurance_providers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE insurance_providers (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id    UUID         NOT NULL REFERENCES hospitals(id),
    name           VARCHAR(200) NOT NULL,
    code           VARCHAR(20)  NOT NULL,
    contact_person VARCHAR(100),
    phone          VARCHAR(20),
    email          VARCHAR(255),
    address        TEXT,
    is_active      BOOLEAN      DEFAULT true,
    created_at     TIMESTAMPTZ  DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10.2 insurance_policies
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE insurance_policies (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID          NOT NULL REFERENCES patients(id),
    provider_id     UUID          NOT NULL REFERENCES insurance_providers(id),
    policy_number   VARCHAR(50)   NOT NULL,
    group_number    VARCHAR(50),
    member_id       VARCHAR(50),
    plan_name       VARCHAR(100),
    coverage_type   VARCHAR(30),             -- 'individual','family'
    coverage_amount DECIMAL(12,2),
    deductible      DECIMAL(12,2),
    copay_percent   DECIMAL(5,2),
    effective_from  DATE          NOT NULL,
    effective_to    DATE,
    is_primary      BOOLEAN       DEFAULT true,
    status          VARCHAR(20)   DEFAULT 'active',  -- 'active','expired','suspended'
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10.3 insurance_claims
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE insurance_claims (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id      UUID          NOT NULL REFERENCES hospitals(id),
    claim_number     VARCHAR(30)   NOT NULL UNIQUE,
    patient_id       UUID          NOT NULL REFERENCES patients(id),
    policy_id        UUID          NOT NULL REFERENCES insurance_policies(id),
    invoice_id       UUID          REFERENCES invoices(id),
    claim_amount     DECIMAL(12,2) NOT NULL,
    approved_amount  DECIMAL(12,2),
    status           VARCHAR(20)   DEFAULT 'submitted',
    submission_date  DATE,
    response_date    DATE,
    rejection_reason TEXT,
    notes            TEXT,
    documents        JSONB,
    created_by       UUID          REFERENCES users(id),
    created_at       TIMESTAMPTZ   DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   DEFAULT NOW()
);

-- Deferred FK: invoices.insurance_claim_id → insurance_claims
ALTER TABLE invoices
    ADD CONSTRAINT fk_invoices_insurance_claim
    FOREIGN KEY (insurance_claim_id) REFERENCES insurance_claims(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10.4 pre_authorizations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE pre_authorizations (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID          NOT NULL REFERENCES patients(id),
    policy_id           UUID          NOT NULL REFERENCES insurance_policies(id),
    service_description TEXT          NOT NULL,
    estimated_cost      DECIMAL(12,2) NOT NULL,
    status              VARCHAR(20)   DEFAULT 'requested',  -- 'requested','approved','denied','expired'
    auth_number         VARCHAR(50),
    approved_amount     DECIMAL(12,2),
    valid_from          DATE,
    valid_to            DATE,
    created_at          TIMESTAMPTZ   DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 2 (continued) — Pharmacy & Optical (depend on invoices)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.3 pharmacy_dispensing
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE pharmacy_dispensing (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id       UUID          NOT NULL REFERENCES hospitals(id),
    dispensing_number VARCHAR(30)   NOT NULL UNIQUE,
    prescription_id   UUID          REFERENCES prescriptions(id),
    patient_id        UUID          REFERENCES patients(id),
    sale_type         VARCHAR(20)   NOT NULL,            -- 'prescription','counter_sale'
    invoice_id        UUID          REFERENCES invoices(id),
    status            VARCHAR(20)   DEFAULT 'pending',   -- 'pending','dispensed','partial','cancelled'
    total_amount      DECIMAL(12,2) DEFAULT 0,
    discount_amount   DECIMAL(12,2) DEFAULT 0,
    tax_amount        DECIMAL(12,2) DEFAULT 0,
    net_amount        DECIMAL(12,2) DEFAULT 0,
    dispensed_by      UUID          REFERENCES users(id),
    dispensed_at      TIMESTAMPTZ,
    notes             TEXT,
    created_at        TIMESTAMPTZ   DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.2 medicine_batches  (needs goods_receipt_notes — FK added as deferred)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE medicine_batches (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id       UUID          NOT NULL REFERENCES medicines(id),
    batch_number      VARCHAR(50)   NOT NULL,
    grn_id            UUID,                              -- FK added later
    manufactured_date DATE,
    expiry_date       DATE          NOT NULL,
    purchase_price    DECIMAL(12,2),
    selling_price     DECIMAL(12,2),
    initial_quantity  INTEGER       NOT NULL,
    current_quantity  INTEGER       NOT NULL,
    is_expired        BOOLEAN       DEFAULT false,
    is_active         BOOLEAN       DEFAULT true,
    created_at        TIMESTAMPTZ   DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (medicine_id, batch_number)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.4 pharmacy_dispensing_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE pharmacy_dispensing_items (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    dispensing_id         UUID          NOT NULL REFERENCES pharmacy_dispensing(id),
    prescription_item_id  UUID          REFERENCES prescription_items(id),
    medicine_id           UUID          NOT NULL REFERENCES medicines(id),
    medicine_batch_id     UUID          NOT NULL REFERENCES medicine_batches(id),
    quantity              INTEGER       NOT NULL,
    unit_price            DECIMAL(12,2) NOT NULL,
    discount_percent      DECIMAL(5,2)  DEFAULT 0,
    tax_amount            DECIMAL(12,2) DEFAULT 0,
    total_price           DECIMAL(12,2) NOT NULL,
    substituted           BOOLEAN       DEFAULT false,
    original_medicine_name VARCHAR(200),
    created_at            TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.5 pharmacy_returns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE pharmacy_returns (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id   UUID          NOT NULL REFERENCES hospitals(id),
    return_number VARCHAR(30)   NOT NULL UNIQUE,
    dispensing_id UUID          NOT NULL REFERENCES pharmacy_dispensing(id),
    patient_id    UUID          REFERENCES patients(id),
    reason        VARCHAR(255)  NOT NULL,
    total_refund  DECIMAL(12,2) NOT NULL,
    status        VARCHAR(20)   DEFAULT 'pending',   -- 'pending','approved','processed','rejected'
    approved_by   UUID          REFERENCES users(id),
    restock       BOOLEAN       DEFAULT true,
    created_at    TIMESTAMPTZ   DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.6 pharmacy_return_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE pharmacy_return_items (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id         UUID          NOT NULL REFERENCES pharmacy_returns(id),
    dispensing_item_id UUID         NOT NULL REFERENCES pharmacy_dispensing_items(id),
    medicine_id       UUID          NOT NULL REFERENCES medicines(id),
    batch_id          UUID          NOT NULL REFERENCES medicine_batches(id),
    quantity          INTEGER       NOT NULL,
    refund_amount     DECIMAL(12,2) NOT NULL,
    restocked         BOOLEAN       DEFAULT false,
    created_at        TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.3 optical_orders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE optical_orders (
    id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id              UUID          NOT NULL REFERENCES hospitals(id),
    order_number             VARCHAR(30)   NOT NULL UNIQUE,
    patient_id               UUID          NOT NULL REFERENCES patients(id),
    optical_prescription_id  UUID          REFERENCES optical_prescriptions(id),
    invoice_id               UUID          REFERENCES invoices(id),
    order_type               VARCHAR(20)   NOT NULL,          -- 'new','replacement','repair_order'
    status                   VARCHAR(20)   DEFAULT 'placed',  -- 'placed','in_progress','quality_check','ready','delivered','cancelled'
    frame_product_id         UUID          REFERENCES optical_products(id),
    right_lens_product_id    UUID          REFERENCES optical_products(id),
    left_lens_product_id     UUID          REFERENCES optical_products(id),
    fitting_measurements     JSONB,
    total_amount             DECIMAL(12,2) DEFAULT 0,
    discount_amount          DECIMAL(12,2) DEFAULT 0,
    tax_amount               DECIMAL(12,2) DEFAULT 0,
    net_amount               DECIMAL(12,2) DEFAULT 0,
    estimated_delivery_date  DATE,
    delivered_at             TIMESTAMPTZ,
    notes                    TEXT,
    created_at               TIMESTAMPTZ   DEFAULT NOW(),
    updated_at               TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.4 optical_order_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE optical_order_items (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID          NOT NULL REFERENCES optical_orders(id),
    product_id      UUID          NOT NULL REFERENCES optical_products(id),
    quantity        INTEGER       NOT NULL DEFAULT 1,
    unit_price      DECIMAL(12,2) NOT NULL,
    discount_percent DECIMAL(5,2)  DEFAULT 0,
    tax_amount      DECIMAL(12,2) DEFAULT 0,
    total_price     DECIMAL(12,2) NOT NULL,
    created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.5 optical_repairs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE optical_repairs (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id           UUID          NOT NULL REFERENCES hospitals(id),
    repair_number         VARCHAR(30)   NOT NULL UNIQUE,
    patient_id            UUID          NOT NULL REFERENCES patients(id),
    item_description      VARCHAR(255)  NOT NULL,
    issue_description     TEXT          NOT NULL,
    status                VARCHAR(20)   DEFAULT 'received',  -- 'received','in_progress','completed','delivered','cancelled'
    estimated_cost        DECIMAL(12,2),
    actual_cost           DECIMAL(12,2),
    invoice_id            UUID          REFERENCES invoices(id),
    estimated_completion  DATE,
    completed_at          TIMESTAMPTZ,
    delivered_at          TIMESTAMPTZ,
    notes                 TEXT,
    created_at            TIMESTAMPTZ   DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 4 — INVENTORY & SUPPORT
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.1 suppliers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE suppliers (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id        UUID         NOT NULL REFERENCES hospitals(id),
    name               VARCHAR(200) NOT NULL,
    code               VARCHAR(20)  NOT NULL,
    contact_person     VARCHAR(100),
    phone              VARCHAR(20),
    email              VARCHAR(255),
    address            TEXT,
    tax_id             VARCHAR(50),
    payment_terms      VARCHAR(50),
    lead_time_days     INTEGER,
    rating             DECIMAL(3,1),
    product_categories TEXT[]       DEFAULT '{}',
    is_active          BOOLEAN      DEFAULT true,
    created_at         TIMESTAMPTZ  DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

COMMENT ON COLUMN suppliers.product_categories IS 
    'Array of product categories supplied by this vendor: medicine, optical, surgical, equipment, laboratory, disposable, other';

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.2 purchase_orders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE purchase_orders (
    id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id            UUID          NOT NULL REFERENCES hospitals(id),
    po_number              VARCHAR(30)   NOT NULL UNIQUE,
    supplier_id            UUID          NOT NULL REFERENCES suppliers(id),
    order_date             DATE          NOT NULL,
    expected_delivery_date DATE,
    status                 VARCHAR(20)   DEFAULT 'draft', -- 'draft','submitted','partially_received','received','cancelled'
    total_amount           DECIMAL(12,2) DEFAULT 0,
    tax_amount             DECIMAL(12,2) DEFAULT 0,
    notes                  TEXT,
    approved_by            UUID          REFERENCES users(id),
    created_by             UUID          REFERENCES users(id),
    created_at             TIMESTAMPTZ   DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.3 purchase_order_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE purchase_order_items (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID          NOT NULL REFERENCES purchase_orders(id),
    item_type         VARCHAR(20)   NOT NULL,       -- 'medicine','optical_product'
    item_id           UUID          NOT NULL,        -- FK to medicines or optical_products
    quantity_ordered  INTEGER       NOT NULL,
    quantity_received INTEGER       DEFAULT 0,
    unit_price        DECIMAL(12,2) NOT NULL,
    total_price       DECIMAL(12,2) NOT NULL,
    created_at        TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.4 goods_receipt_notes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE goods_receipt_notes (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id       UUID          NOT NULL REFERENCES hospitals(id),
    grn_number        VARCHAR(30)   NOT NULL UNIQUE,
    purchase_order_id UUID          REFERENCES purchase_orders(id),
    supplier_id       UUID          NOT NULL REFERENCES suppliers(id),
    receipt_date      DATE          NOT NULL,
    invoice_number    VARCHAR(50),
    invoice_date      DATE,
    total_amount      DECIMAL(12,2) DEFAULT 0,
    status            VARCHAR(20)   DEFAULT 'pending', -- 'pending','verified','accepted','rejected'
    verified_by       UUID          REFERENCES users(id),
    notes             TEXT,
    created_by        UUID          REFERENCES users(id),
    created_at        TIMESTAMPTZ   DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   DEFAULT NOW()
);

-- Deferred FK: medicine_batches.grn_id → goods_receipt_notes
ALTER TABLE medicine_batches
    ADD CONSTRAINT fk_medicine_batches_grn
    FOREIGN KEY (grn_id) REFERENCES goods_receipt_notes(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.5 grn_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE grn_items (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id            UUID          NOT NULL REFERENCES goods_receipt_notes(id),
    item_type         VARCHAR(20)   NOT NULL,       -- 'medicine','optical_product'
    item_id           UUID          NOT NULL,
    batch_number      VARCHAR(50),
    manufactured_date DATE,
    expiry_date       DATE,
    quantity_received INTEGER       NOT NULL,
    quantity_accepted INTEGER,
    quantity_rejected INTEGER       DEFAULT 0,
    unit_price        DECIMAL(12,2) NOT NULL,
    total_price       DECIMAL(12,2) NOT NULL,
    rejection_reason  VARCHAR(255),
    created_at        TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.6 stock_movements
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE stock_movements (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id    UUID          NOT NULL REFERENCES hospitals(id),
    item_type      VARCHAR(20)   NOT NULL,          -- 'medicine','optical_product'
    item_id        UUID          NOT NULL,
    batch_id       UUID,
    movement_type  VARCHAR(20)   NOT NULL,           -- 'stock_in','sale','dispensing','return','adjustment','transfer','expired','damaged'
    reference_type VARCHAR(30),                       -- 'grn','dispensing','return','adjustment','transfer'
    reference_id   UUID,
    quantity       INTEGER       NOT NULL,            -- Positive = in, Negative = out
    balance_after  INTEGER       NOT NULL,
    unit_cost      DECIMAL(12,2),
    notes          VARCHAR(255),
    performed_by   UUID          REFERENCES users(id),
    created_at     TIMESTAMPTZ   DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.7 stock_adjustments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE stock_adjustments (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id       UUID        NOT NULL REFERENCES hospitals(id),
    adjustment_number VARCHAR(30) NOT NULL UNIQUE,
    item_type         VARCHAR(20) NOT NULL,
    item_id           UUID        NOT NULL,
    batch_id          UUID,
    adjustment_type   VARCHAR(20) NOT NULL,        -- 'increase','decrease','write_off'
    quantity          INTEGER     NOT NULL,
    reason            VARCHAR(255) NOT NULL,
    approved_by       UUID        REFERENCES users(id),
    status            VARCHAR(20) DEFAULT 'pending', -- 'pending','approved','rejected'
    created_by        UUID        REFERENCES users(id),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.8 cycle_counts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE cycle_counts (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id  UUID        NOT NULL REFERENCES hospitals(id),
    count_number VARCHAR(30) NOT NULL UNIQUE,
    count_date   DATE        NOT NULL,
    status       VARCHAR(20) DEFAULT 'in_progress', -- 'in_progress','completed','verified'
    notes        TEXT,
    counted_by   UUID        REFERENCES users(id),
    verified_by  UUID        REFERENCES users(id),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.9 cycle_count_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE cycle_count_items (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_count_id   UUID        NOT NULL REFERENCES cycle_counts(id),
    item_type        VARCHAR(20) NOT NULL,
    item_id          UUID        NOT NULL,
    batch_id         UUID,
    system_quantity  INTEGER     NOT NULL,
    counted_quantity INTEGER     NOT NULL,
    variance         INTEGER     NOT NULL,          -- counted - system
    variance_reason  VARCHAR(255),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS & AUDIT
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 12.1 notifications
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE notifications (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id    UUID         NOT NULL REFERENCES hospitals(id),
    user_id        UUID         NOT NULL REFERENCES users(id),
    title          VARCHAR(200) NOT NULL,
    message        TEXT         NOT NULL,
    type           VARCHAR(30)  NOT NULL,            -- 'appointment','prescription','billing','inventory','system'
    priority       VARCHAR(10)  DEFAULT 'normal',    -- 'low','normal','high','urgent'
    reference_type VARCHAR(30),
    reference_id   UUID,
    is_read        BOOLEAN      DEFAULT false,
    read_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12.2 notification_templates
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE notification_templates (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id   UUID         REFERENCES hospitals(id),
    code          VARCHAR(50)  NOT NULL,
    channel       VARCHAR(20)  NOT NULL,              -- 'sms','email','whatsapp','in_app'
    locale        VARCHAR(10)  DEFAULT 'en',
    subject       VARCHAR(200),
    body_template TEXT         NOT NULL,
    is_active     BOOLEAN      DEFAULT true,
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (hospital_id, code, channel, locale)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12.3 notification_queue
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE notification_queue (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID         NOT NULL REFERENCES hospitals(id),
    channel         VARCHAR(20)  NOT NULL,
    recipient       VARCHAR(255) NOT NULL,
    subject         VARCHAR(200),
    body            TEXT         NOT NULL,
    status          VARCHAR(20)  DEFAULT 'pending',  -- 'pending','sent','failed','cancelled'
    attempts        INTEGER      DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    error_message   TEXT,
    scheduled_at    TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 13.1 audit_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id  UUID         REFERENCES hospitals(id),
    user_id      UUID         REFERENCES users(id),       -- NULL for system actions
    action       VARCHAR(20)  NOT NULL,                     -- 'create','update','delete','login','logout','export','print'
    entity_type  VARCHAR(50)  NOT NULL,
    entity_id    UUID,
    entity_name  VARCHAR(200),
    old_values   JSONB,
    new_values   JSONB,
    ip_address   VARCHAR(45),
    user_agent   VARCHAR(500),
    request_path VARCHAR(255),
    created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ID SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 14.2 id_sequences
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE id_sequences (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id      UUID        NOT NULL REFERENCES hospitals(id),
    hospital_code    CHAR(2)     NOT NULL,
    entity_type      VARCHAR(10) NOT NULL,          -- 'patient' or 'staff'
    role_gender_code CHAR(1)     NOT NULL,           -- M/F/O/D/N/S/A/P/R/T/X
    year_code        CHAR(2)     NOT NULL,           -- e.g., '26'
    month_code       CHAR(1)     NOT NULL,           -- 1-9,A,B,C
    last_sequence    INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (hospital_id, entity_type, role_gender_code, year_code, month_code)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 14.3 id_cards
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE id_cards (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id        UUID         NOT NULL REFERENCES hospitals(id),
    holder_type        VARCHAR(10)  NOT NULL,         -- 'patient' or 'user' (staff)
    holder_id          UUID         NOT NULL,
    reference_number   VARCHAR(12)  NOT NULL,          -- The 12-digit ID
    photo_url          VARCHAR(500),
    card_data_snapshot JSONB        NOT NULL,
    front_design_url   VARCHAR(500),
    back_design_url    VARCHAR(500),
    issued_at          TIMESTAMPTZ  DEFAULT NOW(),
    issued_by          UUID         REFERENCES users(id),
    revoked_at         TIMESTAMPTZ,                    -- NULL = active
    version            INTEGER      DEFAULT 1,
    created_at         TIMESTAMPTZ  DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 14.4 password_emails
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE password_emails (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL REFERENCES users(id),
    sent_by          UUID         NOT NULL REFERENCES users(id),
    sent_to_email    VARCHAR(255) NOT NULL,
    sent_at          TIMESTAMPTZ  DEFAULT NOW(),
    is_temp_password BOOLEAN      DEFAULT true,
    created_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Users
CREATE INDEX idx_users_email       ON users(email);
CREATE INDEX idx_users_active      ON users(is_active, hospital_id);
CREATE INDEX idx_users_refnum      ON users(reference_number);

-- Refresh tokens
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id, revoked_at);

-- Patients
CREATE INDEX idx_patients_phone ON patients(phone_country_code, phone_number) WHERE is_deleted = false;
CREATE INDEX idx_patients_name  ON patients(hospital_id, first_name, last_name) WHERE is_deleted = false;
CREATE INDEX idx_patients_prn   ON patients(patient_reference_number);
CREATE INDEX idx_patients_active ON patients(hospital_id, is_active) WHERE is_deleted = false;

-- Doctors
CREATE INDEX idx_doctors_hospital ON doctors(hospital_id, is_active);
CREATE INDEX idx_doctors_dept     ON doctors(department_id);

-- Appointments
CREATE INDEX idx_appointments_doctor_date ON appointments(doctor_id, appointment_date) WHERE is_deleted = false;
CREATE INDEX idx_appointments_patient     ON appointments(patient_id, appointment_date DESC) WHERE is_deleted = false;
CREATE INDEX idx_appointments_status      ON appointments(hospital_id, appointment_date, status) WHERE is_deleted = false;

-- Queue
CREATE INDEX idx_queue_doctor_date ON appointment_queue(doctor_id, queue_date, position);
CREATE INDEX idx_queue_status      ON appointment_queue(doctor_id, queue_date, status);

-- Medicines
CREATE INDEX idx_medicines_name    ON medicines(hospital_id, name);
CREATE INDEX idx_medicines_generic ON medicines(generic_name);
CREATE INDEX idx_medicines_barcode ON medicines(barcode) WHERE barcode IS NOT NULL;

-- Medicine batches
CREATE INDEX idx_batches_expiry ON medicine_batches(expiry_date) WHERE is_active = true;
CREATE INDEX idx_batches_stock  ON medicine_batches(medicine_id, is_active, current_quantity);

-- Prescriptions
CREATE INDEX idx_prescriptions_patient     ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_doctor      ON prescriptions(doctor_id);
CREATE INDEX idx_prescriptions_appointment ON prescriptions(appointment_id);
CREATE INDEX idx_prescriptions_status      ON prescriptions(status);
CREATE INDEX idx_prescriptions_created     ON prescriptions(created_at);
CREATE INDEX idx_prescription_items_rx     ON prescription_items(prescription_id);
CREATE INDEX idx_prescription_templates_doctor ON prescription_templates(doctor_id);
CREATE INDEX idx_prescription_versions_rx  ON prescription_versions(prescription_id);

-- Waitlists
CREATE INDEX idx_waitlist_doctor_date ON waitlists(doctor_id, preferred_date) WHERE is_deleted = false;
CREATE INDEX idx_waitlist_patient     ON waitlists(patient_id, preferred_date) WHERE is_deleted = false;
CREATE INDEX idx_waitlist_status      ON waitlists(status);

-- Invoices
CREATE INDEX idx_invoices_patient     ON invoices(patient_id, invoice_date DESC) WHERE is_deleted = false;
CREATE INDEX idx_invoices_date_status ON invoices(hospital_id, invoice_date, status) WHERE is_deleted = false;
CREATE INDEX idx_invoices_status      ON invoices(status);

-- Stock movements
CREATE INDEX idx_stock_movements_item ON stock_movements(item_type, item_id, created_at DESC);

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- Audit logs
CREATE INDEX idx_audit_entity   ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_user     ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_hospital ON audit_logs(hospital_id, created_at DESC);

-- ID cards
CREATE INDEX idx_id_cards_refnum ON id_cards(reference_number);
CREATE INDEX idx_id_cards_holder ON id_cards(holder_type, holder_id);

-- Password emails
CREATE INDEX idx_password_emails_user ON password_emails(user_id, sent_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTION: Calculate 12-digit HMS ID checksum
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION hms_calculate_checksum(prefix VARCHAR)
RETURNS CHAR(1) AS $$
DECLARE
    total   INTEGER := 0;
    i       INTEGER;
    ch      CHAR(1);
    val     INTEGER;
    check_val INTEGER;
BEGIN
    -- prefix must be exactly 6 characters: HHGYYM
    IF LENGTH(prefix) != 6 THEN
        RAISE EXCEPTION 'Prefix must be exactly 6 characters, got %', LENGTH(prefix);
    END IF;

    FOR i IN 1..6 LOOP
        ch := UPPER(SUBSTRING(prefix FROM i FOR 1));
        IF ch >= '0' AND ch <= '9' THEN
            val := ASCII(ch) - ASCII('0');
        ELSE
            val := ASCII(ch) - 55;   -- A=10, B=11, ...
        END IF;
        total := total + val * i;
    END LOOP;

    check_val := total % 36;
    IF check_val < 10 THEN
        RETURN CHR(ASCII('0') + check_val);
    ELSE
        RETURN CHR(55 + check_val);    -- 10=A, 11=B, ...
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTION: Generate next HMS 12-digit ID
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION hms_generate_id(
    p_hospital_id   UUID,
    p_hospital_code CHAR(2),
    p_entity_type   VARCHAR(10),   -- 'patient' or 'staff'
    p_gender_code   CHAR(1),
    p_year_code     CHAR(2),
    p_month_code    CHAR(1)
) RETURNS VARCHAR(12) AS $$
DECLARE
    v_sequence  INTEGER;
    v_prefix    VARCHAR(6);
    v_checksum  CHAR(1);
    v_id        VARCHAR(12);
BEGIN
    -- Upsert the sequence row and get next value
    INSERT INTO id_sequences (hospital_id, hospital_code, entity_type, role_gender_code, year_code, month_code, last_sequence)
    VALUES (p_hospital_id, p_hospital_code, p_entity_type, p_gender_code, p_year_code, p_month_code, 1)
    ON CONFLICT (hospital_id, entity_type, role_gender_code, year_code, month_code)
    DO UPDATE SET last_sequence = id_sequences.last_sequence + 1, updated_at = NOW()
    RETURNING last_sequence INTO v_sequence;

    -- Build prefix: HH + G + YY + M
    v_prefix := p_hospital_code || p_gender_code || p_year_code || p_month_code;

    -- Calculate checksum
    v_checksum := hms_calculate_checksum(v_prefix);

    -- Build final 12-digit ID
    v_id := v_prefix || v_checksum || LPAD(v_sequence::TEXT, 5, '0');

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — Schema complete (62+ tables, all indexes, helper functions)
-- ═══════════════════════════════════════════════════════════════════════════════


-- ==============================================================================
-- SECTION 2 — MULTI-TENANT SaaS CORE (saas_core)
-- Source: 05_multi_tenant_schema.sql
-- ==============================================================================

-- ============================================================================
-- HMS Multi-Tenant SaaS Schema Extension
-- Creates tables for tenant management, subscriptions, and module registry
-- ============================================================================

-- Create schema for SaaS core tables
CREATE SCHEMA IF NOT EXISTS saas_core;

-- ============================================================================
-- 1. TENANTS (Hospitals in SaaS context)
-- ============================================================================
CREATE TABLE saas_core.tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Organization details
    name                VARCHAR(255) NOT NULL,
    slug                VARCHAR(50) NOT NULL UNIQUE,
    code                VARCHAR(20) NOT NULL UNIQUE,
    
    -- Branding
    logo_url            VARCHAR(500),
    primary_color       VARCHAR(7) DEFAULT '#1E40AF',
    secondary_color     VARCHAR(7) DEFAULT '#3B82F6',
    
    -- Contact
    email               VARCHAR(255) NOT NULL,
    phone               VARCHAR(20),
    address_line_1      VARCHAR(255),
    address_line_2      VARCHAR(255),
    city                VARCHAR(100),
    state_province      VARCHAR(100),
    postal_code         VARCHAR(20),
    country             VARCHAR(3) DEFAULT 'USA',
    timezone            VARCHAR(50) DEFAULT 'UTC',
    default_currency    VARCHAR(3) DEFAULT 'USD',
    
    -- Registration info
    registration_number VARCHAR(100),
    tax_id              VARCHAR(50),
    
    -- Status
    status              VARCHAR(20) DEFAULT 'pending',
    is_verified         BOOLEAN DEFAULT false,
    verified_at         TIMESTAMPTZ,
    
    -- Onboarding
    onboarding_completed BOOLEAN DEFAULT false,
    onboarding_step     VARCHAR(50) DEFAULT 'profile',
    
    -- Admin user (first admin created for this tenant)
    admin_user_id       UUID,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON saas_core.tenants(slug);
CREATE INDEX idx_tenants_status ON saas_core.tenants(status);

-- ============================================================================
-- 2. SUBSCRIPTION PLANS
-- ============================================================================
CREATE TABLE saas_core.subscription_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(50) NOT NULL UNIQUE,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    
    -- Billing
    billing_cycle       VARCHAR(20) NOT NULL DEFAULT 'monthly',
    base_price          DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency            VARCHAR(3) DEFAULT 'USD',
    
    -- Limits
    max_users           INTEGER,
    max_patients        INTEGER,
    max_storage_gb      INTEGER,
    max_appointments_monthly INTEGER,
    
    -- Feature flags as JSONB
    features_enabled    JSONB DEFAULT '{}',
    
    -- Module access
    modules_included    UUID[] DEFAULT '{}',
    
    -- Availability
    is_public           BOOLEAN DEFAULT true,
    is_active           BOOLEAN DEFAULT true,
    sort_order          INTEGER DEFAULT 0,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. TENANT SUBSCRIPTIONS
-- ============================================================================
CREATE TABLE saas_core.tenant_subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES saas_core.tenants(id),
    plan_id             UUID NOT NULL REFERENCES saas_core.subscription_plans(id),
    
    -- Subscription period
    status              VARCHAR(20) DEFAULT 'trialing',
    trial_ends_at       TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end  TIMESTAMPTZ NOT NULL,
    
    -- Cancellation
    cancel_at_period_end BOOLEAN DEFAULT false,
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason VARCHAR(255),
    
    -- Payment
    payment_method      VARCHAR(20),
    billing_email       VARCHAR(255),
    
    -- Custom overrides
    custom_features     JSONB DEFAULT '{}',
    custom_limits       JSONB DEFAULT '{}',
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index: only one active subscription per tenant
CREATE UNIQUE INDEX idx_subscriptions_active_unique 
ON saas_core.tenant_subscriptions(tenant_id) 
WHERE status IN ('trialing', 'active', 'past_due');

CREATE INDEX idx_subscriptions_tenant ON saas_core.tenant_subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON saas_core.tenant_subscriptions(status);
CREATE INDEX idx_subscriptions_period_end ON saas_core.tenant_subscriptions(current_period_end);

-- ============================================================================
-- 4. MODULE REGISTRY
-- ============================================================================
CREATE TABLE saas_core.modules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(50) NOT NULL UNIQUE,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    category            VARCHAR(50) NOT NULL,
    
    -- Technical
    frontend_route_prefix VARCHAR(50),
    api_prefix          VARCHAR(50),
    icon                VARCHAR(50),
    
    -- Dependencies (array of module codes)
    required_modules    VARCHAR(50)[] DEFAULT '{}',
    
    -- Default permissions
    default_permissions JSONB DEFAULT '{}',
    
    -- Status
    is_core             BOOLEAN DEFAULT false,
    is_active           BOOLEAN DEFAULT true,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_modules_category ON saas_core.modules(category);
CREATE INDEX idx_modules_core ON saas_core.modules(is_core);

-- ============================================================================
-- 5. TENANT MODULE CONFIGURATION
-- ============================================================================
CREATE TABLE saas_core.tenant_modules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES saas_core.tenants(id),
    module_id           UUID NOT NULL REFERENCES saas_core.modules(id),
    
    -- Configuration
    is_enabled          BOOLEAN DEFAULT true,
    enabled_at          TIMESTAMPTZ,
    enabled_by          UUID,
    
    -- Feature flags within module
    feature_config      JSONB DEFAULT '{}',
    
    -- Custom limits for this tenant
    custom_limits       JSONB DEFAULT '{}',
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, module_id)
);

CREATE INDEX idx_tenant_modules_tenant ON saas_core.tenant_modules(tenant_id);
CREATE INDEX idx_tenant_modules_enabled ON saas_core.tenant_modules(tenant_id, is_enabled);

-- ============================================================================
-- 6. USAGE TRACKING
-- ============================================================================
CREATE TABLE saas_core.usage_tracking (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES saas_core.tenants(id),
    resource_type       VARCHAR(50) NOT NULL,
    period_year         INTEGER NOT NULL,
    period_month        INTEGER NOT NULL,
    
    usage_count         INTEGER DEFAULT 0,
    limit_reached_at    TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, resource_type, period_year, period_month)
);

CREATE INDEX idx_usage_tenant ON saas_core.usage_tracking(tenant_id);
CREATE INDEX idx_usage_period ON saas_core.usage_tracking(period_year, period_month);

-- ============================================================================
-- 7. BILLING INVOICES
-- ============================================================================
CREATE TABLE saas_core.billing_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES saas_core.tenants(id),
    subscription_id     UUID REFERENCES saas_core.tenant_subscriptions(id),
    
    invoice_number      VARCHAR(30) NOT NULL UNIQUE,
    status              VARCHAR(20) DEFAULT 'draft',
    
    -- Amounts
    subtotal            DECIMAL(12,2) NOT NULL,
    tax_amount          DECIMAL(12,2) DEFAULT 0,
    total               DECIMAL(12,2) NOT NULL,
    amount_paid         DECIMAL(12,2) DEFAULT 0,
    amount_due          DECIMAL(12,2) NOT NULL,
    
    -- Dates
    invoice_date        DATE NOT NULL,
    due_date            DATE NOT NULL,
    paid_at             TIMESTAMPTZ,
    
    -- Line items
    line_items          JSONB NOT NULL,
    
    -- Payment
    payment_method      VARCHAR(20),
    payment_reference   VARCHAR(100),
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_tenant ON saas_core.billing_invoices(tenant_id);
CREATE INDEX idx_invoices_status ON saas_core.billing_invoices(status);

-- ============================================================================
-- 8. AUDIT LOGS (Cross-tenant for Super Admin visibility)
-- ============================================================================
CREATE TABLE saas_core.audit_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID REFERENCES saas_core.tenants(id),
    user_id             UUID,
    user_type           VARCHAR(20) NOT NULL DEFAULT 'hospital',
    
    action              VARCHAR(50) NOT NULL,
    entity_type         VARCHAR(50) NOT NULL,
    entity_id           UUID,
    entity_name         VARCHAR(200),
    
    old_values          JSONB,
    new_values          JSONB,
    
    ip_address          VARCHAR(45),
    user_agent          VARCHAR(500),
    request_path        VARCHAR(255),
    
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON saas_core.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_user ON saas_core.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON saas_core.audit_logs(entity_type, entity_id);

-- ============================================================================
-- 10. SYSTEM SETTINGS (Global configuration)
-- ============================================================================
CREATE TABLE saas_core.system_settings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key         VARCHAR(100) NOT NULL UNIQUE,
    setting_value       TEXT,
    setting_type        VARCHAR(20) NOT NULL DEFAULT 'string',
    description         TEXT,
    is_editable         BOOLEAN DEFAULT true,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Note: Super Admin is managed through existing users table with role='super_admin'

-- Seed Subscription Plans
INSERT INTO saas_core.subscription_plans (code, name, description, billing_cycle, base_price, max_users, max_patients, features_enabled) VALUES
('free', 'Free', 'Basic features for single-doctor clinics', 'monthly', 0, 5, 500, 
 '{"appointments": true, "patients": true, "prescriptions": true, "billing_basic": true}'),

('starter', 'Starter', 'Essential features for growing practices', 'monthly', 49, 15, 2000,
 '{"appointments": true, "patients": true, "prescriptions": true, "pharmacy": true, "billing_full": true}'),

('professional', 'Professional', 'Full feature set for multi-specialty clinics', 'monthly', 149, 50, 10000,
 '{"appointments": true, "patients": true, "prescriptions": true, "pharmacy": true, "inventory": true, "billing_full": true, "insurance": true, "analytics": true}'),

('enterprise', 'Enterprise', 'Unlimited everything for hospital chains', 'monthly', 499, NULL, NULL,
 '{"all_modules": true, "custom_api": true, "dedicated_support": true, "multi_branch": true}'),

-- Internal/manually-assigned plan used for hospitals onboarded directly by
-- the platform team (no self-serve tier fits) — see 08_fix_hospitals_tenant_id.sql.
('unlimited', 'Unlimited', 'All modules included, no limits', 'monthly', 0, NULL, NULL,
 '{"all_modules": true}')
ON CONFLICT (code) DO NOTHING;

-- Seed Modules
INSERT INTO saas_core.modules (code, name, description, category, frontend_route_prefix, api_prefix, icon, is_core, required_modules) VALUES
('auth', 'Authentication', 'Login, logout, password management', 'core', '/auth', '/api/v1/auth', 'shield', true, '{}'),
('hospital_profile', 'Hospital Profile', 'Hospital branding, settings, departments', 'core', '/hospital', '/api/v1/hospital', 'building', true, '{}'),
('patients', 'Patient Management', 'Patient registration and records', 'core', '/patients', '/api/v1/patients', 'users', true, '{}'),
('doctors', 'Doctor Management', 'Doctor profiles and schedules', 'core', '/doctors', '/api/v1/doctors', 'stethoscope', true, '{}'),
('appointments', 'Appointments', 'Scheduling and queue management', 'core', '/appointments', '/api/v1/appointments', 'calendar', true, '{}'),
('prescriptions', 'Prescriptions', 'Prescription creation and management', 'clinical', '/prescriptions', '/api/v1/prescriptions', 'file-text', false, '{"patients","doctors"}'),
('pharmacy', 'Pharmacy', 'Medicine catalog and dispensing', 'clinical', '/pharmacy', '/api/v1/pharmacy', 'pill', false, '{"prescriptions"}'),
('billing', 'Billing', 'Invoices, payments, refunds', 'financial', '/billing', '/api/v1/billing', 'credit-card', false, '{"patients"}'),
('inventory', 'Inventory', 'Stock management and procurement', 'inventory', '/inventory', '/api/v1/inventory', 'package', false, '{}'),
('optical', 'Optical Store', 'Optical prescriptions and products', 'clinical', '/optical', '/api/v1/optical', 'glasses', false, '{"patients","inventory"}'),
('analytics', 'Analytics', 'Reports and insights', 'analytics', '/analytics', '/api/v1/analytics', 'bar-chart', false, '{}'),
('insurance', 'Insurance', 'Claims and provider management', 'financial', '/insurance', '/api/v1/insurance', 'umbrella', false, '{"billing"}');

-- Seed System Settings
INSERT INTO saas_core.system_settings (setting_key, setting_value, setting_type, description) VALUES
('platform_name', 'HMS Platform', 'string', 'Platform display name'),
('default_timezone', 'UTC', 'string', 'Default timezone for new hospitals'),
('default_currency', 'USD', 'string', 'Default currency for new hospitals'),
('trial_days', '14', 'number', 'Default trial period in days'),
('maintenance_mode', 'false', 'boolean', 'Platform maintenance mode'),
('max_file_upload_mb', '10', 'number', 'Maximum file upload size in MB'),
('session_timeout_minutes', '60', 'number', 'User session timeout');

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON saas_core.tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON saas_core.subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON saas_core.tenant_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_modules_updated_at BEFORE UPDATE ON saas_core.modules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_modules_updated_at BEFORE UPDATE ON saas_core.tenant_modules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_updated_at BEFORE UPDATE ON saas_core.usage_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON saas_core.billing_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS FOR CONVENIENCE
-- ============================================================================

-- View: Active tenants with subscription info
CREATE VIEW saas_core.v_active_tenants AS
SELECT 
    t.*,
    sp.name as plan_name,
    sp.code as plan_code,
    ts.status as subscription_status,
    ts.current_period_end,
    CASE 
        WHEN ts.status = 'trialing' THEN 'Trial'
        WHEN ts.status = 'active' THEN 'Active'
        WHEN ts.status = 'past_due' THEN 'Past Due'
        WHEN ts.status = 'suspended' THEN 'Suspended'
        ELSE 'Unknown'
    END as display_status
FROM saas_core.tenants t
LEFT JOIN saas_core.tenant_subscriptions ts ON t.id = ts.tenant_id 
    AND ts.status IN ('trialing', 'active', 'past_due')
LEFT JOIN saas_core.subscription_plans sp ON ts.plan_id = sp.id
WHERE t.status = 'active';

-- View: Tenant modules with details
CREATE VIEW saas_core.v_tenant_modules AS
SELECT 
    tm.*,
    m.code as module_code,
    m.name as module_name,
    m.description as module_description,
    m.category,
    m.is_core,
    m.icon,
    m.frontend_route_prefix,
    m.api_prefix
FROM saas_core.tenant_modules tm
JOIN saas_core.modules m ON tm.module_id = m.id;

-- ============================================================================
-- DONE
-- ============================================================================


-- ==============================================================================
-- SECTION 3 — TENANT LINKS, AUDIT, RLS & SECURITY
-- Source: 07_security_schema_fixes.sql
-- ==============================================================================

-- HMS Multi-Tenant Security Fixes - Database Schema Alterations
-- Run this after the current 05_multi_tenant_schema.sql
-- Date: 2026-05-08
-- Purpose: Fix critical schema relationships for proper multi-tenant isolation

-- ============================================================
-- 1. ADD EXPLICIT TENANT LINK TO HOSPITALS (Critical Fix)
-- ============================================================
-- Currently hospitals have no direct FK to tenants, only implied via saas_core schema
-- This ensures complete data integrity

DO $$
DECLARE
    v_tenant_id UUID;
    v_hospitals_without_tenant INTEGER;
BEGIN
    IF to_regclass('public.hospitals') IS NULL THEN
        RAISE NOTICE 'Skipping hospitals tenant link: public.hospitals does not exist';
        RETURN;
    END IF;

    -- 1) Add column first (nullable), then backfill, then add FK/NOT NULL.
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'hospitals'
          AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.hospitals ADD COLUMN tenant_id UUID;
    END IF;

    -- Backfill from first available tenant (replace with explicit mapping in production).
    SELECT st.id
    INTO v_tenant_id
    FROM saas_core.tenants st
    ORDER BY st.created_at NULLS LAST, st.id
    LIMIT 1;

    IF v_tenant_id IS NOT NULL THEN
        UPDATE public.hospitals
        SET tenant_id = v_tenant_id
        WHERE tenant_id IS NULL;
    ELSE
        RAISE NOTICE 'No rows found in saas_core.tenants; hospitals.tenant_id left NULL. Backfill and re-run.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'hospitals_tenant_id_fkey'
          AND conrelid = 'public.hospitals'::regclass
    ) THEN
        ALTER TABLE public.hospitals
        ADD CONSTRAINT hospitals_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id);
    END IF;

    SELECT COUNT(*)
    INTO v_hospitals_without_tenant
    FROM public.hospitals
    WHERE tenant_id IS NULL;

    IF v_hospitals_without_tenant = 0 THEN
        ALTER TABLE public.hospitals
        ALTER COLUMN tenant_id SET NOT NULL;
    ELSE
        RAISE NOTICE 'hospitals.tenant_id remains nullable (% rows without tenant)', v_hospitals_without_tenant;
    END IF;
END $$;

-- Create index for fast tenant lookups
CREATE INDEX IF NOT EXISTS idx_hospitals_tenant_id ON public.hospitals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hospitals_tenant_active ON public.hospitals(tenant_id, is_active);


-- ============================================================
-- 2. AUDIT LOG TABLE FOR COMPLIANCE
-- ============================================================
-- Track all critical operations with full tenant context for compliance/forensics

CREATE TABLE IF NOT EXISTS saas_core.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    tenant_id UUID NOT NULL REFERENCES saas_core.tenants(id),
    user_id UUID REFERENCES public.users(id),
    hospital_id UUID REFERENCES public.hospitals(id),
    
    -- Action details
    action VARCHAR(50) NOT NULL,  -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'PERMISSION_DENIED'
    resource_type VARCHAR(50),    -- 'patient', 'user', 'invoice', etc.
    resource_id UUID,
    
    -- Changes
    old_values JSONB,
    new_values JSONB,
    
    -- Metadata
    ip_address INET,
    user_agent VARCHAR(500),
    severity VARCHAR(20) DEFAULT 'INFO',  -- 'INFO', 'WARNING', 'CRITICAL'
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill schema if audit_logs already existed from a previous partial migration.
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS hospital_id UUID;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(50);
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS resource_type VARCHAR(50);
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS resource_id UUID;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS old_values JSONB;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS new_values JSONB;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500);
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'INFO';
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE saas_core.audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_audit_tenant_created
    ON saas_core.audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_created
    ON saas_core.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_severity
    ON saas_core.audit_logs(action, severity, created_at DESC);

COMMENT ON TABLE saas_core.audit_logs IS 'Immutable audit trail for compliance and security forensics';


-- ============================================================
-- 3. SOFT DELETE IMPROVEMENTS - ENSURE DATA INTEGRITY
-- ============================================================
-- Add cascade delete constraints that respect tenant isolation

-- Verify cascade delete on users table
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_created_by_fkey,
ADD CONSTRAINT users_created_by_fkey 
    FOREIGN KEY (created_by) 
    REFERENCES public.users(id) 
    ON DELETE SET NULL;

-- Verify cascade delete on patients
ALTER TABLE public.patients
DROP CONSTRAINT IF EXISTS patients_created_by_fkey,
ADD CONSTRAINT patients_created_by_fkey 
    FOREIGN KEY (created_by) 
    REFERENCES public.users(id) 
    ON DELETE SET NULL;

ALTER TABLE public.patients
DROP CONSTRAINT IF EXISTS patients_updated_by_fkey,
ADD CONSTRAINT patients_updated_by_fkey 
    FOREIGN KEY (updated_by) 
    REFERENCES public.users(id) 
    ON DELETE SET NULL;


-- ============================================================
-- 4. TENANT STATUS VALIDATION CONSTRAINTS
-- ============================================================
-- Ensure only active tenants can be used

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_subscription_status'
          AND conrelid = 'saas_core.tenant_subscriptions'::regclass
    ) THEN
        ALTER TABLE saas_core.tenant_subscriptions
        ADD CONSTRAINT check_subscription_status
            CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_tenant_status'
          AND conrelid = 'saas_core.tenants'::regclass
    ) THEN
        ALTER TABLE saas_core.tenants
        ADD CONSTRAINT check_tenant_status
            CHECK (status IN ('pending', 'active', 'suspended', 'cancelled'));
    END IF;
END $$;


-- ============================================================
-- 5. MODULE DEPENDENCY VALIDATION
-- ============================================================
-- Ensure modules can't be enabled without their dependencies

CREATE TABLE IF NOT EXISTS saas_core.module_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_name VARCHAR(50) NOT NULL,
    depends_on VARCHAR(50) NOT NULL,
    is_optional BOOLEAN DEFAULT FALSE,
    
    UNIQUE(module_name, depends_on)
);

-- Populate module dependencies
INSERT INTO saas_core.module_dependencies (module_name, depends_on, is_optional)
VALUES
    ('pharmacy', 'patients', FALSE),
    ('pharmacy', 'users', FALSE),
    ('inventory', 'suppliers', FALSE),
    ('optical', 'patients', FALSE),
    ('optical', 'prescriptions', FALSE),
    ('billing', 'invoices', FALSE),
    ('billing', 'insurance', FALSE),
    ('billing', 'patients', FALSE),
    ('reports', 'patients', FALSE),
    ('reports', 'appointments', FALSE)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 6. USAGE TRACKING TABLE
-- ============================================================
-- Track daily usage metrics for each tenant (API calls, resource counts)

CREATE TABLE IF NOT EXISTS saas_core.usage_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES saas_core.tenants(id) ON DELETE CASCADE,
    
    -- Metrics date
    metric_date DATE NOT NULL,
    
    -- Counters
    api_calls_count BIGINT DEFAULT 0,
    users_count INT DEFAULT 0,
    patients_count INT DEFAULT 0,
    appointments_count INT DEFAULT 0,
    
    -- Storage
    storage_bytes_used BIGINT DEFAULT 0,
    
    -- Timestamps
    recorded_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_date
    ON saas_core.usage_metrics(tenant_id, metric_date DESC);

COMMENT ON TABLE saas_core.usage_metrics IS 'Daily usage metrics per tenant for billing and monitoring';


-- ============================================================
-- 7. RATE LIMITING TABLE (for persistent rate limit state)
-- ============================================================
-- Track request counts per tenant for rate limiting

CREATE TABLE IF NOT EXISTS saas_core.rate_limit_buckets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES saas_core.tenants(id),
    
    -- Bucket window
    window_start TIMESTAMPTZ NOT NULL,
    window_duration_seconds INT NOT NULL DEFAULT 60,
    
    -- Counts
    request_count INT DEFAULT 0,
    
    -- Auto-cleanup
    expires_at TIMESTAMPTZ NOT NULL,

    UNIQUE(tenant_id, window_start, window_duration_seconds)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_expires
    ON saas_core.rate_limit_buckets(expires_at);

-- Auto-cleanup old rate limit buckets
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM saas_core.rate_limit_buckets 
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (in PostgreSQL: use pg_cron extension)
-- SELECT cron.schedule('cleanup_rate_limits', '0 */1 * * *', 'SELECT cleanup_expired_rate_limits()');


-- ============================================================
-- 8. TENANT ONBOARDING STATE TABLE
-- ============================================================
-- Track tenant onboarding progress

CREATE TABLE IF NOT EXISTS saas_core.tenant_onboarding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES saas_core.tenants(id) ON DELETE CASCADE,
    
    -- Onboarding steps
    profile_completed BOOLEAN DEFAULT FALSE,
    billing_completed BOOLEAN DEFAULT FALSE,
    team_invited BOOLEAN DEFAULT FALSE,
    first_patient_created BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tenant
    ON saas_core.tenant_onboarding(tenant_id);


-- ============================================================
-- 9. SECURITY: ROW-LEVEL SECURITY (PostgreSQL ONLY)
-- ============================================================
-- Enable RLS on critical tables to add database-level security

-- Enable RLS
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS patients_hospital_isolation ON public.patients;
DROP POLICY IF EXISTS appointments_hospital_isolation ON public.appointments;
DROP POLICY IF EXISTS prescriptions_hospital_isolation ON public.prescriptions;
DROP POLICY IF EXISTS invoices_hospital_isolation ON public.invoices;

-- Create isolation policies (basic example - adjust to your needs)
CREATE POLICY patients_hospital_isolation ON public.patients
    USING (
        hospital_id = ANY(
            SELECT h.id FROM public.hospitals h
            WHERE h.tenant_id = current_setting('app.current_tenant_id')::uuid
        )
    );

-- NOTE: RLS requires setting 'app.current_tenant_id' before each query
-- This is done in the application layer via set_config()


-- ============================================================
-- 10. PERFORMANCE: CRITICAL INDEXES FOR MULTI-TENANT QUERIES
-- ============================================================

-- Patient queries
CREATE INDEX IF NOT EXISTS idx_patients_hospital_active ON public.patients(hospital_id, is_deleted, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_hospital_reference ON public.patients(hospital_id, patient_reference_number);

-- Appointment queries
CREATE INDEX IF NOT EXISTS idx_appointments_hospital_date ON public.appointments(hospital_id, appointment_date DESC);

-- User queries
CREATE INDEX IF NOT EXISTS idx_users_hospital_active ON public.users(hospital_id, is_deleted, is_active);

-- Invoice queries
CREATE INDEX IF NOT EXISTS idx_invoices_hospital_created ON public.invoices(hospital_id, created_at DESC);

-- Inventory queries (optional table in some deployments)
DO $$
BEGIN
    IF to_regclass('public.inventory') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_hospital_active
            ON public.inventory(hospital_id, is_deleted);
    ELSE
        RAISE NOTICE 'Skipping inventory index: public.inventory does not exist';
    END IF;
END $$;


-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these to verify the schema is correct:

-- Check all hospitals have tenant_id:
-- SELECT COUNT(*) as hospitals_without_tenant FROM hospitals WHERE tenant_id IS NULL;

-- Check FK relationships:
-- SELECT * FROM information_schema.table_constraints 
-- WHERE table_name='hospitals' AND constraint_type='FOREIGN KEY';

-- List all indexes:
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' OR schemaname = 'saas_core';


-- ============================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================
/*
-- Remove new columns/tables
ALTER TABLE public.hospitals DROP COLUMN tenant_id;
DROP TABLE saas_core.audit_logs;
DROP TABLE saas_core.module_dependencies;
DROP TABLE saas_core.usage_metrics;
DROP TABLE saas_core.rate_limit_buckets;
DROP TABLE saas_core.tenant_onboarding;
DROP FUNCTION cleanup_expired_rate_limits();
*/


-- ==============================================================================
-- SECTION 4 — INVENTORY: supplier product categories
-- Source: inventory_alter.sql
-- ==============================================================================

-- ============================================================================
-- HMS - Inventory Alter Script: Add product_categories to suppliers table
-- ============================================================================
-- This script adds a column to track which product categories a supplier
-- provides (medicine, optical, surgical, equipment, etc.)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADD COLUMN: product_categories (ARRAY of text)
-- ─────────────────────────────────────────────────────────────────────────────
-- This column stores an array of product category names that the supplier
-- specializes in. Example: {'medicine', 'surgical'} or {'optical', 'equipment'}
--
-- Available categories:
--   - medicine      : Pharmaceutical medicines and drugs
--   - optical       : Optical products (frames, lenses, contact lenses)
--   - surgical      : Surgical instruments and consumables
--   - equipment     : Medical equipment and devices
--   - laboratory    : Laboratory reagents and consumables
--   - disposable    : Disposable medical supplies
--   - other         : Other products not in above categories
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS product_categories TEXT[] DEFAULT '{}';

-- Add a comment to document the column
COMMENT ON COLUMN suppliers.product_categories IS 
    'Array of product categories supplied by this vendor: medicine, optical, surgical, equipment, laboratory, disposable, other';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SEED DATA: Update existing suppliers with appropriate product categories
-- ─────────────────────────────────────────────────────────────────────────────
-- These UPDATE statements assign product categories to existing suppliers
-- based on their typical business focus. Adjust as needed for your data.
-- ─────────────────────────────────────────────────────────────────────────────

-- Update suppliers that are primarily medicine/pharma suppliers
UPDATE suppliers
SET product_categories = ARRAY['medicine', 'disposable']
WHERE LOWER(name) LIKE '%pharma%' 
   OR LOWER(name) LIKE '%drug%' 
   OR LOWER(name) LIKE '%medicine%'
   OR LOWER(name) LIKE '%pharmaceutical%';

-- Update suppliers that are optical/eye care related
UPDATE suppliers
SET product_categories = ARRAY['optical']
WHERE LOWER(name) LIKE '%optical%' 
   OR LOWER(name) LIKE '%vision%' 
   OR LOWER(name) LIKE '%eye%'
   OR LOWER(name) LIKE '%lens%';

-- Update suppliers that are surgical/medical equipment suppliers
UPDATE suppliers
SET product_categories = ARRAY['surgical', 'equipment']
WHERE LOWER(name) LIKE '%surgical%' 
   OR LOWER(name) LIKE '%equipment%' 
   OR LOWER(name) LIKE '%medical devices%'
   OR LOWER(name) LIKE '%instruments%';

-- Update suppliers that are laboratory related
UPDATE suppliers
SET product_categories = ARRAY['laboratory']
WHERE LOWER(name) LIKE '%laboratory%' 
   OR LOWER(name) LIKE '%lab%' 
   OR LOWER(name) LIKE '%diagnostic%'
   OR LOWER(name) LIKE '%reagent%';

-- Update general/wholesale suppliers (those not matching above patterns)
UPDATE suppliers
SET product_categories = ARRAY['medicine', 'disposable', 'other']
WHERE product_categories = '{}' 
   OR product_categories IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. OPTIONAL: Add CHECK constraint to validate categories (PostgreSQL 12+)
-- ─────────────────────────────────────────────────────────────────────────────
-- Uncomment the following if you want to enforce valid category values:
--
-- ALTER TABLE suppliers
--     ADD CONSTRAINT chk_product_categories
--     CHECK (
--         product_categories IS NULL OR 
--         product_categories <@ ARRAY['medicine', 'optical', 'surgical', 'equipment', 'laboratory', 'disposable', 'other']
--     );
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. OPTIONAL: Create index for faster filtering by product category
-- ─────────────────────────────────────────────────────────────────────────────
-- Uncomment if you need to frequently query suppliers by category:
--
-- CREATE INDEX IF NOT EXISTS idx_suppliers_product_categories 
--     ON suppliers USING GIN (product_categories);
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================================================================
-- END OF ALTER SCRIPT
-- ============================================================================


-- ==============================================================================
-- SECTION 5 — COMMON (GLOBAL) MEDICINES
-- Source: 09_common_medicines.sql
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 09_common_medicines.sql
-- Platform-wide "common" medicines usable by hospitals that do NOT have the
-- inventory module (so they can still prescribe). Common/global medicines have
-- hospital_id = NULL and is_global = TRUE, and are managed by the super admin.
-- ─────────────────────────────────────────────────────────────────────────────

-- Allow medicines that are not owned by any single hospital.
ALTER TABLE medicines ALTER COLUMN hospital_id DROP NOT NULL;

-- Flag for the shared, cross-tenant formulary.
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;

-- Fast lookup of the global formulary.
CREATE INDEX IF NOT EXISTS idx_medicines_is_global ON medicines(is_global) WHERE is_global = TRUE;


-- ==============================================================================
-- SECTION 6 — OPTICAL STORE: batch/lot stock tracking
-- Source: 10_optical_batches.sql
-- ==============================================================================

-- optical_products, optical_prescriptions, optical_orders, optical_order_items
-- already exist (Section 1). This adds the one missing piece — optical_batches
-- — so optical stock is tracked the same way medicine_batches tracks Pharmacy
-- stock, then backfills existing optical_products.current_stock into opening
-- batches so no existing seed stock is lost when batches become the source of
-- truth. Mirrors medicine_batches, except expiry_date is nullable: frames/
-- solutions/accessories don't expire, only contact lenses meaningfully do.

CREATE TABLE IF NOT EXISTS optical_batches (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    optical_product_id  UUID          NOT NULL REFERENCES optical_products(id),
    batch_number        VARCHAR(50)   NOT NULL,
    grn_id              UUID          REFERENCES goods_receipt_notes(id),
    manufactured_date   DATE,
    expiry_date         DATE,
    purchase_price      NUMERIC,
    selling_price       NUMERIC,
    initial_quantity    INTEGER       NOT NULL DEFAULT 0,
    current_quantity    INTEGER       NOT NULL DEFAULT 0,
    is_expired          BOOLEAN       DEFAULT false,
    is_active           BOOLEAN       DEFAULT true,
    created_at          TIMESTAMPTZ   DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (optical_product_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_optical_batches_product ON optical_batches(optical_product_id);
CREATE INDEX IF NOT EXISTS idx_optical_batches_expiry ON optical_batches(expiry_date);

-- optical_order_items needs a batch reference now that sales decrement a
-- specific batch (FEFO) instead of a flat current_stock counter.
ALTER TABLE optical_order_items ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES optical_batches(id);

-- Backfill: one opening batch per existing product with stock on hand, so
-- seeded optical_products rows keep their current_stock instead of silently
-- going to zero once optical_batches becomes the source of truth. Null expiry
-- = "never expires" under the FEFO rule used by the service layer. Guarded on
-- "product has no batches yet at all" rather than ON CONFLICT on batch_number
-- — the batch_number embeds today's date, so re-running this on a later day
-- would otherwise insert a second opening batch (and silently double stock)
-- instead of being a no-op.
INSERT INTO optical_batches (optical_product_id, batch_number, expiry_date, initial_quantity, current_quantity, purchase_price, selling_price)
SELECT
    op.id,
    'OPENING-' || to_char(NOW(), 'YYYYMMDD'),
    NULL,
    COALESCE(op.current_stock, 0),
    COALESCE(op.current_stock, 0),
    op.purchase_price,
    op.selling_price
FROM optical_products op
WHERE COALESCE(op.current_stock, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM optical_batches ob WHERE ob.optical_product_id = op.id);

-- optical_products.current_stock is superseded by SUM(optical_batches) —
-- mirrors how Medicine has no stock column at all, batches are the only
-- source of truth. Not dropping the column (no destructive drops in this
-- migration history); just marking it dead so it isn't read by mistake.
COMMENT ON COLUMN optical_products.current_stock IS
  'DEPRECATED — unused since optical_batches was introduced. Stock is now SUM(optical_batches.current_quantity) for active batches, mirroring Medicine/MedicineBatch.';

-- Module-dependency reconciliation: Optical is self-contained (its own
-- prescription model, its own standalone batch stock-in path), so it does
-- not hard-require Inventory or the clinical Prescriptions module. Settle
-- the three previously-disagreeing, currently-unenforced dependency sources
-- down to just "patients".
UPDATE saas_core.modules SET required_modules = ARRAY['patients'] WHERE code = 'optical';

DELETE FROM saas_core.module_dependencies WHERE module_name = 'optical' AND depends_on = 'prescriptions';
DELETE FROM saas_core.module_dependencies WHERE module_name = 'optical' AND depends_on = 'inventory';


-- ==============================================================================
-- SECTION 7 — SECURITY: access-token revocation (blocklist)
-- Source: security_updates.sql
-- ==============================================================================

-- Addresses audit findings C1 (logout is a no-op) and C2 (no real refresh-token
-- rotation) from SECURITY_AUDIT.md. The refresh_tokens table already exists
-- (Section 1) and is reused as-is for real refresh-token rotation — this adds
-- the access-token blocklist table.

-- Every logout / password-change / account-deactivation inserts the `jti` of
-- the still-valid access token here so get_current_user can reject it (C1).
-- Rows are pruned once the underlying token would have expired anyway.
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti           UUID        PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL
);

-- Used by prune_expired() housekeeping.
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON revoked_tokens (expires_at);

-- Used to revoke all outstanding sessions for a user (password change / disable).
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user_id ON revoked_tokens (user_id);

-- Fast lookup during /auth/refresh (rotated, single-use refresh tokens).
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);

-- Housekeeping view: tokens still blocking that are past expiry. Useful for
-- ops monitoring; CREATE OR REPLACE keeps re-runs clean.
CREATE OR REPLACE VIEW v_revoked_tokens_expired AS
SELECT jti, user_id, revoked_at, expires_at
FROM revoked_tokens
WHERE expires_at < now();

-- ############################################################################
-- End of 01_full_schema.sql
-- ############################################################################
