-- ==============================================================================
-- 12 — BASE SALARY ON USERS
--
-- Adds base_salary directly onto the existing `users` table, same pattern as
-- 11_add_employee_fields_to_users.sql. Nullable, no existing columns touched.
--
-- Safe to run against an existing DB — idempotent (ADD COLUMN IF NOT EXISTS).
-- ==============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS base_salary NUMERIC(12,2);
