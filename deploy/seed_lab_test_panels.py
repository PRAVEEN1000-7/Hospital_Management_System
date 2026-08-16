#!/usr/bin/env python3
"""
Seed the MHC (Master Health Checkup) and HHC (Health Checkup) lab test
packages — the same data built and verified locally — reproducibly against
any database (local or live), for one or all hospitals.

Ensures two catalog tests exist first (CBC and a standalone TSH — both were
missing from the originally seeded lab_tests catalog), then creates/updates
the two named packages by resolving each member test by NAME against that
hospital's own catalog (test IDs differ per database, so matching by name is
what makes this portable between local and live).

Idempotent — safe to re-run: an existing package's test_ids are refreshed to
match this script's list rather than duplicated; an existing catalog test
(matched by its code) is left untouched rather than recreated.

Skips (with a clear message, never crashes) any hospital whose catalog is
missing a test this script can't itself invent — e.g. no "Lipid Profile" row
at all for that hospital. Re-run after adding it.

Usage (run from backend/, inside the venv):
    python ../deploy/seed_lab_test_panels.py
    python ../deploy/seed_lab_test_panels.py --hospital-id <uuid>
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


def seed_hospital(db, hospital) -> None:
    hid = hospital.id
    label = f"{hospital.name} ({hid})"

    # 1. Ensure the extra catalog tests exist (matched by code, the natural key).
    for t in EXTRA_TESTS:
        existing = db.query(LabTest).filter(LabTest.hospital_id == hid, LabTest.code == t["code"]).first()
        if existing:
            continue
        db.add(LabTest(
            hospital_id=hid, name=t["name"], code=t["code"],
            category=t["category"], sample_type=t["sample_type"],
            price=0, is_active=True,
        ))
    db.flush()

    # 2. Resolve every needed test by name against this hospital's own catalog.
    by_name = {
        t.name: t.id
        for t in db.query(LabTest).filter(LabTest.hospital_id == hid, LabTest.is_active == True).all()
    }

    for code, spec in PANELS.items():
        missing = [n for n in spec["tests"] if n not in by_name]
        if missing:
            print(f"  SKIP {code} for {label}: catalog is missing {missing}")
            continue
        test_ids = [by_name[n] for n in spec["tests"]]

        panel = db.query(LabTestPanel).filter(LabTestPanel.hospital_id == hid, LabTestPanel.code == code).first()
        if panel:
            panel.test_ids = test_ids
            panel.name = spec["name"]
            print(f"  Updated {code} for {label} ({len(test_ids)} tests)")
        else:
            db.add(LabTestPanel(hospital_id=hid, name=spec["name"], code=code, test_ids=test_ids, is_active=True))
            print(f"  Created {code} for {label} ({len(test_ids)} tests)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--hospital-id", help="Seed only this hospital. Default: every hospital.")
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

        print(f"Seeding MHC/HHC lab test packages for {len(hospitals)} hospital(s)...")
        for h in hospitals:
            seed_hospital(db, h)
        db.commit()
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
