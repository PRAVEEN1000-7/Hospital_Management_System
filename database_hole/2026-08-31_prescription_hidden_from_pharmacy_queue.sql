-- ==============================================================================
-- 2026-08-31 — PHARMACY QUEUE "REMOVE" MUST NOT DELETE THE PRESCRIPTION
--
-- Previously, removing a not-yet-dispensed prescription from the pharmacist's
-- Pending Prescriptions queue (PendingPrescriptions.tsx) called the same
-- delete_prescription() used everywhere else, which sets prescriptions.
-- is_deleted = true — hiding it from the doctor's own /prescriptions ("All
-- Prescription") list too, not just the pharmacy queue. A pharmacist meant
-- "this doesn't need pharmacy action anymore," not "this visit's
-- prescription record never happened."
--
-- New column is scoped ONLY to the pharmacy dispensing queue's own listing
-- (dispensing_service.get_pending_prescriptions) — every other listing
-- (prescription_service.list_prescriptions, patient history, etc.) ignores
-- it entirely and keeps showing the prescription exactly as before.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS hidden_from_pharmacy_queue BOOLEAN NOT NULL DEFAULT false;
