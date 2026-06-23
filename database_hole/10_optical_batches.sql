-- ============================================================================
-- 10_optical_batches.sql
-- Optical Store module: batch/lot stock tracking + supporting fixes.
--
-- optical_products, optical_prescriptions, optical_orders, optical_order_items
-- already exist (created earlier, never wired up to application code). This
-- migration adds the one missing piece — optical_batches — so optical stock
-- can be tracked the same way medicine_batches tracks Pharmacy stock, then
-- backfills existing optical_products.current_stock into opening batches so
-- no existing seed stock is lost when batches become the source of truth.
-- ============================================================================

-- 1. Batch/lot table for optical products. Mirrors medicine_batches, except
--    expiry_date is nullable: frames/solutions/accessories don't expire,
--    only contact lenses meaningfully do.
CREATE TABLE IF NOT EXISTS optical_batches (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    optical_product_id  UUID          NOT NULL REFERENCES optical_products(id),
    batch_number        VARCHAR(50)   NOT NULL,
    grn_id              UUID          REFERENCES goods_receipt_notes(id),
    manufactured_date   DATE,
    expiry_date         DATE,
    purchase_price      NUMERIC,
    selling_price       NUMERIC,
    initial_quantity    INTEGER       NOT NULL DEFAULT 0,
    current_quantity    INTEGER       NOT NULL DEFAULT 0,
    is_expired          BOOLEAN       DEFAULT false,
    is_active           BOOLEAN       DEFAULT true,
    created_at          TIMESTAMPTZ   DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (optical_product_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_optical_batches_product ON optical_batches(optical_product_id);
CREATE INDEX IF NOT EXISTS idx_optical_batches_expiry ON optical_batches(expiry_date);

-- 2. optical_order_items needs a batch reference now that sales decrement a
--    specific batch (FEFO) instead of a flat current_stock counter.
ALTER TABLE optical_order_items ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES optical_batches(id);

-- 3. Backfill: one opening batch per existing product with stock on hand, so
--    the 7 seeded optical_products rows keep their current_stock instead of
--    silently going to zero once optical_batches becomes the source of truth.
--    Null expiry = "never expires" under the FEFO rule used by the service layer.
--    Guarded on "product has no batches yet at all" rather than ON CONFLICT on
--    the batch_number — the batch_number embeds today's date, so re-running this
--    script on a later day would otherwise insert a second opening batch (and
--    silently double the product's stock) instead of being a no-op.
INSERT INTO optical_batches (optical_product_id, batch_number, expiry_date, initial_quantity, current_quantity, purchase_price, selling_price)
SELECT
    op.id,
    'OPENING-' || to_char(NOW(), 'YYYYMMDD'),
    NULL,
    COALESCE(op.current_stock, 0),
    COALESCE(op.current_stock, 0),
    op.purchase_price,
    op.selling_price
FROM optical_products op
WHERE COALESCE(op.current_stock, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM optical_batches ob WHERE ob.optical_product_id = op.id);

-- 4. optical_products.current_stock is now superseded by SUM(optical_batches)
--    — mirrors how Medicine has no stock column at all, batches are the only
--    source of truth. Not dropping the column (no destructive drops in this
--    migration history); just marking it dead so it isn't read by mistake.
COMMENT ON COLUMN optical_products.current_stock IS
  'DEPRECATED — unused since optical_batches was introduced. Stock is now SUM(optical_batches.current_quantity) for active batches, mirroring Medicine/MedicineBatch.';

-- 5. Module-dependency reconciliation: Optical is self-contained (its own
--    prescription model, its own standalone batch stock-in path), so it does
--    not hard-require Inventory or the clinical Prescriptions module. Settle
--    the three previously-disagreeing, currently-unenforced dependency
--    sources down to just "patients".
UPDATE saas_core.modules SET required_modules = ARRAY['patients'] WHERE code = 'optical';

DELETE FROM saas_core.module_dependencies WHERE module_name = 'optical' AND depends_on = 'prescriptions';
DELETE FROM saas_core.module_dependencies WHERE module_name = 'optical' AND depends_on = 'inventory';
