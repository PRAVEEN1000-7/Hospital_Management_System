-- ==============================================================================
-- 23 — INCENTIVES
--
-- A sales-linked incentive for an employee. The admin enters sales_amount
-- and incentive_percent; incentive_amount is computed and stored
-- server-side (sales_amount * incentive_percent / 100) — never trusted
-- from the client. Unlike allowances there's no in-hand/added-to-salary
-- choice: every incentive always counts toward that month's Payroll
-- net_payable. One row per event, tagged to (year, month) — same reasoning
-- as allowances (22_add_allowances.sql): an employee can have more than
-- one incentive entry in a month.
--
-- payroll_items.incentive_added is the frozen snapshot of that month's sum
-- at the moment "Generate Payroll" was run — same principle as
-- allowance_added and every other payroll_items column.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS incentives (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id        UUID NOT NULL REFERENCES hospitals(id),
    user_id            UUID NOT NULL REFERENCES users(id),
    year               INTEGER NOT NULL,
    month              INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    sales_amount       NUMERIC(12,2) NOT NULL CHECK (sales_amount > 0),
    incentive_percent  NUMERIC(5,2) NOT NULL CHECK (incentive_percent > 0),
    incentive_amount   NUMERIC(12,2) NOT NULL CHECK (incentive_amount >= 0),
    created_by         UUID REFERENCES users(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incentives_hospital_year_month ON incentives(hospital_id, year, month);
CREATE INDEX IF NOT EXISTS idx_incentives_user ON incentives(user_id);

ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS incentive_added NUMERIC(12,2) NOT NULL DEFAULT 0;
