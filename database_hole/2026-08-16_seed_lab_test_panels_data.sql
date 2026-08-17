-- ==============================================================================
-- 2026-08-16 — SEED DATA: MHC / HHC LAB TEST PACKAGES
--
-- Pure-SQL equivalent of deploy/seed_lab_test_panels.py, for anyone who'd
-- rather run one file + restart than run a Python script. Same effect, same
-- guarantees:
--
--   * Contains NO hospital-specific data — every hospital comes from the
--     `hospitals` table already in whichever database you run this against.
--     Run it on your local DB, only your local hospitals are touched; run it
--     on production, only production's own real hospitals are touched.
--   * Resolves each package's member tests by NAME, per hospital (test IDs
--     differ between databases, so matching by name is what makes this
--     portable instead of copying raw rows across environments).
--   * Idempotent — safe to re-run: an existing package's test_ids/name are
--     refreshed via ON CONFLICT ... DO UPDATE rather than duplicated; an
--     existing catalog test (matched by its code) is left untouched via
--     ON CONFLICT ... DO NOTHING.
--   * A hospital whose catalog is missing one of the required test names
--     (e.g. no "Lipid Profile" row at all) is silently skipped for that one
--     package — nothing errors, that hospital just won't get that package
--     until the missing test exists in its catalog.
--
-- REQUIRES: database_hole/2026-08-14_lab_test_panels.sql already applied
-- (creates the lab_test_panels table this file inserts into).
--
-- Safe to run against an existing DB — idempotent, re-run any time.
-- ==============================================================================

-- ── 1. Two catalog tests this feature needs, missing from the original seed ──

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, is_active)
SELECT gen_random_uuid(), h.id, 'CBC (Complete Blood Count)', 'CBC', 'Haematology', 'Blood', 0, true
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

INSERT INTO lab_tests (id, hospital_id, name, code, category, sample_type, price, is_active)
SELECT gen_random_uuid(), h.id, 'TSH (Thyroid Stimulating Hormone)', 'TSH', 'Biochemistry', 'Blood', 0, true
FROM hospitals h
ON CONFLICT (hospital_id, code) DO NOTHING;

-- ── 2. MHC (Master Health Checkup) — 7 tests ──────────────────────────────────

WITH mhc_names(name, ord) AS (
    VALUES
        ('CBC (Complete Blood Count)', 1),
        ('Blood Sugar (FBS)', 2),
        ('Lipid Profile', 3),
        ('Liver Function Test (LFT)', 4),
        ('Thyroid Profile (T3, T4, TSH)', 5),
        ('Urine Complete (Routine Urinalysis)', 6),
        ('Microscopy (General)', 7)
),
mhc_resolved AS (
    SELECT
        lt.hospital_id,
        array_agg(lt.id ORDER BY mn.ord) AS test_ids,
        count(*) AS matched_count
    FROM lab_tests lt
    JOIN mhc_names mn ON mn.name = lt.name
    WHERE lt.is_active = true
    GROUP BY lt.hospital_id
)
INSERT INTO lab_test_panels (id, hospital_id, name, code, test_ids, is_active)
SELECT gen_random_uuid(), hospital_id, 'MHC (Master Health Checkup)', 'MHC', test_ids, true
FROM mhc_resolved
WHERE matched_count = (SELECT count(*) FROM mhc_names)
ON CONFLICT (hospital_id, code) DO UPDATE
    SET test_ids = EXCLUDED.test_ids, name = EXCLUDED.name, updated_at = NOW();

-- ── 3. HHC (Health Checkup) — 5 tests ─────────────────────────────────────────

WITH hhc_names(name, ord) AS (
    VALUES
        ('CBC (Complete Blood Count)', 1),
        ('Blood Sugar (FBS)', 2),
        ('Lipid Profile', 3),
        ('Electrolytes & Renal Profile', 4),
        ('TSH (Thyroid Stimulating Hormone)', 5)
),
hhc_resolved AS (
    SELECT
        lt.hospital_id,
        array_agg(lt.id ORDER BY hn.ord) AS test_ids,
        count(*) AS matched_count
    FROM lab_tests lt
    JOIN hhc_names hn ON hn.name = lt.name
    WHERE lt.is_active = true
    GROUP BY lt.hospital_id
)
INSERT INTO lab_test_panels (id, hospital_id, name, code, test_ids, is_active)
SELECT gen_random_uuid(), hospital_id, 'HHC (Health Checkup)', 'HHC', test_ids, true
FROM hhc_resolved
WHERE matched_count = (SELECT count(*) FROM hhc_names)
ON CONFLICT (hospital_id, code) DO UPDATE
    SET test_ids = EXCLUDED.test_ids, name = EXCLUDED.name, updated_at = NOW();
