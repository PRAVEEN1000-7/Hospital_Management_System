-- ==============================================================================
-- 15 — NGRAM FIELD_TYPE SCOPING + MEDICINE MISSING COLUMNS
--
-- Two independent, additive changes bundled together (same-session work):
--
-- 1. clinical_note_ngrams.field_type — the statistical autocomplete model
--    (see 14_clinical_note_ngrams.sql) is being extended from one field
--    (Clinical Notes) to ten: Diagnosis, Advice, Optical Prescription Notes,
--    Pharmacy/Optical Sale Notes, Medicine Description/Drug Interaction
--    Notes/Side Effects, and Stock Adjustment Reason. Without a field_type
--    column, all of these completely different phrasing domains would share
--    one n-gram pool per hospital and produce nonsensical suggestions (e.g.
--    a Diagnosis field suggesting stock-adjustment phrasing). DEFAULT
--    'clinical_notes' backfills every existing row — this table already has
--    real seeded + live-learned data from the shipped Clinical Notes
--    feature, so this must stay additive, never destructive. The unique
--    constraint and lookup index are rebuilt to include field_type, since
--    two different fields could otherwise collide on the same
--    (hospital_id, n, context, next_token) tuple and corrupt each other's
--    frequency counts.
--
-- 2. medicines.drug_interaction_notes / medicines.side_effects — pre-existing
--    bug fix, unrelated to autocomplete: the Medicine Form UI has had these
--    two textareas for a while, and the Pydantic schemas already accept
--    them, but no matching DB column ever existed, so anything typed into
--    them was silently discarded on save. Adding the columns lets them
--    persist (backend/app/services/pharmacy_service.py's create/update
--    already do generic column-driven assignment, so no service code change
--    should be needed beyond these columns existing).
--
-- Safe to run against an existing DB — every statement is idempotent.
-- ==============================================================================

ALTER TABLE clinical_note_ngrams ADD COLUMN IF NOT EXISTS field_type TEXT NOT NULL DEFAULT 'clinical_notes';

ALTER TABLE clinical_note_ngrams DROP CONSTRAINT IF EXISTS uq_clinical_note_ngrams_key;
ALTER TABLE clinical_note_ngrams DROP CONSTRAINT IF EXISTS clinical_note_ngrams_hospital_id_n_context_next_token_key;
ALTER TABLE clinical_note_ngrams ADD CONSTRAINT uq_clinical_note_ngrams_key
    UNIQUE (hospital_id, field_type, n, context, next_token);

DROP INDEX IF EXISTS idx_clinical_note_ngrams_lookup;
CREATE INDEX IF NOT EXISTS idx_clinical_note_ngrams_lookup
    ON clinical_note_ngrams (hospital_id, field_type, n, context, frequency DESC);

ALTER TABLE medicines ADD COLUMN IF NOT EXISTS drug_interaction_notes TEXT;
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS side_effects TEXT;
