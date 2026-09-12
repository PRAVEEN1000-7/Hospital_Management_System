-- ==============================================================================
-- 2026-09-12 — Single combined "Add" (reading addition) power for both eyes,
-- on both the AR/machine reading and the doctor's final prescription.
--
-- Same rationale as the earlier `pd` column: reading addition is clinically
-- the same for both eyes in almost every prescription, so the entry UI now
-- shows one shared field per block instead of separate right_add/left_add
-- (and right_machine_add/left_machine_add) inputs. Those old per-eye columns
-- are kept, untouched, for backward compatibility with existing records.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS add NUMERIC(4,2);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS machine_add NUMERIC(4,2);
