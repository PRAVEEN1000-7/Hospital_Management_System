#!/usr/bin/env python3
"""
Flush ALL data from the HMS database, keep the schema (tables/columns/
constraints) exactly as-is, then re-seed exactly what's needed to log back
in as a fresh Super Admin and start onboarding real hospitals. One file,
one script — flush and seed together.

THIS IS IRREVERSIBLE. It deletes every row in every table in the `public`
and `saas_core` schemas — every hospital, patient, appointment, invoice,
inventory record, everything. Nothing is dropped structurally (no DROP
TABLE), only DELETEd. Take a full pg_dump backup before running this.

Usage (run from backend/, inside the venv, on the server):
    python ../deploy/flush_and_reseed_database.py --confirm FLUSH
    python ../deploy/flush_and_reseed_database.py --confirm FLUSH \\
        --superadmin-username myname --superadmin-email me@x.com --superadmin-password 'Real@Pass123'

What it does, in order:
  1. Refuses to run without --confirm FLUSH (exact match).
  2. Verifies every migration file it's about to replay actually exists on
     disk — BEFORE touching any data. (An earlier version of this script
     referenced a migration file that had since been deleted from
     database_hole/ and only found out when it tried to run it — after the
     TRUNCATE had already happened. This check exists specifically so that
     class of bug fails safe.)
  3. Prints every table that will be truncated and asks you to type the
     database name back as a second confirmation.
  4. TRUNCATEs every table in `public` + `saas_core` (single statement,
     CASCADE, so FK order is handled automatically) — no DROP, no ALTER,
     the schema itself is untouched.
  5. Seeds the core module registry (including the 'lab' module row —
     see step 6), system settings, and module dependencies (extracted from
     01_full_schema.sql — that file itself is NOT replayed; see the
     comment on MIGRATIONS_TO_REPLAY for why). Also self-healing: CREATE
     TABLE IF NOT EXISTS for each of those, since a real server hit
     `relation does not exist` here — its schema had silently drifted from
     what this file assumes, and a TRUNCATE never creates missing tables,
     only empties existing ones. subscription_plans is deliberately left
     with NO rows — the client defines their own plan(s) via the Super
     Admin UI after logging in.
  6. Re-runs the existing, already-idempotent schema/reference migrations
     (05, 07, 08, 09, 10, 11, 12, 13) — RBAC config, GRN/OPD extensions,
     and your real lab test catalog (10, 11, 12, 13 — the client-supplied
     report templates). 02 (eye-hospital pack), 03 (fictional demo
     hospitals), AND 06 (the original 18-test lab catalog + PO payment
     modes + visiting_doctor role) are all deliberately skipped — per
     explicit instruction, 06's rows were dev/testing data, not something
     to carry into a client handoff (its one load-bearing piece, the 'lab'
     module registration, is preserved in step 5 instead).
  7. Seeds the 14 system roles (fixed IDs, matching what's already live).
  8. Creates a placeholder "Platform" tenant + hospital — a super_admin's
     hospital_id is NOT NULL + FK, so it needs *some* hospital row to
     reference even with zero real hospitals created yet.
  9. Creates exactly ONE Super Admin account, pointed at that placeholder
     hospital, using the given username/email/password (fixed, not
     randomly generated — must_change_password=True is set, so it's only
     ever valid for the first login). Skips creation if a super_admin
     already exists rather than creating a duplicate.
 10. Verifies afterward that the `users` table contains exactly one row —
     that Super Admin — and prints every other account found if not. This
     only happens if the database wasn't actually empty of users before
     the TRUNCATE ran on it (should never happen given step 4, but this is
     the explicit, printed guarantee rather than an assumption).
"""
import argparse
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import urlparse, unquote

# The checkmarks below need UTF-8 to print — Linux (the real deploy target)
# defaults to it, but a Windows console's default codepage (cp1252) doesn't
# support them and crashes mid-run on a print(), *after* the actual DB write
# already succeeded. Force UTF-8 output so this never depends on the host's
# console codepage.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.utils.security import get_password_hash  # noqa: E402

DATABASE_HOLE = Path(__file__).resolve().parent.parent / "database_hole"

# 01_full_schema.sql is deliberately NOT replayed here — it's a bootstrap-
# only file (72 plain `CREATE TABLE` statements, only 7 use IF NOT EXISTS;
# README.md itself marks it "Yes, once"). A TRUNCATE leaves every table
# structurally intact, so re-running 01 against an already-flushed database
# fails immediately on the first `CREATE TABLE hospitals (...)` with
# "relation already exists" — confirmed by actually running this script for
# real and hitting exactly that error. 01 DOES contain real seed data
# alongside its schema DDL though (the core module registry, system
# settings, module dependencies) — that part is reproduced in
# seed_core_platform_data() below instead, with ON CONFLICT added where the
# original in 01 didn't need one (running once against an empty database).
#
# 02 (eye-hospital pack) and 03 (fictional demo hospitals) are deliberately
# excluded — 03 is explicitly marked "never run against production" in its
# own README entry, and 02 is opt-in per hospital, not universal seed data.
#
# 06_seed_reference_data.sql is ALSO deliberately excluded, per explicit
# instruction — its actual seed rows (the original 18-test lab catalog,
# default PO payment modes, the visiting_doctor role) were dev/testing data,
# not something to carry into a client handoff. The one thing in that file
# that IS real infrastructure — the 'lab' module registration row, which
# makes Laboratory appear in the per-hospital module toggle UI at all — is
# preserved by reproducing just that one INSERT in seed_core_platform_data()
# below, alongside the other core modules extracted from 01_full_schema.sql.
MIGRATIONS_TO_REPLAY = [
    "05_schema_structure.sql",
    "07_queue_display_screens.sql",
    "08_role_permission_overrides.sql",
    "09_grn_edit_and_opd_assignment.sql",
    "10_lab_test_templates_batch2.sql",
    "11_lab_technician_role.sql",
    "12_lab_test_templates_batch3.sql",
    "13_lab_test_fasting_blood_sugar.sql",
]

# Same fixed IDs already live in the database.
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
SUPER_ADMIN_ROLE_ID = "e0000000-0000-0000-0000-000000000001"

PLATFORM_HOSPITAL_ID = "00000000-0000-0000-0000-000000000001"
PLATFORM_TENANT_ID = "00000000-0000-0000-0000-000000000002"


def db_conn_args():
    """Parse DATABASE_URL into psql-friendly connection args + password."""
    parsed = urlparse(settings.DATABASE_URL)
    return {
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "user": parsed.username or "hms_user",
        "password": unquote(parsed.password or ""),
        "dbname": (parsed.path or "/hms_db").lstrip("/"),
    }


def missing_migration_files():
    """Returns the list of MIGRATIONS_TO_REPLAY entries not found on disk."""
    return [f for f in MIGRATIONS_TO_REPLAY if not (DATABASE_HOLE / f).exists()]


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


def replay_migrations(conn):
    """Re-run the production-safe schema/reference migrations (05-13)."""
    print("\nReplaying schema + reference-data migrations...")
    for filename in MIGRATIONS_TO_REPLAY:
        _run_psql_file(conn, DATABASE_HOLE / filename)


def seed_core_platform_data():
    """Seed the CORE module registry, system settings, and module
    dependencies — extracted from 01_full_schema.sql's SEED DATA section
    (see the comment on MIGRATIONS_TO_REPLAY for why that file can't just
    be re-run wholesale). Idempotent — every statement here has an ON
    CONFLICT clause, added where the original in 01 didn't have one (it
    didn't need one there, running once against an empty database).

    subscription_plans is deliberately NOT seeded with any rows — only its
    table is ensured to exist. The client defines their own plan(s) via the
    Super Admin UI after first login, not predefined ones invented for
    this project.

    Also self-healing: CREATE TABLE IF NOT EXISTS for all four tables
    first, using the exact DDL from 01_full_schema.sql. This exists because
    a real server hit `relation "saas_core.module_dependencies" does not
    exist` here — its database was set up from an earlier version of
    01_full_schema.sql that predates that table (or an interrupted initial
    run), so the schema had silently drifted from what this file assumes.
    A TRUNCATE never creates missing tables, only empties existing ones, so
    this has to be handled here rather than assumed away."""
    print("\nSeeding core module registry, system settings...")
    db = SessionLocal()
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS saas_core.subscription_plans (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code                VARCHAR(50) NOT NULL UNIQUE,
            name                VARCHAR(100) NOT NULL,
            description         TEXT,
            billing_cycle       VARCHAR(20) NOT NULL DEFAULT 'monthly',
            base_price          DECIMAL(12,2) NOT NULL DEFAULT 0,
            currency            VARCHAR(3) DEFAULT 'USD',
            max_users           INTEGER,
            max_patients        INTEGER,
            max_storage_gb      INTEGER,
            max_appointments_monthly INTEGER,
            features_enabled    JSONB DEFAULT '{}',
            modules_included    UUID[] DEFAULT '{}',
            is_public           BOOLEAN DEFAULT true,
            is_active           BOOLEAN DEFAULT true,
            sort_order          INTEGER DEFAULT 0,
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS saas_core.modules (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code                VARCHAR(50) NOT NULL UNIQUE,
            name                VARCHAR(100) NOT NULL,
            description         TEXT,
            category            VARCHAR(50) NOT NULL,
            frontend_route_prefix VARCHAR(50),
            api_prefix          VARCHAR(50),
            icon                VARCHAR(50),
            required_modules    VARCHAR(50)[] DEFAULT '{}',
            default_permissions JSONB DEFAULT '{}',
            is_core             BOOLEAN DEFAULT false,
            is_active           BOOLEAN DEFAULT true,
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS saas_core.system_settings (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            setting_key         VARCHAR(100) NOT NULL UNIQUE,
            setting_value       TEXT,
            setting_type        VARCHAR(20) NOT NULL DEFAULT 'string',
            description         TEXT,
            is_editable         BOOLEAN DEFAULT true,
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS saas_core.module_dependencies (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            module_name VARCHAR(50) NOT NULL,
            depends_on VARCHAR(50) NOT NULL,
            is_optional BOOLEAN DEFAULT FALSE,
            UNIQUE(module_name, depends_on)
        )
    """))
    db.commit()
    # subscription_plans is deliberately left EMPTY here — the client defines
    # their own plan(s) via the Super Admin UI after first login, rather than
    # inheriting predefined ones invented for this project. The table itself
    # is still created above so that first "create a plan" action doesn't
    # hit the same missing-table bug this function's docstring describes for
    # module_dependencies.
    db.execute(text("""
        INSERT INTO saas_core.modules (code, name, description, category, frontend_route_prefix, api_prefix, icon, is_core, required_modules) VALUES
        ('auth', 'Authentication', 'Login, logout, password management', 'core', '/auth', '/api/v1/auth', 'shield', true, '{}'),
        ('hospital_profile', 'Hospital Profile', 'Hospital branding, settings, departments', 'core', '/hospital', '/api/v1/hospital', 'building', true, '{}'),
        ('patients', 'Patient Management', 'Patient registration and records', 'core', '/patients', '/api/v1/patients', 'users', true, '{}'),
        ('doctors', 'Doctor Management', 'Doctor profiles and schedules', 'core', '/doctors', '/api/v1/doctors', 'stethoscope', true, '{}'),
        ('appointments', 'Appointments', 'Scheduling and queue management', 'core', '/appointments', '/api/v1/appointments', 'calendar', true, '{}'),
        ('prescriptions', 'Prescriptions', 'Prescription creation and management', 'clinical', '/prescriptions', '/api/v1/prescriptions', 'file-text', false, '{"patients","doctors"}'),
        ('pharmacy', 'Pharmacy', 'Medicine catalog and dispensing', 'clinical', '/pharmacy', '/api/v1/pharmacy', 'pill', false, '{"prescriptions"}'),
        ('billing', 'Billing', 'Invoices, payments, refunds', 'financial', '/billing', '/api/v1/billing', 'credit-card', false, '{"patients"}'),
        ('inventory', 'Inventory', 'Stock management and procurement', 'inventory', '/inventory', '/api/v1/inventory', 'package', false, '{}'),
        ('optical', 'Optical Store', 'Optical prescriptions and products', 'clinical', '/optical', '/api/v1/optical', 'glasses', false, '{"patients","inventory"}'),
        ('analytics', 'Analytics', 'Reports and insights', 'analytics', '/analytics', '/api/v1/analytics', 'bar-chart', false, '{}'),
        ('insurance', 'Insurance', 'Claims and provider management', 'financial', '/insurance', '/api/v1/insurance', 'umbrella', false, '{"billing"}'),
        ('lab', 'Laboratory', 'Lab test catalog, ordering, sample tracking, and results', 'clinical', '/lab', '/api/v1/lab', 'flask', false, '{"patients","prescriptions"}')
        ON CONFLICT (code) DO NOTHING
    """))
    db.execute(text("""
        INSERT INTO saas_core.system_settings (setting_key, setting_value, setting_type, description) VALUES
        ('platform_name', 'HMS Platform', 'string', 'Platform display name'),
        ('default_timezone', 'UTC', 'string', 'Default timezone for new hospitals'),
        ('default_currency', 'USD', 'string', 'Default currency for new hospitals'),
        ('trial_days', '14', 'number', 'Default trial period in days'),
        ('maintenance_mode', 'false', 'boolean', 'Platform maintenance mode'),
        ('max_file_upload_mb', '10', 'number', 'Maximum file upload size in MB'),
        ('session_timeout_minutes', '60', 'number', 'User session timeout')
        ON CONFLICT (setting_key) DO NOTHING
    """))
    db.execute(text("""
        INSERT INTO saas_core.module_dependencies (module_name, depends_on, is_optional) VALUES
        ('pharmacy', 'patients', FALSE),
        ('pharmacy', 'users', FALSE),
        ('inventory', 'suppliers', FALSE),
        ('optical', 'patients', FALSE),
        ('optical', 'prescriptions', FALSE),
        ('billing', 'invoices', FALSE),
        ('billing', 'insurance', FALSE),
        ('billing', 'patients', FALSE),
        ('reports', 'patients', FALSE),
        ('reports', 'appointments', FALSE)
        ON CONFLICT DO NOTHING
    """))
    db.commit()
    db.close()
    print("  ✓ Core platform data ready")


def seed_roles():
    """Seed the 14 system roles. Idempotent — ON CONFLICT (id) DO NOTHING."""
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
    print(f"  ✓ {len(ROLES)} roles ready")


def seed_platform_hospital():
    """Create the placeholder Platform tenant + hospital. Idempotent.

    A super_admin's hospital_id is NOT NULL + FK, so it needs *some*
    hospital row to reference even with zero real hospitals created yet.
    hospitals.is_system marks this row so it can be reliably excluded from
    any real-hospital listing.
    """
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


def ensure_superadmin(username: str, email: str, password: str):
    """Create one Super Admin (full-access) account pointed at the Platform
    hospital — but ONLY if no super_admin account exists yet. Never creates
    a duplicate; safe to call on every run of this script.

    Uses the given fixed password rather than generating a random one — the
    account is created with must_change_password=True, so this is only ever
    valid for the first login regardless.

    Returns (created: bool, username: str, password_or_None: str).
    """
    db = SessionLocal()
    existing = db.execute(text(
        "SELECT u.username, u.email FROM users u "
        "JOIN user_roles ur ON ur.user_id = u.id "
        "WHERE ur.role_id = :role_id AND u.is_deleted = false"
    ), {"role_id": SUPER_ADMIN_ROLE_ID}).fetchall()

    if existing:
        db.close()
        print("\nSuper Admin account(s) already exist — not creating another:")
        for row in existing:
            print(f"  - {row[0]} ({row[1]})")
        return False, existing[0][0], None

    print("\nCreating Super Admin (full-access) account...")
    password_hash = get_password_hash(password)

    from app.services.patient_id_service import generate_staff_id
    reference_number = generate_staff_id(db, uuid.UUID(PLATFORM_HOSPITAL_ID), "super_admin")
    user_id = str(uuid.uuid4())
    db.execute(text(
        "INSERT INTO users (id, hospital_id, reference_number, email, username, password_hash, "
        "first_name, last_name, is_active, must_change_password) "
        "VALUES (:id, :hospital_id, :ref, :email, :username, :pw_hash, 'System', 'Administrator', true, true)"
    ), {
        "id": user_id, "hospital_id": PLATFORM_HOSPITAL_ID, "ref": reference_number,
        "email": email, "username": username, "pw_hash": password_hash,
    })
    db.execute(text(
        "INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)"
    ), {"user_id": user_id, "role_id": SUPER_ADMIN_ROLE_ID})
    db.commit()
    db.close()
    return True, username, password


def verify_only_superadmin_exists():
    """Explicit safety net for "only one user, fresh": ensure_superadmin()
    only checks whether a super_admin already exists — it has no way to
    notice a stray non-superadmin user (e.g. leftover staff/test accounts
    from a flush that didn't actually run, or ran against the wrong
    database). This queries the real total and prints every user found so
    that's never silent. Does not fail the script — the seed data itself is
    still valid either way — but the run should not be treated as a "fresh,
    superadmin-only" database if this reports more than one row.
    """
    db = SessionLocal()
    rows = db.execute(text(
        "SELECT u.username, u.email, "
        "COALESCE((SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id "
        " WHERE ur.user_id = u.id AND r.name = 'super_admin' LIMIT 1), 'other') AS role "
        "FROM users u WHERE u.is_deleted = false ORDER BY u.created_at"
    )).fetchall()
    db.close()

    if len(rows) == 1 and rows[0][2] == "super_admin":
        print(f"\nVerified: exactly one user in the database — {rows[0][0]} ({rows[0][1]}), super_admin.")
    else:
        print(f"\n!! WARNING: expected exactly one Super Admin user, found {len(rows)}:")
        for username, email, role in rows:
            print(f"  - {username} ({email}) — {role}")
        print("   This means the database was not actually empty of users before seeding —")
        print("   the TRUNCATE step above should have caught this. Double-check DATABASE_URL")
        print("   in backend/.env actually points at the database you meant to flush.")


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
    missing = missing_migration_files()
    if missing:
        print("Refusing to run — these migration files are missing from database_hole/:")
        for f in missing:
            print(f"  - {f}")
        print("Nothing has been touched. Fix the file list or restore the files, then re-run.")
        sys.exit(1)

    conn = db_conn_args()

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
    seed_core_platform_data()
    replay_migrations(conn)
    seed_roles()
    seed_platform_hospital()
    created, username, _ = ensure_superadmin(args.superadmin_username, args.superadmin_email, args.superadmin_password)
    verify_only_superadmin_exists()

    print("\n" + "=" * 70)
    if created:
        print("DONE. Database flushed and re-seeded. Log in with:")
        print(f"  Username: {username}")
        print(f"  Email:    {args.superadmin_email}")
        print(f"  Password: {args.superadmin_password}")
        print("  (must_change_password is set — you'll be asked to change it on first login,")
        print("   so this fixed password is only ever valid for that first login.)")
    else:
        print("DONE. Database flushed and re-seeded, but a Super Admin already existed:")
        print(f"  Username: {username}")
        print("  (this should not happen right after a TRUNCATE — see the WARNING above if any)")
    print("=" * 70)


if __name__ == "__main__":
    main()
