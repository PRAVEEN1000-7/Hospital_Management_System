"""
One-time seed: ensure every active hospital has the standard Indian GST slabs
(0/5/12/18/28%) as active tax_configurations rows.

Without at least one slab configured, the GST-rate dropdowns on Purchase
Orders and Invoices have nothing to offer but 0% — this unblocks that for
hospitals that never configured any (also self-serviceable going forward via
Settings -> Tax Configuration -> "Add Standard GST Slabs").

Idempotent: skips any (hospital, code) pair that already exists.
"""
import sys
sys.path.insert(0, '.')

from datetime import date
from decimal import Decimal

import app.main  # noqa: F401 — registers all models before querying
from app.database import SessionLocal
from app.models.user import Hospital
from app.models.tax_config import TaxConfiguration

STANDARD_RATES = [
    ("GST0", "GST 0%", Decimal("0")),
    ("GST5", "GST 5%", Decimal("5")),
    ("GST12", "GST 12%", Decimal("12")),
    ("GST18", "GST 18%", Decimal("18")),
    ("GST28", "GST 28%", Decimal("28")),
]


def main() -> None:
    db = SessionLocal()
    total_created = 0
    try:
        hospitals = db.query(Hospital).filter(Hospital.is_active == True).all()
        for hosp in hospitals:
            existing_codes = {
                c.code
                for c in db.query(TaxConfiguration.code)
                .filter(TaxConfiguration.hospital_id == hosp.id)
                .all()
            }
            created_here = 0
            for code, name, rate in STANDARD_RATES:
                if code in existing_codes:
                    continue
                db.add(TaxConfiguration(
                    hospital_id=hosp.id,
                    name=name,
                    code=code,
                    rate_percentage=rate,
                    applies_to="both",
                    is_compound=False,
                    is_active=True,
                    effective_from=date.today(),
                ))
                created_here += 1
                total_created += 1
            if created_here:
                print(f"{hosp.name} ({hosp.id}): added {created_here} slab(s)")
            else:
                print(f"{hosp.name} ({hosp.id}): already has all standard slabs, skipped")
        db.commit()
        print(f"\nDone. Created {total_created} tax slab row(s) across {len(hospitals)} hospital(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
