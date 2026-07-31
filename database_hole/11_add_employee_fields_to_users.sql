-- ==============================================================================
-- 11 — EMPLOYEE FIELDS ON USERS
--
-- Adds HR/employment fields directly onto the existing `users` table, per
-- explicit instruction: not a separate employee_profiles table. All new
-- columns are nullable (existing rows get NULL) except include_in_payroll,
-- which defaults to true. No existing columns are touched or removed.
--
-- Safe to run against an existing DB — idempotent (ADD COLUMN IF NOT EXISTS).
-- ==============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);
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

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
