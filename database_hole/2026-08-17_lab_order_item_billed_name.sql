-- ==============================================================================
-- 2026-08-17 — LAB BILLING: per-item billed_name + catalog price always ₹0
--
-- Pairs with a code change: lab test catalog prices are no longer entered/
-- editable at all (LabTestCreate/LabTestUpdate dropped the field) — the
-- real amount for a lab report is now entered by billing staff per order
-- item, at collection time (LabOrderItem.price, via the new
-- PUT /lab/orders/{order_id}/items/{item_id}/billing endpoint), together
-- with an optional billing-only display name (the new billed_name column
-- below). The doctor's own views keep showing LabOrderItem.test_name
-- (the catalog snapshot) untouched by any of this — only the invoice and
-- billing worklist read billed_name.
--
-- Idempotent — safe to re-run.
-- ==============================================================================

ALTER TABLE lab_order_items ADD COLUMN IF NOT EXISTS billed_name VARCHAR(200);

-- Existing catalog test prices are no longer meaningful going forward —
-- zero them out. Does NOT touch lab_order_items.price on existing orders
-- (paid or unpaid) — those are each order's own already-agreed amount and
-- are left exactly as they are; only the catalog itself is reset.
UPDATE lab_tests SET price = 0 WHERE price <> 0;
