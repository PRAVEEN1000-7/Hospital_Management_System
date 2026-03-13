-- ============================================================
-- 06_pharmacy_prescription_fields.sql
-- Adds manufacturing date to batches and prescription snapshot
-- fields to pharmacy sale items.
-- ============================================================

-- 1. Add mfg_date to medicine_batches
ALTER TABLE medicine_batches ADD COLUMN IF NOT EXISTS mfg_date DATE;

-- 2. Add prescription snapshot fields to pharmacy_sale_items
ALTER TABLE pharmacy_sale_items ADD COLUMN IF NOT EXISTS batch_number VARCHAR(50);
ALTER TABLE pharmacy_sale_items ADD COLUMN IF NOT EXISTS mfg_date DATE;
ALTER TABLE pharmacy_sale_items ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE pharmacy_sale_items ADD COLUMN IF NOT EXISTS mrp NUMERIC(12,2);
ALTER TABLE pharmacy_sale_items ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(200);

-- Done ✓
