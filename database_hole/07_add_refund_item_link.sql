-- ==============================================================================
-- 07 — Link a refund to the specific invoice line item (and quantity) it
-- covers, so a medicine refund can restore the exact stock quantity to the
-- exact batch it was dispensed from, instead of only adjusting money.
--
-- Both columns are nullable / additive: a refund with no invoice_item_id
-- behaves exactly as before (a plain monetary refund against a payment,
-- e.g. a consultation-fee refund or a general billing correction) — nothing
-- to restock. Only refunds that explicitly target a "medicine" line item
-- carry a restock_quantity and trigger stock restoration in
-- refund_service.process_refund.
-- ==============================================================================

ALTER TABLE refunds
    ADD COLUMN IF NOT EXISTS invoice_item_id UUID REFERENCES invoice_items(id);

ALTER TABLE refunds
    ADD COLUMN IF NOT EXISTS restock_quantity NUMERIC(10, 2);
