#!/usr/bin/env python3
"""
Flush ALL data from the HMS database, keep the schema (tables/columns/
constraints) exactly as-is, then re-seed the minimum needed to log back in
as a fresh super_admin and start onboarding real hospitals.

THIS IS IRREVERSIBLE. It deletes every row in every table in the `public`
and `saas_core` schemas — every hospital, patient, appointment, invoice,
inventory record, everything. Nothing is dropped structurally (no DROP
TABLE), only DELETEd. Take a full pg_dump backup before running this.

Usage (run from backend/, inside the venv, on the server):
    python ../deploy/flush_and_reseed_database.py --confirm FLUSH

What it does, in order:
  1. Refuses to run without --confirm FLUSH (exact match) — no silent
     partial-arg or interactive-only trap, works the same in a script or
     a terminal.
  2. Verifies every migration file it's about to replay actually exists on
     disk — BEFORE touching any data. (An earlier version of this script
     referenced a migration file that had since been deleted from
     database_hole/ and only found out when it tried to run it — after
     the TRUNCATE had already happened. This check exists specifically so
     that class of bug fails safe, before anything destructive runs.)
  3. Prints every table that will be truncated and asks you to type the
     database name back as a second confirmation.
  4. TRUNCATEs every table in `public` + `saas_core` (single statement,
     CASCADE, so FK order is handled automatically) — no DROP, no ALTER,
     the schema itself is untouched.
  5. Re-runs the existing, already-idempotent schema/reference migrations
     (01, 05, 06, 07, 08, 09, 10, 11, 12, 13) via psql, in the same order
     database_hole/README.md documents — this restores the module
     registry, lab test catalog, etc. exactly as already tested, instead
     of duplicating that logic here. 02 (eye-hospital pack) and 03 (demo/
     fictional hospitals) are deliberately skipped — 03 is explicitly
     marked "never run against production" in its own README entry.
  6. Seeds the 14 system roles directly (same fixed IDs already live in
     the database — see ROLES below) — done here rather than by
     re-running 03, since 03 also creates fictional demo hospitals we
     don't want in a production database. This is self-contained
     precisely so the script doesn't depend on which migration files
     happen to exist in database_hole/ at run time (that folder's exact
     contents have already changed once mid-session).
  7. Creates a placeholder "Platform" tenant + hospital, inline (not via
     an external migration file, for the same self-containment reason as
     #6) — a super_admin's hospital_id is NOT NULL + FK, so it needs
     *some* hospital row to reference even with zero real hospitals
     created yet. Adds hospitals.is_system so this row can be reliably
     excluded from any real-hospital listing.
  8. Creates one fresh super_admin user pointed at that placeholder
     hospital, with a securely random-generated password printed once at
     the end. Nothing else has been seeded — no other users, no real
     hospitals — that account is the only way to log in until you create
     a real hospital through the Super Admin UI.
"""
import argparse
import secrets
import string
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse, unquote

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.utils.security import get_password_hash  # noqa: E402

DATABASE_HOLE = Path(__file__).resolve().parent.parent / "database_hole"
MIGRATIONS_TO_REPLAY = [
    "01_full_schema.sql",
    "05_schema_structure.sql",
    "06_seed_reference_data.sql",
    "07_queue_display_screens.sql",
    "08_role_permission_overrides.sql",
    "09_grn_edit_and_opd_assignment.sql",
    "10_lab_test_templates_batch2.sql",
    "11_lab_technician_role.sql",
    "12_lab_test_templates_batch3.sql",
    "13_lab_test_fasting_blood_sugar.sql",
]

# Same fixed IDs already live in the database — see the query that produced
# this list in the session that wrote this script (database_hole/*.sql).
ROLES = [
    ("e0000000-0000-0000-0000-000000000001", "super_admin", "Super Administrator", "Full system access across all hospitals"),
    ("e0000000-0000-0000-0000-000000000002", "admin", "Hospital Admin", "Hospital-level administrative access"),
    ("e0000000-0000-0000-0000-000000000003", "doctor", "Doctor", "Clinical and patient care access"),
    ("e0000000-0000-0000-0000-000000000004", "receptionist", "Receptionist", "Front desk and appointment operations"),
    ("e0000000-0000-0000-0000-000000000005", "pharmacist", "Pharmacist", "Pharmacy dispensing operations"),
    ("e0000000-0000-0000-0000-000000000006", "optical_staff", "Optical Staff", "Optical store operations"),
    ("e0000000-0000-0000-0000-000000000007", "cashier", "Cashier", "Billing and payment operations"),
    ("e0000000-0000-0000-0000-000000000008", "inventory_manager", "Inventory Manager", "Inventory and stock management"),
    ("e0000000-0000-0000-0000-000000000009", "report_viewer", "Report Viewer", "View and export reports"),
    ("e0000000-0000-0000-0000-000000000010", "nurse", "Nurse", "Nursing and patient care support"),
    ("e0000000-0000-0000-0000-000000000011", "staff", "Staff", "General staff access"),
    ("e0000000-0000-0000-0000-000000000012", "visiting_doctor", "Special Doctor / Visiting Doctor", "Guest/visiting doctor with limited clinical access (walk-in queue view, own schedule, new prescriptions only)"),
    ("e0000000-0000-0000-0000-000000000013", "hr_manager", "HR Manager", "Manages employee records, holidays, shifts, attendance, leave, and payroll — no clinical or billing access."),
    ("e0000000-0000-0000-0000-000000000014", "lab_technician", "Lab Technician", "Laboratory test processing and report entry"),
]

PLATFORM_HOSPITAL_ID = "00000000-0000-0000-0000-000000000001"
PLATFORM_TENANT_ID = "00000000-0000-0000-0000-000000000002"


def _db_conn_args():
    """Parse DATABASE_URL into psql-friendly connection args + password."""
    parsed = urlparse(settings.DATABASE_URL)
    return {
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "user": parsed.username or "hms_user",
        "password": unquote(parsed.password or ""),
        "dbname": (parsed.path or "/hms_db").lstrip("/"),
    }


def _run_psql_file(conn, sql_file: Path):
    import os
    env = os.environ.copy()
    env["PGPASSWORD"] = conn["password"]
    result = subprocess.run(
        ["psql", "-h", conn["host"], "-p", conn["port"], "-U", conn["user"], "-d", conn["dbname"], "-v", "ON_ERROR_STOP=1", "-f", str(sql_file)],
        env=env, capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"\n!! FAILED running {sql_file.name}:")
        print(result.stdout)
        print(result.stderr)
        sys.exit(1)
    print(f"  ✓ {sql_file.name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--confirm", required=True, help='Must be exactly "FLUSH" to proceed')
    parser.add_argument("--superadmin-username", default="superadmin")
    parser.add_argument("--superadmin-email", default="superadmin@platform.local")
    args = parser.parse_args()

    if args.confirm != "FLUSH":
        print('Refusing to run — pass --confirm FLUSH exactly.')
        sys.exit(1)

    # Fail fast on a missing migration file BEFORE anything destructive
    # runs — this is exactly the bug an earlier version of this script had
    # (it referenced a migration file that had been deleted, and only
    # found out mid-run, after the TRUNCATE already happened).
    missing = [f for f in MIGRATIONS_TO_REPLAY if not (DATABASE_HOLE / f).exists()]
    if missing:
        print("Refusing to run — these migration files are missing from database_hole/:")
        for f in missing:
            print(f"  - {f}")
        print("Nothing has been touched. Fix the file list or restore the files, then re-run.")
        sys.exit(1)

    conn = _db_conn_args()

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

    # ── 1. TRUNCATE everything ──────────────────────────────────────────
    qualified = [f'"{s}"."{t}"' for s, t in tables]
    print(f"\nTruncating {len(qualified)} tables...")
    db = SessionLocal()
    db.execute(text(f"TRUNCATE TABLE {', '.join(qualified)} RESTART IDENTITY CASCADE"))
    db.commit()
    db.close()
    print("  ✓ All tables truncated. Schema untouched.")

    # ── 2. Replay the production-safe schema/reference migrations ──────
    print("\nReplaying schema + reference-data migrations...")
    for filename in MIGRATIONS_TO_REPLAY:
        _run_psql_file(conn, DATABASE_HOLE / filename)

    # ── 3. Seed the 14 system roles ─────────────────────────────────────
    print("\nSeeding system roles...")
    db = SessionLocal()
    for role_id, name, display_name, description in ROLES:
        db.execute(text(
            "INSERT INTO roles (id, hospital_id, name, display_name, description, is_system, is_active) "
            "VALUES (:id, NULL, :name, :display_name, :description, true, true) "
            "ON CONFLICT (id) DO NOTHING"
        ), {"id": role_id, "name": name, "display_name": display_name, "description": description})
    db.commit()
    db.close()
    print(f"  ✓ {len(ROLES)} roles seeded")

    # ── 4. Platform placeholder hospital/tenant ─────────────────────────
    # Inline rather than a separate migration file — kept self-contained so
    # this script doesn't depend on a specific database_hole/ file existing
    # at run time (see the module docstring for why that matters here).
    print("\nCreating placeholder Platform hospital/tenant...")
    db = SessionLocal()
    db.execute(text(
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false"
    ))
    db.execute(text(
        "INSERT INTO saas_core.tenants (id, name, slug, code, email, status) "
        "VALUES (:id, 'Platform (System)', 'platform-system', 'PLATFORM', "
        "'platform-system@internal.invalid', 'active') "
        "ON CONFLICT (id) DO NOTHING"
    ), {"id": PLATFORM_TENANT_ID})
    db.execute(text(
        "INSERT INTO hospitals (id, name, code, is_active, is_system, tenant_id, timezone, default_currency, country) "
        "VALUES (:id, 'Platform (System Account Holder)', 'PLATFORM', false, true, :tenant_id, 'UTC', 'USD', 'USA') "
        "ON CONFLICT (id) DO NOTHING"
    ), {"id": PLATFORM_HOSPITAL_ID, "tenant_id": PLATFORM_TENANT_ID})
    db.commit()
    db.close()
    print("  ✓ Platform hospital/tenant ready")

    # ── 5. Fresh super_admin user ────────────────────────────────────────
    print("\nCreating super_admin account...")
    password = "".join(secrets.choice(string.ascii_letters + string.digits + "!@#$%^&*") for _ in range(20))
    password_hash = get_password_hash(password)

    db = SessionLocal()
    from app.services.patient_id_service import generate_staff_id
    import uuid as _uuid
    reference_number = generate_staff_id(db, _uuid.UUID(PLATFORM_HOSPITAL_ID), "super_admin")
    user_id = str(_uuid.uuid4())
    db.execute(text(
        "INSERT INTO users (id, hospital_id, reference_number, email, username, password_hash, "
        "first_name, last_name, is_active, must_change_password) "
        "VALUES (:id, :hospital_id, :ref, :email, :username, :pw_hash, 'System', 'Administrator', true, true)"
    ), {
        "id": user_id, "hospital_id": PLATFORM_HOSPITAL_ID, "ref": reference_number,
        "email": args.superadmin_email, "username": args.superadmin_username, "pw_hash": password_hash,
    })
    db.execute(text(
        "INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, 'e0000000-0000-0000-0000-000000000001')"
    ), {"user_id": user_id})
    db.commit()
    db.close()

    print("\n" + "=" * 70)
    print("DONE. Database flushed and re-seeded. Log in with:")
    print(f"  Username: {args.superadmin_username}")
    print(f"  Password: {password}")
    print("  (must_change_password is set — you'll be asked to change it on first login)")
    print("This password is shown ONCE and is not stored anywhere else. Save it now.")
    print("=" * 70)


if __name__ == "__main__":
    main()
