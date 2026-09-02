-- ==============================================================================
-- SEED — PRODUCTION ESSENTIALS (no demo/dev/test data)
--
-- One consolidated, idempotent file with every piece of SEED DATA (not
-- schema) the application needs to run without errors in production. Built
-- by reading every file in database_hole/ and deploy/ and pulling out just
-- the "data only" parts — see database_hole/README.md's own File Reference
-- table, which already marks each file as schema vs. data. Nothing here
-- was invented for this file; every statement is copied or adapted from an
-- existing migration or from deploy/flush_and_reseed_database.py's Python
-- seed functions (translated to plain SQL so this is runnable with a single
-- `psql -f`, no Python/venv needed).
--
-- WHAT THIS FILE IS NOT:
--   - Not the schema. Run 01_full_schema.sql (+ 02 for eye hospitals, then
--     05/07/08/09/14/15/16 and the dated column-adding migrations) FIRST —
--     see README.md sections 4-6. This file assumes every table it inserts
--     into already exists.
--   - Not demo data. There is no fictional hospital, patient, doctor, or
--     test staff account anywhere in this file — those files
--     (03_seed_data.sql, 04_reference_queries.sql, 06_seed_reference_data.sql)
--     were already deliberately deleted from this project; this file does
--     not reintroduce anything like them.
--   - Not the Super Admin bootstrap. Creating the one login you use to get
--     into the app at all requires a bcrypt password hash and is already
--     handled safely (with a "does one already exist?" guard and a
--     destructive-data warning) by deploy/flush_and_reseed_database.py —
--     see README.md section 6. Run that script after this file. Hardcoding
--     a default admin password into a file meant to sit in source control
--     is deliberately avoided here.
--
-- WHAT THIS FILE IS: every piece of reference/config data a hospital needs
-- to actually be usable once created — the module registry (what "Pharmacy",
-- "Lab", "Optical" etc. even are, and what each depends on), system
-- settings, the 14 fixed system roles (including lab_technician, whose
-- absence historically made "Lab Technician" staff accounts silently get no
-- role at all — see 11_lab_technician_role.sql), the placeholder Platform
-- hospital the Super Admin FK needs, the General Billing module, and your
-- real client-supplied lab test catalog + MHC/HHC health-checkup packages.
--
-- IDEMPOTENT — every statement here is safe to run more than once, and safe
-- to run against a database that already has real hospitals/data in it.
-- Nothing here TRUNCATEs, DROPs, or DELETEs anything.
--
-- RUN THIS AGAIN after creating each new hospital — the lab test catalog and
-- MHC/HHC panel sections loop over every row currently in `hospitals` (same
-- portable design as deploy/seed_lab_test_panels.py), so a hospital created
-- after the last time this ran won't have those rows yet until you re-run it.
-- On a hospital that already has them, re-running is a safe no-op.
--
-- Usage:
--   psql -U hms_user -d hms_db -f database_hole/seed_production_essentials.sql
-- ==============================================================================


-- ──────────────────────────────────────────────────────────────────────────
-- 1. CORE MODULE REGISTRY, SYSTEM SETTINGS, MODULE DEPENDENCIES
--
-- The real platform infrastructure 01_full_schema.sql originally seeded
-- (see its own SEED DATA section) — reproduced here idempotently so it can
-- be re-applied without re-running that whole schema file. Table-creation
-- guards match deploy/flush_and_reseed_database.py's own "self-healing"
-- CREATE TABLE IF NOT EXISTS (a real server was once found missing
-- saas_core.module_dependencies entirely, from an earlier schema version).
-- subscription_plans is deliberately left with NO rows — the client defines
-- their own plan(s) via the Super Admin UI after logging in, not predefined
-- ones invented for this project.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saas_core.subscription_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(50) NOT NULL UNIQUE,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    billing_cycle       VARCHAR(20) NOT NULL DEFAULT 'monthly',
    base_price          DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency            VARCHAR(3) DEFAULT 'USD',
    max_users           INTEGER,
    max_patients        INTEGER,
    max_storage_gb      INTEGER,
    max_appointments_monthly INTEGER,
    features_enabled    JSONB DEFAULT '{}',
    modules_included    UUID[] DEFAULT '{}',
    is_public           BOOLEAN DEFAULT true,
    is_active           BOOLEAN DEFAULT true,
    sort_order          INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_core.modules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(50) NOT NULL UNIQUE,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    category            VARCHAR(50) NOT NULL,
    frontend_route_prefix VARCHAR(50),
    api_prefix          VARCHAR(50),
    icon                VARCHAR(50),
    required_modules    VARCHAR(50)[] DEFAULT '{}',
    default_permissions JSONB DEFAULT '{}',
    is_core             BOOLEAN DEFAULT false,
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_core.system_settings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key         VARCHAR(100) NOT NULL UNIQUE,
    setting_value       TEXT,
    setting_type        VARCHAR(20) NOT NULL DEFAULT 'string',
    description         TEXT,
    is_editable         BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_core.module_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_name VARCHAR(50) NOT NULL,
    depends_on VARCHAR(50) NOT NULL,
    is_optional BOOLEAN DEFAULT FALSE,
    UNIQUE(module_name, depends_on)
);

-- Every selectable module in the app, including 'general_billing' (added
-- 2026-08-13, folded in here rather than kept as a separate file) and 'lab'
-- (the one load-bearing row preserved from the now-deleted
-- 06_seed_reference_data.sql — without it, "Laboratory" never appears in
-- the per-hospital module toggle UI at all).
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
('insurance', 'Insurance', 'Claims and provider management', 'financial', '/insurance', '/api/v1/insurance', 'umbrella', false, '{"billing"}'),
('lab', 'Laboratory', 'Lab test catalog, ordering, sample tracking, and results', 'clinical', '/lab', '/api/v1/lab', 'flask', false, '{"patients","prescriptions"}'),
('general_billing', 'General Billing', 'Free-form billing for miscellaneous charges not tied to OPD, Pharmacy, or Optical', 'financial', '/billing/general-billing', '/api/v1/invoices', 'point_of_sale', false, '{"billing"}')
ON CONFLICT (code) DO NOTHING;

INSERT INTO saas_core.system_settings (setting_key, setting_value, setting_type, description) VALUES
('platform_name', 'HMS Platform', 'string', 'Platform display name'),
('default_timezone', 'UTC', 'string', 'Default timezone for new hospitals'),
('default_currency', 'USD', 'string', 'Default currency for new hospitals'),
('trial_days', '14', 'number', 'Default trial period in days'),
('maintenance_mode', 'false', 'boolean', 'Platform maintenance mode'),
('max_file_upload_mb', '10', 'number', 'Maximum file upload size in MB'),
('session_timeout_minutes', '60', 'number', 'User session timeout')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO saas_core.module_dependencies (module_name, depends_on, is_optional) VALUES
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

-- Every hospital gets 'lab' too, both for hospitals that already exist and
-- for future ones signing up under an existing plan. Harmless no-op on a
-- fresh install with zero tenants/plans yet — re-run this file once real
-- hospitals exist and it takes effect then. Never force-disables anything
-- a superadmin explicitly turned off (same "only upgrade" rule
-- tenant_service.py's own module-enable logic follows).
UPDATE saas_core.subscription_plans sp
SET modules_included = array_append(sp.modules_included, m.id)
FROM saas_core.modules m
WHERE m.code = 'lab'
  AND NOT (m.id = ANY(sp.modules_included));

INSERT INTO saas_core.tenant_modules (tenant_id, module_id, is_enabled, enabled_at)
SELECT t.id, m.id, true, NOW()
FROM saas_core.tenants t
CROSS JOIN saas_core.modules m
WHERE m.code = 'lab'
ON CONFLICT (tenant_id, module_id) DO UPDATE
    SET is_enabled = true,
        enabled_at = COALESCE(saas_core.tenant_modules.enabled_at, NOW())
    WHERE saas_core.tenant_modules.is_enabled = false;


-- ──────────────────────────────────────────────────────────────────────────
-- 2. SYSTEM ROLES (14 fixed roles, hospital_id IS NULL — shared platform-wide)
--
-- Fixed IDs matching what's already live. Includes lab_technician
-- (originally 11_lab_technician_role.sql) — its absence was the root cause
-- of "Lab Technician staff accounts silently get no role at all, dashboard
-- is empty" (login worked, but zero user_roles rows meant every
-- hasRole()/allowedRoles() check across the app failed).
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO roles (id, hospital_id, name, display_name, description, is_system, is_active) VALUES
('e0000000-0000-0000-0000-000000000001', NULL, 'super_admin', 'Super Administrator', 'Full system access across all hospitals', true, true),
('e0000000-0000-0000-0000-000000000002', NULL, 'admin', 'Hospital Admin', 'Hospital-level administrative access', true, true),
('e0000000-0000-0000-0000-000000000003', NULL, 'doctor', 'Doctor', 'Clinical and patient care access', true, true),
('e0000000-0000-0000-0000-000000000004', NULL, 'receptionist', 'Receptionist', 'Front desk and appointment operations', true, true),
('e0000000-0000-0000-0000-000000000005', NULL, 'pharmacist', 'Pharmacist', 'Pharmacy dispensing operations', true, true),
('e0000000-0000-0000-0000-000000000006', NULL, 'optical_staff', 'Optical Staff', 'Optical store operations', true, true),
('e0000000-0000-0000-0000-000000000007', NULL, 'cashier', 'Cashier', 'Billing and payment operations', true, true),
('e0000000-0000-0000-0000-000000000008', NULL, 'inventory_manager', 'Inventory Manager', 'Inventory and stock management', true, true),
('e0000000-0000-0000-0000-000000000009', NULL, 'report_viewer', 'Report Viewer', 'View and export reports', true, true),
('e0000000-0000-0000-0000-000000000010', NULL, 'nurse', 'Nurse', 'Nursing and patient care support', true, true),
('e0000000-0000-0000-0000-000000000011', NULL, 'staff', 'Staff', 'General staff access', true, true),
('e0000000-0000-0000-0000-000000000012', NULL, 'visiting_doctor', 'Special Doctor / Visiting Doctor', 'Guest/visiting doctor with limited clinical access (walk-in queue view, own schedule, new prescriptions only)', true, true),
('e0000000-0000-0000-0000-000000000013', NULL, 'hr_manager', 'HR Manager', 'Manages employee records, holidays, shifts, attendance, leave, and payroll — no clinical or billing access.', true, true),
('e0000000-0000-0000-0000-000000000014', NULL, 'lab_technician', 'Lab Technician', 'Laboratory test processing and report entry', true, true)
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────────────────
-- 3. PLACEHOLDER "PLATFORM" HOSPITAL + TENANT
--
-- A super_admin's users.hospital_id is NOT NULL + FK, so it needs *some*
-- hospital row to reference even before any real hospital has been created.
-- is_system marks this row so it's reliably excluded from any real-hospital
-- listing. Never shown anywhere in the UI.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

INSERT INTO saas_core.tenants (id, name, slug, code, email, status)
VALUES ('00000000-0000-0000-0000-000000000002', 'Platform (System)', 'platform-system', 'PLATFORM', 'platform-system@internal.invalid', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO hospitals (id, name, code, is_active, is_system, tenant_id, timezone, default_currency, country)
VALUES ('00000000-0000-0000-0000-000000000001', 'Platform (System Account Holder)', 'PLATFORM', false, true, '00000000-0000-0000-0000-000000000002', 'UTC', 'USD', 'USA')
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────────────────
-- 4. LAB TEST CATALOG — real, client-supplied report templates
--
-- Sourced from actual client report workbooks/specs (REPORT_HEALTH_FOUNDATION.xlsx,
-- lab_report_templates_specification.md, medical_reports_data.md) — not dev
-- placeholders. Consolidated verbatim from 10_lab_test_templates_batch2.sql,
-- 12_lab_test_templates_batch3.sql, and 13_lab_test_fasting_blood_sugar.sql;
-- see those files for full per-test sourcing notes. Loops over every row in
-- `hospitals`, so this is a no-op until at least one real hospital exists —
-- re-run this file after creating each new hospital. Top-level
-- price/unit/reference_range are NULL/0 throughout (those concepts live
-- per-parameter inside report_template) — LAB ADMINS MUST SET REAL PRICES
-- via the Lab Test Catalog UI after this runs.
-- ──────────────────────────────────────────────────────────────────────────

-- Batch 2 (10 tests)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Lipid Profile', 'LIPID_PROFILE', 'Biochemistry', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Total Cholesterol", "unit": "mg/dl", "reference_range": "140 to 180", "section": null, "sequence": 1},
  {"name": "HDL Cholesterol (Direct)", "unit": "mg/dl", "reference_range": "35 to 50", "section": null, "sequence": 2},
  {"name": "Triglycerides", "unit": "mg/dl", "reference_range": "25 to 150", "section": null, "sequence": 3},
  {"name": "LDL Cholesterol", "unit": "mg/dl", "reference_range": "85 to 130", "section": null, "sequence": 4},
  {"name": "VLDL Cholesterol", "unit": "mg/dl", "reference_range": "5.0 to 40", "section": null, "sequence": 5},
  {"name": "LDL/HDL Ratio", "unit": "Ratio", "reference_range": "1.5 to 3.5", "section": null, "sequence": 6},
  {"name": "Total Cholesterol/HDL Ratio", "unit": "Ratio", "reference_range": "3.0 to 5.0", "section": null, "sequence": 7}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Prolactin (PRL)', 'PROLACTIN', 'Immunology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Prolactin", "unit": "ng/ml", "reference_range": "Female (non-pregnant): 4.79 to 23.3 | Male: 4.04 to 15.2", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Iron Studies (Iron, TIBC, UIBC)', 'IRON_STUDIES', 'Biochemistry', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Iron", "unit": "ug/dl", "reference_range": "50 to 170 (Ferrozine)", "section": null, "sequence": 1},
  {"name": "Total Iron Binding Capacity (TIBC)", "unit": "ug/dl", "reference_range": "Infant: 100 to 400 | Adult: 250 to 425 (Calculated)", "section": null, "sequence": 2},
  {"name": "Unsaturated Iron Binding Capacity (UIBC)", "unit": "ug/dl", "reference_range": "135 to 392 (Ferrozine)", "section": null, "sequence": 3}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'HLA B27', 'HLA_B27', 'Immunology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "HLA B27", "unit": null, "reference_range": "Negative (Flow Cytometry)", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Vitamin D3 & Calcium', 'VIT_D3_CAL', 'Immunology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "25-Hydroxy Vitamin D (Vitamin D3)", "unit": "ng/ml", "reference_range": "Deficiency: <=20 | Insufficiency: 21 to 29 | Sufficiency: >=30 (ECLIA)", "section": "Vitamin D", "sequence": 1},
  {"name": "Calcium", "unit": "mg/dl", "reference_range": "Newborn: 8.4 to 10.6 | Adults: 8.6 to 10.3 (Arsenazo III)", "section": "Biochemistry", "sequence": 2}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Urine Culture & Sensitivity (C/S Urine)', 'URINE_CS', 'Microbiology', 'Urine', 0, NULL, NULL, NULL, true,
'[
  {"name": "Microscopy", "unit": null, "reference_range": null, "section": null, "sequence": 1},
  {"name": "Culture", "unit": null, "reference_range": null, "section": null, "sequence": 2},
  {"name": "Note", "unit": null, "reference_range": null, "section": null, "sequence": 3}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Blood Group & Rh Typing', 'BLOOD_GROUP', 'Haematology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Blood Group", "unit": null, "reference_range": null, "section": null, "sequence": 1},
  {"name": "Rh Type", "unit": null, "reference_range": null, "section": null, "sequence": 2}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Dengue Fever Profile (IgG, IgM, NS1)', 'DENGUE_PROFILE', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Dengue Antibody IgG", "unit": "Units", "reference_range": "<9: Negative | 9-11: Equivocal | >11: Positive (ELISA)", "section": null, "sequence": 1},
  {"name": "Dengue Antibody IgM", "unit": "Units", "reference_range": "<9: Negative | 9-11: Equivocal | >11: Positive (ELISA)", "section": null, "sequence": 2},
  {"name": "Dengue NS1 Antigen", "unit": "Units", "reference_range": "<9: Negative | 9-11: Equivocal | >11: Positive (ELISA)", "section": null, "sequence": 3}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Peripheral Smear (PS)', 'PERIPHERAL_SMEAR', 'Haematology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "RBCs", "unit": null, "reference_range": null, "section": null, "sequence": 1},
  {"name": "Parasites", "unit": null, "reference_range": null, "section": null, "sequence": 2},
  {"name": "Platelets", "unit": null, "reference_range": null, "section": null, "sequence": 3},
  {"name": "WBC", "unit": null, "reference_range": null, "section": null, "sequence": 4},
  {"name": "Immature Cells", "unit": null, "reference_range": null, "section": null, "sequence": 5},
  {"name": "Impression", "unit": null, "reference_range": null, "section": null, "sequence": 6}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Microscopy (General)', 'MICROSCOPY_GEN', 'Clinical Pathology', 'Body Fluid', 0, NULL, NULL, NULL, true,
'[
  {"name": "Cast", "unit": null, "reference_range": "Nil", "section": null, "sequence": 1},
  {"name": "Crystal", "unit": null, "reference_range": "Nil", "section": null, "sequence": 2},
  {"name": "Bacteria", "unit": null, "reference_range": "Nil", "section": null, "sequence": 3},
  {"name": "Others", "unit": null, "reference_range": "Nil", "section": null, "sequence": 4}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

-- Batch 3 (3 tests)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Blood Sugar (RBS)', 'BLOOD_SUGAR_RBS', 'Biochemistry', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Blood Sugar (RBS)", "unit": "mg/dl", "reference_range": "100 to 140", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Hormonal Profile (FSH, LH, Prolactin, Testosterone)', 'HORMONAL_PROFILE', 'Immunology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "FSH", "unit": "mIU/mL", "reference_range": "1.50 to 12.40 (ECLIA)", "section": null, "sequence": 1},
  {"name": "LH", "unit": "mIU/mL", "reference_range": "1.70 to 8.60 (ECLIA)", "section": null, "sequence": 2},
  {"name": "Prolactin", "unit": "ng/ml", "reference_range": "3.46 to 19.40 (CMIA)", "section": null, "sequence": 3},
  {"name": "Testosterone, Total", "unit": "ng/ml", "reference_range": "2.490 to 8.360 (ECLIA)", "section": null, "sequence": 4}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'MUSK Antibody (Myasthenia Gravis)', 'MUSK_AB', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "MUSK Antibody, Myasthenia Gravis", "unit": "INDEX", "reference_range": "< 1.0: Negative | >= 1.0: Positive", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;

-- Fasting Blood Sugar (1 test) — clinically distinct from RBS above
-- (different collection condition, different reference range).
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Blood Sugar (FBS)', 'BLOOD_SUGAR_FBS', 'Biochemistry', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Blood Sugar (FBS)", "unit": "mg/dl", "reference_range": "80 to 120", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h ON CONFLICT (hospital_id, code) DO NOTHING;


-- ──────────────────────────────────────────────────────────────────────────
-- 5. LAB TEST PACKAGES — MHC / HHC (real health-checkup bundles)
--
-- lab_test_panels table (originally 2026-08-14_lab_test_panels.sql) + its
-- MHC/HHC data (originally 2026-08-16_seed_lab_test_panels_data.sql).
-- Contains no hospital-specific data — every hospital comes from whichever
-- database this runs against. Creates the 9 distinct catalog tests either
-- package needs (by code, filling only what's missing — batch 2/3 above
-- already cover most of them), then resolves each package's members by
-- that same code. Idempotent: an existing package's test_ids/name refresh
-- via ON CONFLICT ... DO UPDATE; an existing catalog test is left untouched.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_test_panels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id),
    name        VARCHAR(200) NOT NULL,
    code        VARCHAR(30) NOT NULL,
    test_ids    UUID[] NOT NULL DEFAULT '{}',
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

CREATE INDEX IF NOT EXISTS idx_lab_test_panels_hospital ON lab_test_panels(hospital_id);

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, is_active)
SELECT gen_random_uuid(), h.id, v.name, v.code, v.category, v.sample_type, 0, true
FROM hospitals h
CROSS JOIN (VALUES
    ('CBC (Complete Blood Count)',              'CBC',              'Haematology', 'Blood'),
    ('TSH (Thyroid Stimulating Hormone)',        'TSH',              'Biochemistry', 'Blood'),
    ('Blood Sugar (FBS)',                        'BLOOD_SUGAR_FBS',  'Biochemistry', 'Blood'),
    ('Lipid Profile',                             'LIPID_PROFILE',    'Biochemistry', 'Blood'),
    ('Liver Function Test (LFT)',                 'LFT',              'Biochemistry', 'Blood'),
    ('Thyroid Profile (T3, T4, TSH)',             'THYROID',          'Biochemistry', 'Blood'),
    ('Urine Complete (Routine Urinalysis)',       'URINE_C',          'Pathology', 'Urine'),
    ('Microscopy (General)',                      'MICROSCOPY_GEN',   'Pathology', 'Blood'),
    ('Electrolytes & Renal Profile',              'ELEC_RENAL',       'Biochemistry', 'Blood')
) AS v(name, code, category, sample_type)
ON CONFLICT (hospital_id, code) DO NOTHING;

WITH mhc_codes(code, ord) AS (
    VALUES ('CBC', 1), ('BLOOD_SUGAR_FBS', 2), ('LIPID_PROFILE', 3), ('LFT', 4), ('THYROID', 5), ('URINE_C', 6), ('MICROSCOPY_GEN', 7)
),
mhc_resolved AS (
    SELECT lt.hospital_id, array_agg(lt.id ORDER BY mc.ord) AS test_ids, count(*) AS matched_count
    FROM lab_tests lt JOIN mhc_codes mc ON mc.code = lt.code
    WHERE lt.is_active = true GROUP BY lt.hospital_id
)
INSERT INTO lab_test_panels (id, hospital_id, name, code, test_ids, is_active)
SELECT gen_random_uuid(), hospital_id, 'MHC (Master Health Checkup)', 'MHC', test_ids, true
FROM mhc_resolved WHERE matched_count = (SELECT count(*) FROM mhc_codes)
ON CONFLICT (hospital_id, code) DO UPDATE SET test_ids = EXCLUDED.test_ids, name = EXCLUDED.name, updated_at = NOW();

WITH hhc_codes(code, ord) AS (
    VALUES ('CBC', 1), ('BLOOD_SUGAR_FBS', 2), ('LIPID_PROFILE', 3), ('ELEC_RENAL', 4), ('TSH', 5)
),
hhc_resolved AS (
    SELECT lt.hospital_id, array_agg(lt.id ORDER BY hc.ord) AS test_ids, count(*) AS matched_count
    FROM lab_tests lt JOIN hhc_codes hc ON hc.code = lt.code
    WHERE lt.is_active = true GROUP BY lt.hospital_id
)
INSERT INTO lab_test_panels (id, hospital_id, name, code, test_ids, is_active)
SELECT gen_random_uuid(), hospital_id, 'HHC (Health Checkup)', 'HHC', test_ids, true
FROM hhc_resolved WHERE matched_count = (SELECT count(*) FROM hhc_codes)
ON CONFLICT (hospital_id, code) DO UPDATE SET test_ids = EXCLUDED.test_ids, name = EXCLUDED.name, updated_at = NOW();

-- ==============================================================================
-- DONE. Next step: create your Super Admin login —
--   cd backend
--   python ../deploy/flush_and_reseed_database.py --confirm FLUSH \
--       --superadmin-username <you> --superadmin-email <you@x.com> --superadmin-password '<Real@Pass>'
-- (safe to run after this file — it only touches users/roles-membership, and
-- skips creating a Super Admin if one already exists). Then log in and
-- create your first real hospital through the UI.
-- ==============================================================================
