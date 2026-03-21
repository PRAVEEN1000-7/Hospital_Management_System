-- ============================================================================
-- HMS - Inventory Alter Script: Add product_categories to suppliers table
-- ============================================================================
-- This script adds a column to track which product categories a supplier
-- provides (medicine, optical, surgical, equipment, etc.)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADD COLUMN: product_categories (ARRAY of text)
-- ─────────────────────────────────────────────────────────────────────────────
-- This column stores an array of product category names that the supplier
-- specializes in. Example: {'medicine', 'surgical'} or {'optical', 'equipment'}
--
-- Available categories:
--   - medicine      : Pharmaceutical medicines and drugs
--   - optical       : Optical products (frames, lenses, contact lenses)
--   - surgical      : Surgical instruments and consumables
--   - equipment     : Medical equipment and devices
--   - laboratory    : Laboratory reagents and consumables
--   - disposable    : Disposable medical supplies
--   - other         : Other products not in above categories
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS product_categories TEXT[] DEFAULT '{}';

-- Add a comment to document the column
COMMENT ON COLUMN suppliers.product_categories IS 
    'Array of product categories supplied by this vendor: medicine, optical, surgical, equipment, laboratory, disposable, other';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SEED DATA: Update existing suppliers with appropriate product categories
-- ─────────────────────────────────────────────────────────────────────────────
-- These UPDATE statements assign product categories to existing suppliers
-- based on their typical business focus. Adjust as needed for your data.
-- ─────────────────────────────────────────────────────────────────────────────

-- Update suppliers that are primarily medicine/pharma suppliers
UPDATE suppliers
SET product_categories = ARRAY['medicine', 'disposable']
WHERE LOWER(name) LIKE '%pharma%' 
   OR LOWER(name) LIKE '%drug%' 
   OR LOWER(name) LIKE '%medicine%'
   OR LOWER(name) LIKE '%pharmaceutical%';

-- Update suppliers that are optical/eye care related
UPDATE suppliers
SET product_categories = ARRAY['optical']
WHERE LOWER(name) LIKE '%optical%' 
   OR LOWER(name) LIKE '%vision%' 
   OR LOWER(name) LIKE '%eye%'
   OR LOWER(name) LIKE '%lens%';

-- Update suppliers that are surgical/medical equipment suppliers
UPDATE suppliers
SET product_categories = ARRAY['surgical', 'equipment']
WHERE LOWER(name) LIKE '%surgical%' 
   OR LOWER(name) LIKE '%equipment%' 
   OR LOWER(name) LIKE '%medical devices%'
   OR LOWER(name) LIKE '%instruments%';

-- Update suppliers that are laboratory related
UPDATE suppliers
SET product_categories = ARRAY['laboratory']
WHERE LOWER(name) LIKE '%laboratory%' 
   OR LOWER(name) LIKE '%lab%' 
   OR LOWER(name) LIKE '%diagnostic%'
   OR LOWER(name) LIKE '%reagent%';

-- Update general/wholesale suppliers (those not matching above patterns)
UPDATE suppliers
SET product_categories = ARRAY['medicine', 'disposable', 'other']
WHERE product_categories = '{}' 
   OR product_categories IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. OPTIONAL: Add CHECK constraint to validate categories (PostgreSQL 12+)
-- ─────────────────────────────────────────────────────────────────────────────
-- Uncomment the following if you want to enforce valid category values:
--
-- ALTER TABLE suppliers
--     ADD CONSTRAINT chk_product_categories
--     CHECK (
--         product_categories IS NULL OR 
--         product_categories <@ ARRAY['medicine', 'optical', 'surgical', 'equipment', 'laboratory', 'disposable', 'other']
--     );
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. OPTIONAL: Create index for faster filtering by product category
-- ─────────────────────────────────────────────────────────────────────────────
-- Uncomment if you need to frequently query suppliers by category:
--
-- CREATE INDEX IF NOT EXISTS idx_suppliers_product_categories 
--     ON suppliers USING GIN (product_categories);
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================================================================
-- END OF ALTER SCRIPT
-- ============================================================================
