-- ============================================================================
-- HMS - Link Products Table with Inventory Tables
-- ============================================================================
-- This script adds product_id foreign keys to inventory-related tables
-- and creates views for seamless integration.
-- 
-- Run AFTER: 07_seed_products.sql
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADD product_id TO purchase_order_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON purchase_order_items(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ADD product_id TO grn_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE grn_items 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_grn_items_product_id ON grn_items(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ADD product_id TO stock_movements
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stock_movements 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ADD product_id TO stock_adjustments
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stock_adjustments 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_adjustments_product_id ON stock_adjustments(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ADD product_id TO cycle_count_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cycle_count_items 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_cycle_count_items_product_id ON cycle_count_items(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ADD product_id TO medicine_batches (for linking with products)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE medicine_batches 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_medicine_batches_product_id ON medicine_batches(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. LINK EXISTING MEDICINES WITH PRODUCTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Update medicine_batches to link with products via medicine_id
UPDATE medicine_batches mb
SET product_id = p.id
FROM medicines m
JOIN products p ON m.id = p.id OR (m.generic_name = p.generic_name AND m.hospital_id = p.hospital_id)
WHERE mb.medicine_id = m.id 
  AND mb.product_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. CREATE COMPREHENSIVE VIEWS FOR INVENTORY OPERATIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- View: Purchase Orders with Product Details
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

-- View: GRNs with Product Details
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

-- View: Stock Movements with Product Details
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

-- View: Stock Adjustments with Product Details
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

-- View: Cycle Counts with Product Details
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

-- View: Low Stock Items with Product Details (unified view)
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

-- View: Expiring Items with Product Details
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

-- View: Complete Inventory Dashboard
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CREATE FUNCTION TO AUTO-LINK MEDICINES WITH PRODUCTS
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

-- Create trigger for auto-linking (optional - can be enabled if needed)
-- DROP TRIGGER IF EXISTS trg_link_medicine_product ON medicines;
-- CREATE TRIGGER trg_link_medicine_product
--     AFTER INSERT OR UPDATE ON medicines
--     FOR EACH ROW
--     EXECUTE FUNCTION link_medicine_with_product();

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. VERIFICATION QUERIES (Commented out - run manually)
-- ─────────────────────────────────────────────────────────────────────────────

-- Verify product links:
-- SELECT 
--     'purchase_order_items' AS table_name, 
--     COUNT(*) AS total_rows, 
--     COUNT(product_id) AS linked_to_product 
-- FROM purchase_order_items
-- UNION ALL
-- SELECT 'grn_items', COUNT(*), COUNT(product_id) FROM grn_items
-- UNION ALL
-- SELECT 'stock_movements', COUNT(*), COUNT(product_id) FROM stock_movements
-- UNION ALL
-- SELECT 'medicine_batches', COUNT(*), COUNT(product_id) FROM medicine_batches;

-- Test views:
-- SELECT * FROM v_low_stock_products LIMIT 10;
-- SELECT * FROM v_expiring_products LIMIT 10;
-- SELECT * FROM v_complete_inventory_dashboard;

-- ============================================================================
-- END OF PRODUCT-INVENTORY LINKING SCRIPT
-- ============================================================================
