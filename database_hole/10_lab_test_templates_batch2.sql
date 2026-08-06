-- ==============================================================================
-- 10 — LAB TEST CATALOG — BATCH 2 (client-supplied report templates)
--
-- Adds 10 new lab_tests catalog rows, sourced from the client's own report
-- workbook (REPORT_HEALTH_FOUNDATION.xlsx — one sheet per test panel, each a
-- real filled-in report showing the panel's true parameter/unit/reference-
-- range layout). Uses the exact same generic report_template mechanism as
-- 06_seed_reference_data.sql's 18-test catalog (backend/app/models/lab.py's
-- LabTest.report_template JSONB + LabTestParameterTemplate schema) — no
-- schema or application code change was needed, this is data only.
--
-- The workbook actually contains ~27 sheets, not 10. Every sheet was
-- reviewed; most turned out to be the SAME underlying test(s) the existing
-- 18-test catalog already covers, just re-combined into a different bundle
-- (e.g. "LIPID,RF" = Lipid Profile + Renal Profile + one Thyroid parameter;
-- "ELECTROLYTES" = Electrolytes + Renal Profile, i.e. identical to the
-- already-seeded ELEC_RENAL; "TFT"/"HBA1C" sheets both just repeat the
-- existing THYROID / DIAB_PROFILE parameters). Re-inserting those as new
-- catalog rows would create duplicate, confusing entries for tests that can
-- already be ordered (individually or together) today — so only sheets
-- describing a genuinely new panel were turned into new rows below. The CBC
-- sheet matches the already-seeded CBC test exactly in substance; per
-- instruction, the existing CBC seed (06, corrected spelling/units) remains
-- the source of truth and was left untouched.
--
-- New tests (all idempotent — ON CONFLICT (hospital_id, code) DO NOTHING,
-- same pattern as 06):
--   1. LIPID_PROFILE  — Lipid Profile, standalone (was only ever bundled
--      with other panels in the existing catalog)
--   2. PROLACTIN      — Prolactin (PRL)
--   3. IRON_STUDIES   — Iron, TIBC, UIBC
--   4. HLA_B27        — HLA B27
--   5. VIT_D3_CAL     — Vitamin D3 & Calcium
--   6. URINE_CS       — Urine Culture & Sensitivity (Microbiology; narrative
--      Microscopy/Culture/Note result fields, same null-unit/null-range
--      pattern already used for CBC's Blood Group/RH Type rows)
--   7. BLOOD_GROUP    — Blood Group & Rh Typing, standalone (previously only
--      orderable bundled inside CBC)
--   8. DENGUE_PROFILE — Dengue Fever Profile (IgG + IgM + NS1 Antigen, ELISA)
--      — distinct from the existing DENGUE_NS1 rapid antigen-only test
--   9. PERIPHERAL_SMEAR — Peripheral Smear (narrative morphology findings)
--   10. MICROSCOPY_GEN — Microscopy (General) — Cast/Crystal/Bacteria/Others,
--       for specimens other than urine (urine's own microscopy section
--       already lives inside the existing URINE_C test)
--
-- Top-level price/unit/reference_range/turnaround_hours are NULL/0 for the
-- same reason as 06's catalog: those concepts live per-parameter inside
-- report_template. LAB ADMINS MUST SET REAL PRICES via the Lab Test Catalog
-- UI after running this file.
-- ==============================================================================

-- 1. LIPID_PROFILE — Lipid Profile (Biochemistry / Blood)
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
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 2. PROLACTIN — Prolactin (Immunology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Prolactin (PRL)', 'PROLACTIN', 'Immunology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Prolactin", "unit": "ng/ml", "reference_range": "Female (non-pregnant): 4.79 to 23.3 | Male: 4.04 to 15.2", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 3. IRON_STUDIES — Iron, TIBC, UIBC (Biochemistry / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Iron Studies (Iron, TIBC, UIBC)', 'IRON_STUDIES', 'Biochemistry', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Iron", "unit": "ug/dl", "reference_range": "50 to 170 (Ferrozine)", "section": null, "sequence": 1},
  {"name": "Total Iron Binding Capacity (TIBC)", "unit": "ug/dl", "reference_range": "Infant: 100 to 400 | Adult: 250 to 425 (Calculated)", "section": null, "sequence": 2},
  {"name": "Unsaturated Iron Binding Capacity (UIBC)", "unit": "ug/dl", "reference_range": "135 to 392 (Ferrozine)", "section": null, "sequence": 3}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 4. HLA_B27 — HLA B27 (Immunology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'HLA B27', 'HLA_B27', 'Immunology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "HLA B27", "unit": null, "reference_range": "Negative (Flow Cytometry)", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 5. VIT_D3_CAL — Vitamin D3 & Calcium (Immunology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Vitamin D3 & Calcium', 'VIT_D3_CAL', 'Immunology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "25-Hydroxy Vitamin D (Vitamin D3)", "unit": "ng/ml", "reference_range": "Deficiency: <=20 | Insufficiency: 21 to 29 | Sufficiency: >=30 (ECLIA)", "section": "Vitamin D", "sequence": 1},
  {"name": "Calcium", "unit": "mg/dl", "reference_range": "Newborn: 8.4 to 10.6 | Adults: 8.6 to 10.3 (Arsenazo III)", "section": "Biochemistry", "sequence": 2}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 6. URINE_CS — Urine Culture & Sensitivity (Microbiology / Urine)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Urine Culture & Sensitivity (C/S Urine)', 'URINE_CS', 'Microbiology', 'Urine', 0, NULL, NULL, NULL, true,
'[
  {"name": "Microscopy", "unit": null, "reference_range": null, "section": null, "sequence": 1},
  {"name": "Culture", "unit": null, "reference_range": null, "section": null, "sequence": 2},
  {"name": "Note", "unit": null, "reference_range": null, "section": null, "sequence": 3}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 7. BLOOD_GROUP — Blood Group & Rh Typing, standalone (Haematology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Blood Group & Rh Typing', 'BLOOD_GROUP', 'Haematology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Blood Group", "unit": null, "reference_range": null, "section": null, "sequence": 1},
  {"name": "Rh Type", "unit": null, "reference_range": null, "section": null, "sequence": 2}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 8. DENGUE_PROFILE — Dengue Fever Profile: IgG + IgM + NS1 (Serology / Blood)
-- Distinct from the existing DENGUE_NS1 rapid test (NS1 antigen only) — this
-- is the fuller ELISA antibody+antigen panel from the source workbook.
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Dengue Fever Profile (IgG, IgM, NS1)', 'DENGUE_PROFILE', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Dengue Antibody IgG", "unit": "Units", "reference_range": "<9: Negative | 9-11: Equivocal | >11: Positive (ELISA)", "section": null, "sequence": 1},
  {"name": "Dengue Antibody IgM", "unit": "Units", "reference_range": "<9: Negative | 9-11: Equivocal | >11: Positive (ELISA)", "section": null, "sequence": 2},
  {"name": "Dengue NS1 Antigen", "unit": "Units", "reference_range": "<9: Negative | 9-11: Equivocal | >11: Positive (ELISA)", "section": null, "sequence": 3}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 9. PERIPHERAL_SMEAR — Peripheral Smear (Haematology / Blood)
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
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 10. MICROSCOPY_GEN — Microscopy (General) (Clinical Pathology / Body Fluid)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Microscopy (General)', 'MICROSCOPY_GEN', 'Clinical Pathology', 'Body Fluid', 0, NULL, NULL, NULL, true,
'[
  {"name": "Cast", "unit": null, "reference_range": "Nil", "section": null, "sequence": 1},
  {"name": "Crystal", "unit": null, "reference_range": "Nil", "section": null, "sequence": 2},
  {"name": "Bacteria", "unit": null, "reference_range": "Nil", "section": null, "sequence": 3},
  {"name": "Others", "unit": null, "reference_range": "Nil", "section": null, "sequence": 4}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;
