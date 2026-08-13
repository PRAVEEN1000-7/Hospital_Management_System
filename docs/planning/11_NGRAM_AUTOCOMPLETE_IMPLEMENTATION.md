# Statistical (N-gram) Autocomplete for Free-Text Fields

Status: **Implemented and live**
Modules covered: **Prescriptions only** (scoped down from an earlier
Prescriptions + Pharmacy + Optical build — see §8)
Model type: **Statistical (order-2 Markov chain / n-gram)** — not AI/LLM

---

## 1. What this is

An inline "ghost text" autocomplete — Gmail Smart Compose / GitHub Copilot
style — on the Prescription screen's free-text fields. As a user types, a
grey suggested continuation appears right after the cursor once they pause;
Tab accepts it, Escape or moving the cursor dismisses it.

Unlike an LLM-based approach, suggestions come purely from **counting word
sequences** in each hospital's own historical data. No text is ever sent to
a third-party API — the entire model lives in this app's own Postgres
database. This was a deliberate choice over an LLM for three reasons:
cost (no per-keystroke API billing), latency (a DB lookup is sub-50ms vs.
200-500ms+ for an LLM round trip), and compliance (patient text never
leaves the hospital's own infrastructure, sidestepping the BAA question
that's still open for the separate Deepgram speech-to-text proposal in
`10_SPEECH_TO_TEXT_PRESCRIPTION_DEEPGRAM.md`).

## 2. Which fields have it

| `field_type` | UI location | Backend column |
|---|---|---|
| `clinical_notes` | Prescription screen → Clinical Notes | `Prescription.clinical_notes` |
| `diagnosis` | Prescription screen → Diagnosis | `Prescription.diagnosis` |
| `advice` | Prescription screen → Advice | `Prescription.advice` |
| `optical_prescription_notes` | Prescription screen → Optical Notes (eye-diagram card) | `OpticalPrescription.notes` |

Each `field_type` keeps its own isolated suggestion pool per hospital —
Diagnosis phrasing never bleeds into Advice phrasing, etc.

The canonical list lives in exactly one place:
`backend/app/services/ngram_service.py::VALID_FIELD_TYPES`.

## 3. How the model works

### The core idea: n-grams with backoff

An **n-gram** is a sequence of *n* words. This system stores two sizes at
once for every word observed:

- **Bigram (n=2)**: 1 word of context → next word. `"presents" → "with"`
- **Trigram (n=3)**: 2 words of context → next word. `"patient presents" → "with"`

At suggestion time, the trigram (more specific, better prediction) is tried
first; if that exact 2-word context has never been seen, it falls back to
the bigram (1 word of context). This is called **backoff** in n-gram
language modeling — always prefer more context, drop to less only when
there's no data for it.

```
User has typed: "...patient presents"
        │
        ▼
Try trigram: context = "patient presents" → found "with" (freq 3)? use it.
        │ (if not found)
        ▼
Fall back to bigram: context = "presents" → found "with" (freq 2)? use it.
        │ (if not found)
        ▼
No suggestion.
```

Once a word is predicted, the system **chains**: it slides the context
window forward by one and repeats, up to `MAX_CONTINUATION_WORDS` (5), so a
single pause in typing can surface a multi-word continuation
("with fever and cough"), not just the next single word. Chaining stops
early if:
- the top candidate's frequency is below `MIN_SUPPORT` (2) — avoids acting
  on a single one-off note as if it were a real pattern,
- the top candidate's share of its context's total observed frequency drops
  below `MIN_CONFIDENCE_RATIO` (0.15) — stops chaining once the prediction
  gets too uncertain,
- the model predicts the special `<END>` marker (the note ended there in
  training data).

### Word-completion vs. next-word prediction

The lookup handles two cases depending on whether the cursor follows a
completed word (trailing whitespace) or a partial word being typed:
- **Next-word** ("patient presents " — trailing space): predicts a whole
  new word from scratch.
- **Word-completion** ("pati" — no trailing space): filters candidates to
  ones starting with "pati" (e.g. "patient"), and the suggested text is
  only the *remainder* ("ent"), so it attaches directly at the cursor with
  no extra space. If the just-typed text already exactly matches a known
  word (e.g. "hi" is itself a complete word, not a prefix of a longer one),
  the remainder is an empty string — the code deliberately keeps that empty
  slot in the output join so the *next* real word still gets a leading
  space (see the `NOTE` comment in `get_suggestion()`; omitting it was a
  real bug caught during testing — it collapsed "hi" + "how are you" into
  "hihow are you").

### Tokenization

`ngram_service.tokenize()` uses one regex,
`[a-zA-Z][a-zA-Z'-]*|\d+(?:\.\d+)?`, lowercasing everything and dropping all
punctuation (punctuation is never modeled as a token). `<START>` and `<END>`
are synthetic padding tokens marking the beginning/end of a note, so the
model can predict a plausible *first* word and know when a continuation
should stop rather than run on forever.

## 4. Database schema

Single table, `clinical_note_ngrams` (name predates the `field_type`
column — kept as-is rather than renamed, to avoid migration risk on a table
with real live data):

```sql
CREATE TABLE clinical_note_ngrams (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id  UUID NOT NULL REFERENCES hospitals(id),
    field_type   TEXT NOT NULL DEFAULT 'clinical_notes',
    n            SMALLINT NOT NULL CHECK (n IN (2, 3)),
    context      TEXT NOT NULL,
    next_token   TEXT NOT NULL,
    frequency    INTEGER NOT NULL DEFAULT 1,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (hospital_id, field_type, n, context, next_token)
);
CREATE INDEX idx_clinical_note_ngrams_lookup
    ON clinical_note_ngrams (hospital_id, field_type, n, context, frequency DESC);
```

| Column | Meaning |
|---|---|
| `hospital_id` | Multi-tenancy boundary — every query/write is scoped by this. Verified: a Hospital A user's request for a context that only exists in Hospital B's data returns empty. |
| `field_type` | Domain boundary — see §2. |
| `n` | `2` = bigram (1-word context) or `3` = trigram (2-word context). |
| `context` | The preceding word(s), lowercase, space-joined. `<START>` marks the beginning of a note. |
| `next_token` | The predicted word, or `<END>`. |
| `frequency` | How many times this exact sequence has been observed — the ranking/confidence signal. |
| `updated_at` | Last increment time (bookkeeping; not currently used for recency-weighting). |

Created by `database_hole/14_clinical_note_ngrams.sql`; the `field_type`
column (and, in the same migration, `medicines.drug_interaction_notes`/
`medicines.side_effects` — a pre-existing, unrelated persistence bug fixed
in the same pass, kept even though those fields no longer feed the ngram
model, see §8) were added by
`database_hole/15_ngram_field_type_and_medicine_columns.sql`. Both
migrations are idempotent and were applied without any data loss to the
pre-existing Clinical-Notes-only rows (backfilled to
`field_type = 'clinical_notes'`).

## 5. Backend implementation

### `backend/app/services/ngram_service.py`

Two entry points:

- **`index_note(db, hospital_id, field_type, text)`** — incremental live
  learning. Tokenizes the text, extracts bigram+trigram counts, and
  **upserts with increment** via Postgres `ON CONFLICT ... DO UPDATE SET
  frequency = frequency + excluded.frequency`. Called once a record becomes
  "final" (see below) — never on drafts, so abandoned/incorrect drafts
  never pollute the model.
- **`get_suggestion(db, hospital_id, field_type, text_before_caret)`** —
  the lookup/backoff/chaining logic described in §3. Returns `""` if the
  model has no confident guess.

Both validate `field_type` against `VALID_FIELD_TYPES` defensively
(silent no-op + log warning on an unrecognized value — these are
non-blocking internal calls, never meant to raise into a caller's commit
path).

### API — `backend/app/routers/suggestions.py`

```
POST /api/v1/suggestions/note
Body: { "field": "diagnosis", "text": "patient presents" }
Response: { "suggestion": "with fever" }
```

Deliberately **not** gated behind the Prescriptions module's subscription
check (unlike most routers in this app) — it's read-only, returns only
aggregate word-frequency continuations (no PII), and is already strictly
scoped by `current_user.hospital_id`. This was chosen originally so a
Pharmacy/Optical-only hospital wouldn't be blocked if those fields got
added later; it's kept even after those fields were scoped back out (§8),
in case they're re-added.

### Live-learning call sites

`index_note()` is called from exactly 4 places, both in
`prescription_service.py::finalize_prescription`:

```python
index_note(db, rx.hospital_id, "clinical_notes", rx.clinical_notes)
index_note(db, rx.hospital_id, "diagnosis", rx.diagnosis)
index_note(db, rx.hospital_id, "advice", rx.advice)
```
and one more in `optical_service.py::create_optical_prescription` for
`optical_prescription_notes` (triggered by its own separate API call from
`PrescriptionBuilder.tsx`, which fires just before — not as part of —
`finalize_prescription()`).

Every call site follows the same non-blocking pattern already established
elsewhere in this codebase (e.g. `notify_hospital_users` calls):
```python
try:
    from .ngram_service import index_note
    index_note(db, hospital_id, "<field_type>", text)
except Exception:
    logger.warning("Failed to index ... into ngram model", exc_info=True)
```
A failure here can never break the actual business operation (finalizing a
prescription, etc.).

`get_suggestion()` has exactly one caller: the `/suggestions/note` route
handler.

## 6. Frontend implementation

### `frontend/src/components/common/AutocompleteField.tsx`

A single reusable component wrapping either an `<input>` or `<textarea>`,
used at all 4 UI sites (so the ghost-text logic exists in exactly one
place, not copy-pasted per field). Props mirror a normal controlled
input/textarea (`value`, `onChange`, `className`, `placeholder`, `rows`,
`required`, `disabled`, `readOnly`) plus `as` (`'input' | 'textarea'`) and
`field` (the `field_type` key). It owns its own ref and suggestion state
internally, so multiple instances never interfere with each other.

Internals:
- **`frontend/src/hooks/useGhostTextSuggestion.ts`** — 250ms debounce after
  a keystroke; only fires if the cursor is still at the very end of the
  text with no active selection; cancels any in-flight request
  (`AbortController`) if a newer one fires first.
- **`frontend/src/services/suggestionService.ts`** — thin POST wrapper to
  `/suggestions/note`, sending only the trailing ~200 characters (less data
  in transit/logs per keystroke).
- **`frontend/src/utils/caretPosition.ts`** — computes the on-screen pixel
  position of the cursor using the mirror-div technique (an off-screen
  `<div>` styled identically to the real field, filled with the text up to
  the cursor, with a marker `<span>` measured for its offset) — handles
  both wrapped multi-line `<textarea>` text and single-line `<input>`
  horizontal scrolling.
- The suggestion itself is rendered via a `createPortal` into
  `document.body`, positioned `fixed` at the computed coordinates, and
  re-glued on scroll/resize (same pattern already used elsewhere in this
  codebase for the medicine-search dropdown).
- **Tab-to-accept** uses the "native setter + dispatch a real `input`
  event" trick rather than hand-constructing a fake React event — React
  intercepts the native `value` setter for controlled inputs, so this is
  the only reliable way to programmatically trigger a proper `onChange`
  call from outside a real keystroke.

### Where it's wired in

`PrescriptionBuilder.tsx` only — Clinical Notes, Diagnosis, Advice, Optical
Notes.

## 7. Bootstrapping / seeding

`deploy/seed_ngram_model.py` — a standalone, re-runnable script (follows
the same pattern as `deploy/flush_and_reseed_database.py`) that builds the
initial model from **existing historical data**, before enough live traffic
accumulates on its own.

```bash
# From backend/, inside the venv:
python ../deploy/seed_ngram_model.py                          # every hospital, every field
python ../deploy/seed_ngram_model.py --hospital-id <uuid>      # one hospital, every field
python ../deploy/seed_ngram_model.py --field diagnosis --field advice   # specific fields only
python ../deploy/seed_ngram_model.py --extra-corpus diagnosis:/path/to/phrases.txt   # blend in an external phrase list
```

Driven by a declarative `FIELD_SOURCES` registry (one entry per
`field_type`, pointing at its ORM model/column) — covers all 4 fields via
one generic loop rather than 4 hand-written ones, and would extend cleanly
if a field is ever re-added. **Rebuild, not append**, scoped to exactly
`(hospital, field_type)` — each run deletes and rebuilds only that specific
pair, so re-seeding one field can never wipe another field's data (this was
an actual bug caught and fixed during implementation: an earlier version
deleted by `hospital_id` alone).

## 8. History: Pharmacy/Optical was built, tested, then scoped back out

An earlier pass extended this same mechanism to 6 more fields across
Pharmacy and Optical (Dispensing/Sale Notes, Medicine Description/Drug
Interaction Notes/Side Effects, Stock Adjustment Reason). It was fully
implemented, verified end-to-end (multi-tenancy isolation, the
`Medicine.hospital_id IS NULL` global-medicine guard, the intentional
pharmacy+optical shared pool for Stock Adjustment Reason, a seed-script
delete-scoping regression test), and briefly live — then deliberately
scoped back down to Prescriptions only, per explicit direction. That work
was reverted:
- The 6 pharmacy/optical UI sites went back to plain `<textarea>`/`<input>`.
- The corresponding `index_note()` call sites in `pharmacy_service.py`,
  `optical_service.py`, and `dispensing_service.py` were removed (including
  the `_index_medicine_ngrams()` helper, which no longer had any caller).
- `VALID_FIELD_TYPES` and the seed script's `FIELD_SOURCES` were narrowed
  back to the 4 Prescription fields.
- The now-orphaned ngram rows for the 6 removed field_types were deleted
  from the table.

**Kept, not reverted**: the `medicines.drug_interaction_notes`/
`medicines.side_effects` DB columns — that was a genuine pre-existing
persistence bug fix (those fields were typed into the Medicine Form UI and
silently discarded before), unrelated to autocomplete, and still valid.
They just no longer feed the ngram model.

Re-adding a field is a small, mechanical change if needed later: add its
`field_type` to `VALID_FIELD_TYPES` and `FIELD_SOURCES`, add one
`index_note()` call at its "this record is final" point, and swap its
`<textarea>`/`<input>` for `<AutocompleteField as="..." field="...">` in
the frontend — the reusable component and all the supporting
hook/service/utility code were left in place since Prescriptions still
uses them.

## 9. Known limitation: no cross-field sharing

Each field's pool is 100% isolated — if "hi how are you" has been typed
once in Clinical Notes and once in Advice, neither field individually
reaches `MIN_SUPPORT` (2) on its own, even though the phrase is objectively
common. A hybrid fix was scoped but **not built**: every `index_note()`
call would also write into a shared `field_type = '__global__'` pool, and
`get_suggestion()` would fall back to that pool when the field-specific
lookup comes up empty — preserving per-field precision for genuinely
domain-specific phrasing while letting generic/common text warm up faster
everywhere. See conversation history for the manual SQL used to
prototype/validate this idea against real data before committing to any
code change.

## 10. Verification performed

- Migration backward-compatibility: row counts identical before/after,
  all pre-existing rows correctly backfilled to `field_type='clinical_notes'`.
- Multi-tenancy isolation confirmed: a canary phrase indexed for one
  hospital is never visible to another hospital's suggestions.
- No cross-contamination between `diagnosis`/`advice`/`clinical_notes` from
  a single `finalize_prescription()` call — each field's canary marker only
  ever appears in its own pool.
- Seed script's field-scoped delete regression-tested: rebuilding one
  field_type leaves every other field_type's row count for that hospital
  untouched.
- End-to-end UI test (real login → real prescription create/finalize →
  live n-gram increment → suggestion API → ghost-text render → Tab-accept
  insertion) confirmed via a headless-browser walkthrough with a screenshot
  showing the grey suggestion rendered inline.
- (From the reverted Pharmacy/Optical pass, for the record: multi-tenancy
  isolation, the `Medicine.hospital_id IS NULL` guard, and the intentional
  pharmacy+optical shared Stock Adjustment Reason pool were all confirmed
  working before that scope was removed.)
