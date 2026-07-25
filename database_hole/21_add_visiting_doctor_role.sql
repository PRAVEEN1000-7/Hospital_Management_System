-- ==============================================================================
-- 21 — SPECIAL DOCTOR / VISITING DOCTOR ROLE
--
-- Adds the "visiting_doctor" system role introduced by the client's role
-- permission matrix (see docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md).
-- A visiting/guest doctor gets a narrower slice of the Doctor role: they can
-- view the walk-in queue, view+edit their own doctor schedule, and create new
-- prescriptions — but no access to patient directory management, staff
-- directory, analytics, appointment management, or anything outside clinical
-- consultation. Enforced in backend/app/core/module_roles.py and mirrored in
-- frontend/src/config/modulePermissions.ts.
--
-- Safe to run against an existing DB — idempotent (WHERE NOT EXISTS guard),
-- matching the pattern of 03_seed_data.sql's roles insert.
-- ==============================================================================

INSERT INTO roles (id, hospital_id, name, display_name, description, is_system, is_active)
SELECT
    'e0000000-0000-0000-0000-000000000012', NULL, 'visiting_doctor',
    'Special Doctor / Visiting Doctor',
    'Guest/visiting doctor with limited clinical access (walk-in queue view, own schedule, new prescriptions only)',
    true, true
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE name = 'visiting_doctor' AND hospital_id IS NULL
);
