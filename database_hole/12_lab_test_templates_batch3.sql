-- ==============================================================================
-- 12 — LAB TEST CATALOG — BATCH 3 (client-supplied report specs)
--
-- Source: lab_report_templates_specification.md (10 templates) and
-- medical_reports_data.md (10 real reports, MR-001..MR-010), both reverse-
-- engineered from real WhatsApp report images. Every test/panel in BOTH
-- files was cross-checked against the existing catalog (06_seed_reference_data.sql
-- + 10_lab_test_templates_batch2.sql) before writing anything here.
--
-- Result: all 10 templates in lab_report_templates_specification.md, and 7 of
-- the 10 reports in medical_reports_data.md, are ALREADY fully covered by
-- existing catalog tests — including the ones described as "combined panels"
-- (e.g. "Liver Function & Thyroid Profile", "Malaria, Widal & Dengue",
-- the 6-test "Serology Infectious Disease Panel"). Nothing extra was needed
-- for those: GET /lab/orders/{id}/pdf (lab.py) already loops every item on
-- an order and renders each as its own section-titled block in ONE document
-- (see the `for item in resp.items` / section-row rendering there) — so a lab
-- tech ordering several existing tests together on one order already produces
-- exactly the same combined-report layout the specs describe. No new "panel"
-- catalog rows or code changes were needed for that.
--
-- Only 3 tests, all from medical_reports_data.md, had no existing coverage
-- under any name (verified: no catalog row anywhere mentions FSH, LH,
-- Testosterone, MUSK, or a standalone Blood Sugar/RBS test — Diabetic Profile
-- only ever covered HbA1c/eAG, never RBS itself):
--   1. BLOOD_SUGAR_RBS   — Blood Sugar (RBS), standalone (MR-002)
--   2. HORMONAL_PROFILE  — FSH, LH, Prolactin, Testosterone Total (MR-003).
--      Prolactin is intentionally repeated here (it already exists standalone
--      as PROLACTIN) — the source report genuinely issues these 4 together
--      as one panel, same "duplication is fine, it's per-panel not global"
--      precedent as batch2's Diabetic Profile/Lipid Profile.
--   3. MUSK_AB           — MUSK Antibody, Myasthenia Gravis (MR-007/MR-009,
--      the same test appears twice in the source data — one catalog row
--      covers both since they're identical).
--
-- Idempotent — ON CONFLICT (hospital_id, code) DO NOTHING, same pattern as
-- 06/10. Top-level price/unit/reference_range/turnaround_hours are NULL/0,
-- same reasoning as those files: those concepts live per-parameter inside
-- report_template. LAB ADMINS MUST SET REAL PRICES via the Lab Test Catalog
-- UI after running this file.
-- ==============================================================================

-- 1. BLOOD_SUGAR_RBS — Blood Sugar (RBS) (Biochemistry / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Blood Sugar (RBS)', 'BLOOD_SUGAR_RBS', 'Biochemistry', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Blood Sugar (RBS)", "unit": "mg/dl", "reference_range": "100 to 140", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 2. HORMONAL_PROFILE — FSH, LH, Prolactin, Testosterone Total (Immunology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Hormonal Profile (FSH, LH, Prolactin, Testosterone)', 'HORMONAL_PROFILE', 'Immunology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "FSH", "unit": "mIU/mL", "reference_range": "1.50 to 12.40 (ECLIA)", "section": null, "sequence": 1},
  {"name": "LH", "unit": "mIU/mL", "reference_range": "1.70 to 8.60 (ECLIA)", "section": null, "sequence": 2},
  {"name": "Prolactin", "unit": "ng/ml", "reference_range": "3.46 to 19.40 (CMIA)", "section": null, "sequence": 3},
  {"name": "Testosterone, Total", "unit": "ng/ml", "reference_range": "2.490 to 8.360 (ECLIA)", "section": null, "sequence": 4}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- 3. MUSK_AB — MUSK Antibody, Myasthenia Gravis (Serology / Blood)
INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'MUSK Antibody (Myasthenia Gravis)', 'MUSK_AB', 'Serology', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "MUSK Antibody, Myasthenia Gravis", "unit": "INDEX", "reference_range": "< 1.0: Negative | >= 1.0: Positive", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;
