#!/usr/bin/env python3
"""
Bootstrap (or rebuild) the statistical autocomplete n-gram model for one or
more hospitals and one or more fields, from each field's own historical text,
optionally blended with extra hand-supplied phrase/sentence files.

This is NOT the live-learning path — once a hospital is running, new records
are indexed incrementally by backend/app/services/ngram_service.py::index_note(),
called from each field's own "this record is now final" point (see
prescription_service.py::finalize_prescription, pharmacy_service.py's
create_sale/create_medicine/update_medicine/create_stock_adjustment,
optical_service.py's equivalents, dispensing_service.py::dispense_prescription).
This script is for (a) the initial bootstrap before enough live data exists,
and (b) folding in an external phrase list whenever one becomes available,
via --extra-corpus.

IMPORTANT — rebuild, not append, PER (hospital, field_type): each run DELETEs
and rebuilds only the target hospital+field's rows from scratch (that field's
current historical data, plus whatever --extra-corpus files you pass THIS
run for that field). It does not remember extra-corpus files from a previous
run, and rebuilding one field never touches any other field's rows for that
hospital. This makes "re-run after a new phrase file arrives" trivially safe.

Usage (run from backend/, inside the venv):
    python ../deploy/seed_ngram_model.py
    python ../deploy/seed_ngram_model.py --hospital-id <uuid>
    python ../deploy/seed_ngram_model.py --field clinical_notes --field diagnosis
    python ../deploy/seed_ngram_model.py --extra-corpus clinical_notes:/path/to/phrases.txt
    python ../deploy/seed_ngram_model.py --hospital-id <uuid> --extra-corpus diagnosis:a.txt --extra-corpus advice:b.txt

--extra-corpus is field-scoped: '<field_type>:<path>'. File format is plain
text, one phrase/sentence per line; blank lines and '#' comments are ignored.
Applied to every hospital rebuilt this run, only for that one field_type.

What it does, in order:
  1. Determines which hospital(s) to rebuild: either the one given via
     --hospital-id, or every hospital in the hospitals table.
  2. Determines which field(s) to rebuild: either the ones given via --field
     (repeatable), or all of ngram_service.VALID_FIELD_TYPES.
  3. Per (hospital, field_type): streams that field's historical text from
     its backing model/column (see FIELD_SOURCES below — Prescription fields
     are filtered to is_finalized=true; Medicine fields are naturally scoped
     to that hospital's own medicines since global/common medicines have
     hospital_id IS NULL and never match a specific hospital's filter),
     tokenizes each record, and accumulates bigram (n=2) + trigram (n=3)
     counts with <START>/<END> padding. Folds in any matching --extra-corpus
     lines the same way.
  4. In one transaction: deletes that hospital+field's existing
     clinical_note_ngrams rows, bulk-inserts the rebuilt counts.
  5. Prints a per-(hospital, field) summary.
"""
import argparse
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Optional

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal  # noqa: E402
from app.models.user import Hospital  # noqa: E402
from app.models.prescription import Prescription  # noqa: E402
from app.models.optical import OpticalPrescription  # noqa: E402
from app.models.ngram import ClinicalNoteNgram  # noqa: E402
from app.services.ngram_service import tokenize, START, END, VALID_FIELD_TYPES  # noqa: E402

_IS_FINALIZED = Prescription.is_finalized.is_(True)

# (field_type, Model, text column, extra filter or None). hospital_id scoping
# and non-null/non-empty text are applied uniformly in rebuild_field() below —
# only add an entry here if a field needs something beyond that (e.g.
# Prescription fields only count once finalized, to match the live-learning
# trigger which also only fires at finalize time). Scoped to the Prescription
# screen only — see the note on ngram_service.VALID_FIELD_TYPES.
FIELD_SOURCES: dict[str, tuple[Any, Any, Optional[Any]]] = {
    "clinical_notes": (Prescription, Prescription.clinical_notes, _IS_FINALIZED),
    "diagnosis": (Prescription, Prescription.diagnosis, _IS_FINALIZED),
    "advice": (Prescription, Prescription.advice, _IS_FINALIZED),
    "optical_prescription_notes": (OpticalPrescription, OpticalPrescription.notes, None),
}
assert set(FIELD_SOURCES) == set(VALID_FIELD_TYPES), "FIELD_SOURCES must cover exactly VALID_FIELD_TYPES"


def read_lines(path: str) -> list[str]:
    lines: list[str] = []
    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            lines.append(line)
    return lines


def parse_extra_corpus_args(specs: list[str]) -> dict[str, list[str]]:
    """'<field_type>:<path>' per spec, grouped by field_type."""
    by_field: dict[str, list[str]] = {}
    for spec in specs:
        if ":" not in spec:
            raise SystemExit(f"--extra-corpus must be '<field_type>:<path>', got: {spec!r}")
        field_type, path = spec.split(":", 1)
        if field_type not in VALID_FIELD_TYPES:
            raise SystemExit(f"--extra-corpus field_type {field_type!r} must be one of: {', '.join(sorted(VALID_FIELD_TYPES))}")
        by_field.setdefault(field_type, []).extend(read_lines(path))
    return by_field


def accumulate_counts(text: str, counts: Counter) -> None:
    tokens = tokenize(text)
    if not tokens:
        return
    padded = [START, START] + tokens + [END]
    for i in range(2, len(padded)):
        next_token = padded[i]
        bigram_context = padded[i - 1]
        trigram_context = f"{padded[i - 2]} {padded[i - 1]}"
        counts[(2, bigram_context, next_token)] += 1
        counts[(3, trigram_context, next_token)] += 1


def rebuild_field(db, hospital_id, field_type: str, extra_lines: list[str]) -> dict:
    model, column, extra_filter = FIELD_SOURCES[field_type]

    counts: Counter = Counter()
    records_processed = 0
    filters = [model.hospital_id == hospital_id, column.isnot(None), column != ""]
    if extra_filter is not None:
        filters.append(extra_filter)

    for (text,) in db.query(column).filter(*filters).yield_per(500):
        accumulate_counts(text, counts)
        records_processed += 1

    for line in extra_lines:
        accumulate_counts(line, counts)

    db.query(ClinicalNoteNgram).filter(
        ClinicalNoteNgram.hospital_id == hospital_id,
        ClinicalNoteNgram.field_type == field_type,
    ).delete()

    rows = [
        ClinicalNoteNgram(hospital_id=hospital_id, field_type=field_type, n=n, context=context, next_token=next_token, frequency=freq)
        for (n, context, next_token), freq in counts.items()
    ]
    db.bulk_save_objects(rows)
    db.commit()

    return {
        "records_processed": records_processed,
        "extra_lines_folded_in": len(extra_lines),
        "ngrams_written": len(rows),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--hospital-id", help="Rebuild only this hospital. Default: every hospital.")
    parser.add_argument(
        "--field",
        action="append",
        default=[],
        metavar="FIELD_TYPE",
        help=f"Rebuild only this field_type. Repeatable. Default: all of {sorted(VALID_FIELD_TYPES)}.",
    )
    parser.add_argument(
        "--extra-corpus",
        action="append",
        default=[],
        metavar="FIELD_TYPE:PATH",
        help="Field-scoped phrase file, e.g. 'diagnosis:/path/to/phrases.txt'. Repeatable.",
    )
    args = parser.parse_args()

    for f in args.field:
        if f not in VALID_FIELD_TYPES:
            raise SystemExit(f"--field {f!r} must be one of: {', '.join(sorted(VALID_FIELD_TYPES))}")
    field_types = args.field or sorted(VALID_FIELD_TYPES)

    extra_by_field = parse_extra_corpus_args(args.extra_corpus)
    for field_type, lines in extra_by_field.items():
        print(f"Loaded {len(lines)} extra-corpus line(s) for field '{field_type}'.")

    db = SessionLocal()
    try:
        if args.hospital_id:
            hospital_ids = [args.hospital_id]
        else:
            hospital_ids = [row[0] for row in db.query(Hospital.id).all()]

        if not hospital_ids:
            print("No hospitals found — nothing to seed.")
            return

        print(f"Rebuilding {len(field_types)} field(s) for {len(hospital_ids)} hospital(s)...")
        for hospital_id in hospital_ids:
            for field_type in field_types:
                summary = rebuild_field(db, hospital_id, field_type, extra_by_field.get(field_type, []))
                print(
                    f"  hospital {hospital_id} / {field_type}: "
                    f"{summary['records_processed']} records, "
                    f"{summary['extra_lines_folded_in']} extra lines, "
                    f"{summary['ngrams_written']} n-grams written"
                )
    finally:
        db.close()


if __name__ == "__main__":
    main()
