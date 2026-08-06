-- ==============================================================================
-- 14 — REMOVE department_id FROM USERS
--
-- Reverts 11_add_employee_fields_to_users.sql's department_id column. The
-- `departments` table is scoped to clinical/doctor specialties (Cardiology,
-- Orthopedics, Pharmacy, Laboratory, ...) — reusing it as a general HR
-- department field for nurses/pharmacists/inventory managers was a mismatch;
-- those roles don't belong in a doctor-specialty list. `doctors.department_id`
-- is untouched — that one is correctly scoped to clinical departments.
--
-- Safe to run against an existing DB — idempotent (DROP COLUMN/INDEX IF EXISTS).
-- ==============================================================================

DROP INDEX IF EXISTS idx_users_department;
ALTER TABLE users DROP COLUMN IF EXISTS department_id;
