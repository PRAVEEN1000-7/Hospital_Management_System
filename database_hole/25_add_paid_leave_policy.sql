-- ==============================================================================
-- 25 — PAID LEAVE POLICY (System Settings → Leave Policy)
--
-- Lets a hospital choose between two ways of setting paid leave entitlement:
--   - paid_leave_uniform = false (default): every employee keeps their own
--     users.paid_leave_entitlement value, set individually in Staff
--     Directory — unchanged from how this already worked.
--   - paid_leave_uniform = true: every employee instead gets
--     paid_leave_default_days, ignoring their individual value. The
--     per-employee field in Staff Directory is greyed out in this mode
--     (frontend only — the column itself is untouched either way, so
--     switching back to "per employee" later restores whatever was there).
--
-- Consulted by attendance_service.get_month_report when computing each
-- employee's paid_leave_entitlement for that month's deduction calculation.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS paid_leave_uniform BOOLEAN DEFAULT FALSE;
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS paid_leave_default_days INTEGER DEFAULT 2;
