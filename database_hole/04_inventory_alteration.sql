-- ============================================================================
-- HMS - Inventory Module: Complete Schema Alterations
-- ============================================================================
-- This file consolidates all ALTER TABLE, CREATE TABLE, CREATE FUNCTION, 
-- CREATE TRIGGER, and CREATE VIEW statements from the inventory migration files.
-- 
-- Source files consolidated:
--   - 05_add_item_name_columns.sql
--   - 06_products_master_table.sql
--   - 08_link_products_with_inventory.sql
--   - 09_fix_grn_segregation.sql
--   - 09_update_medicine_skus.sql (schema changes only)
--   - 10_fix_inventory_consistency.sql (schema changes only)
--   - 10_sync_medicine_skus_to_products.sql (schema changes only)
--   - inventory_alter.sql
--
-- Run AFTER: 01_schema.sql, 02_seed_data.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: CREATE NEW TABLES (from 06_products_master_table.sql)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.1 CREATE CENTRALIZED PRODUCTS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    product_name VARCHAR(200) NOT NULL,
    generic_name VARCHAR(200),
    brand_name VARCHAR(200),
    category VARCHAR(50) NOT NULL,
    subcategory VARCHAR(100),
    sku VARCHAR(50),
    barcode VARCHAR(100),
    manufacturer VARCHAR(200),
    supplier_id UUID REFERENCES suppliers(id),
    purchase_price NUMERIC(12, 2) DEFAULT 0,
    selling_price NUMERIC(12, 2) DEFAULT 0,
    mrp NUMERIC(12, 2) DEFAULT 0,
    tax_percentage NUMERIC(5, 2) DEFAULT 0,
    unit_type VARCHAR(50) DEFAULT 'unit',
    pack_size INTEGER DEFAULT 1,
    min_stock_level INTEGER DEFAULT 10,
    max_stock_level INTEGER DEFAULT 1000,
    reorder_level INTEGER DEFAULT 20,
    storage_conditions TEXT,
    shelf_life_days INTEGER,
    requires_refrigeration BOOLEAN DEFAULT FALSE,
    is_hazardous BOOLEAN DEFAULT FALSE,
    is_narcotic BOOLEAN DEFAULT FALSE,
    requires_prescription BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_hospital ON products(hospital_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.2 CREATE STOCK SUMMARY TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    total_stock INTEGER DEFAULT 0,
    available_stock INTEGER DEFAULT 0,
    reserved_stock INTEGER DEFAULT 0,
    damaged_stock INTEGER DEFAULT 0,
    expired_stock INTEGER DEFAULT 0,
    total_batches INTEGER DEFAULT 0,
    earliest_expiry DATE,
    avg_cost_price NUMERIC(12, 2) DEFAULT 0,
    total_value NUMERIC(14, 2) DEFAULT 0,
    is_low_stock BOOLEAN DEFAULT FALSE,
    is_expiring_soon BOOLEAN DEFAULT FALSE,
    last_movement_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hospital_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_summary_hospital ON stock_summary(hospital_id);
CREATE INDEX IF NOT EXISTS idx_stock_summary_low_stock ON stock_summary(hospital_id, is_low_stock) WHERE is_low_stock = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.3 CREATE STOCK ALERTS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium',
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    current_stock INTEGER,
    threshold_stock INTEGER,
    expiry_date DATE,
    days_until_expiry INTEGER,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_hospital ON stock_alerts(hospital_id);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_unresolved ON stock_alerts(hospital_id, is_resolved) WHERE is_resolved = FALSE;

-- ============================================================================
-- PART 2: ADD ITEM_NAME COLUMNS (from 05_add_item_name_columns.sql)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.1 ADD item_name TO purchase_order_items
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
-- 2.2 ADD item_name TO grn_items
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
-- 2.3 ADD item_name TO stock_movements
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);

ALTER TABLE stock_movements
    ALTER COLUMN item_id DROP NOT NULL;

COMMENT ON COLUMN stock_movements.item_name IS
    'Name of the item for display purposes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.4 ADD item_name TO stock_adjustments
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stock_adjustments
    ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);

ALTER TABLE stock_adjustments
    ALTER COLUMN item_id DROP NOT NULL;

COMMENT ON COLUMN stock_adjustments.item_name IS
    'Name of the item for display purposes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.5 ADD item_name TO cycle_count_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cycle_count_items
    ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);

ALTER TABLE cycle_count_items
    ALTER COLUMN item_id DROP NOT NULL;

COMMENT ON COLUMN cycle_count_items.item_name IS
    'Name of the item for display purposes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.6 UPDATE item_type COLUMN SIZES
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
-- PART 3: ADD PRODUCT_ID FOREIGN KEYS (from 08_link_products_with_inventory.sql)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.1 ADD product_id TO purchase_order_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE purchase_order_items
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON purchase_order_items(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2 ADD product_id TO grn_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE grn_items
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

CREATE INDEX IF NOT EXISTS idx_grn_items_product_id ON grn_items(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.3 ADD product_id TO stock_movements
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stock_movements
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4 ADD product_id TO stock_adjustments
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stock_adjustments
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

CREATE INDEX IF NOT EXISTS idx_adjustments_product_id ON stock_adjustments(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.5 ADD product_id TO cycle_count_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cycle_count_items
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

CREATE INDEX IF NOT EXISTS idx_cycle_count_items_product_id ON cycle_count_items(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.6 ADD product_id TO medicine_batches
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE medicine_batches
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

CREATE INDEX IF NOT EXISTS idx_medicine_batches_product_id ON medicine_batches(product_id);

-- ============================================================================
-- PART 4: ADD SUPPLIER PRODUCT CATEGORIES (from inventory_alter.sql)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.1 ADD product_categories ARRAY TO suppliers
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS product_categories TEXT[] DEFAULT '{}';

COMMENT ON COLUMN suppliers.product_categories IS
    'Array of product categories supplied by this vendor: medicine, optical, surgical, equipment, laboratory, disposable, other';

-- ============================================================================
-- PART 5: GRN SEGREGATION TRIGGER (from 09_fix_grn_segregation.sql)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.1 CREATE/REPLACE GRN Segregation Function
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_grn_segregation()
RETURNS TRIGGER AS $$
DECLARE
    creator_role TEXT;
BEGIN
    -- Get the role of the creator
    SELECT r.name INTO creator_role
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = NEW.created_by
    LIMIT 1;

    -- Allow admin and super_admin to create and verify (they have override permissions)
    IF creator_role IN ('admin', 'super_admin') THEN
        RETURN NEW;
    END IF;

    -- For other users, enforce segregation of duties
    IF NEW.created_by IS NOT NULL AND NEW.verified_by IS NOT NULL AND NEW.created_by = NEW.verified_by THEN
        RAISE EXCEPTION 'Segregation of duties violation: GRN creator cannot be the verifier. Please have an admin or different user verify this GRN.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.2 CREATE/REPLACE GRN Segregation Trigger
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_grn_segregation ON goods_receipt_notes;

CREATE TRIGGER trg_grn_segregation
    BEFORE INSERT OR UPDATE OF verified_by ON goods_receipt_notes
    FOR EACH ROW
    EXECUTE FUNCTION enforce_grn_segregation();

-- ============================================================================
-- PART 6: CREATE INVENTORY VIEWS (from 08_link_products_with_inventory.sql)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.1 View: Purchase Orders with Product Details
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_purchase_orders_with_products AS
SELECT
    po.id,
    po.po_number,
    po.hospital_id,
    po.supplier_id,
    s.name AS supplier_name,
    po.order_date,
    po.expected_delivery_date,
    po.status,
    po.total_amount,
    po.notes,
    po.created_by,
    po.approved_by,
    po.created_at,
    po.updated_at,
    poi.id AS item_id,
    poi.item_type,
    poi.item_id AS catalog_item_id,
    poi.product_id,
    p.product_name,
    p.generic_name,
    p.category,
    p.sku,
    p.barcode,
    poi.item_name,
    poi.quantity_ordered,
    poi.quantity_received,
    poi.unit_price,
    poi.total_price AS item_total
FROM purchase_orders po
JOIN suppliers s ON po.supplier_id = s.id
LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
LEFT JOIN products p ON poi.product_id = p.id OR (poi.item_type = 'medicine' AND poi.item_id::text = p.id::text)
ORDER BY po.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.2 View: GRNs with Product Details
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_grns_with_products AS
SELECT
    grn.id,
    grn.grn_number,
    grn.hospital_id,
    grn.purchase_order_id,
    grn.supplier_id,
    s.name AS supplier_name,
    grn.receipt_date,
    grn.invoice_number,
    grn.invoice_date,
    grn.total_amount,
    grn.status,
    grn.verified_by,
    grn.notes,
    grn.created_by,
    grn.created_at,
    grn.updated_at,
    grni.id AS grn_item_id,
    grni.item_type,
    grni.item_id AS catalog_item_id,
    grni.product_id,
    p.product_name,
    p.generic_name,
    p.category,
    grni.item_name,
    grni.batch_number,
    grni.expiry_date,
    grni.quantity_received,
    grni.quantity_accepted,
    grni.quantity_rejected,
    grni.unit_price,
    grni.total_price AS item_total
FROM goods_receipt_notes grn
JOIN suppliers s ON grn.supplier_id = s.id
LEFT JOIN grn_items grni ON grn.id = grni.grn_id
LEFT JOIN products p ON grni.product_id = p.id OR (grni.item_type = 'medicine' AND grni.item_id::text = p.id::text)
ORDER BY grn.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.3 View: Stock Movements with Product Details
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_stock_movements_with_products AS
SELECT
    sm.id,
    sm.hospital_id,
    sm.item_type,
    sm.item_id AS catalog_item_id,
    sm.product_id,
    COALESCE(p.product_name, sm.item_name) AS product_name,
    COALESCE(p.generic_name, sm.item_name) AS generic_name,
    COALESCE(p.category, sm.item_type) AS category,
    p.sku,
    p.barcode,
    sm.batch_id,
    sm.movement_type,
    sm.reference_type,
    sm.reference_id,
    sm.quantity,
    sm.balance_after,
    sm.unit_cost,
    (sm.quantity * COALESCE(sm.unit_cost, 0)) AS total_cost,
    sm.notes,
    sm.performed_by,
    sm.created_at
FROM stock_movements sm
LEFT JOIN products p ON sm.product_id = p.id OR (sm.item_type = 'medicine' AND sm.item_id::text = p.id::text)
ORDER BY sm.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.4 View: Stock Adjustments with Product Details
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_adjustments_with_products AS
SELECT
    sa.id,
    sa.adjustment_number,
    sa.hospital_id,
    sa.item_type,
    sa.item_id AS catalog_item_id,
    sa.product_id,
    COALESCE(p.product_name, sa.item_name) AS product_name,
    COALESCE(p.generic_name, sa.item_name) AS generic_name,
    COALESCE(p.category, sa.item_type) AS category,
    p.sku,
    sa.batch_id,
    sa.adjustment_type,
    sa.quantity,
    sa.reason,
    sa.status,
    sa.approved_by,
    sa.created_by,
    sa.created_at
FROM stock_adjustments sa
LEFT JOIN products p ON sa.product_id = p.id OR (sa.item_type = 'medicine' AND sa.item_id::text = p.id::text)
ORDER BY sa.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.5 View: Cycle Counts with Product Details
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_cycle_counts_with_products AS
SELECT
    cc.id,
    cc.count_number,
    cc.hospital_id,
    cc.count_date,
    cc.status,
    cc.notes,
    cc.counted_by,
    cc.verified_by,
    cc.created_at,
    cci.id AS count_item_id,
    cci.item_type,
    cci.item_id AS catalog_item_id,
    cci.product_id,
    COALESCE(p.product_name, cci.item_name) AS product_name,
    COALESCE(p.generic_name, cci.item_name) AS generic_name,
    COALESCE(p.category, cci.item_type) AS category,
    p.sku,
    cci.batch_id,
    cci.system_quantity,
    cci.counted_quantity,
    cci.variance,
    cci.variance_reason
FROM cycle_counts cc
LEFT JOIN cycle_count_items cci ON cc.id = cci.cycle_count_id
LEFT JOIN products p ON cci.product_id = p.id OR (cci.item_type = 'medicine' AND cci.item_id::text = p.id::text)
ORDER BY cc.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.6 View: Low Stock Items with Product Details
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_low_stock_products AS
SELECT
    p.id AS product_id,
    p.product_name,
    p.generic_name,
    p.category,
    p.subcategory,
    p.sku,
    p.barcode,
    p.purchase_price,
    p.selling_price,
    p.mrp,
    p.reorder_level,
    p.min_stock_level,
    p.max_stock_level,
    ss.total_stock,
    ss.available_stock,
    ss.total_value,
    ss.is_low_stock,
    ss.is_expiring_soon,
    ss.earliest_expiry,
    s.name AS supplier_name,
    s.contact_person,
    s.phone AS supplier_phone,
    s.email AS supplier_email
FROM products p
JOIN stock_summary ss ON p.id = ss.product_id
LEFT JOIN suppliers s ON p.supplier_id = s.id
WHERE p.is_active = true
  AND p.is_deleted = false
  AND ss.is_low_stock = true
ORDER BY ss.available_stock ASC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.7 View: Expiring Items with Product Details
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_expiring_products AS
SELECT
    p.id AS product_id,
    p.product_name,
    p.generic_name,
    p.category,
    p.sku,
    p.shelf_life_days,
    mb.batch_number,
    mb.expiry_date,
    mb.current_quantity AS current_quantity,
    mb.purchase_price,
    mb.selling_price,
    (mb.expiry_date - CURRENT_DATE) AS days_until_expiry,
    CASE
        WHEN mb.expiry_date < CURRENT_DATE THEN 'expired'
        WHEN mb.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical'
        WHEN mb.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'warning'
        ELSE 'normal'
    END AS expiry_status
FROM products p
JOIN medicine_batches mb ON p.id = mb.product_id OR mb.medicine_id::text = p.id::text
WHERE p.is_active = true
  AND p.is_deleted = false
  AND mb.is_active = true
  AND mb.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
ORDER BY mb.expiry_date ASC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.8 View: Complete Inventory Dashboard
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_complete_inventory_dashboard AS
SELECT
    p.hospital_id,
    COUNT(DISTINCT p.id) AS total_products,
    COUNT(DISTINCT CASE WHEN p.is_active = true AND p.is_deleted = false THEN p.id END) AS active_products,
    COUNT(DISTINCT CASE WHEN p.category = 'medicine' THEN p.id END) AS total_medicines,
    COUNT(DISTINCT CASE WHEN p.category = 'optical' THEN p.id END) AS total_optical,
    COUNT(DISTINCT CASE WHEN p.category = 'surgical' THEN p.id END) AS total_surgical,
    COUNT(DISTINCT CASE WHEN p.category = 'laboratory' THEN p.id END) AS total_laboratory,
    COUNT(DISTINCT CASE WHEN p.category = 'equipment' THEN p.id END) AS total_equipment,
    COALESCE(SUM(ss.total_stock), 0) AS total_stock_units,
    COALESCE(SUM(ss.total_value), 0) AS total_inventory_value,
    COUNT(DISTINCT CASE WHEN ss.is_low_stock = true THEN p.id END) AS low_stock_products,
    COUNT(DISTINCT CASE WHEN ss.is_expiring_soon = true THEN p.id END) AS expiring_soon_products,
    COUNT(DISTINCT CASE WHEN mb.expiry_date < CURRENT_DATE THEN mb.id END) AS expired_batches,
    COUNT(DISTINCT sa.id) FILTER (WHERE sa.is_resolved = false) AS active_alerts,
    COUNT(DISTINCT sa.id) FILTER (WHERE sa.is_resolved = false AND sa.severity = 'critical') AS critical_alerts
FROM products p
LEFT JOIN stock_summary ss ON p.id = ss.product_id
LEFT JOIN medicine_batches mb ON p.id = mb.product_id
LEFT JOIN stock_alerts sa ON p.id = sa.product_id
WHERE p.is_deleted = false
GROUP BY p.hospital_id;

-- ============================================================================
-- PART 7: HELPER FUNCTIONS (from 08_link_products_with_inventory.sql)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.1 Function to Auto-Link Medicines with Products
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION link_medicine_with_product()
RETURNS TRIGGER AS $$
BEGIN
    -- When a medicine is created/updated, try to link with existing product
    IF NEW.id IS NOT NULL THEN
        UPDATE products p
        SET is_active = true
        WHERE p.hospital_id = NEW.hospital_id
          AND (
            LOWER(p.product_name) = LOWER(NEW.name)
            OR LOWER(p.generic_name) = LOWER(NEW.generic_name)
          )
          AND p.category = 'medicine';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger is available but not enabled by default
-- To enable: 
-- DROP TRIGGER IF EXISTS trg_link_medicine_product ON medicines;
-- CREATE TRIGGER trg_link_medicine_product
--     AFTER INSERT OR UPDATE ON medicines
--     FOR EACH ROW
--     EXECUTE FUNCTION link_medicine_with_product();

COMMIT;

-- ============================================================================
-- END OF INVENTORY ALTERATION SCRIPT
-- ============================================================================
