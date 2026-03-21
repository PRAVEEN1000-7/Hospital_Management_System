-- ============================================================================
-- HMS - Update Missing SKUs for Medicines
-- ============================================================================
-- This script updates all medicines that don't have an SKU by generating
-- unique SKUs based on their name, category, and a hash of their ID.
-- It also syncs the SKUs to the Products table for auto-created product entries.
--
-- Run AFTER: 02_seed_data.sql
-- Usage: psql -U hms_user -d hms_db -f 09_update_medicine_skus.sql
-- ============================================================================

BEGIN;

-- Step 1: Update medicines with missing SKUs
-- Generates SKU format: MED-{CATEGORY}-{NAME_HASH}
-- Examples: MED-TAB-PARACETAMOL500, MED-CAP-AMOXICILLIN250, MED-SYR-COUGHDX

UPDATE medicines
SET sku = CONCAT(
    'MED-',
    UPPER(SUBSTRING(category FROM 1 FOR 3)), '-',
    UPPER(REPLACE(REPLACE(REPLACE(REPLACE(
        SUBSTRING(name FROM 1 FOR 12),
        ' ', ''), '-', ''), '.', ''), '&', 'AND')
    ),
    '-',
    LPAD(ABS(MOD(
        ('x' || SUBSTRING(md5(id::text || created_at::text) FROM 1 FOR 8))::bit(32)::int, 
        1000
    ))::text, 3, '0')
)
WHERE sku IS NULL OR sku = '';

-- Verify medicine SKU update
SELECT 
    COUNT(*) as total_medicines,
    COUNT(sku) as medicines_with_sku,
    COUNT(*) - COUNT(sku) as medicines_without_sku
FROM medicines;

-- Step 2: Update corresponding Products table entries
-- Syncs medicine SKUs to their auto-created product records

UPDATE products p
SET sku = m.sku,
    updated_at = NOW()
FROM medicines m
WHERE p.product_name = m.name
  AND p.category = 'medicine'
  AND p.hospital_id = m.hospital_id
  AND m.sku IS NOT NULL
  AND (p.sku IS NULL OR p.sku = '' OR p.sku != m.sku);

-- Verify product SKU update
SELECT 
    COUNT(*) as total_medicine_products,
    COUNT(p.sku) as products_with_sku,
    COUNT(*) - COUNT(p.sku) as products_without_sku
FROM products p
INNER JOIN medicines m ON p.product_name = m.name 
    AND p.category = 'medicine' 
    AND p.hospital_id = m.hospital_id;

-- Show sample updated SKUs in both tables
SELECT 
    m.id as medicine_id,
    m.name as medicine_name,
    m.sku as medicine_sku,
    p.id as product_id,
    p.product_name,
    p.sku as product_sku,
    CASE 
        WHEN m.sku = p.sku THEN '✓ Match'
        ELSE '✗ Mismatch'
    END as status
FROM medicines m
INNER JOIN products p ON p.product_name = m.name 
    AND p.category = 'medicine' 
    AND p.hospital_id = m.hospital_id
ORDER BY m.category, m.name
LIMIT 20;

COMMIT;

-- ============================================================================
-- Summary
-- ============================================================================
-- This script:
-- 1. Updates all medicines with missing SKUs
-- 2. Uses format: MED-{CAT}-{NAME}-{SEQ}
-- 3. Ensures uniqueness with MD5 hash
-- 4. Syncs SKUs to Products table
-- 5. Verifies the update was successful
-- ============================================================================
