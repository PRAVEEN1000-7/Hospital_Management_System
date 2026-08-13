-- ==============================================================================
-- 14 — MAKE doctor_id OPTIONAL ON PRESCRIPTIONS / LAB ORDERS / OPTICAL PRESCRIPTIONS
--
-- Pharmacist, lab technician, and optical staff "walk-in" create flows (added
-- earlier the same day this migration was written) let non-doctor staff
-- create a Prescription / LabOrder / OpticalPrescription for a walk-in
-- patient with no consultation behind it. All three tables' doctor_id column
-- was still NOT NULL, forcing those flows to attribute the record to an
-- arbitrary doctor picked from a dropdown. This drops that constraint so
-- doctor_id can genuinely be left NULL — "no doctor assigned" — instead of
-- being misattributed.
--
-- Application-layer changes that go with this: backend/app/models/{prescription,lab,optical}.py
-- (nullable=True), and the corresponding create_* service functions in
-- prescription_service.py / lab_service.py / optical_service.py now leave
-- doctor_id = None instead of raising when the caller isn't a doctor and no
-- doctor_id was supplied.
--
-- Safe to run against an existing DB — every statement only alters the
-- column if it is still NOT NULL, so re-running this file is a no-op.
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'prescriptions' AND column_name = 'doctor_id' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE prescriptions ALTER COLUMN doctor_id DROP NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lab_orders' AND column_name = 'doctor_id' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE lab_orders ALTER COLUMN doctor_id DROP NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'optical_prescriptions' AND column_name = 'doctor_id' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE optical_prescriptions ALTER COLUMN doctor_id DROP NOT NULL;
    END IF;
END $$;
