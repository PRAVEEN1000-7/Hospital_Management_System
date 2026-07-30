-- ==============================================================================
-- 11 — MISSING SYSTEM ROLE: lab_technician
--
-- Root cause of "lab technician can't log in / dashboard is empty": the
-- Laboratory module (backend/app/routers/lab.py's LAB_STAFF_ROLES, the
-- frontend's /lab routes in App.tsx, Layout.tsx's canAccessLab, and the
-- "Lab Technician" option in the Create/Edit Staff form) has always assumed
-- a 'lab_technician' row exists in the `roles` table — but it was never
-- seeded. 03_seed_data.sql seeded 10 system roles, then 'staff' was appended
-- later in that same file; 'lab_technician' was simply missed both times and
-- every module that references it by name was built afterward without
-- anyone re-checking this table.
--
-- Practical effect: creating a staff member with role "Lab Technician" in
-- the UI succeeds (POST /users returns 201, a valid staff ID like "xxT26..."
-- is generated — ROLE_CODE_MAP already has an entry for it) but silently
-- attaches NO role, because user_service.create_user() does
-- `role = db.query(Role).filter(Role.name == role_name).first(); if role: ...`
-- with no else branch — a lookup miss is just skipped, not reported. The
-- resulting account can still authenticate (login doesn't check roles at
-- all), but has zero entries in user_roles, so every hasRole()/allowedRoles()
-- check across the whole app fails: no sidebar items, every /lab route
-- redirects away, every lab.py endpoint 403s. From the technician's side
-- this is indistinguishable from "login isn't working."
--
-- This migration only adds the missing row (system role, not tied to any
-- one hospital — matches every other row in this table). The silent-skip
-- bug itself is fixed separately in backend/app/services/user_service.py
-- (now raises a clear error instead of silently dropping the role), so this
-- exact failure mode can't recur invisibly for any future role.
--
-- Idempotent: guarded by a NOT EXISTS check rather than ON CONFLICT, because
-- hospital_id is NULL for system roles and Postgres does not treat two NULLs
-- as conflicting under a plain UNIQUE(hospital_id, name) constraint.
-- ==============================================================================

INSERT INTO roles (id, hospital_id, name, display_name, description, is_system, is_active)
SELECT
    'e0000000-0000-0000-0000-000000000014',
    NULL,
    'lab_technician',
    'Lab Technician',
    'Laboratory test processing and report entry',
    true,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE name = 'lab_technician' AND hospital_id IS NULL
);
