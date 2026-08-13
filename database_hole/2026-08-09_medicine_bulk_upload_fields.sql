-- ==============================================================================
-- 2026-08-09 — MEDICINE BULK UPLOAD / SINGLE-ADD FIELD PARITY
--
-- Consolidates what were previously two separate incremental files
-- (15_medicine_extended_fields.sql, 16_medicine_batch_supplier.sql) into one
-- dated file covering this update, per the client's preference for a single
-- easy-to-find file per date rather than a growing list of numbered ones.
--
-- Background: the single "Add Medicine" form, the bulk-upload-via-Excel
-- flow, and the Medicine Detail page's Info Card / batch table all already
-- collected or displayed these fields — the frontend forms, the
-- MedicineCreate/MedicineUpdate/MedicineResponse/BatchResponse Pydantic
-- schemas, and the bulk-upload Excel template had all sent/expected them for
-- a while. But the underlying tables never had columns for them, so
-- pharmacy_service._filter_model_data (which only keeps keys matching a real
-- model column) silently dropped every one of them on every create/update —
-- for a single Add just as much as for a bulk upload, and identically for a
-- batch whether it came from the medicine form's Opening Stock section or
-- the bulk template. The value was simply never captured anywhere, which is
-- why re-opening a medicine (or looking at a batch's "Supplier" column)
-- never showed what was typed in.
--
-- 1) medicines — brand, dosage_form, schedule_type, rack_location,
--    drug_interaction_notes, side_effects.
-- 2) medicine_batches — supplier_id (the batch table's "Supplier" column had
--    nothing to read from).
--
-- No application-layer change is needed beyond this file — see
-- backend/app/models/prescription.py's Medicine class and
-- backend/app/models/pharmacy.py's MedicineBatch class for the matching
-- SQLAlchemy column/relationship additions.
--
-- Safe to run against an existing DB — every statement only adds the column
-- if it doesn't already exist, so re-running this file is a no-op.
-- ==============================================================================

-- 1) medicines — six columns already sent by both the single-add form and
--    the bulk-upload Excel template, but never persisted.
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS brand VARCHAR(200);
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS dosage_form VARCHAR(100);
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(10);
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS rack_location VARCHAR(100);
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS drug_interaction_notes TEXT;
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS side_effects TEXT;

-- 2) medicine_batches — the "Supplier" column shown on the Medicine Detail
--    page's batch table had nothing to read from until now.
ALTER TABLE medicine_batches ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
