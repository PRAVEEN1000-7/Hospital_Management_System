-- ==============================================================================
-- 11 — WORKFORCE MANAGEMENT (all phases, consolidated)
--
-- Companion code for Workforce_Management_Implementation_Plan.md /
-- Workforce_Management_Modules_MWMS_to_HMS.md. Everything the Workforce
-- Management feature needs at the database layer, in one file: the module
-- registry row + hr_manager role (Phase 0), employee/holiday tables
-- (Phase 1), shift/attendance tables (Phase 2), leave tables (Phase 3), and
-- payroll tables (Phase 5). Phase 4 (Reports) added no new tables — it's a
-- read-only layer over everything below.
--
-- Idempotent throughout — ON CONFLICT DO NOTHING / a NOT EXISTS guard for
-- seed rows, CREATE TABLE/INDEX IF NOT EXISTS for schema — matching this
-- project's convention (01_full_schema.sql, 05_schema_structure.sql,
-- 06_seed_reference_data.sql).
-- ==============================================================================

-- ══════════════════════════════════════════════════════════════════════════
-- 1. MODULE REGISTRY — ONE opt-in, per-hospital toggleable module
-- ══════════════════════════════════════════════════════════════════════════

-- A single module covers every workforce feature area (employee records,
-- holidays, shifts, attendance, leave, payroll) — deliberately NOT six
-- separate module rows. A hospital either has Workforce Management on or it
-- doesn't; which of the six sub-areas a given role can reach is handled
-- entirely by the six RBAC keys in module_roles.py
-- (employee.records/holidays/shifts/attendance/leave/payroll), not by
-- module-level gating. No tenant_modules row is seeded here, matching the
-- opt-in-by-default pattern used by every other module.
INSERT INTO saas_core.modules (code, name, description, category, frontend_route_prefix, api_prefix, icon, is_core, required_modules) VALUES
('workforce_management', 'Workforce Management', 'Employee records, holiday calendar, shifts, attendance, leave, and payroll (feed only)', 'workforce', '/workforce', '/api/v1', 'badge', false, '{}')
ON CONFLICT (code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. ROLES — hr_manager (global system role, hospital_id IS NULL)
-- ══════════════════════════════════════════════════════════════════════════

-- Follows the exact visiting_doctor precedent (06_seed_reference_data.sql):
-- one global row, not one per hospital — user->role assignment is looked up
-- by name only (user_service.py), so a single row covers every hospital.
INSERT INTO roles (id, hospital_id, name, display_name, description, is_system, is_active)
SELECT
    'e0000000-0000-0000-0000-000000000013', NULL, 'hr_manager',
    'HR Manager',
    'Manages employee records, holidays, shifts, attendance, leave, and payroll — no clinical or billing access.',
    true, true
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE name = 'hr_manager' AND hospital_id IS NULL
);

-- ══════════════════════════════════════════════════════════════════════════
-- 3. EMPLOYEE + HOLIDAY TABLES (§4.1-4.3)
-- ══════════════════════════════════════════════════════════════════════════

-- employee_profiles: 1:1 HR extension of users, same shape as `doctors`
-- extending `users`. employee_salary is effective-dated — application code
-- always INSERTs a new row on a salary change, never UPDATEs an existing
-- one, so history is preserved. holidays are individual dates, including
-- recurring weekly-offs as one row per date.

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

-- ══════════════════════════════════════════════════════════════════════════
-- 4. SHIFT + ATTENDANCE TABLES (§4.4-4.6)
-- ══════════════════════════════════════════════════════════════════════════

-- employee_shift_assignments is effective-dated, one row per reassignment,
-- `reason` mandatory per BRD REQ-SHF-02. attendance_records is one row per
-- employee per date — a grid click is always an upsert on
-- (hospital_id, employee_id, date); deliberately no "marked time" column,
-- since there's no reliable way to know an employee's actual arrival time
-- without hardware, and capturing one would risk being misread as real.

CREATE TABLE IF NOT EXISTS shifts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    name            VARCHAR(50) NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_hospital ON shifts(hospital_id);

CREATE TABLE IF NOT EXISTS employee_shift_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID NOT NULL REFERENCES users(id),
    shift_id        UUID NOT NULL REFERENCES shifts(id),
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    assigned_by     UUID NOT NULL REFERENCES users(id),
    reason          VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee ON employee_shift_assignments(employee_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS attendance_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    employee_id     UUID NOT NULL REFERENCES users(id),
    date            DATE NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'not_marked',
    is_verified     BOOLEAN NOT NULL DEFAULT false,
    marked_by       UUID REFERENCES users(id),
    verified_by     UUID REFERENCES users(id),
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(hospital_id, employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_hospital_date ON attendance_records(hospital_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, date);

-- ══════════════════════════════════════════════════════════════════════════
-- 5. LEAVE TABLES (§4.7-4.8)
-- ══════════════════════════════════════════════════════════════════════════

-- leave_records is HR data-entry — `status` defaults 'approved', matching
-- the existing `doctor_leaves` precedent, not a self-service request queue.
-- leave_balances is per employee/year; `allocated` auto-seeds from
-- employee_profiles.paid_leave_entitlement the first time a balance is
-- needed for that employee/year (see leave_service.get_or_create_balance).

CREATE TABLE IF NOT EXISTS leave_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    employee_id     UUID NOT NULL REFERENCES users(id),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    reason          VARCHAR(255),
    status          VARCHAR(20) NOT NULL DEFAULT 'approved',
    entered_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_records_employee ON leave_records(employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_records_hospital ON leave_records(hospital_id);

CREATE TABLE IF NOT EXISTS leave_balances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID NOT NULL REFERENCES users(id),
    year            INTEGER NOT NULL,
    allocated       INTEGER NOT NULL DEFAULT 0,
    used            INTEGER NOT NULL DEFAULT 0,
    UNIQUE(employee_id, year)
);

-- ══════════════════════════════════════════════════════════════════════════
-- 6. PAYROLL TABLES (§4.9-4.10) — feed only
-- ══════════════════════════════════════════════════════════════════════════

-- LOP/payable-days/deduction FEED ONLY, not full salary disbursement or
-- statutory filings (explicitly out of scope per the BRD).
-- payroll_service.generate_payroll_run reads exclusively from *verified*
-- attendance_records for the period and blocks generation if any tracked
-- employee has an unverified row still outstanding.

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
