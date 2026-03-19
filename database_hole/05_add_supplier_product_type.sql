-- ============================================================================
-- HMS — Add Product Type to Suppliers
-- Adds product_type column to suppliers table for tracking what they supply
-- ============================================================================
-- Run this AFTER 01_schema.sql and 02_seed_data.sql
-- Can be run on existing databases safely (adds column with default)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Add product_type column to suppliers table
-- ─────────────────────────────────────────────────────────────────────────────

-- Add the column if it doesn't exist (safe for re-running)
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'suppliers' 
        AND column_name = 'product_type'
    ) THEN
        ALTER TABLE suppliers 
        ADD COLUMN product_type VARCHAR(50) DEFAULT 'medicine' NOT NULL;
        
        -- Add comment for documentation
        COMMENT ON COLUMN suppliers.product_type IS 'Type of products supplied: medicine, optical, equipment, consumables, etc.';
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Update existing suppliers to have default product_type
-- ─────────────────────────────────────────────────────────────────────────────

-- Set default product_type for existing suppliers based on their name or code
-- Note: If run after 02_seed_data.sql, these updates will apply to seeded suppliers
UPDATE suppliers
SET product_type = 'medicine'
WHERE product_type IS NULL
AND (
    LOWER(name) LIKE '%pharma%'
    OR LOWER(name) LIKE '%med%'
    OR LOWER(name) LIKE '%drug%'
    OR LOWER(code) LIKE '%PHARM%'
    OR LOWER(code) LIKE '%MED%'
);

UPDATE suppliers
SET product_type = 'optical'
WHERE product_type IS NULL
AND (
    LOWER(name) LIKE '%optical%'
    OR LOWER(name) LIKE '%vision%'
    OR LOWER(name) LIKE '%eye%'
    OR LOWER(code) LIKE '%OPT%'
    OR LOWER(code) LIKE '%VISION%'
);

UPDATE suppliers
SET product_type = 'equipment'
WHERE product_type IS NULL
AND (
    LOWER(name) LIKE '%equipment%'
    OR LOWER(name) LIKE '%medical device%'
    OR LOWER(code) LIKE '%EQUIP%'
);

-- Set any remaining NULLs to 'medicine' as default
UPDATE suppliers
SET product_type = 'medicine'
WHERE product_type IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Create index for faster filtering by product type
-- ─────────────────────────────────────────────────────────────────────────────

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_suppliers_product_type 
ON suppliers(product_type);

-- Combined index for common filter pattern (hospital + product type)
CREATE INDEX IF NOT EXISTS idx_suppliers_hospital_product 
ON suppliers(hospital_id, product_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- Update inventory seed data to include product_type
-- ─────────────────────────────────────────────────────────────────────────────

-- Update the seed suppliers in 02_seed_data.sql to have explicit product_type
-- (This is a safety update in case the migration is run after seed data)
UPDATE suppliers
SET product_type = 'medicine'
WHERE id = 'a1000000-0000-0000-0000-000000000001'  -- PharmaCorp Distributors
AND product_type IS DISTINCT FROM 'medicine';

UPDATE suppliers
SET product_type = 'medicine'
WHERE id = 'a1000000-0000-0000-0000-000000000002'  -- MedSupply International
AND product_type IS DISTINCT FROM 'medicine';

UPDATE suppliers
SET product_type = 'optical'
WHERE id = 'a1000000-0000-0000-0000-000000000003'  -- OptiVision Wholesale
AND product_type IS DISTINCT FROM 'optical';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification query (optional - comment out in production)
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT id, name, code, product_type 
-- FROM suppliers 
-- ORDER BY product_type, name;
