-- ==============================================================================
-- 2026-08-31 — lab_orders.doctor_id MUST BE NULLABLE
--
-- Root cause of "Prescription saved, but the lab order could not be created:
-- Failed to create lab order": backend/app/models/lab.py's LabOrder.doctor_id
-- has always been declared `nullable=True` — deliberately, per
-- lab_service.create_lab_order's own comment: doctor_id falls back to None
-- when neither an explicit doctor_id nor a doctor-owned created_by resolves
-- to a Doctor row (e.g. an admin/receptionist finalizing a prescription on
-- a doctor's behalf, or a lab_technician ordering tests for a walk-in with
-- no consultation). The actual `lab_orders` table was created with
-- doctor_id NOT NULL, contradicting the model — every such order attempt
-- hit a NotNullViolation, caught by the router's generic `except Exception`
-- and surfaced only as the opaque "Failed to create lab order".
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

ALTER TABLE lab_orders ALTER COLUMN doctor_id DROP NOT NULL;
