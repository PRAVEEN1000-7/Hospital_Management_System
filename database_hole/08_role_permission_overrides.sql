-- ==============================================================================
-- 08 — PER-HOSPITAL ROLE/PERMISSION OVERRIDES
--
-- Adds an admin-editable UI for the RBAC matrix that has, until now, lived
-- only as a hardcoded dict (backend/app/core/module_roles.py, mirrored in
-- frontend/src/config/modulePermissions.ts) applied identically to every
-- hospital. This table stores SPARSE OVERRIDES ONLY — a hospital admin who
-- has never touched a given (permission_key, role_name) pair has no row here
-- at all, and the system falls back to the static default matrix. This is
-- deliberately NOT a full per-hospital copy of the matrix (that would mean
-- 21 keys x ~13 roles x every hospital, almost all identical to the default
-- and wasted); storing only the deltas keeps writes rare and reads cheap to
-- cache (see get_effective_matrix() in module_roles.py).
--
-- Note: this is functionally distinct from the existing permissions /
-- role_permissions tables (2.3/2.5 in 01_full_schema.sql) — those are keyed
-- to a finer (module, action, resource) granularity, are fully seeded, but
-- are NOT consulted by any live authorization path today (every router
-- checks module_roles.py's static dict instead — see
-- backend/app/core/permissions.py, which is dead code). Reusing that
-- granularity here would require reconciling two incompatible permission
-- models for no benefit; this table instead matches the granularity that is
-- ACTUALLY enforced everywhere (the ~21 dotted keys like "billing",
-- "appt.manage", "general.patients").
--
-- Safe to run against an existing DB — every statement is idempotent
-- (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS hospital_permission_overrides (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID          NOT NULL REFERENCES hospitals(id),
    permission_key  VARCHAR(60)   NOT NULL,             -- e.g. "billing", "appt.manage"
    role_name       VARCHAR(50)   NOT NULL,              -- e.g. "receptionist"
    access_level    VARCHAR(10)   NOT NULL DEFAULT 'none', -- 'none' | 'view' | 'edit'
    updated_by      UUID          REFERENCES users(id),
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW(),
    CHECK (access_level IN ('none', 'view', 'edit')),
    UNIQUE (hospital_id, permission_key, role_name)
);

CREATE INDEX IF NOT EXISTS idx_hospital_permission_overrides_hospital
    ON hospital_permission_overrides(hospital_id);
