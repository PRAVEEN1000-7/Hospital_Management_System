-- ==============================================================================
-- 18 — SEED STANDARD LAB TEST CATALOG
--
-- Seeds 18 standard lab tests (CBC, LFT, Thyroid Profile, Widal, etc.) into
-- lab_tests for every hospital, sourced from real report-template HTML
-- supplied by the customer. Each test's structured layout lives in
-- report_template (see 16_add_lab_report_finalization.sql), now carrying a
-- `section` key per parameter (see backend/app/schemas/lab.py's
-- LabTestParameterTemplate.section) so multi-section reports like CBC can
-- group "Complete Blood Count" / "Differential Count" / "Other Parameters" /
-- "Blood Grouping" under one test instead of being modelled as four.
--
-- Inserted unconditionally for every row in `hospitals`, regardless of
-- whether that hospital has the 'lab' module enabled — matching the
-- precedent in 02_eye_hospital_updates.sql's header comment that additive,
-- harmless rows/columns are seeded for all hospitals and simply go unused
-- until the module is turned on. ON CONFLICT (hospital_id, code) DO NOTHING
-- makes every INSERT idempotent; note the (hospital_id, code) uniqueness on
-- lab_tests is declared as an inline, unnamed `UNIQUE (hospital_id, code)` in
-- 13_add_lab_module.sql (so Postgres auto-names it
-- lab_tests_hospital_id_code_key) — the column-list conflict target below is
-- used instead of a constraint name for that reason.
--
-- Top-level price is intentionally 0 and unit/reference_range/turnaround_hours
-- are intentionally NULL on every row: those concepts now live per-parameter
-- inside report_template, not on the test as a whole. The source templates
-- did not include pricing — LAB ADMINS MUST SET REAL PRICES for each of these
-- tests via the Lab Test Catalog UI after running this seed.
--
-- A handful of values in the source templates were corrected in transcription
-- (see inline notes below): ELEC_RENAL's Blood Urea/Serum Creatinine/Uric
-- Acid units (source had implausible ng/ml, ug/dl, Uiu/ml — clear copy-paste
-- errors, corrected to mg/dl), and URINE_C's pH/Specific Gravity reference
-- ranges (source had them swapped/mismatched). A 19th source template
-- ("C/S Urine" microbiology) was skipped entirely — it was a duplicate of the
-- electrolytes report, not a distinct test.
--
-- Safe to run against an existing DB — every statement is idempotent
-- (ON CONFLICT DO NOTHING); no destructive operations.
-- ==============================================================================

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
