-- ==============================================================================
-- 14 — CLINICAL NOTES AUTOCOMPLETE (N-GRAM MODEL)
--
-- Adds clinical_note_ngrams: a per-hospital, statistical (non-AI) word/phrase
-- prediction table that powers an inline "ghost text" suggestion on the
-- Clinical Notes field of the prescription screen, similar to Gmail Smart
-- Compose but trained purely on each hospital's own historical notes — no
-- LLM, no patient text ever leaves the hospital's own database.
--
-- Model: order-2 Markov chain (bigram + trigram), scoped strictly per
-- hospital_id — a hospital's suggestions must never be built from, or
-- visible to, another hospital's notes (see backend/app/services/
-- ngram_service.py and backend/app/routers/suggestions.py for the query-time
-- enforcement of this via current_user.hospital_id).
--
-- Rows are written two ways:
--   1. deploy/seed_ngram_model.py — a one-off/rerunnable bootstrap script
--      that rebuilds a hospital's rows from its existing finalized
--      clinical_notes (and, optionally, an extra hand-supplied phrase file).
--   2. backend/app/services/ngram_service.py::index_note() — incremental
--      live learning, called once a prescription is finalized (not on every
--      draft save, so abandoned/incorrect drafts never pollute the model).
--
-- Safe to run against an existing DB — every statement is idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS clinical_note_ngrams (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id  UUID NOT NULL REFERENCES hospitals(id),
    n            SMALLINT NOT NULL CHECK (n IN (2, 3)),  -- 2 = bigram (1-word context), 3 = trigram (2-word context)
    context      TEXT NOT NULL,                           -- lowercase, space-joined (n-1) preceding tokens
    next_token   TEXT NOT NULL,                            -- lowercase predicted token, or the literal '<END>' marker
    frequency    INTEGER NOT NULL DEFAULT 1,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (hospital_id, n, context, next_token)
);

-- The UNIQUE constraint above already gives an equality index on
-- (hospital_id, n, context); this second index adds frequency DESC so the
-- "top suggestions for this context" query (ORDER BY frequency DESC LIMIT k)
-- doesn't need an in-memory sort.
CREATE INDEX IF NOT EXISTS idx_clinical_note_ngrams_lookup
    ON clinical_note_ngrams (hospital_id, n, context, frequency DESC);
