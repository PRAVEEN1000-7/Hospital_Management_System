-- ==============================================================================
-- 20 — PAYROLL
--
-- payroll_runs: one row per (hospital, year, month) — "Generate Payroll"
-- upserts this and its line items from the Attendance Report data for that
-- month. Re-generating overwrites the previous snapshot (no finalize/lock
-- concept yet — add one later if a hard cutoff is needed).
--
-- payroll_items: one row per employee per payroll run — a frozen snapshot
-- of that month's attendance-derived numbers (present/absent/deduction) and
-- the resulting net payable, so later edits to base_salary or paid leave
-- entitlement don't silently rewrite payroll history.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS payroll_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id   UUID NOT NULL REFERENCES hospitals(id),
    year          INTEGER NOT NULL,
    month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    generated_by  UUID REFERENCES users(id),
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, year, month)
);

CREATE TABLE IF NOT EXISTS payroll_items (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id        UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    user_id               UUID NOT NULL REFERENCES users(id),
    present_count         NUMERIC(5,1) NOT NULL DEFAULT 0,
    absent_count          NUMERIC(5,1) NOT NULL DEFAULT 0,
    paid_leave_entitlement INTEGER NOT NULL DEFAULT 0,
    working_days          INTEGER NOT NULL DEFAULT 0,
    base_salary           NUMERIC(12,2) NOT NULL DEFAULT 0,
    per_day_salary        NUMERIC(12,2) NOT NULL DEFAULT 0,
    deduction_days        NUMERIC(5,1) NOT NULL DEFAULT 0,
    deduction_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_payable           NUMERIC(12,2) NOT NULL DEFAULT 0,
    UNIQUE (payroll_run_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_hospital ON payroll_runs(hospital_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id);
