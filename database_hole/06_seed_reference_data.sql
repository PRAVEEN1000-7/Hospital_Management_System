-- ==============================================================================
-- 06 — SEED / REFERENCE DATA (real, production-safe seed rows — NOT the
-- fictional dev/demo data in 03_seed_data.sql)
--
-- Every statement here is a data INSERT (never a schema change) that
-- populates catalog/reference/lookup rows needed for the tables created in
-- 05_schema_structure.sql. Run AFTER that file — every INSERT below assumes
-- its target table/column already exists.
--
-- Safe to run against an existing DB — every statement is idempotent
-- (INSERT ... ON CONFLICT DO NOTHING, or an explicit NOT EXISTS guard where
-- ON CONFLICT can't apply — see §1's comment). Re-running inserts nothing new
-- and changes nothing.
--
-- Sections:
--   1. Optical Store — opening stock batch backfill (one-time data migration
--      tied to optical_batches, created in 05_schema_structure.sql §3.1).
--   2. Laboratory — module registration row + the 18-test standard catalog.
--   3. Inventory — default purchase-order payment modes per hospital.
--   4. Roles — the visiting_doctor ("Special Doctor / Visiting Doctor") role.
-- ==============================================================================


-- ══════════════════════════════════════════════════════════════════════════
-- 1. OPTICAL STORE — opening stock batch backfill
-- ══════════════════════════════════════════════════════════════════════════

-- One opening batch per existing product with stock on hand, so seeded
-- optical_products rows keep their current_stock instead of silently going
-- to zero once optical_batches becomes the source of truth. Null expiry =
-- "never expires" under the FEFO rule used by the service layer. Guarded on
-- "product has no batches yet at all" rather than ON CONFLICT on
-- batch_number — the batch_number embeds today's date, so re-running this on
-- a later day would otherwise insert a second opening batch (and silently
-- double stock) instead of being a no-op.
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


-- ══════════════════════════════════════════════════════════════════════════
-- 2. LABORATORY — module registration + standard test catalog
-- ══════════════════════════════════════════════════════════════════════════

-- Module registration — makes 'lab' appear in the existing generic
-- super-admin per-tenant module toggle UI (SuperAdminHospitalDetail.tsx)
-- once this row exists; no frontend change needed for that to work.
-- required_modules includes 'prescriptions' (unlike optical, which was
-- deliberately trimmed to not require it) because lab's only order entry
-- point is the Prescription Builder.
INSERT INTO saas_core.modules (code, name, description, category, frontend_route_prefix, api_prefix, icon, is_core, required_modules) VALUES
('lab', 'Laboratory', 'Lab test catalog, ordering, sample tracking, and results', 'clinical', '/lab', '/api/v1/lab', 'flask', false, '{"patients","prescriptions"}')
ON CONFLICT (code) DO NOTHING;

-- Seeds 18 standard lab tests (CBC, LFT, Thyroid Profile, Widal, etc.) into
-- lab_tests for every hospital, sourced from real report-template HTML
-- supplied by the customer. Each test's structured layout lives in
-- report_template (05_schema_structure.sql §5.5), carrying a `section` key
-- per parameter (see backend/app/schemas/lab.py's
-- LabTestParameterTemplate.section) so multi-section reports like CBC can
-- group "Complete Blood Count" / "Differential Count" / "Other Parameters" /
-- "Blood Grouping" under one test instead of being modelled as four.
--
-- Inserted unconditionally for every row in `hospitals`, regardless of
-- whether that hospital has the 'lab' module enabled — additive, harmless
-- rows simply go unused until the module is turned on. ON CONFLICT
-- (hospital_id, code) DO NOTHING makes every INSERT idempotent; the
-- (hospital_id, code) uniqueness on lab_tests is an inline, unnamed
-- `UNIQUE (hospital_id, code)` (05_schema_structure.sql §5.1), so the
-- column-list conflict target is used instead of a constraint name.
--
-- Top-level price is intentionally 0 and unit/reference_range/turnaround_hours
-- are intentionally NULL on every row: those concepts now live per-parameter
-- inside report_template, not on the test as a whole. LAB ADMINS MUST SET
-- REAL PRICES for each of these tests via the Lab Test Catalog UI after
-- running this seed.
--
-- A handful of values in the source templates were corrected in transcription:
-- ELEC_RENAL's Blood Urea/Serum Creatinine/Uric Acid units (source had
-- implausible ng/ml, ug/dl, Uiu/ml — clear copy-paste errors, corrected to
-- mg/dl), and URINE_C's pH/Specific Gravity reference ranges (source had them
-- swapped/mismatched). A 19th source template ("C/S Urine" microbiology) was
-- skipped entirely — it was a duplicate of the electrolytes report, not a
-- distinct test.

-- 1. CBC — Complete Blood Count (Haematology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Complete Blood Count (CBC)', 'CBC', 'Haematology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Haemoglobin", "unit": "gms%", "reference_range": "13 to 17", "section": "Complete Blood Count", "sequence": 1},
  {"name": "Total Count (WBC)", "unit": "Cells/Cumm", "reference_range": "4000 to 10000", "section": "Complete Blood Count", "sequence": 2},
  {"name": "Neutrophil", "unit": "%", "reference_range": "40 to 70", "section": "Differential Count", "sequence": 3},
  {"name": "Lymphocyte", "unit": "%", "reference_range": "20 to 50", "section": "Differential Count", "sequence": 4},
  {"name": "Eosinophil", "unit": "%", "reference_range": "01 to 06", "section": "Differential Count", "sequence": 5},
  {"name": "Monocyte", "unit": "%", "reference_range": "02 to 10", "section": "Differential Count", "sequence": 6},
  {"name": "Basophil", "unit": "%", "reference_range": "00 to 01", "section": "Differential Count", "sequence": 7},
  {"name": "ESR", "unit": "mm/hr", "reference_range": "0 to 30", "section": "Other Parameters", "sequence": 8},
  {"name": "RBC", "unit": "million/cumm", "reference_range": "4.5 to 6.00", "section": "Other Parameters", "sequence": 9},
  {"name": "HCT", "unit": "%", "reference_range": "40 to 54", "section": "Other Parameters", "sequence": 10},
  {"name": "MCV", "unit": "fl", "reference_range": "80 to 96", "section": "Other Parameters", "sequence": 11},
  {"name": "MCH", "unit": "pg", "reference_range": "27 to 32", "section": "Other Parameters", "sequence": 12},
  {"name": "MCHC", "unit": "%", "reference_range": "32 to 36", "section": "Other Parameters", "sequence": 13},
  {"name": "Platelet Count", "unit": "Cells/Cumm (Lakh)", "reference_range": "1.4 to 4.0", "section": "Other Parameters", "sequence": 14},
  {"name": "Blood Group", "unit": null, "reference_range": null, "section": "Blood Grouping", "sequence": 15},
  {"name": "RH Type", "unit": null, "reference_range": null, "section": "Blood Grouping", "sequence": 16}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 2. ELEC_RENAL — Electrolytes & Renal Profile (Biochemistry / Blood)
-- NOTE: Blood Urea / Serum Creatinine / Uric Acid units corrected to mg/dl —
-- the source template had implausible units (ng/ml, ug/dl, Uiu/ml), clearly
-- copy-paste errors from another report.
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Electrolytes & Renal Profile', 'ELEC_RENAL', 'Biochemistry', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Sodium", "unit": "mmol/L", "reference_range": "136 to 145", "section": "Electrolytes", "sequence": 1},
  {"name": "Potassium", "unit": "mmol/L", "reference_range": "3.5 to 5.1", "section": "Electrolytes", "sequence": 2},
  {"name": "Chloride", "unit": "mmol/L", "reference_range": "98 to 107", "section": "Electrolytes", "sequence": 3},
  {"name": "Bicarbonate", "unit": "mmol/L", "reference_range": "23 to 30", "section": "Electrolytes", "sequence": 4},
  {"name": "Blood Urea", "unit": "mg/dl", "reference_range": "10 to 40", "section": "Renal Profile", "sequence": 5},
  {"name": "Serum Creatinine", "unit": "mg/dl", "reference_range": "0.7 to 1.4", "section": "Renal Profile", "sequence": 6},
  {"name": "Uric Acid", "unit": "mg/dl", "reference_range": "3.4 to 7.0", "section": "Renal Profile", "sequence": 7},
  {"name": "Calcium", "unit": "mg/dl", "reference_range": "8.5 to 11", "section": "Renal Profile", "sequence": 8}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 3. DIAB_PROFILE — Diabetic Profile (Biochemistry / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Diabetic Profile', 'DIAB_PROFILE', 'Biochemistry', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "HbA1c", "unit": "%", "reference_range": "4.00 to 5.60", "section": null, "sequence": 1},
  {"name": "Estimated Average Glucose (eAG)", "unit": "mg/dl", "reference_range": "80 to 120", "section": null, "sequence": 2}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 4. PSA — Prostate Specific Antigen (Immunology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'PSA (Prostate Specific Antigen)', 'PSA', 'Immunology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "PSA", "unit": "ng/ml", "reference_range": "<40y: <1.4 | 40-49: <2.0 | 50-59: <3.1 | 60-69: <4.1 | >70: <4.4", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 5. BT_CT — Bleeding Time & Clotting Time (Haematology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Bleeding Time & Clotting Time', 'BT_CT', 'Haematology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Bleeding Time", "unit": "Minutes", "reference_range": "1 to 3", "section": null, "sequence": 1},
  {"name": "Clotting Time", "unit": "Minutes", "reference_range": "3 to 8", "section": null, "sequence": 2}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 6. RA_FACTOR — RA Factor (Serology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'RA Factor', 'RA_FACTOR', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "RA Factor", "unit": "IU/ml", "reference_range": "Less than 14", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 7. LFT — Liver Function Test (Biochemistry / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Liver Function Test (LFT)', 'LFT', 'Biochemistry', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Bilirubin Total", "unit": "mg/dl", "reference_range": "0.2 to 1.2", "section": null, "sequence": 1},
  {"name": "Bilirubin Direct", "unit": "mg/dl", "reference_range": "0.0 to 0.2", "section": null, "sequence": 2},
  {"name": "Bilirubin Indirect", "unit": "mg/dl", "reference_range": "0.1 to 0.5", "section": null, "sequence": 3},
  {"name": "SGOT (AST)", "unit": "U/L", "reference_range": "8 to 40", "section": null, "sequence": 4},
  {"name": "SGPT (ALT)", "unit": "U/L", "reference_range": "5 to 40", "section": null, "sequence": 5},
  {"name": "Alkaline Phosphatase", "unit": "U/L", "reference_range": "42 to 130", "section": null, "sequence": 6},
  {"name": "GGT", "unit": "U/L", "reference_range": "0 to 115", "section": null, "sequence": 7},
  {"name": "Total Protein", "unit": "g/dl", "reference_range": "6.4 to 7.8", "section": null, "sequence": 8},
  {"name": "Albumin", "unit": "g/dl", "reference_range": "3.5 to 5.2", "section": null, "sequence": 9},
  {"name": "A/G Ratio", "unit": "Ratio", "reference_range": "0.9 to 2.0", "section": null, "sequence": 10}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 8. THYROID — Thyroid Profile (T3, T4, TSH) (Biochemistry / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Thyroid Profile (T3, T4, TSH)', 'THYROID', 'Biochemistry', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Serum T3", "unit": "ng/ml", "reference_range": "0.80 to 2.00", "section": null, "sequence": 1},
  {"name": "Serum T4", "unit": "ug/dl", "reference_range": "4.1 to 12.1", "section": null, "sequence": 2},
  {"name": "TSH", "unit": "uIU/ml", "reference_range": "0.30 to 5.5", "section": null, "sequence": 3}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 9. HIV — Anti HIV Ag/Ab Combo (Serology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'HIV (Anti HIV Ag/Ab Combo)', 'HIV', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Anti HIV Ag/Ab Combo", "unit": "COI", "reference_range": "<0.9: Non Reactive, >=1.0: Reactive (ECLIA)", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 10. VDRL — Syphilis Antibody (Serology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'VDRL (Syphilis Antibody)', 'VDRL', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "VDRL", "unit": null, "reference_range": "Non Reactive (Chromatographic Lateral Flow)", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 11. HBSAG — Hepatitis B Surface Antigen (Serology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'HBsAg (Hepatitis B Surface Antigen)', 'HBSAG', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "HBs Ag", "unit": "COI", "reference_range": "<0.9: Non Reactive, >=1.0: Reactive (ECLIA)", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 12. HBEAG — Hepatitis B e-Antigen (Serology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'HBeAg (Hepatitis B e-Antigen)', 'HBEAG', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "HBe Ag", "unit": null, "reference_range": "Non Reactive: <1.0, Reactive: >=1.0", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 13. HCV — Anti-HCV (Hepatitis C Antibody) (Serology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Anti-HCV (Hepatitis C Antibody)', 'HCV', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Anti HCV", "unit": null, "reference_range": "<0.9: Non Reactive, >=1.0: Reactive (ECLIA)", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 14. CRP — C-Reactive Protein (Serology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'CRP (C-Reactive Protein)', 'CRP', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "CRP", "unit": "mg/L", "reference_range": "Less than 5.0", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 15. URINE_C — Urine Complete (Routine Urinalysis) (Clinical Pathology / Urine)
-- NOTE: pH and Specific Gravity reference ranges corrected here — the source
-- template had them swapped/mismatched.
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Urine Complete (Routine Urinalysis)', 'URINE_C', 'Clinical Pathology', 'Urine', 0, NULL, NULL, NULL, true,
'[
  {"name": "Colour", "unit": null, "reference_range": "Pale Yellow to Yellow", "section": "Physical & Chemical Examination", "sequence": 1},
  {"name": "Appearance", "unit": null, "reference_range": "Clear", "section": "Physical & Chemical Examination", "sequence": 2},
  {"name": "Reaction (pH)", "unit": null, "reference_range": "4.5 to 8.0", "section": "Physical & Chemical Examination", "sequence": 3},
  {"name": "Specific Gravity", "unit": null, "reference_range": "1.005 to 1.030", "section": "Physical & Chemical Examination", "sequence": 4},
  {"name": "Nitrite", "unit": null, "reference_range": "Negative", "section": "Physical & Chemical Examination", "sequence": 5},
  {"name": "Leukocytes", "unit": null, "reference_range": "Negative", "section": "Physical & Chemical Examination", "sequence": 6},
  {"name": "Blood", "unit": null, "reference_range": "Negative", "section": "Physical & Chemical Examination", "sequence": 7},
  {"name": "Ketone", "unit": null, "reference_range": "Negative", "section": "Physical & Chemical Examination", "sequence": 8},
  {"name": "Albumin", "unit": null, "reference_range": "Nil", "section": "Physical & Chemical Examination", "sequence": 9},
  {"name": "Sugar", "unit": null, "reference_range": "Negative", "section": "Physical & Chemical Examination", "sequence": 10},
  {"name": "Bile Salt", "unit": null, "reference_range": "Nil", "section": "Physical & Chemical Examination", "sequence": 11},
  {"name": "Bile Pigment", "unit": null, "reference_range": "Nil", "section": "Physical & Chemical Examination", "sequence": 12},
  {"name": "Urobilinogen", "unit": null, "reference_range": "Normal (0.2-1.0 EU/dL)", "section": "Physical & Chemical Examination", "sequence": 13},
  {"name": "Pus Cells", "unit": "/hpf", "reference_range": "2 to 4", "section": "Microscopic Examination", "sequence": 14},
  {"name": "RBC", "unit": "/hpf", "reference_range": "Nil", "section": "Microscopic Examination", "sequence": 15},
  {"name": "Epithelial Cells", "unit": "/hpf", "reference_range": "2 to 4", "section": "Microscopic Examination", "sequence": 16}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 16. MP_SMEAR — Malarial Parasite (Smear) (Haematology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Malarial Parasite (Smear)', 'MP_SMEAR', 'Haematology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Malarial Parasite", "unit": null, "reference_range": "Not found in the smear examined", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 17. WIDAL — Widal Test (Serology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Widal Test', 'WIDAL', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Typhi O", "unit": "Titer", "reference_range": "< 1:80 (Slide agglutination)", "section": null, "sequence": 1},
  {"name": "Typhi H", "unit": "Titer", "reference_range": "< 1:80 (Slide agglutination)", "section": null, "sequence": 2},
  {"name": "Typhi AH", "unit": "Titer", "reference_range": "< 1:80 (Slide agglutination)", "section": null, "sequence": 3},
  {"name": "Typhi BH", "unit": "Titer", "reference_range": "< 1:80 (Slide agglutination)", "section": null, "sequence": 4}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 18. DENGUE_NS1 — Dengue NS1 Antigen (Serology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Dengue NS1 Antigen', 'DENGUE_NS1', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Dengue NS1 Antigen", "unit": null, "reference_range": "<9: Negative | 9.0-11.0: Equivocal | >11: Positive (ELISA)", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════
-- 3. INVENTORY — default purchase-order payment modes
-- ══════════════════════════════════════════════════════════════════════════

-- Seed default modes for every existing hospital (payment_modes table
-- created in 05_schema_structure.sql §7).
INSERT INTO payment_modes (hospital_id, name)
SELECT h.id, m.name
FROM hospitals h
CROSS JOIN (VALUES ('Cash'), ('Cheque'), ('Bank Transfer'), ('UPI'), ('NEFT/RTGS'), ('Card'), ('Online')) AS m(name)
ON CONFLICT (hospital_id, name) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════
-- 4. ROLES — Special Doctor / Visiting Doctor
-- ══════════════════════════════════════════════════════════════════════════

-- Adds the "visiting_doctor" system role introduced by the client's role
-- permission matrix (see docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md).
-- A visiting/guest doctor gets a narrower slice of the Doctor role: they can
-- view the walk-in queue, view+edit their own doctor schedule, and create new
-- prescriptions — but no access to patient directory management, staff
-- directory, analytics, appointment management, or anything outside clinical
-- consultation. Enforced in backend/app/core/module_roles.py and mirrored in
-- frontend/src/config/modulePermissions.ts.
INSERT INTO roles (id, hospital_id, name, display_name, description, is_system, is_active)
SELECT
    'e0000000-0000-0000-0000-000000000012', NULL, 'visiting_doctor',
    'Special Doctor / Visiting Doctor',
    'Guest/visiting doctor with limited clinical access (walk-in queue view, own schedule, new prescriptions only)',
    true, true
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE name = 'visiting_doctor' AND hospital_id IS NULL
);
