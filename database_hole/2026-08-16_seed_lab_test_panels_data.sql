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
--   * Every catalog test either package needs is created here directly, by
--     CODE (ON CONFLICT (hospital_id, code) DO NOTHING) — not assumed to
--     already exist from some other migration or from manual local testing.
--     2026-08-17 fix: the original version of this file matched member
--     tests by NAME, assuming names seeded on the author's local dev
--     database (some from migrations 10/12/13, four of them — LFT, Thyroid
--     Profile, Urine Complete, Electrolytes & Renal Profile — from NO
--     migration at all, only ever created locally by hand) would also exist
--     verbatim on production. They didn't, so the packages silently never
--     got created there (INSERT 0 0, no error). This version is fully
--     self-contained: it creates all nine distinct tests either package
--     needs, then resolves them by the CODE it just guaranteed, so this
--     works identically on a completely empty catalog as it does on one
--     already fully populated by 10/12/13 (same codes either way — a
--     no-op via ON CONFLICT when they're already there).
--   * Idempotent — safe to re-run: an existing package's test_ids/name are
--     refreshed via ON CONFLICT ... DO UPDATE rather than duplicated; an
--     existing catalog test (matched by its code) is left untouched via
--     ON CONFLICT ... DO NOTHING.
--
-- REQUIRES: database_hole/2026-08-14_lab_test_panels.sql already applied
-- (creates the lab_test_panels table this file inserts into).
--
-- Safe to run against an existing DB — idempotent, re-run any time.
-- ==============================================================================

-- ── 1. Every catalog test either package needs, guaranteed to exist ──────────
-- Codes match migrations 10/12/13 where those already define the same test
-- (LIPID_PROFILE, MICROSCOPY_GEN, BLOOD_SUGAR_FBS) — ON CONFLICT DO NOTHING
-- means this is a no-op there and only fills the gap where it's missing.

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

-- ── 2. MHC (Master Health Checkup) — 7 tests ──────────────────────────────────

WITH mhc_codes(code, ord) AS (
    VALUES
        ('CBC', 1),
        ('BLOOD_SUGAR_FBS', 2),
        ('LIPID_PROFILE', 3),
        ('LFT', 4),
        ('THYROID', 5),
        ('URINE_C', 6),
        ('MICROSCOPY_GEN', 7)
),
mhc_resolved AS (
    SELECT
        lt.hospital_id,
        array_agg(lt.id ORDER BY mc.ord) AS test_ids,
        count(*) AS matched_count
    FROM lab_tests lt
    JOIN mhc_codes mc ON mc.code = lt.code
    WHERE lt.is_active = true
    GROUP BY lt.hospital_id
)
INSERT INTO lab_test_panels (id, hospital_id, name, code, test_ids, is_active)
SELECT gen_random_uuid(), hospital_id, 'MHC (Master Health Checkup)', 'MHC', test_ids, true
FROM mhc_resolved
WHERE matched_count = (SELECT count(*) FROM mhc_codes)
ON CONFLICT (hospital_id, code) DO UPDATE
    SET test_ids = EXCLUDED.test_ids, name = EXCLUDED.name, updated_at = NOW();

-- ── 3. HHC (Health Checkup) — 5 tests ─────────────────────────────────────────

WITH hhc_codes(code, ord) AS (
    VALUES
        ('CBC', 1),
        ('BLOOD_SUGAR_FBS', 2),
        ('LIPID_PROFILE', 3),
        ('ELEC_RENAL', 4),
        ('TSH', 5)
),
hhc_resolved AS (
    SELECT
        lt.hospital_id,
        array_agg(lt.id ORDER BY hc.ord) AS test_ids,
        count(*) AS matched_count
    FROM lab_tests lt
    JOIN hhc_codes hc ON hc.code = lt.code
    WHERE lt.is_active = true
    GROUP BY lt.hospital_id
)
INSERT INTO lab_test_panels (id, hospital_id, name, code, test_ids, is_active)
SELECT gen_random_uuid(), hospital_id, 'HHC (Health Checkup)', 'HHC', test_ids, true
FROM hhc_resolved
WHERE matched_count = (SELECT count(*) FROM hhc_codes)
ON CONFLICT (hospital_id, code) DO UPDATE
    SET test_ids = EXCLUDED.test_ids, name = EXCLUDED.name, updated_at = NOW();
