-- ==============================================================================
-- 15 — WORKFORCE MANAGEMENT — PHASE 5: PAYROLL TABLES (feed only)
--
-- Companion code for Workforce_Management_Implementation_Plan.md /
-- Workforce_Management_Modules_MWMS_to_HMS.md §4.9-4.10. Creates
-- `payroll_runs` and `payslips` — LOP/payable-days/deduction FEED ONLY, not
-- full salary disbursement or statutory filings (explicitly out of scope
-- per the BRD). payroll_service.generate_payroll_run reads exclusively from
-- *verified* attendance_records for the period and blocks generation if any
-- tracked employee has an unverified row still outstanding.
--
-- Idempotent — CREATE TABLE IF NOT EXISTS, matching this project's
-- convention (05_schema_structure.sql).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS payroll_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    period_month    INTEGER NOT NULL,
    period_year     INTEGER NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
    generated_by    UUID NOT NULL REFERENCES users(id),
    generated_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(hospital_id, period_month, period_year)
);

CREATE TABLE IF NOT EXISTS payslips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id      UUID NOT NULL REFERENCES payroll_runs(id),
    employee_id         UUID NOT NULL REFERENCES users(id),
    present_days        INTEGER DEFAULT 0,
    absent_days         INTEGER DEFAULT 0,
    leave_days_taken    INTEGER DEFAULT 0,
    holiday_days        INTEGER DEFAULT 0,
    lop_days            INTEGER DEFAULT 0,
    per_day_rate        NUMERIC(12,2) DEFAULT 0,
    deduction_amount    NUMERIC(12,2) DEFAULT 0,
    gross_salary        NUMERIC(12,2) DEFAULT 0,
    net_salary          NUMERIC(12,2) DEFAULT 0,
    generated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payslips_run ON payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);
