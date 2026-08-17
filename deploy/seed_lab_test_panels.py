#!/usr/bin/env python3
"""
Seed the MHC (Master Health Checkup) and HHC (Health Checkup) lab test
packages, for one or all hospitals.

CONTAINS NO HOSPITAL-SPECIFIC OR ENVIRONMENT-SPECIFIC DATA. There is no
hardcoded hospital id, name, or local-only fixture anywhere in this file —
audited line by line to confirm it. Every hospital it touches comes from
querying the `hospitals` table of whichever database you point it at. Run
this against your local dev database and it only ever creates/updates rows
for your local dev hospitals; run it against production and it only ever
touches production's own real hospitals. It is safe by construction to run
against production — nothing here can "leak" local test data into it.

Ensures two catalog tests exist first (CBC and a standalone TSH — both were
missing from the originally seeded lab_tests catalog), then creates/updates
the two named packages by resolving each member test by NAME against that
hospital's own catalog (test IDs differ per database, so matching by name is
what makes this portable between environments instead of copying raw rows).

Idempotent — safe to re-run: an existing package's test_ids are refreshed to
match this script's list rather than duplicated; an existing catalog test
(matched by its code) is left untouched rather than recreated.

Skips (with a clear message, never crashes) any hospital whose catalog is
missing a test this script can't itself invent — e.g. no "Lipid Profile" row
at all for that hospital. Re-run after adding it.

Usage (run from backend/, inside the venv):
    python ../deploy/seed_lab_test_panels.py --dry-run       # preview only, no writes — always run this first on production
    python ../deploy/seed_lab_test_panels.py                 # apply, all hospitals
    python ../deploy/seed_lab_test_panels.py --hospital-id <uuid>
    python ../deploy/seed_lab_test_panels.py --hospital-id <uuid> --dry-run
"""
import argparse
import sys
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal  # noqa: E402
from app.models.user import Hospital  # noqa: E402
from app.models.lab import LabTest, LabTestPanel  # noqa: E402

# New catalog tests this feature needs that weren't in the original seed.
EXTRA_TESTS = [
    {"name": "CBC (Complete Blood Count)", "code": "CBC", "category": "Haematology", "sample_type": "Blood"},
    {"name": "TSH (Thyroid Stimulating Hormone)", "code": "TSH", "category": "Biochemistry", "sample_type": "Blood"},
]

# code -> (display name, member test names resolved against the catalog)
PANELS = {
    "MHC": {
        "name": "MHC (Master Health Checkup)",
        "tests": [
            "CBC (Complete Blood Count)", "Blood Sugar (FBS)", "Lipid Profile",
            "Liver Function Test (LFT)", "Thyroid Profile (T3, T4, TSH)",
            "Urine Complete (Routine Urinalysis)", "Microscopy (General)",
        ],
    },
    "HHC": {
        "name": "HHC (Health Checkup)",
        "tests": [
            "CBC (Complete Blood Count)", "Blood Sugar (FBS)", "Lipid Profile",
            "Electrolytes & Renal Profile", "TSH (Thyroid Stimulating Hormone)",
        ],
    },
}


def seed_hospital(db, hospital, dry_run: bool) -> None:
    hid = hospital.id
    label = f"{hospital.name} ({hid})"
    prefix = "  [DRY RUN] would " if dry_run else "  "

    # 1. Ensure the extra catalog tests exist (matched by code, the natural key).
    for t in EXTRA_TESTS:
        existing = db.query(LabTest).filter(LabTest.hospital_id == hid, LabTest.code == t["code"]).first()
        if existing:
            continue
        print(f"{prefix}add catalog test '{t['name']}' ({t['code']}) for {label}")
        if not dry_run:
            db.add(LabTest(
                hospital_id=hid, name=t["name"], code=t["code"],
                category=t["category"], sample_type=t["sample_type"],
                price=0, is_active=True,
            ))
    db.flush()

    # 2. Resolve every needed test by name against this hospital's own catalog.
    # In dry-run mode, don't rely on the (unflushed-to-DB) tests added above —
    # re-derive what the catalog would contain so the preview is accurate even
    # though nothing was actually inserted.
    by_name = {
        t.name: t.id
        for t in db.query(LabTest).filter(LabTest.hospital_id == hid, LabTest.is_active == True).all()
    }
    if dry_run:
        for t in EXTRA_TESTS:
            by_name.setdefault(t["name"], "<new-id-not-yet-assigned>")

    for code, spec in PANELS.items():
        missing = [n for n in spec["tests"] if n not in by_name]
        if missing:
            print(f"  SKIP {code} for {label}: catalog is missing {missing}")
            continue
        test_ids = [by_name[n] for n in spec["tests"]]

        panel = db.query(LabTestPanel).filter(LabTestPanel.hospital_id == hid, LabTestPanel.code == code).first()
        if panel:
            print(f"{prefix}update {code} for {label} ({len(test_ids)} tests)")
            if not dry_run:
                panel.test_ids = test_ids
                panel.name = spec["name"]
        else:
            print(f"{prefix}create {code} for {label} ({len(test_ids)} tests)")
            if not dry_run:
                db.add(LabTestPanel(hospital_id=hid, name=spec["name"], code=code, test_ids=test_ids, is_active=True))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--hospital-id", help="Seed only this hospital. Default: every hospital.")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would change — no writes, rolled back at the end. Always run this first on production.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.hospital_id:
            target = db.query(Hospital).filter(Hospital.id == uuid.UUID(args.hospital_id)).first()
            if not target:
                raise SystemExit(f"No hospital found with id {args.hospital_id}")
            hospitals = [target]
        else:
            hospitals = db.query(Hospital).all()

        mode = "[DRY RUN] Previewing" if args.dry_run else "Seeding"
        print(f"{mode} MHC/HHC lab test packages for {len(hospitals)} hospital(s)...")
        for h in hospitals:
            seed_hospital(db, h, args.dry_run)

        if args.dry_run:
            db.rollback()
            print("Done. Dry run only — nothing was written. Re-run without --dry-run to apply.")
        else:
            db.commit()
            print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
