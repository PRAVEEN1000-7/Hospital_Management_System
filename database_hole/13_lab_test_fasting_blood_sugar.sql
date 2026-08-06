-- ==============================================================================
-- 13 — LAB TEST CATALOG — Fasting Blood Sugar (FBS)
--
-- Source: REPORT_HEALTH_FOUNDATION.xlsx (the same workbook 10_lab_test_templates_batch2.sql
-- was built from). All 27 real sheets in that workbook were re-checked against
-- today's full catalog (not just the 10-sheet summary from that earlier pass)
-- to answer the user's "I want the format like this as well" request. Every
-- sheet turned out to already be covered — including by 12_lab_test_templates_batch3.sql's
-- new Blood Sugar (RBS) test, which exactly matches the "LIPID,RF" sheet's RBS
-- panel (100 to 140 mg/dl) — except one: the "BS TFT" sheet's FBS parameter
-- (80 to 120 mg/dl), a clinically distinct test from RBS (different collection
-- condition, different reference range) with no existing coverage anywhere.
--
-- Idempotent — ON CONFLICT (hospital_id, code) DO NOTHING, same pattern as
-- 06/10/12. Price/unit/reference_range/turnaround_hours are NULL/0 at the top
-- level for the same reason as those files — set real prices via the Lab Test
-- Catalog UI after running this file.
-- ==============================================================================

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, unit, reference_range, turnaround_hours, is_active, report_template, created_at, updated_at)
SELECT gen_random_uuid(), h.id, 'Blood Sugar (FBS)', 'BLOOD_SUGAR_FBS', 'Biochemistry', 'Blood', 0, NULL, NULL, NULL, true,
'[
  {"name": "Blood Sugar (FBS)", "unit": "mg/dl", "reference_range": "80 to 120", "section": null, "sequence": 1}
]'::jsonb, NOW(), NOW()
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;
