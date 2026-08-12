-- ==============================================================================
-- 2026-08-12 — GST ENGINE FOR PURCHASE ORDERS
--
-- Full GST calculation (CGST/SGST/IGST/UGST split by place of supply, GSTIN
-- validation, tax-slab enforcement) for Purchase Orders only — see
-- backend/app/services/gst_service.py for the calculation logic. GRN
-- deliberately does NOT carry any GST fields; it stays a plain
-- quantity/unit_price/total_price receipt record.
--
-- Party GST data (suppliers.*, hospitals.gstin/gst_registration_status) —
-- needed to determine intra-state vs inter-state vs Union Territory vs
-- export/foreign for each PO.
--
-- Item-level GST fields (purchase_order_items.*) — discount, taxable
-- amount, and the four mutually-exclusive GST components.
--
-- Header-level aggregate fields (purchase_orders.*) — the single summed row
-- per PO, even when line items mix GST rates (e.g. 12% and 18% on the same
-- order).
--
-- Safe to run against an existing DB — every statement is idempotent.
-- ==============================================================================

-- ── Party GST data ──────────────────────────────────────────────────────────

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS gstin VARCHAR(15);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS gst_registration_status VARCHAR(20) DEFAULT 'unregistered';

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS gstin VARCHAR(15);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS gst_registration_status VARCHAR(20) DEFAULT 'registered';

-- ── Purchase Order — item level ─────────────────────────────────────────────

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS ugst_amount NUMERIC(12,2) DEFAULT 0;

-- ── Purchase Order — header aggregate ───────────────────────────────────────

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS ugst_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS place_of_supply_type VARCHAR(20);
