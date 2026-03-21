-- ============================================================================
-- HMS - Sync Medicine SKUs to Products Table
-- ============================================================================
-- This script updates the SKU field in the Products table for all medicines
-- that were auto-synced to the Product catalog.
--
-- Use this if medicines already have SKUs but products don't.
-- Run AFTER: 09_update_medicine_skus.sql (if medicines need SKUs too)
-- Usage: psql -U hms_user -d hms_db -f 10_sync_medicine_skus_to_products.sql
-- ============================================================================

BEGIN;

-- Update product SKUs from corresponding medicines
-- Matches by product name and hospital_id

UPDATE products p
SET sku = m.sku,
    updated_at = NOW(),
    updated_by = NULL
FROM medicines m
WHERE p.product_name = m.name
  AND p.category = 'medicine'
  AND p.hospital_id = m.hospital_id
  AND m.sku IS NOT NULL
  AND (p.sku IS NULL OR p.sku = '' OR p.sku != m.sku);

-- Report: How many products were updated
SELECT 
    'Products Updated' as metric,
    COUNT(*) as count
FROM products p
INNER JOIN medicines m ON p.product_name = m.name 
    AND p.category = 'medicine' 
    AND p.hospital_id = m.hospital_id
WHERE p.sku = m.sku;

-- Verify: Show products with SKUs
SELECT 
    COUNT(*) as total_medicine_products,
    COUNT(p.sku) as products_with_sku,
    COUNT(*) - COUNT(p.sku) as products_without_sku,
    ROUND(100.0 * COUNT(p.sku) / NULLIF(COUNT(*), 0), 2) as percentage_with_sku
FROM products p
INNER JOIN medicines m ON p.product_name = m.name 
    AND p.category = 'medicine' 
    AND p.hospital_id = m.hospital_id;

-- Show sample SKUs in both tables
SELECT 
    m.id as medicine_id,
    m.name as medicine_name,
    m.category as medicine_category,
    m.sku as medicine_sku,
    p.id as product_id,
    p.product_name,
    p.sku as product_sku,
    p.category as product_category,
    CASE 
        WHEN m.sku = p.sku THEN '✓ Match'
        WHEN p.sku IS NULL THEN '✗ Product missing SKU'
        ELSE '✗ Mismatch'
    END as status
FROM medicines m
INNER JOIN products p ON p.product_name = m.name 
    AND p.category = 'medicine' 
    AND p.hospital_id = m.hospital_id
ORDER BY m.category, m.name
LIMIT 20;

-- Find any mismatches
SELECT 
    m.name as medicine_name,
    m.sku as medicine_sku,
    p.sku as product_sku,
    'Mismatch - needs attention' as issue
FROM medicines m
INNER JOIN products p ON p.product_name = m.name 
    AND p.category = 'medicine' 
    AND p.hospital_id = m.hospital_id
WHERE m.sku IS DISTINCT FROM p.sku
LIMIT 10;

COMMIT;

-- ============================================================================
-- Summary
-- ============================================================================
-- This script:
-- 1. Updates product SKUs from medicine SKUs
-- 2. Matches by product name and hospital_id
-- 3. Only updates if product SKU is NULL, empty, or different
-- 4. Verifies the sync was successful
-- 5. Shows any mismatches that need manual attention
-- ============================================================================
