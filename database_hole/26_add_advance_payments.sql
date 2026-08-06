-- ==============================================================================
-- 26 — ADVANCE PAYMENTS (salary advance / loan, recovered as a monthly EMI)
--
-- A salary advance given to an employee, recovered as a fixed EMI deducted
-- from Payroll each month starting at (start_year, start_month) until fully
-- repaid — e.g. amount=50000, installments=10 -> emi_amount=5000/month.
--
-- Unlike allowances/incentives, this is NOT tagged to one month — it's a
-- standing loan spanning many months. Deliberately no monthly repayment
-- ledger table: how much has been repaid, and what any given month's
-- installment is, is computed live from (amount, emi_amount, start_year,
-- start_month) versus the report month being asked about — see
-- advance_payment_service.get_month_deduction. This mirrors Payroll itself
-- now being fully live (no generated snapshot).
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS advance_payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id    UUID NOT NULL REFERENCES hospitals(id),
    user_id        UUID NOT NULL REFERENCES users(id),
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    installments   INTEGER NOT NULL CHECK (installments > 0),
    emi_amount     NUMERIC(12,2) NOT NULL CHECK (emi_amount > 0),
    start_year     INTEGER NOT NULL,
    start_month    INTEGER NOT NULL CHECK (start_month BETWEEN 1 AND 12),
    reason         VARCHAR(255) NOT NULL,
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_payments_hospital ON advance_payments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_user ON advance_payments(user_id);
