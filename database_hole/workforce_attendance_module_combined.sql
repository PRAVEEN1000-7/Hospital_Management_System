-- ==============================================================================
-- WORKFORCE / ATTENDANCE MODULE — one-shot patch for an EXISTING database
--
-- UPDATE: database_hole/production_schema.sql (a full pg_dump of the current
-- schema, covering every table including these) now exists as the
-- single-file option for a brand-new server deploy — see its own header.
-- This file's original purpose is unchanged and still valid below: patching
-- an EXISTING, already-running database that predates Section 8.
--
-- IMPORTANT: this schema is NOT missing from 01_full_schema.sql. It's
-- already there in full, as Section 8 (search for "SECTION 8 — WORKFORCE
-- MANAGEMENT") plus the password_reset_tokens block in Section 7 — every
-- statement below is copied verbatim from those two sections. Any BRAND NEW
-- install that runs 01_full_schema.sql fresh already gets Workforce
-- Management with zero extra steps; this file is not part of the normal
-- setup path (see database_hole/README.md §4/§6).
--
-- This file exists for the other case: a database that was already
-- bootstrapped from an OLDER copy of 01_full_schema.sql, before Section 8
-- was added to it. 01_full_schema.sql itself is explicitly not safe to
-- re-run against an existing database (documented in README.md §4 — most of
-- it is plain CREATE TABLE, not idempotent), so its Workforce section can't
-- just be re-run in isolation from that file. This is that extraction —
-- Section 8 + the password_reset_tokens block, safe to run standalone.
--
-- (This used to be 17 separate incremental files — 10_add_attendance_module
-- through 26_add_advance_payments — one per step as the feature evolved.
-- Once 01_full_schema.sql's Section 8 was written as their consolidated
-- final state, those 17 files became pure duplicates of both Section 8 and
-- of this file, so they were deleted rather than kept as three copies of
-- the same schema. Section 8's own comment block still names all 17 as
-- provenance for exactly this reason.)
--
-- Safe to run against an existing DB — every statement is individually
-- idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING / DROP ... IF EXISTS),
-- same as Section 8. Wrapped in one transaction so a server run either
-- applies cleanly in full or leaves the schema untouched — no partial
-- migration to clean up by hand.
--
-- Run with:
--   psql -h <host> -U <user> -d <db> -v ON_ERROR_STOP=1 -f workforce_attendance_module_combined.sql
-- ==============================================================================

BEGIN;

-- password_reset_tokens — same shape as refresh_tokens (01_full_schema.sql
-- §2.6), for the "Forgot Password" flow (routers/auth.py). This table was
-- referenced by models/user.py and used live by auth.py from the start, but
-- no prior version of 01_full_schema.sql (nor any numbered migration) ever
-- actually created it — a genuine gap, not a later addition.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id),
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens (user_id);

-- ==============================================================================
-- SECTION 8 — WORKFORCE MANAGEMENT (attendance, shifts, holidays, payroll)
-- Verbatim copy of 01_full_schema.sql's Section 8 — see that file for the
-- full "Source: ..." provenance comment naming the 17 original incremental
-- files this was consolidated from.
-- ==============================================================================

-- 8.1 Module registration — makes Attendance selectable in the Super Admin
-- Subscription Plans editor and per-hospital module toggle, same mechanism
-- as every other optional module (Section 5).
INSERT INTO saas_core.modules (code, name, description, category, frontend_route_prefix, api_prefix, icon, is_core, required_modules) VALUES
('attendance', 'Attendance', 'Staff attendance marking, verification, and reporting', 'hr', '/attendance', '/api/v1/attendance', 'event_available', false, '{}')
ON CONFLICT (code) DO NOTHING;

-- 8.2 Employee/HR fields on users — deliberately on the existing `users`
-- table, not a separate employee_profiles table. All nullable except
-- include_in_payroll. A users.department_id column was added and then
-- dropped again within this same feature (departments is scoped to
-- clinical/doctor specialties — reusing it for general HR roles like
-- nurses/pharmacists was a mismatch); it is intentionally absent below.
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_joining DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_leaving DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20); -- full_time / part_time / contract
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account_holder_name VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_branch VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pf_number VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pan_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_leave_entitlement INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS include_in_payroll BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS base_salary NUMERIC(12,2);

-- 8.3 Holidays — one row per hospital per month. holiday_days = regular/
-- weekly-off days (e.g. Sundays), subtracted from payroll working_days.
-- festival_days = festival/local holidays (e.g. Diwali) — non-attendance
-- days in the grid, but NOT subtracted from working_days since they're paid
-- regardless of attendance. Sundays being pre-checked when a month has no
-- saved row yet is a frontend-only default; nothing here enforces it.
CREATE TABLE IF NOT EXISTS holidays (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id   UUID NOT NULL REFERENCES hospitals(id),
    year          INTEGER NOT NULL,
    month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    holiday_days  INTEGER[] NOT NULL DEFAULT '{}',
    festival_days INTEGER[] NOT NULL DEFAULT '{}',
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_holidays_hospital_year_month ON holidays(hospital_id, year, month);

DROP TRIGGER IF EXISTS update_holidays_updated_at ON holidays;
CREATE TRIGGER update_holidays_updated_at BEFORE UPDATE ON holidays
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8.4 Shifts — hospital-configurable shift definitions. users.shift_id
-- holds only the employee's CURRENT shift (no history table), same pattern
-- as designation/employment_type above.
CREATE TABLE IF NOT EXISTS shifts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id  UUID NOT NULL REFERENCES hospitals(id),
    name         VARCHAR(50) NOT NULL,
    start_time   TIME NOT NULL,
    end_time     TIME NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, name)
);

CREATE INDEX IF NOT EXISTS idx_shifts_hospital ON shifts(hospital_id);

DROP TRIGGER IF EXISTS update_shifts_updated_at ON shifts;
CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id);
CREATE INDEX IF NOT EXISTS idx_users_shift ON users(shift_id);

-- Seed Day/Night for every existing hospital so the picker isn't empty on
-- first use. A no-op on a genuinely fresh install (no hospitals yet); kept
-- for parity with running this file against an already-seeded database.
INSERT INTO shifts (hospital_id, name, start_time, end_time)
SELECT id, 'Day Shift', '09:00', '17:00' FROM hospitals
ON CONFLICT (hospital_id, name) DO NOTHING;

INSERT INTO shifts (hospital_id, name, start_time, end_time)
SELECT id, 'Night Shift', '21:00', '06:00' FROM hospitals
ON CONFLICT (hospital_id, name) DO NOTHING;

-- 8.5 Shift assignment history — users.shift_id (8.4) only ever holds the
-- CURRENT shift, so a reassignment would otherwise silently rewrite what
-- past months' Attendance Reports show. This is the effective-dated audit
-- trail: one open-ended row per employee (effective_to IS NULL = current),
-- closed and replaced on every reassignment. Reports resolve "the shift
-- effective as of <end of that report's month>" from here rather than
-- reading users.shift_id directly; users.shift_id remains the fast pointer
-- for current-shift lookups, kept in sync alongside this table.
CREATE TABLE IF NOT EXISTS shift_assignments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id    UUID NOT NULL REFERENCES hospitals(id),
    user_id        UUID NOT NULL REFERENCES users(id),
    shift_id       UUID NOT NULL REFERENCES shifts(id),
    effective_from DATE NOT NULL,
    effective_to   DATE,  -- NULL = still current
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_hospital_user_from
    ON shift_assignments(hospital_id, user_id, effective_from DESC);

-- Backfill: give every currently-assigned employee (seeded just above, on a
-- database that already had hospitals/users) an open-ended assignment row.
-- A no-op on a genuinely fresh install (no users yet); kept for parity with
-- running this file against an already-seeded database.
INSERT INTO shift_assignments (hospital_id, user_id, shift_id, effective_from)
SELECT u.hospital_id, u.id, u.shift_id, COALESCE(u.date_of_joining, u.created_at::date)
FROM users u
WHERE u.shift_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM shift_assignments sa
      WHERE sa.user_id = u.id AND sa.effective_to IS NULL
  );

-- 8.6 Attendance records — one row per (user, date), but ONLY for days that
-- deviate from the default. A working day with no row is assumed Present;
-- 'present' is also a real storable status (explicitly confirmed present,
-- vs. never touched — distinguished in the marking grid as colored vs.
-- blank). Two other day-statuses shown in the Attendance Report are NOT
-- stored here — they're computed on read:
--   - Week-Off / Holiday: any day-of-month in holidays.holiday_days or
--     holidays.festival_days for that hospital/year/month (8.3 above).
--   - Not Applicable (NA): any date outside [users.date_of_joining,
--     users.date_of_leaving] (8.2 above).
-- This keeps the table small (exceptions only) and keeps the Holiday
-- Calendar the single source of truth for holidays.
CREATE TABLE IF NOT EXISTS attendance_records (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id  UUID NOT NULL REFERENCES hospitals(id),
    user_id      UUID NOT NULL REFERENCES users(id),
    date         DATE NOT NULL,
    status       VARCHAR(10) NOT NULL CHECK (status IN ('present', 'absent', 'half_day')),
    reason       VARCHAR(255),
    marked_by    UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_hospital_date ON attendance_records(hospital_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_user ON attendance_records(user_id);

DROP TRIGGER IF EXISTS update_attendance_records_updated_at ON attendance_records;
CREATE TRIGGER update_attendance_records_updated_at BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8.7 Payroll — payroll_runs is one row per (hospital, year, month);
-- "Generate Payroll" upserts it and its line items from that month's
-- Attendance Report. Re-generating overwrites the previous snapshot (no
-- finalize/lock concept yet). payroll_items freezes that month's
-- attendance-derived numbers per employee so later edits to base_salary or
-- paid_leave_entitlement don't silently rewrite payroll history.
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
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id         UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    user_id                UUID NOT NULL REFERENCES users(id),
    present_count          NUMERIC(5,1) NOT NULL DEFAULT 0,
    absent_count           NUMERIC(5,1) NOT NULL DEFAULT 0,
    paid_leave_entitlement INTEGER NOT NULL DEFAULT 0,
    working_days           INTEGER NOT NULL DEFAULT 0,
    base_salary            NUMERIC(12,2) NOT NULL DEFAULT 0,
    per_day_salary         NUMERIC(12,2) NOT NULL DEFAULT 0,
    deduction_days         NUMERIC(5,1) NOT NULL DEFAULT 0,
    deduction_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_payable            NUMERIC(12,2) NOT NULL DEFAULT 0,
    UNIQUE (payroll_run_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_hospital ON payroll_runs(hospital_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id);

-- 8.8 Allowances — a one-off, event-tied payment to an employee (a business
-- trip, a campaign fee, etc.), not a recurring salary component. One row
-- per event, tagged to the (year, month) it should count toward — the same
-- employee can have several in one month, each with its own reason.
-- 'added_to_salary' allowances are summed into that month's Payroll
-- net_payable at generation time; 'in_hand' ones are recorded and shown in
-- the payroll detail popup, but excluded from that sum.
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

-- Frozen snapshot of that month's 'added_to_salary' allowance sum at the
-- moment payroll was generated — same principle as every other
-- payroll_items column (a later allowance edit doesn't retroactively
-- rewrite an already-generated payslip).
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS allowance_added NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 8.9 Incentives — a sales-linked incentive for an employee. The admin
-- enters sales_amount and incentive_percent; incentive_amount is computed
-- and stored server-side (sales_amount * incentive_percent / 100), never
-- trusted from the client. Unlike allowances there's no in-hand/added-to-
-- salary choice: every incentive always counts toward that month's Payroll
-- net_payable. One row per event, tagged to (year, month), same reasoning
-- as allowances above.
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

-- Frozen snapshot of that month's incentive sum at the moment payroll was
-- generated — same principle as allowance_added above.
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS incentive_added NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 8.10 Paid Leave Policy (System Settings → Leave Policy) — a hospital can
-- choose between every employee keeping their own users.paid_leave_
-- entitlement (paid_leave_uniform = false, the default — unchanged
-- behavior), or one hospital-wide number applied to everyone
-- (paid_leave_uniform = true, using paid_leave_default_days). See
-- attendance_service.get_month_report for where this is read.
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS paid_leave_uniform BOOLEAN DEFAULT FALSE;
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS paid_leave_default_days INTEGER DEFAULT 2;

-- 8.11 Advance Payments — a salary advance/loan given to an employee,
-- recovered as a fixed EMI (amount / installments) deducted from Payroll
-- each month starting at (start_year, start_month) until fully repaid.
-- Unlike allowances/incentives this isn't tagged to one month — it's a
-- standing loan spanning many months. Deliberately no monthly repayment
-- ledger: how much is repaid, and any given month's installment, is
-- computed live from (amount, emi_amount, start_year, start_month) versus
-- the report month — see advance_payment_service.get_month_deduction.
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

COMMIT;
