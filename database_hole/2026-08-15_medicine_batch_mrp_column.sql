-- ==============================================================================
-- 2026-08-15 — MEDICINE BATCH: REAL, INDEPENDENT MRP COLUMN
--
-- medicine_batches.mrp used to be a Python-level SQLAlchemy synonym() of
-- selling_price (see models/pharmacy.py) — no real column existed, so
-- entering a different MRP at batch creation was silently discarded, and
-- there was never a way to change MRP after the fact. Real pharmacy
-- practice needs MRP (the price printed on the pack) independent of
-- Selling Price (what's actually charged) — this makes that possible.
--
-- Backfilled from the existing selling_price so every current batch's
-- displayed MRP is unchanged immediately after this migration; the two
-- values only diverge going forward once someone explicitly edits one.
--
-- Safe to run against an existing DB — idempotent (ADD COLUMN IF NOT EXISTS).
-- ==============================================================================

ALTER TABLE medicine_batches ADD COLUMN IF NOT EXISTS mrp NUMERIC(12,2);

UPDATE medicine_batches SET mrp = selling_price WHERE mrp IS NULL;
