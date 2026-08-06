-- ==============================================================================
-- 22 — ALLOWANCES
--
-- A one-off, event-tied payment to an employee (a business trip, a campaign
-- fee, etc.) — not a recurring salary component. Logged whenever it
-- happens, tagged to the (year, month) it should count toward, since the
-- same employee can have several of these in one month, each with its own
-- reason (one row per event, not one aggregated row per employee/month).
--
-- allowance_type:
--   'added_to_salary' — summed into that month's Payroll net_payable at
--                        generation time (see payroll_service.generate_payroll).
--   'in_hand'          — recorded and shown in the payroll detail popup,
--                        but excluded from that sum.
--
-- payroll_items.allowance_added is the frozen snapshot of that sum at the
-- moment "Generate Payroll" was run — same principle as every other
-- payroll_items column (a later allowance edit doesn't retroactively
-- rewrite a payslip that's already been generated; re-running Generate
-- Payroll picks up the change).
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS allowances (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id    UUID NOT NULL REFERENCES hospitals(id),
    user_id        UUID NOT NULL REFERENCES users(id),
    year           INTEGER NOT NULL,
    month          INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    reason         VARCHAR(255) NOT NULL,
    allowance_type VARCHAR(20) NOT NULL CHECK (allowance_type IN ('in_hand', 'added_to_salary')),
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allowances_hospital_year_month ON allowances(hospital_id, year, month);
CREATE INDEX IF NOT EXISTS idx_allowances_user ON allowances(user_id);

ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS allowance_added NUMERIC(12,2) NOT NULL DEFAULT 0;
