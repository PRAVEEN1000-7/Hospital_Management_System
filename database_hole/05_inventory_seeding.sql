-- ============================================================================
-- HMS - Inventory Module: Seed Data
-- ============================================================================
-- This file consolidates all INSERT and UPDATE statements from the inventory
-- seeding files.
--
-- Source files consolidated:
--   - 04_inventory_seed.sql
--   - 07_seed_products.sql (partial - seed data only)
--   - 09_update_medicine_skus.sql (UPDATE statements)
--   - 10_fix_inventory_consistency.sql (data fixes)
--   - 10_sync_medicine_skus_to_products.sql (UPDATE statements)
--   - inventory_alter.sql (seed data for product_categories)
--
-- Run AFTER: 01_schema.sql, 02_seed_data.sql, 04_inventory_alteration.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: UPDATE MEDICINE SKUs (from 09_update_medicine_skus.sql)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.1 Update medicines with missing SKUs
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.2 Sync medicine SKUs to Products table
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE products p
SET sku = m.sku,
    updated_at = NOW()
FROM medicines m
WHERE p.product_name = m.name
  AND p.category = 'medicine'
  AND p.hospital_id = m.hospital_id
  AND m.sku IS NOT NULL
  AND (p.sku IS NULL OR p.sku = '' OR p.sku != m.sku);

-- ============================================================================
-- PART 2: SEED SUPPLIER PRODUCT CATEGORIES (from inventory_alter.sql)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.1 Update medicine/pharma suppliers
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE suppliers
SET product_categories = ARRAY['medicine', 'disposable']
WHERE LOWER(name) LIKE '%pharma%'
   OR LOWER(name) LIKE '%drug%'
   OR LOWER(name) LIKE '%medicine%'
   OR LOWER(name) LIKE '%pharmaceutical%';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.2 Update optical/eye care suppliers
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE suppliers
SET product_categories = ARRAY['optical']
WHERE LOWER(name) LIKE '%optical%'
   OR LOWER(name) LIKE '%vision%'
   OR LOWER(name) LIKE '%eye%'
   OR LOWER(name) LIKE '%lens%';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.3 Update surgical/medical equipment suppliers
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE suppliers
SET product_categories = ARRAY['surgical', 'equipment']
WHERE LOWER(name) LIKE '%surgical%'
   OR LOWER(name) LIKE '%equipment%'
   OR LOWER(name) LIKE '%medical devices%'
   OR LOWER(name) LIKE '%instruments%';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.4 Update laboratory suppliers
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE suppliers
SET product_categories = ARRAY['laboratory']
WHERE LOWER(name) LIKE '%laboratory%'
   OR LOWER(name) LIKE '%lab%'
   OR LOWER(name) LIKE '%diagnostic%'
   OR LOWER(name) LIKE '%reagent%';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.5 Update general/wholesale suppliers
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE suppliers
SET product_categories = ARRAY['medicine', 'disposable', 'other']
WHERE product_categories = '{}'
   OR product_categories IS NULL;

-- ============================================================================
-- PART 3: SEED PRODUCTS TABLE (from 07_seed_products.sql)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.1 Medicine Products
-- ─────────────────────────────────────────────────────────────────────────────

-- Paracetamol 500mg - Most common pain reliever
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'Paracetamol 500mg', 'Paracetamol', 'Calpol', 'medicine', 'tablet',
     'MED-TAB-001', '8901234567890', 'GlaxoSmithKline', 'a1000000-0000-0000-0000-000000000001',
     3.00, 5.00, 5.50, 5.00, 'strip', 10, 50, 500, 100, 'Store in cool dry place', 730, false, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Amoxicillin 250mg - Antibiotic
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'Amoxicillin 250mg', 'Amoxicillin', 'Novamox', 'medicine', 'capsule',
     'MED-CAP-002', '8901234567891', 'Cipla', 'a1000000-0000-0000-0000-000000000002',
     7.50, 12.00, 13.00, 5.00, 'strip', 10, 30, 300, 60, 'Store below 25°C', 730, true, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Omeprazole 20mg - Proton pump inhibitor
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     'Omeprazole 20mg', 'Omeprazole', 'Omez', 'medicine', 'capsule',
     'MED-CAP-003', '8901234567892', 'Dr. Reddy''s', 'a1000000-0000-0000-0000-000000000001',
     4.50, 8.00, 8.50, 5.00, 'strip', 14, 40, 400, 80, 'Store in cool dry place', 730, true, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Atorvastatin 10mg - Cholesterol medication
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
     'Atorvastatin 10mg', 'Atorvastatin', 'Atorva', 'medicine', 'tablet',
     'MED-TAB-004', '8901234567893', 'Sun Pharma', 'a1000000-0000-0000-0000-000000000002',
     9.00, 15.00, 16.00, 5.00, 'strip', 10, 25, 250, 50, 'Store below 25°C', 730, true, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Metformin 500mg - Diabetes medication
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
     'Metformin 500mg', 'Metformin', 'Glyciphage', 'medicine', 'tablet',
     'MED-TAB-005', '8901234567894', 'USV', 'a1000000-0000-0000-0000-000000000001',
     3.50, 6.00, 6.50, 5.00, 'strip', 10, 50, 500, 100, 'Store in cool dry place', 730, true, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Ciprofloxacin 500mg - Antibiotic
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001',
     'Ciprofloxacin 500mg', 'Ciprofloxacin', 'Cipro', 'medicine', 'tablet',
     'MED-TAB-006', '8901234567895', 'Bayer', 'a1000000-0000-0000-0000-000000000002',
     11.00, 18.00, 19.00, 5.00, 'strip', 10, 20, 200, 40, 'Store below 25°C, protect from light', 730, true, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Cetirizine 10mg - Antihistamine
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001',
     'Cetirizine 10mg', 'Cetirizine', 'Zyrtec', 'medicine', 'tablet',
     'MED-TAB-007', '8901234567896', 'UCB Pharma', 'a1000000-0000-0000-0000-000000000002',
     2.00, 4.00, 4.50, 5.00, 'strip', 10, 40, 400, 80, 'Store in cool dry place', 730, false, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Ibuprofen 400mg - NSAID pain reliever
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001',
     'Ibuprofen 400mg', 'Ibuprofen', 'Brufen', 'medicine', 'tablet',
     'MED-TAB-008', '8901234567897', 'Abbott', 'a1000000-0000-0000-0000-000000000001',
     4.00, 7.00, 7.50, 5.00, 'strip', 10, 30, 300, 60, 'Store in cool dry place', 730, false, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Cough Syrup DX - Cough suppressant
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001',
     'Cough Syrup DX', 'Dextromethorphan', 'Benylin', 'medicine', 'syrup',
     'MED-SYR-009', '8901234567898', 'Johnson & Johnson', 'a1000000-0000-0000-0000-000000000002',
     5.00, 9.00, 10.00, 5.00, 'bottle', 100, 20, 200, 40, 'Store below 25°C', 1095, false, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Eye Drops Moxifloxacin - Antibiotic eye drops
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001',
     'Moxifloxacin Eye Drops', 'Moxifloxacin', 'Moxiflox', 'medicine', 'drops',
     'MED-DRP-010', '8901234567899', 'Alcon', 'a1000000-0000-0000-0000-000000000003',
     7.00, 12.00, 13.00, 5.00, 'bottle', 5, 15, 150, 30, 'Store in refrigerator (2-8°C)', 730, true, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Insulin Glargine - Diabetes injection (requires refrigeration)
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_refrigeration, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001',
     'Insulin Glargine', 'Insulin Glargine', 'Lantus', 'medicine', 'injection',
     'MED-INJ-011', '8901234567900', 'Sanofi', 'a1000000-0000-0000-0000-000000000001',
     250.00, 350.00, 380.00, 5.00, 'vial', 10, 10, 100, 20, 'Store in refrigerator (2-8°C)', 730, true, true, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Morphine Injection - Narcotic (controlled substance)
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_narcotic, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001',
     'Morphine Sulfate 10mg/ml', 'Morphine', 'Morphine', 'medicine', 'injection',
     'MED-INJ-012', '8901234567901', 'Hameln Pharma', 'a1000000-0000-0000-0000-000000000001',
     50.00, 80.00, 90.00, 5.00, 'ampoule', 10, 5, 50, 10, 'Store in locked cabinet, protect from light', 1095, true, true, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2 Optical Products
-- ─────────────────────────────────────────────────────────────────────────────

-- Classic Round Frame - Eyeglass frame
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001',
     'Classic Round Frame', 'Eyeglass Frame', 'RayBan', 'optical', 'frame',
     'OPT-FRM-020', '8902234567890', 'Luxottica', 'a1000000-0000-0000-0000-000000000003',
     80.00, 150.00, 165.00, 12.00, 'piece', 1, 10, 100, 20, 'Store in dry place, avoid pressure', true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Aviator Sunglass Frame
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001',
     'Aviator Sunglass Frame', 'Sunglass Frame', 'Oakley', 'optical', 'frame',
     'OPT-FRM-021', '8902234567891', 'Oakley Inc', 'a1000000-0000-0000-0000-000000000003',
     120.00, 220.00, 240.00, 12.00, 'piece', 1, 5, 50, 10, 'Store in protective case', true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Single Vision Lens - Standard
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000001',
     'Single Vision Lens', 'Optical Lens', 'Essilor', 'optical', 'lens',
     'OPT-LNS-022', '8902234567892', 'Essilor', 'a1000000-0000-0000-0000-000000000003',
     35.00, 70.00, 77.00, 12.00, 'pair', 1, 20, 200, 40, 'Store in original packaging', true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Progressive Lens - Premium
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000001',
     'Progressive Lens Premium', 'Progressive Lens', 'Varilux', 'optical', 'lens',
     'OPT-LNS-023', '8902234567893', 'Essilor', 'a1000000-0000-0000-0000-000000000003',
     110.00, 200.00, 220.00, 12.00, 'pair', 1, 10, 100, 20, 'Store in original packaging', true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Contact Lens Solution
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000001',
     'Contact Lens Solution', 'Cleaning Solution', 'Opti-Free', 'optical', 'accessory',
     'OPT-ACC-024', '8902234567894', 'Alcon', 'a1000000-0000-0000-0000-000000000003',
     7.00, 14.00, 15.00, 12.00, 'bottle', 360, 30, 300, 60, 'Store at room temperature', 730, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.3 Surgical & Medical Supplies
-- ─────────────────────────────────────────────────────────────────────────────

-- Surgical Gloves (Sterile)
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000001',
     'Surgical Gloves Sterile L', 'Latex Gloves', 'MediGlove', 'surgical', 'disposable',
     'SUR-DIS-030', '8903234567890', 'Hartalega', 'a1000000-0000-0000-0000-000000000002',
     0.50, 1.00, 1.20, 12.00, 'pair', 100, 500, 5000, 1000, 'Store in cool dry place, avoid direct sunlight', 1825, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Surgical Mask 3-Ply
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000001',
     'Surgical Mask 3-Ply', 'Face Mask', 'SafeMask', 'surgical', 'disposable',
     'SUR-DIS-031', '8903234567891', '3M', 'a1000000-0000-0000-0000-000000000002',
     0.10, 0.25, 0.30, 12.00, 'piece', 50, 1000, 10000, 2000, 'Store in clean dry area', 1825, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Syringe 5ml with Needle
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000001',
     'Syringe 5ml with Needle', 'Disposable Syringe', 'Becton Dickinson', 'surgical', 'disposable',
     'SUR-DIS-032', '8903234567892', 'BD Medical', 'a1000000-0000-0000-0000-000000000002',
     0.30, 0.60, 0.70, 12.00, 'piece', 100, 500, 5000, 1000, 'Store in sterile condition', 1825, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Gauze Sterile 4x4
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000001',
     'Gauze Sterile 4x4 inches', 'Surgical Gauze', 'MedGauze', 'surgical', 'dressing',
     'SUR-DRS-033', '8903234567893', 'Johnson & Johnson', 'a1000000-0000-0000-0000-000000000002',
     0.05, 0.15, 0.20, 12.00, 'piece', 100, 1000, 10000, 2000, 'Keep in sterile packaging', 1825, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Bandage Elastic 4 inch
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000034', 'a0000000-0000-0000-0000-000000000001',
     'Bandage Elastic 4 inch', 'Elastic Bandage', 'Crepe', 'surgical', 'dressing',
     'SUR-DRS-034', '8903234567894', 'BSN Medical', 'a1000000-0000-0000-0000-000000000002',
     2.00, 4.00, 4.50, 12.00, 'roll', 1, 50, 500, 100, 'Store in dry place', true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4 Laboratory Supplies
-- ─────────────────────────────────────────────────────────────────────────────

-- Blood Collection Tube EDTA
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000040', 'a0000000-0000-0000-0000-000000000001',
     'Blood Collection Tube EDTA 2ml', 'Vacutainer', 'BD Vacutainer', 'laboratory', 'consumable',
     'LAB-CON-040', '8904234567890', 'BD Medical', 'a1000000-0000-0000-0000-000000000002',
     0.40, 0.80, 0.90, 12.00, 'tube', 100, 500, 5000, 1000, 'Store at room temperature', 1825, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Glucose Test Strips
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000001',
     'Glucose Test Strips', 'Blood Glucose Strip', 'Accu-Chek', 'laboratory', 'consumable',
     'LAB-CON-041', '8904234567891', 'Roche', 'a1000000-0000-0000-0000-000000000002',
     0.50, 1.00, 1.20, 12.00, 'strip', 50, 200, 2000, 400, 'Store in cool dry place, keep vial closed', 545, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Pregnancy Test Kit
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-000000000001',
     'Pregnancy Test Kit', 'hCG Test', 'Clearblue', 'laboratory', 'diagnostic',
     'LAB-DIA-042', '8904234567892', 'Procter & Gamble', 'a1000000-0000-0000-0000-000000000002',
     3.00, 6.00, 7.00, 12.00, 'kit', 1, 50, 500, 100, 'Store at room temperature', 730, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.5 Equipment & Devices
-- ─────────────────────────────────────────────────────────────────────────────

-- Digital Thermometer
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000050', 'a0000000-0000-0000-0000-000000000001',
     'Digital Thermometer', 'Clinical Thermometer', 'Omron', 'equipment', 'diagnostic',
     'EQP-DIA-050', '8905234567890', 'Omron Healthcare', 'a1000000-0000-0000-0000-000000000002',
     15.00, 30.00, 35.00, 12.00, 'piece', 1, 10, 100, 20, 'Store in protective case', 1825, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Blood Pressure Monitor Automatic
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000001',
     'Blood Pressure Monitor Automatic', 'BP Monitor', 'Omron', 'equipment', 'diagnostic',
     'EQP-DIA-051', '8905234567891', 'Omron Healthcare', 'a1000000-0000-0000-0000-000000000002',
     40.00, 75.00, 85.00, 12.00, 'piece', 1, 5, 50, 10, 'Store in protective case, avoid humidity', 1825, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Pulse Oximeter
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000052', 'a0000000-0000-0000-0000-000000000001',
     'Pulse Oximeter Fingertip', 'SpO2 Monitor', 'ChoiceMMed', 'equipment', 'diagnostic',
     'EQP-DIA-052', '8905234567892', 'ChoiceMMed', 'a1000000-0000-0000-0000-000000000002',
     25.00, 50.00, 55.00, 12.00, 'piece', 1, 10, 100, 20, 'Store in protective case', 1825, true,
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 4: SEED STOCK SUMMARY (from 07_seed_products.sql - partial)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.1 Stock Summary for Medicines
-- ─────────────────────────────────────────────────────────────────────────────

-- Paracetamol 500mg - High stock item
INSERT INTO stock_summary (id, hospital_id, product_id, total_stock, available_stock, reserved_stock, damaged_stock, expired_stock, total_batches, earliest_expiry, avg_cost_price, total_value, is_low_stock, is_expiring_soon, last_movement_at)
VALUES
    ('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000001',
     120, 115, 0, 3, 2, 3, '2026-06-15', 3.00, 360.00, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (hospital_id, product_id) DO NOTHING;

-- Amoxicillin 250mg
INSERT INTO stock_summary (id, hospital_id, product_id, total_stock, available_stock, reserved_stock, damaged_stock, expired_stock, total_batches, earliest_expiry, avg_cost_price, total_value, is_low_stock, is_expiring_soon, last_movement_at)
VALUES
    ('70000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000002',
     85, 80, 0, 5, 0, 2, '2026-08-20', 7.50, 637.50, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (hospital_id, product_id) DO NOTHING;

-- Omeprazole 20mg
INSERT INTO stock_summary (id, hospital_id, product_id, total_stock, available_stock, reserved_stock, damaged_stock, expired_stock, total_batches, earliest_expiry, avg_cost_price, total_value, is_low_stock, is_expiring_soon, last_movement_at)
VALUES
    ('70000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000003',
     45, 42, 0, 3, 0, 2, '2026-07-10', 4.50, 202.50, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (hospital_id, product_id) DO NOTHING;

-- ============================================================================
-- PART 5: SEED INVENTORY WORKFLOW DATA (from 04_inventory_seed.sql)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.1 PURCHASE ORDERS
-- ─────────────────────────────────────────────────────────────────────────────

-- PO-1: Medicine restock from PharmaCorp (approved → partially received)
INSERT INTO purchase_orders (id, hospital_id, po_number, supplier_id, order_date, expected_delivery_date, status, total_amount, notes, approved_by, created_by)
VALUES
    ('b1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'PO-2025-0001', 'a1000000-0000-0000-0000-000000000001', '2025-01-10', '2025-01-17',
     'partially_received', 490.00, 'Monthly medicine restock — batch 1',
     '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- PO-2: Optical products from OptiVision (approved, awaiting delivery)
INSERT INTO purchase_orders (id, hospital_id, po_number, supplier_id, order_date, expected_delivery_date, status, total_amount, notes, approved_by, created_by)
VALUES
    ('b1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'PO-2025-0002', 'a1000000-0000-0000-0000-000000000003', '2025-01-15', '2025-01-25',
     'approved', 2300.00, 'Optical frames and lenses quarterly order',
     '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- PO-3: Urgent medicine order from MedSupply (submitted, pending approval)
INSERT INTO purchase_orders (id, hospital_id, po_number, supplier_id, order_date, expected_delivery_date, status, total_amount, notes, created_by)
VALUES
    ('b1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     'PO-2025-0003', 'a1000000-0000-0000-0000-000000000002', '2025-01-20', '2025-01-23',
     'submitted', 330.00, 'Urgent restock — Amoxicillin and Ciprofloxacin running low',
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- PO-4: Draft order (not yet submitted)
INSERT INTO purchase_orders (id, hospital_id, po_number, supplier_id, order_date, status, total_amount, notes, created_by)
VALUES
    ('b1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
     'PO-2025-0004', 'a1000000-0000-0000-0000-000000000001', '2025-01-22',
     'draft', 175.00, 'Draft — eye drops and cough syrup',
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- PO-5: Fully received order
INSERT INTO purchase_orders (id, hospital_id, po_number, supplier_id, order_date, expected_delivery_date, status, total_amount, notes, approved_by, created_by)
VALUES
    ('b1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
     'PO-2025-0005', 'a1000000-0000-0000-0000-000000000002', '2025-01-05', '2025-01-10',
     'received', 225.00, 'Cetirizine and Ibuprofen restock — complete',
     '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.2 PURCHASE ORDER ITEMS
-- ─────────────────────────────────────────────────────────────────────────────

-- PO-1 items (medicines)
INSERT INTO purchase_order_items (id, purchase_order_id, item_type, item_id, quantity_ordered, quantity_received, unit_price, total_price)
VALUES
    ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000001', 100, 100, 3.00, 300.00),
    ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000003', 50, 20, 4.50, 225.00),
    ('b2000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000005', 80, 0, 3.50, 280.00)
ON CONFLICT (id) DO NOTHING;

-- PO-2 items (optical products)
INSERT INTO purchase_order_items (id, purchase_order_id, item_type, item_id, quantity_ordered, quantity_received, unit_price, total_price)
VALUES
    ('b2000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000001', 10, 0, 80.00, 800.00),
    ('b2000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000003', 20, 0, 35.00, 700.00),
    ('b2000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000004', 10, 0, 110.00, 1100.00)
ON CONFLICT (id) DO NOTHING;

-- PO-3 items (medicines — urgent)
INSERT INTO purchase_order_items (id, purchase_order_id, item_type, item_id, quantity_ordered, quantity_received, unit_price, total_price)
VALUES
    ('b2000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000003',
     'medicine', '50000000-0000-0000-0000-000000000002', 40, 0, 7.50, 300.00),
    ('b2000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000003',
     'medicine', '50000000-0000-0000-0000-000000000006', 20, 0, 11.00, 220.00)
ON CONFLICT (id) DO NOTHING;

-- PO-4 items (draft)
INSERT INTO purchase_order_items (id, purchase_order_id, item_type, item_id, quantity_ordered, quantity_received, unit_price, total_price)
VALUES
    ('b2000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000004',
     'medicine', '50000000-0000-0000-0000-000000000010', 30, 0, 7.00, 210.00),
    ('b2000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000004',
     'medicine', '50000000-0000-0000-0000-000000000009', 25, 0, 5.00, 125.00)
ON CONFLICT (id) DO NOTHING;

-- PO-5 items (fully received)
INSERT INTO purchase_order_items (id, purchase_order_id, item_type, item_id, quantity_ordered, quantity_received, unit_price, total_price)
VALUES
    ('b2000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000005',
     'medicine', '50000000-0000-0000-0000-000000000007', 50, 50, 2.00, 100.00),
    ('b2000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000005',
     'medicine', '50000000-0000-0000-0000-000000000008', 30, 30, 4.00, 120.00)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.3 GOODS RECEIPT NOTES (GRNs)
-- ─────────────────────────────────────────────────────────────────────────────

-- GRN-1: First receipt against PO-1
INSERT INTO goods_receipt_notes (id, hospital_id, grn_number, purchase_order_id, supplier_id, receipt_date, invoice_number, invoice_date, total_amount, status, verified_by, notes, created_by)
VALUES
    ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'GRN-2025-0001', 'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
     '2025-01-15', 'INV-PC-2025-0042', '2025-01-14', 390.00, 'accepted',
     '10000000-0000-0000-0000-000000000007', 'First delivery from PharmaCorp — Paracetamol complete, Omeprazole partial',
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- GRN-2: Full receipt of PO-5
INSERT INTO goods_receipt_notes (id, hospital_id, grn_number, purchase_order_id, supplier_id, receipt_date, invoice_number, invoice_date, total_amount, status, verified_by, notes, created_by)
VALUES
    ('c1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'GRN-2025-0002', 'b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002',
     '2025-01-09', 'INV-MS-2025-0018', '2025-01-08', 220.00, 'accepted',
     '10000000-0000-0000-0000-000000000007', 'MedSupply delivery — all quantities matched',
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- GRN-3: Standalone receipt (no PO)
INSERT INTO goods_receipt_notes (id, hospital_id, grn_number, supplier_id, receipt_date, invoice_number, total_amount, status, notes, created_by)
VALUES
    ('c1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     'GRN-2025-0003', 'a1000000-0000-0000-0000-000000000003',
     '2025-01-18', 'INV-OV-2025-0009', 350.00, 'verified',
     'Walk-in delivery of cleaning solution — standalone (no PO)',
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- GRN-4: Pending verification
INSERT INTO goods_receipt_notes (id, hospital_id, grn_number, purchase_order_id, supplier_id, receipt_date, total_amount, status, notes, created_by)
VALUES
    ('c1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
     'GRN-2025-0004', 'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
     '2025-01-22', 0, 'pending',
     'Second delivery attempt for remaining Omeprazole — awaiting verification',
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.4 GRN ITEMS
-- ─────────────────────────────────────────────────────────────────────────────

-- GRN-1 items
INSERT INTO grn_items (id, grn_id, item_type, item_id, batch_number, expiry_date, quantity_received, quantity_accepted, quantity_rejected, unit_price, total_price)
VALUES
    ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000001', 'BATCH-PC-2025-A', '2027-01-15',
     100, 100, 0, 3.00, 300.00),
    ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000003', 'BATCH-OM-2025-A', '2026-07-20',
     20, 18, 2, 4.50, 90.00)
ON CONFLICT (id) DO NOTHING;

-- GRN-2 items
INSERT INTO grn_items (id, grn_id, item_type, item_id, batch_number, expiry_date, quantity_received, quantity_accepted, quantity_rejected, unit_price, total_price)
VALUES
    ('c2000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002',
     'medicine', '50000000-0000-0000-0000-000000000007', 'BATCH-CT-2025-A', '2027-03-10',
     50, 50, 0, 2.00, 100.00),
    ('c2000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002',
     'medicine', '50000000-0000-0000-0000-000000000008', 'BATCH-IB-2025-A', '2027-05-30',
     30, 30, 0, 4.00, 120.00)
ON CONFLICT (id) DO NOTHING;

-- GRN-3 items (standalone — optical product)
INSERT INTO grn_items (id, grn_id, item_type, item_id, batch_number, expiry_date, quantity_received, quantity_accepted, quantity_rejected, unit_price, total_price)
VALUES
    ('c2000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000003',
     'optical_product', '90000000-0000-0000-0000-000000000007', 'BATCH-SOL-2025-A', '2026-12-31',
     50, 50, 0, 7.00, 350.00)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.5 STOCK MOVEMENTS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO stock_movements (id, hospital_id, item_type, item_id, movement_type, reference_type, reference_id, quantity, balance_after, unit_cost, notes, performed_by, created_at)
VALUES
    -- Stock-in from GRN-1 (Paracetamol)
    ('d1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000001', 'stock_in', 'grn', 'c1000000-0000-0000-0000-000000000001',
     100, 150, 3.00, 'GRN-2025-0001: Paracetamol 500mg received',
     '10000000-0000-0000-0000-000000000010', '2025-01-15 09:30:00+00'),

    -- Stock-in from GRN-1 (Omeprazole)
    ('d1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000003', 'stock_in', 'grn', 'c1000000-0000-0000-0000-000000000001',
     18, 58, 4.50, 'GRN-2025-0001: Omeprazole 20mg received (2 rejected)',
     '10000000-0000-0000-0000-000000000010', '2025-01-15 09:32:00+00'),

    -- Stock-in from GRN-2 (Cetirizine)
    ('d1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000007', 'stock_in', 'grn', 'c1000000-0000-0000-0000-000000000002',
     50, 90, 2.00, 'GRN-2025-0002: Cetirizine 10mg received',
     '10000000-0000-0000-0000-000000000010', '2025-01-09 10:00:00+00'),

    -- Stock-in from GRN-2 (Ibuprofen)
    ('d1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000008', 'stock_in', 'grn', 'c1000000-0000-0000-0000-000000000002',
     30, 70, 4.00, 'GRN-2025-0002: Ibuprofen 400mg received',
     '10000000-0000-0000-0000-000000000010', '2025-01-09 10:05:00+00'),

    -- Stock-in from GRN-3 (Cleaning Solution)
    ('d1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
     'optical_product', '90000000-0000-0000-0000-000000000007', 'stock_in', 'grn', 'c1000000-0000-0000-0000-000000000003',
     50, 150, 7.00, 'GRN-2025-0003: Lens Cleaning Solution standalone receipt',
     '10000000-0000-0000-0000-000000000010', '2025-01-18 11:00:00+00'),

    -- Dispensing of Paracetamol
    ('d1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000001', 'dispensing', 'dispensing', NULL,
     -10, 140, 3.00, 'Pharmacy dispensing — prescription #RX-001',
     '10000000-0000-0000-0000-000000000007', '2025-01-16 14:00:00+00'),

    -- Sale of Cetirizine
    ('d1000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000007', 'sale', NULL, NULL,
     -5, 85, 2.00, 'Over-the-counter sale',
     '10000000-0000-0000-0000-000000000007', '2025-01-17 16:30:00+00'),

    -- Return of Ibuprofen
    ('d1000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000008', 'return', 'return', NULL,
     3, 73, 4.00, 'Patient returned unopened Ibuprofen strips',
     '10000000-0000-0000-0000-000000000007', '2025-01-19 09:15:00+00'),

    -- Expired — Eye Drops write-off
    ('d1000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000010', 'expired', 'adjustment', NULL,
     -5, 10, 7.00, 'Expired batch found during shelf check',
     '10000000-0000-0000-0000-000000000010', '2025-01-20 08:00:00+00'),

    -- Damaged — Cleaning Solution
    ('d1000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001',
     'optical_product', '90000000-0000-0000-0000-000000000007', 'damaged', 'adjustment', NULL,
     -2, 148, 7.00, 'Two bottles found leaking during inspection',
     '10000000-0000-0000-0000-000000000010', '2025-01-21 10:30:00+00'),

    -- Adjustment (increase) — Omeprazole
    ('d1000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000003', 'adjustment', 'adjustment', NULL,
     5, 63, 4.50, 'Stock adjustment — found 5 units in secondary storage room',
     '10000000-0000-0000-0000-000000000010', '2025-01-21 14:00:00+00'),

    -- Transfer — Paracetamol to Apollo Branch
    ('d1000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000001', 'transfer', 'transfer', NULL,
     -20, 120, 3.00, 'Inter-branch transfer to HMS Apollo Branch',
     '10000000-0000-0000-0000-000000000010', '2025-01-22 11:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.6 STOCK ADJUSTMENTS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO stock_adjustments (id, hospital_id, adjustment_number, item_type, item_id, adjustment_type, quantity, reason, approved_by, status, created_by)
VALUES
    -- Adjustment 1: Increase — found extra Omeprazole (approved)
    ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'ADJ-2025-0001', 'medicine', '50000000-0000-0000-0000-000000000003',
     'increase', 5, 'Found 5 extra Omeprazole strips in secondary storage during audit',
     '10000000-0000-0000-0000-000000000002', 'approved', '10000000-0000-0000-0000-000000000010'),

    -- Adjustment 2: Write-off — expired Eye Drops (approved)
    ('e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'ADJ-2025-0002', 'medicine', '50000000-0000-0000-0000-000000000010',
     'write_off', 5, 'Expired Moxifloxacin Eye Drops — batch BATCH-ED-2024 expired 2024-12-31',
     '10000000-0000-0000-0000-000000000002', 'approved', '10000000-0000-0000-0000-000000000010'),

    -- Adjustment 3: Decrease — damaged Cleaning Solution (approved)
    ('e1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     'ADJ-2025-0003', 'optical_product', '90000000-0000-0000-0000-000000000007',
     'decrease', 2, 'Two bottles of Lens Cleaning Solution found leaking during inspection',
     '10000000-0000-0000-0000-000000000002', 'approved', '10000000-0000-0000-0000-000000000010'),

    -- Adjustment 4: Pending approval
    ('e1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
     'ADJ-2025-0004', 'medicine', '50000000-0000-0000-0000-000000000004',
     'decrease', 3, 'Atorvastatin 10mg — 3 strips found damaged in storage',
     'pending', '10000000-0000-0000-0000-000000000010'),

    -- Adjustment 5: Rejected example
    ('e1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
     'ADJ-2025-0005', 'medicine', '50000000-0000-0000-0000-000000000005',
     'increase', 20, 'Claimed to find 20 Metformin strips — rejected due to no corroborating evidence',
     '10000000-0000-0000-0000-000000000002', 'rejected', '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.7 CYCLE COUNTS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO cycle_counts (id, hospital_id, count_number, count_date, status, notes, counted_by, verified_by)
VALUES
    -- Cycle Count 1: Completed and verified
    ('f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'CC-2025-0001', '2025-01-20', 'verified',
     'Monthly physical count — Pharmacy shelf A (medicines)',
     '10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000007'),

    -- Cycle Count 2: In progress
    ('f1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'CC-2025-0002', '2025-01-25', 'in_progress',
     'Optical department quarterly count — frames and lenses',
     '10000000-0000-0000-0000-000000000010'),

    -- Cycle Count 3: Completed, awaiting verification
    ('f1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     'CC-2025-0003', '2025-01-23', 'completed',
     'Spot check — fast-moving OTC medicines',
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.8 CYCLE COUNT ITEMS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO cycle_count_items (id, cycle_count_id, item_type, item_id, system_quantity, counted_quantity, variance, variance_reason)
VALUES
    -- CC-1 items (verified — some variances)
    ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000001', 150, 148, -2,
     'Minor discrepancy — possible unrecorded dispensing'),
    ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000003', 58, 58, 0, NULL),
    ('f2000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000007', 90, 89, -1,
     'One strip possibly misplaced — search in progress'),
    ('f2000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000008', 70, 70, 0, NULL),

    -- CC-2 items (in progress — optical)
    ('f2000000-0000-0000-0000-000000000005', 'f1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000001', 25, 25, 0),
    ('f2000000-0000-0000-0000-000000000006', 'f1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000003', 50, 49, -1),
    ('f2000000-0000-0000-0000-000000000007', 'f1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000007', 150, 148, -2),

    -- CC-3 items (completed — OTC spot check)
    ('f2000000-0000-0000-0000-000000000008', 'f1000000-0000-0000-0000-000000000003',
     'medicine', '50000000-0000-0000-0000-000000000001', 140, 140, 0, NULL),
    ('f2000000-0000-0000-0000-000000000009', 'f1000000-0000-0000-0000-000000000003',
     'medicine', '50000000-0000-0000-0000-000000000007', 85, 85, 0, NULL),
    ('f2000000-0000-0000-0000-000000000010', 'f1000000-0000-0000-0000-000000000003',
     'medicine', '50000000-0000-0000-0000-000000000009', 20, 18, -2,
     'Cough Syrup — 2 bottles likely dispensed without record')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================================
-- END OF INVENTORY SEEDING SCRIPT
-- ============================================================================
