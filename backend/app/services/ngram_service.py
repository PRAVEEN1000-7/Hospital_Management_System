"""
Statistical (order-2 Markov chain / n-gram) autocomplete suggestion service.
Not AI/LLM: suggestions come purely from counting word sequences in a
hospital's own historical text, so no patient text ever leaves the
hospital's own database.

Scoped to the Prescription screen only (see VALID_FIELD_TYPES) — each
field's n-grams are kept in their own pool via field_type, since mixing e.g.
Diagnosis phrasing with Advice phrasing would produce nonsensical
suggestions.

Two entry points:
  - index_note(): incremental live learning, called from each field's
    "this record is now final" point (see the call sites in
    prescription_service.py and optical_service.py::create_optical_prescription).
  - get_suggestion(): query-time lookup used by the /suggestions API.

tokenize()/START/END are also imported by deploy/seed_ngram_model.py, which
does the initial bulk bootstrap from history — keeping the tokenizer here
(rather than duplicated in both places) means the two can never drift apart.
"""
import logging
import re
from collections import Counter
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql import func

from ..models.ngram import ClinicalNoteNgram

logger = logging.getLogger(__name__)

TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z'-]*|\d+(?:\.\d+)?")
START = "<START>"
END = "<END>"

MIN_SUPPORT = 2  # a candidate needs at least this much frequency to be suggested
MAX_CONTINUATION_WORDS = 5
MIN_CONFIDENCE_RATIO = 0.15  # candidate's share of its context's total frequency, to keep chaining

# Single source of truth for which fields have autocomplete. Referenced by
# schemas/suggestion.py (request validation) and deploy/seed_ngram_model.py
# (bootstrap registry) — never hand-duplicated a third time. Scoped to the
# Prescription screen only — pharmacy/optical fields were wired up and then
# deliberately scoped back out (their n-gram rows were purged; re-add the
# field_type here plus the write-side index_note() call to bring one back).
VALID_FIELD_TYPES = frozenset({
    "clinical_notes",                    # Prescription.clinical_notes
    "diagnosis",                         # Prescription.diagnosis
    "advice",                            # Prescription.advice
    "optical_prescription_notes",        # OpticalPrescription.notes
})


def tokenize(text: str) -> list[str]:
    if not text:
        return []
    return TOKEN_RE.findall(text.lower())


def index_note(db: Session, hospital_id, field_type: str, text: Optional[str]) -> None:
    """Incrementally fold one finalized record's n-grams into the model
    (upsert-with-increment). Non-blocking by design — callers wrap this in
    try/except so a failure here never breaks the caller's own commit."""
    if field_type not in VALID_FIELD_TYPES:
        logger.warning("index_note: unknown field_type %r, skipping", field_type)
        return

    tokens = tokenize(text)
    if not tokens:
        return

    padded = [START, START] + tokens + [END]
    counts: Counter = Counter()
    for i in range(2, len(padded)):
        next_token = padded[i]
        counts[(2, padded[i - 1], next_token)] += 1
        counts[(3, f"{padded[i - 2]} {padded[i - 1]}", next_token)] += 1

    if not counts:
        return

    values = [
        {
            "hospital_id": hospital_id,
            "field_type": field_type,
            "n": n,
            "context": context,
            "next_token": next_token,
            "frequency": freq,
        }
        for (n, context, next_token), freq in counts.items()
    ]
    stmt = pg_insert(ClinicalNoteNgram).values(values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["hospital_id", "field_type", "n", "context", "next_token"],
        set_={
            "frequency": ClinicalNoteNgram.frequency + stmt.excluded.frequency,
            "updated_at": func.now(),
        },
    )
    db.execute(stmt)
    db.commit()


def _top_candidates(db: Session, hospital_id, field_type: str, n: int, context: str, limit: int = 5) -> list[tuple[str, int]]:
    rows = (
        db.query(ClinicalNoteNgram.next_token, ClinicalNoteNgram.frequency)
        .filter(
            ClinicalNoteNgram.hospital_id == hospital_id,
            ClinicalNoteNgram.field_type == field_type,
            ClinicalNoteNgram.n == n,
            ClinicalNoteNgram.context == context,
        )
        .order_by(ClinicalNoteNgram.frequency.desc())
        .limit(limit)
        .all()
    )
    return [(next_token, freq) for next_token, freq in rows]


def get_suggestion(db: Session, hospital_id, field_type: str, text_before_caret: str) -> str:
    """Return a suggested continuation (possibly multi-word) for the given
    trailing text, or "" if the model has no confident guess."""
    if field_type not in VALID_FIELD_TYPES:
        logger.warning("get_suggestion: unknown field_type %r, returning empty", field_type)
        return ""

    if not text_before_caret:
        return ""

    ends_with_boundary = text_before_caret[-1].isspace()
    tokens = tokenize(text_before_caret)
    if not tokens:
        return ""

    partial_word = None
    if not ends_with_boundary:
        partial_word = tokens[-1]
        tokens = tokens[:-1]
        if len(partial_word) < 2:
            return ""

    context_tokens = ([START, START] + tokens)[-2:]

    output_tokens: list[str] = []
    first_step = True

    for _ in range(MAX_CONTINUATION_WORDS):
        trigram_context = " ".join(context_tokens)
        candidates = _top_candidates(db, hospital_id, field_type, 3, trigram_context)
        if not candidates:
            candidates = _top_candidates(db, hospital_id, field_type, 2, context_tokens[-1])
        if not candidates:
            break

        if first_step and partial_word:
            candidates = [(tok, freq) for tok, freq in candidates if tok.startswith(partial_word)]
            if not candidates:
                break

        total = sum(freq for _, freq in candidates)
        best_token, best_freq = candidates[0]

        if best_freq < MIN_SUPPORT:
            break
        if not first_step and (best_freq / total) < MIN_CONFIDENCE_RATIO:
            break
        if best_token == END:
            break

        if first_step and partial_word:
            output_tokens.append(best_token[len(partial_word):])
        else:
            output_tokens.append(best_token)

        context_tokens = [context_tokens[-1], best_token]
        first_step = False

    # NOTE: do not filter out empty strings here. output_tokens[0] is "" exactly
    # when the just-typed partial word ("hi") is itself already a complete word
    # in the vocabulary (as opposed to a prefix of a longer one, e.g. "pati" ->
    # "patient"). In that case the empty first element still needs to occupy
    # its slot in the join so the resulting string starts with a separating
    # space before the next real word — dropping it collapses "hi" + "how..."
    # into "hihow..." with no boundary between what's typed and the suggestion.
    return " ".join(output_tokens)
