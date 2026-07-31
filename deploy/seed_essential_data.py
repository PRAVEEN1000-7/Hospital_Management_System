#!/usr/bin/env python3
"""
Seed the essential platform data: subscription plans + the core module
registry + system settings (extracted from 01_full_schema.sql — see the
comment on MIGRATIONS_TO_REPLAY for why that file itself can't be re-run),
the schema/reference migrations 05-13 (lab test catalog, RBAC config, etc.),
the 14 system roles, the "Platform" placeholder hospital/tenant, and one
Super Admin (full-access) account — everything needed to log in and start
creating real hospitals.

Safe to run on its own, separately from a flush:
  - On a freshly flushed/empty database (e.g. right after
    flush_and_reseed_database.py's TRUNCATE step).
  - On an existing database, to make sure the essentials are present —
    every step here is idempotent (ON CONFLICT DO NOTHING / existence
    checks throughout). Running it twice never creates duplicates and
    never overwrites data that's already there.
  - It does NOT create any real hospital, patient, or business data — only
    the platform-level scaffolding listed above. Create real hospitals
    through the Super Admin UI after logging in.

Intended workflow (client handoff, not a dev/test reset):
  1. Flush the database (flush_and_reseed_database.py, or your own TRUNCATE)
     to remove all prior test/dev data.
  2. Run this script. You get back exactly one login: the Super Admin
     account printed at the end. Nothing else exists yet — no test users,
     no demo hospitals, no sample patients.
  3. Log in as that Super Admin and create the client's real hospital
     through the UI (Super Admin -> Hospitals -> New). Hand its admin
     credentials to the client.
  4. The client's hospital admin creates their own staff, patients, and
     day-to-day data from there — this script never touches that layer.

Usage (run from backend/, inside the venv, on the server):
    python ../deploy/seed_essential_data.py
    python ../deploy/seed_essential_data.py --superadmin-username myname --superadmin-email me@x.com

flush_and_reseed_database.py imports and calls the functions in this file
for its own re-seed step — this file is the single source of truth for what
"essential seed data" means, so the two scripts can't drift apart.
"""
import argparse
import subprocess
import sys
import uuid
from pathlib import Path

# The checkmarks below need UTF-8 to print — Linux (the real deploy target)
# defaults to it, but a Windows console's default codepage (cp1252) doesn't
# support them and crashes mid-run on a print(), *after* the actual DB write
# already succeeded. Force UTF-8 output so this never depends on the host's
# console codepage.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from urllib.parse import urlparse, unquote

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
# "relation already exists" — confirmed by actually running this script
# for real and hitting exactly that error. 01 DOES contain real seed data
# alongside its schema DDL though (subscription plans, the core module
# registry, system settings, module dependencies) — that part is extracted
# into seed_core_platform_data() below instead, with ON CONFLICT added
# where the original statements in 01 didn't have it (safe there only
# because 01 is assumed to run against a truly empty database; this script
# has to be safe to re-run against a non-empty one too).
#
# 02 (eye-hospital pack) and 03 (fictional demo hospitals) are deliberately
# excluded — 03 is explicitly marked "never run against production" in its
# own README entry, and 02 is opt-in per hospital, not universal seed data.
MIGRATIONS_TO_REPLAY = [
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
    """Seed subscription plans, the CORE module registry, system settings,
    and module dependencies — extracted from 01_full_schema.sql's SEED DATA
    section (see the comment on MIGRATIONS_TO_REPLAY for why that file
    can't just be re-run wholesale). Idempotent — every statement here has
    an ON CONFLICT clause, added where the original in 01 didn't have one
    (it didn't need one there, running once against an empty database)."""
    print("\nSeeding subscription plans, core module registry, system settings...")
    db = SessionLocal()
    db.execute(text("""
        INSERT INTO saas_core.subscription_plans (code, name, description, billing_cycle, base_price, max_users, max_patients, features_enabled) VALUES
        ('free', 'Free', 'Basic features for single-doctor clinics', 'monthly', 0, 5, 500,
         '{"appointments": true, "patients": true, "prescriptions": true, "billing_basic": true}'),
        ('starter', 'Starter', 'Essential features for growing practices', 'monthly', 49, 15, 2000,
         '{"appointments": true, "patients": true, "prescriptions": true, "pharmacy": true, "billing_full": true}'),
        ('professional', 'Professional', 'Full feature set for multi-specialty clinics', 'monthly', 149, 50, 10000,
         '{"appointments": true, "patients": true, "prescriptions": true, "pharmacy": true, "inventory": true, "billing_full": true, "insurance": true, "analytics": true}'),
        ('enterprise', 'Enterprise', 'Unlimited everything for hospital chains', 'monthly', 499, NULL, NULL,
         '{"all_modules": true, "custom_api": true, "dedicated_support": true, "multi_branch": true}'),
        ('unlimited', 'Unlimited', 'All modules included, no limits', 'monthly', 0, NULL, NULL,
         '{"all_modules": true}')
        ON CONFLICT (code) DO NOTHING
    """))
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
        ('insurance', 'Insurance', 'Claims and provider management', 'financial', '/insurance', '/api/v1/insurance', 'umbrella', false, '{"billing"}')
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


def run_all(superadmin_username: str, superadmin_email: str, superadmin_password: str):
    """Run every seed step in order. Used both standalone (main() below)
    and by flush_and_reseed_database.py after its TRUNCATE."""
    missing = missing_migration_files()
    if missing:
        print("Refusing to run — these migration files are missing from database_hole/:")
        for f in missing:
            print(f"  - {f}")
        sys.exit(1)

    conn = db_conn_args()
    seed_core_platform_data()
    replay_migrations(conn)
    seed_roles()
    seed_platform_hospital()
    created, username, _ = ensure_superadmin(superadmin_username, superadmin_email, superadmin_password)

    print("\n" + "=" * 70)
    if created:
        print("DONE. Essential data seeded. Log in with either:")
        print(f"  Username: {username}")
        print(f"  Email:    {superadmin_email}")
        print(f"  Password: {superadmin_password}")
        print("  (must_change_password is set — you'll be asked to change it on first login,")
        print("   so this fixed password is only ever valid for that first login.)")
    else:
        print("DONE. Essential data seeded/verified. Log in with your existing Super Admin account:")
        print(f"  Username: {username}")
        print("  (password unchanged — this script never touches an existing account)")
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--superadmin-username", default="superadmin_hms")
    parser.add_argument("--superadmin-email", default="superadmin@mecandria.com")
    parser.add_argument("--superadmin-password", default="Superadmin@123")
    args = parser.parse_args()
    run_all(args.superadmin_username, args.superadmin_email, args.superadmin_password)


if __name__ == "__main__":
    main()
