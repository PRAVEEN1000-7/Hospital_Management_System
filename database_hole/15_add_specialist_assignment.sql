-- ==============================================================================
-- 15 — SPECIALIST ASSIGNMENT FLAG (walk-in registration)
--
-- Adds a lock flag to appointments so reception can mark a walk-in as a
-- "Specialist Assignment" — the patient must be consulted by the doctor
-- chosen at registration only. Once set, the backend refuses to reassign
-- (POST /walk-ins/{id}/assign-doctor) or refer (POST /walk-ins/refer) that
-- patient to a different doctor; the queue entry only ever appears under
-- the originally assigned doctor.
--
-- Safe to run against an existing DB — idempotent (ADD COLUMN IF NOT EXISTS).
-- ==============================================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_specialist_assignment BOOLEAN NOT NULL DEFAULT FALSE;
