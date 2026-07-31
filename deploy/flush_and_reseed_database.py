#!/usr/bin/env python3
"""
Flush ALL data from the HMS database, keep the schema (tables/columns/
constraints) exactly as-is, then re-seed the essentials via
seed_essential_data.py so you can log back in as a fresh Super Admin and
start onboarding real hospitals.

THIS IS IRREVERSIBLE. It deletes every row in every table in the `public`
and `saas_core` schemas — every hospital, patient, appointment, invoice,
inventory record, everything. Nothing is dropped structurally (no DROP
TABLE), only DELETEd. Take a full pg_dump backup before running this.

Usage (run from backend/, inside the venv, on the server):
    python ../deploy/flush_and_reseed_database.py --confirm FLUSH

What it does, in order:
  1. Refuses to run without --confirm FLUSH (exact match).
  2. Verifies every migration file seed_essential_data.py is about to
     replay actually exists on disk — BEFORE touching any data. (An
     earlier version of this script referenced a migration file that had
     since been deleted from database_hole/ and only found out when it
     tried to run it — after the TRUNCATE had already happened. This
     check exists specifically so that class of bug fails safe.)
  3. Prints every table that will be truncated and asks you to type the
     database name back as a second confirmation.
  4. TRUNCATEs every table in `public` + `saas_core` (single statement,
     CASCADE, so FK order is handled automatically) — no DROP, no ALTER,
     the schema itself is untouched.
  5. Calls seed_essential_data.run_all() to restore everything needed to
     log in again — see that file for exactly what it does (schema/
     reference migrations, system roles, the Platform placeholder
     hospital/tenant, one Super Admin account). Kept in a separate file so
     it can also be run on its own — re-seeding without re-flushing, or
     checking the essentials are present on an existing database — and so
     the two scripts can't drift apart from duplicated logic.
"""
import argparse
import sys
from pathlib import Path

# See the matching comment in seed_essential_data.py — forces UTF-8 output
# so the print()s below never depend on the host console's codepage.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import text  # noqa: E402
from app.database import SessionLocal  # noqa: E402
import seed_essential_data as seed  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--confirm", required=True, help='Must be exactly "FLUSH" to proceed')
    parser.add_argument("--superadmin-username", default="superadmin_hms")
    parser.add_argument("--superadmin-email", default="superadmin@mecandria.com")
    parser.add_argument("--superadmin-password", default="Superadmin@123")
    args = parser.parse_args()

    if args.confirm != "FLUSH":
        print('Refusing to run — pass --confirm FLUSH exactly.')
        sys.exit(1)

    # Fail fast on a missing migration file BEFORE anything destructive runs.
    missing = seed.missing_migration_files()
    if missing:
        print("Refusing to run — these migration files are missing from database_hole/:")
        for f in missing:
            print(f"  - {f}")
        print("Nothing has been touched. Fix the file list or restore the files, then re-run.")
        sys.exit(1)

    conn = seed.db_conn_args()

    db = SessionLocal()
    tables = db.execute(text(
        "SELECT table_schema, table_name FROM information_schema.tables "
        "WHERE table_schema IN ('public','saas_core') AND table_type='BASE TABLE'"
    )).fetchall()
    db.close()

    print("=" * 70)
    print(f"About to PERMANENTLY DELETE ALL DATA in database '{conn['dbname']}' on {conn['host']}:{conn['port']}")
    print(f"({len(tables)} tables across public + saas_core — structure is kept, only data is wiped)")
    print("=" * 70)
    typed = input(f"Type the database name ('{conn['dbname']}') to proceed, anything else cancels: ")
    if typed != conn["dbname"]:
        print("Cancelled — input did not match database name.")
        sys.exit(1)

    # ── TRUNCATE everything ──────────────────────────────────────────────
    qualified = [f'"{s}"."{t}"' for s, t in tables]
    print(f"\nTruncating {len(qualified)} tables...")
    db = SessionLocal()
    db.execute(text(f"TRUNCATE TABLE {', '.join(qualified)} RESTART IDENTITY CASCADE"))
    db.commit()
    db.close()
    print("  ✓ All tables truncated. Schema untouched.")

    # ── Re-seed everything essential ────────────────────────────────────
    seed.run_all(args.superadmin_username, args.superadmin_email, args.superadmin_password)


if __name__ == "__main__":
    main()
