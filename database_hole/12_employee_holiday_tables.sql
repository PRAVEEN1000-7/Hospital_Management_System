-- ==============================================================================
-- 12 — WORKFORCE MANAGEMENT — PHASE 1: EMPLOYEE + HOLIDAY TABLES
--
-- Companion code for Workforce_Management_Implementation_Plan.md /
-- Workforce_Management_Modules_MWMS_to_HMS.md §4.1-4.3. Creates the three
-- Phase 1 tables: employee_profiles (1:1 HR extension of users, same shape
-- as `doctors` extending `users`), employee_salary (effective-dated —
-- application code always INSERTs a new row on a salary change, never
-- UPDATEs an existing one, so history is preserved), and holidays
-- (individual dates, including recurring weekly-offs as one row per date).
--
-- Idempotent — CREATE TABLE IF NOT EXISTS throughout, matching this
-- project's convention (05_schema_structure.sql).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS employee_profiles (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL UNIQUE REFERENCES users(id),
    hospital_id                 UUID NOT NULL REFERENCES hospitals(id),
    department_id               UUID REFERENCES departments(id),
    designation                 VARCHAR(100),
    date_of_joining             DATE,
    date_of_leaving             DATE,
    employment_type             VARCHAR(20) DEFAULT 'full_time',
    bank_account_holder_name    VARCHAR(150),
    bank_account_number         VARCHAR(30),
    bank_ifsc                   VARCHAR(15),
    bank_branch                 VARCHAR(150),
    pf_number                   VARCHAR(30),
    pan_number                  VARCHAR(15),
    reporting_manager_id        UUID REFERENCES users(id),
    paid_leave_entitlement      INTEGER DEFAULT 0,
    include_in_payroll          BOOLEAN DEFAULT true,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_profiles_hospital ON employee_profiles(hospital_id);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_department ON employee_profiles(department_id);

CREATE TABLE IF NOT EXISTS employee_salary (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id                 UUID NOT NULL REFERENCES users(id),
    hospital_id                 UUID NOT NULL REFERENCES hospitals(id),
    basic_salary                NUMERIC(12,2) NOT NULL,
    per_day_salary               NUMERIC(12,2) NOT NULL,
    flexi_allowance              NUMERIC(12,2) DEFAULT 0,
    pf_contribution_employee     NUMERIC(12,2) DEFAULT 0,
    effective_from               DATE NOT NULL,
    created_at                   TIMESTAMPTZ DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_salary_employee ON employee_salary(employee_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS holidays (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id                 UUID NOT NULL REFERENCES hospitals(id),
    date                        DATE NOT NULL,
    name                        VARCHAR(150) NOT NULL,
    type                        VARCHAR(20) DEFAULT 'other',
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(hospital_id, date)
);

CREATE INDEX IF NOT EXISTS idx_holidays_hospital_date ON holidays(hospital_id, date);
