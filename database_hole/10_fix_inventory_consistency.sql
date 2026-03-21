-- ============================================================================
-- HMS - Complete Inventory Data Consistency Fix
-- ============================================================================
-- This script fixes all inconsistencies between Products, Medicines, and Stock
-- Run AFTER all other migration scripts
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SYNC MEDICINES WITH PRODUCTS (Create products for medicines without them)
-- ─────────────────────────────────────────────────────────────────────────────

-- Create product entries for medicines that don't have them
INSERT INTO products (
    id, hospital_id, product_name, generic_name, brand_name, category, 
    subcategory, sku, barcode, manufacturer, supplier_id,
    purchase_price, selling_price, mrp, tax_percentage,
    unit_type, pack_size, min_stock_level, max_stock_level, reorder_level,
    storage_conditions, shelf_life_days, requires_prescription, is_active, is_deleted,
    created_at, updated_at
)
SELECT 
    gen_random_uuid() as id,
    m.hospital_id,
    m.name as product_name,
    m.generic_name,
    m.name as brand_name,  -- Use name as brand for legacy medicines
    'medicine' as category,
    m.category as subcategory,
    m.sku,
    m.barcode,
    m.manufacturer,
    NULL as supplier_id,
    COALESCE(m.purchase_price, 0) as purchase_price,
    COALESCE(m.selling_price, 0) as selling_price,
    COALESCE(m.selling_price, 0) as mrp,
    0 as tax_percentage,
    m.unit_of_measure as unit_type,
    COALESCE(m.units_per_pack, 1) as pack_size,
    COALESCE(m.reorder_level, 10) as min_stock_level,
    COALESCE(m.max_stock_level, 1000) as max_stock_level,
    COALESCE(m.reorder_level, 20) as reorder_level,
    m.storage_instructions as storage_conditions,
    730 as shelf_life_days,  -- Default 2 years
    m.requires_prescription,
    m.is_active,
    false as is_deleted,
    m.created_at,
    m.updated_at
FROM medicines m
LEFT JOIN products p ON LOWER(m.name) = LOWER(p.product_name) AND m.hospital_id = p.hospital_id
WHERE p.id IS NULL
  AND m.is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. UPDATE MEDICINE_BATCHES TO LINK WITH PRODUCTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Link medicine_batches to products via medicine_id
UPDATE medicine_batches mb
SET product_id = p.id
FROM medicines m
JOIN products p ON m.id = p.id OR (LOWER(m.name) = LOWER(p.product_name) AND m.hospital_id = p.hospital_id)
WHERE mb.medicine_id = m.id
  AND mb.product_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. UPDATE STOCK_MOVEMENTS TO USE PRODUCT_ID
-- ─────────────────────────────────────────────────────────────────────────────

-- Add product_id to stock movements for medicine items
UPDATE stock_movements sm
SET product_id = p.id
FROM medicines m
JOIN products p ON m.id = p.id OR (LOWER(m.name) = LOWER(p.product_name) AND m.hospital_id = p.hospital_id)
WHERE sm.item_type = 'medicine'
  AND sm.item_id = m.id
  AND sm.product_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. REBUILD STOCK_SUMMARY FROM MOVEMENTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Delete existing stock summaries (will be rebuilt)
DELETE FROM stock_summary;

-- Rebuild stock_summary from stock_movements
INSERT INTO stock_summary (
    id, hospital_id, product_id,
    total_stock, available_stock, reserved_stock, damaged_stock, expired_stock,
    total_batches, earliest_expiry, avg_cost_price, total_value,
    is_low_stock, is_expiring_soon, last_movement_at, updated_at
)
SELECT 
    gen_random_uuid() as id,
    sm.hospital_id,
    sm.product_id,
    -- Calculate totals from movements
    COALESCE(SUM(CASE WHEN sm.movement_type = 'stock_in' THEN sm.quantity ELSE 0 END), 0) as total_stock,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'stock_in' THEN sm.quantity ELSE 0 END), 0) 
        - COALESCE(SUM(CASE WHEN sm.movement_type IN ('stock_out', 'sale', 'dispensing', 'expired') THEN sm.quantity ELSE 0 END), 0) as available_stock,
    0 as reserved_stock,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'damaged' THEN sm.quantity ELSE 0 END), 0) as damaged_stock,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'expired' THEN sm.quantity ELSE 0 END), 0) as expired_stock,
    -- Batch info from medicine_batches
    (SELECT COUNT(*) FROM medicine_batches mb WHERE mb.product_id = sm.product_id AND mb.is_active = true) as total_batches,
    -- Earliest expiry from batches
    (SELECT MIN(mb.expiry_date) FROM medicine_batches mb WHERE mb.product_id = sm.product_id AND mb.is_active = true) as earliest_expiry,
    -- Average cost price
    COALESCE(AVG(sm.unit_cost), 0) as avg_cost_price,
    -- Total value
    COALESCE(SUM(CASE WHEN sm.movement_type = 'stock_in' THEN sm.quantity * sm.unit_cost ELSE 0 END), 0) as total_value,
    -- Low stock flag
    CASE WHEN 
        COALESCE(SUM(CASE WHEN sm.movement_type = 'stock_in' THEN sm.quantity ELSE 0 END), 0) 
        - COALESCE(SUM(CASE WHEN sm.movement_type IN ('stock_out', 'sale', 'dispensing', 'expired') THEN sm.quantity ELSE 0 END), 0)
        <= p.reorder_level 
    THEN true ELSE false END as is_low_stock,
    -- Expiring soon flag
    CASE WHEN 
        (SELECT MIN(mb.expiry_date) FROM medicine_batches mb WHERE mb.product_id = sm.product_id AND mb.is_active = true) 
        <= CURRENT_DATE + INTERVAL '90 days'
    THEN true ELSE false END as is_expiring_soon,
    -- Last movement
    MAX(sm.created_at) as last_movement_at,
    CURRENT_TIMESTAMP as updated_at
FROM stock_movements sm
JOIN products p ON sm.product_id = p.id
WHERE sm.product_id IS NOT NULL
GROUP BY sm.hospital_id, sm.product_id, p.reorder_level
ON CONFLICT (hospital_id, product_id) DO UPDATE SET
    total_stock = EXCLUDED.total_stock,
    available_stock = EXCLUDED.available_stock,
    reserved_stock = EXCLUDED.reserved_stock,
    damaged_stock = EXCLUDED.damaged_stock,
    expired_stock = EXCLUDED.expired_stock,
    total_batches = EXCLUDED.total_batches,
    earliest_expiry = EXCLUDED.earliest_expiry,
    avg_cost_price = EXCLUDED.avg_cost_price,
    total_value = EXCLUDED.total_value,
    is_low_stock = EXCLUDED.is_low_stock,
    is_expiring_soon = EXCLUDED.is_expiring_soon,
    last_movement_at = EXCLUDED.last_movement_at,
    updated_at = CURRENT_TIMESTAMP;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ADD MISSING STOCK_SUMMARY ENTRIES FOR PRODUCTS WITHOUT MOVEMENTS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO stock_summary (
    id, hospital_id, product_id,
    total_stock, available_stock, reserved_stock, damaged_stock, expired_stock,
    total_batches, earliest_expiry, avg_cost_price, total_value,
    is_low_stock, is_expiring_soon, last_movement_at, updated_at
)
SELECT 
    gen_random_uuid() as id,
    p.hospital_id,
    p.id as product_id,
    0 as total_stock,
    0 as available_stock,
    0 as reserved_stock,
    0 as damaged_stock,
    0 as expired_stock,
    COALESCE((SELECT COUNT(*) FROM medicine_batches mb WHERE mb.product_id = p.id AND mb.is_active = true), 0) as total_batches,
    (SELECT MIN(mb.expiry_date) FROM medicine_batches mb WHERE mb.product_id = p.id AND mb.is_active = true) as earliest_expiry,
    COALESCE(p.purchase_price, 0) as avg_cost_price,
    0 as total_value,
    CASE WHEN 0 <= p.reorder_level THEN true ELSE false END as is_low_stock,
    CASE WHEN 
        (SELECT MIN(mb.expiry_date) FROM medicine_batches mb WHERE mb.product_id = p.id AND mb.is_active = true) 
        <= CURRENT_DATE + INTERVAL '90 days'
    THEN true ELSE false END as is_expiring_soon,
    NULL as last_movement_at,
    CURRENT_TIMESTAMP as updated_at
FROM products p
LEFT JOIN stock_summary ss ON p.id = ss.product_id
WHERE ss.id IS NULL
  AND p.is_active = true
  AND p.is_deleted = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. UPDATE STOCK_ALERTS BASED ON CURRENT STOCK
-- ─────────────────────────────────────────────────────────────────────────────

-- Insert new low stock alerts for products without existing alerts
INSERT INTO stock_alerts (
    id, hospital_id, product_id, alert_type, severity, title, message,
    current_stock, threshold_stock, is_resolved, created_at
)
SELECT 
    gen_random_uuid() as id,
    ss.hospital_id,
    ss.product_id,
    'low_stock' as alert_type,
    CASE WHEN ss.available_stock = 0 THEN 'critical' 
         WHEN ss.available_stock < p.reorder_level / 2 THEN 'high'
         ELSE 'medium' END as severity,
    'Low Stock Alert: ' || p.product_name as title,
    'Current stock (' || ss.available_stock || ') is below reorder level (' || p.reorder_level || '). Please create a purchase order.' as message,
    ss.available_stock as current_stock,
    p.reorder_level as threshold_stock,
    false as is_resolved,
    CURRENT_TIMESTAMP as created_at
FROM stock_summary ss
JOIN products p ON ss.product_id = p.id
WHERE ss.is_low_stock = true
  AND NOT EXISTS (
      SELECT 1 FROM stock_alerts sa 
      WHERE sa.product_id = ss.product_id 
        AND sa.alert_type = 'low_stock'
        AND sa.is_resolved = false
  );

-- Insert new expiry alerts
INSERT INTO stock_alerts (
    id, hospital_id, product_id, alert_type, severity, title, message,
    current_stock, expiry_date, days_until_expiry, is_resolved, created_at
)
SELECT 
    gen_random_uuid() as id,
    ss.hospital_id,
    ss.product_id,
    'expiring_soon' as alert_type,
    CASE WHEN ss.earliest_expiry <= CURRENT_DATE THEN 'critical'
         WHEN ss.earliest_expiry <= CURRENT_DATE + INTERVAL '30 days' THEN 'high'
         ELSE 'medium' END as severity,
    'Expiry Alert: ' || p.product_name as title,
    'Batch expires on ' || ss.earliest_expiry || ' (' || 
        (ss.earliest_expiry - CURRENT_DATE) || ' days remaining). Consider using FIFO.' as message,
    ss.available_stock as current_stock,
    ss.earliest_expiry as expiry_date,
    (ss.earliest_expiry - CURRENT_DATE) as days_until_expiry,
    false as is_resolved,
    CURRENT_TIMESTAMP as created_at
FROM stock_summary ss
JOIN products p ON ss.product_id = p.id
WHERE ss.is_expiring_soon = true
  AND ss.earliest_expiry IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM stock_alerts sa 
      WHERE sa.product_id = ss.product_id 
        AND sa.alert_type = 'expiring_soon'
        AND sa.is_resolved = false
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. VERIFICATION QUERIES
-- ─────────────────────────────────────────────────────────────────────────────

-- Verify products exist for all active medicines
-- SELECT COUNT(*) as medicines_without_products
-- FROM medicines m
-- LEFT JOIN products p ON LOWER(m.name) = LOWER(p.product_name) AND m.hospital_id = p.hospital_id
-- WHERE p.id IS NULL AND m.is_active = true;
-- Expected: 0

-- Verify stock_summary exists for all products
-- SELECT COUNT(*) as products_without_summary
-- FROM products p
-- LEFT JOIN stock_summary ss ON p.id = ss.product_id
-- WHERE ss.id IS NULL AND p.is_active = true AND p.is_deleted = false;
-- Expected: 0

-- Verify medicine_batches linked to products
-- SELECT COUNT(*) as batches_without_product_link
-- FROM medicine_batches mb
-- WHERE mb.product_id IS NULL AND mb.is_active = true;
-- Expected: 0 (or very low for legacy batches)

-- ============================================================================
-- END OF CONSISTENCY FIX SCRIPT
-- ============================================================================
