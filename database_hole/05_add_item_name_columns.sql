-- ============================================================================
-- HMS - Inventory Alter Script: Add item_name columns for display purposes
-- ============================================================================
-- This script adds item_name columns to inventory item tables to store
-- the item name directly, avoiding the need for complex joins or lookups.
-- This supports both catalog items (with item_id) and manual entries (without).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADD COLUMN: item_name to purchase_order_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE purchase_order_items
    ADD COLUMN IF NOT EXISTS item_name VARCHAR(200) NOT NULL DEFAULT 'Unknown Item';

ALTER TABLE purchase_order_items
    ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE purchase_order_items
    ALTER COLUMN item_name DROP DEFAULT;

COMMENT ON COLUMN purchase_order_items.item_name IS
    'Name of the item for display. Required for all items.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ADD COLUMN: item_name to grn_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE grn_items
    ADD COLUMN IF NOT EXISTS item_name VARCHAR(200) NOT NULL DEFAULT 'Unknown Item';

ALTER TABLE grn_items
    ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE grn_items
    ALTER COLUMN item_name DROP DEFAULT;

COMMENT ON COLUMN grn_items.item_name IS
    'Name of the item for display. Required for all items.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ADD COLUMN: item_name to stock_movements
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);

ALTER TABLE stock_movements
    ALTER COLUMN item_id DROP NOT NULL;

COMMENT ON COLUMN stock_movements.item_name IS
    'Name of the item for display purposes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ADD COLUMN: item_name to stock_adjustments
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stock_adjustments
    ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);

ALTER TABLE stock_adjustments
    ALTER COLUMN item_id DROP NOT NULL;

COMMENT ON COLUMN stock_adjustments.item_name IS
    'Name of the item for display purposes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ADD COLUMN: item_name to cycle_count_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cycle_count_items
    ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);

ALTER TABLE cycle_count_items
    ALTER COLUMN item_id DROP NOT NULL;

COMMENT ON COLUMN cycle_count_items.item_name IS
    'Name of the item for display purposes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. UPDATE item_type column sizes to VARCHAR(50) for flexibility
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE purchase_order_items
    ALTER COLUMN item_type TYPE VARCHAR(50);

ALTER TABLE grn_items
    ALTER COLUMN item_type TYPE VARCHAR(50);

ALTER TABLE stock_movements
    ALTER COLUMN item_type TYPE VARCHAR(50);

ALTER TABLE stock_adjustments
    ALTER COLUMN item_type TYPE VARCHAR(50);

ALTER TABLE cycle_count_items
    ALTER COLUMN item_type TYPE VARCHAR(50);

-- ============================================================================
-- END OF ALTER SCRIPT
-- ============================================================================
