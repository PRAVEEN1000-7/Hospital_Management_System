-- ============================================================================
-- HMS - Products & Stock Seed Data
-- ============================================================================
-- This script seeds the products table with comprehensive data including
-- medicines, optical products, surgical items, and other hospital supplies.
-- 
-- Products table is the CENTRAL catalog for all inventory items.
-- Medicine table remains for prescription-specific data.
-- Stock is tracked via medicine_batches and linked to products.
-- 
-- Run AFTER: 01_schema.sql, 02_seed_data.sql, 04_inventory_seed.sql, 06_products_master_table.sql
-- ============================================================================

-- Constants:
--   Hospital:           a0000000-0000-0000-0000-000000000001 (HMS Core Hospital)
--   Inventory Manager:  10000000-0000-0000-0000-000000000010 (Robert Taylor)
--   Admin:              10000000-0000-0000-0000-000000000002 (Hospital Admin)
--   Pharmacist:         10000000-0000-0000-0000-000000000007 (Michael Brown)
--   Suppliers:          a1000000-...-001 (PharmaCorp), -002 (MedSupply), -003 (OptiVision)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SEED PRODUCTS TABLE - CENTRAL PRODUCT CATALOG
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.1 Medicine Products (linked to medicines table)
-- ─────────────────────────────────────────────────────────────────────────────

-- Paracetamol 500mg - Most common pain reliever
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'Paracetamol 500mg', 'Paracetamol', 'Calpol', 'medicine', 'tablet',
     'MED-TAB-001', '8901234567890', 'GlaxoSmithKline', 'a1000000-0000-0000-0000-000000000001',
     3.00, 5.00, 5.50, 5.00, 'strip', 10, 50, 500, 100, 'Store in cool dry place', 730, false, true,
     '10000000-0000-0000-0000-000000000010');

-- Amoxicillin 250mg - Antibiotic
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'Amoxicillin 250mg', 'Amoxicillin', 'Novamox', 'medicine', 'capsule',
     'MED-CAP-002', '8901234567891', 'Cipla', 'a1000000-0000-0000-0000-000000000002',
     7.50, 12.00, 13.00, 5.00, 'strip', 10, 30, 300, 60, 'Store below 25°C', 730, true, true,
     '10000000-0000-0000-0000-000000000010');

-- Omeprazole 20mg - Proton pump inhibitor
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     'Omeprazole 20mg', 'Omeprazole', 'Omez', 'medicine', 'capsule',
     'MED-CAP-003', '8901234567892', 'Dr. Reddy''s', 'a1000000-0000-0000-0000-000000000001',
     4.50, 8.00, 8.50, 5.00, 'strip', 14, 40, 400, 80, 'Store in cool dry place', 730, true, true,
     '10000000-0000-0000-0000-000000000010');

-- Atorvastatin 10mg - Cholesterol medication
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
     'Atorvastatin 10mg', 'Atorvastatin', 'Atorva', 'medicine', 'tablet',
     'MED-TAB-004', '8901234567893', 'Sun Pharma', 'a1000000-0000-0000-0000-000000000002',
     9.00, 15.00, 16.00, 5.00, 'strip', 10, 25, 250, 50, 'Store below 25°C', 730, true, true,
     '10000000-0000-0000-0000-000000000010');

-- Metformin 500mg - Diabetes medication
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
     'Metformin 500mg', 'Metformin', 'Glyciphage', 'medicine', 'tablet',
     'MED-TAB-005', '8901234567894', 'USV', 'a1000000-0000-0000-0000-000000000001',
     3.50, 6.00, 6.50, 5.00, 'strip', 10, 50, 500, 100, 'Store in cool dry place', 730, true, true,
     '10000000-0000-0000-0000-000000000010');

-- Ciprofloxacin 500mg - Antibiotic
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001',
     'Ciprofloxacin 500mg', 'Ciprofloxacin', 'Cipro', 'medicine', 'tablet',
     'MED-TAB-006', '8901234567895', 'Bayer', 'a1000000-0000-0000-0000-000000000002',
     11.00, 18.00, 19.00, 5.00, 'strip', 10, 20, 200, 40, 'Store below 25°C, protect from light', 730, true, true,
     '10000000-0000-0000-0000-000000000010');

-- Cetirizine 10mg - Antihistamine
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001',
     'Cetirizine 10mg', 'Cetirizine', 'Zyrtec', 'medicine', 'tablet',
     'MED-TAB-007', '8901234567896', 'UCB Pharma', 'a1000000-0000-0000-0000-000000000002',
     2.00, 4.00, 4.50, 5.00, 'strip', 10, 40, 400, 80, 'Store in cool dry place', 730, false, true,
     '10000000-0000-0000-0000-000000000010');

-- Ibuprofen 400mg - NSAID pain reliever
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001',
     'Ibuprofen 400mg', 'Ibuprofen', 'Brufen', 'medicine', 'tablet',
     'MED-TAB-008', '8901234567897', 'Abbott', 'a1000000-0000-0000-0000-000000000001',
     4.00, 7.00, 7.50, 5.00, 'strip', 10, 30, 300, 60, 'Store in cool dry place', 730, false, true,
     '10000000-0000-0000-0000-000000000010');

-- Cough Syrup DX - Cough suppressant
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001',
     'Cough Syrup DX', 'Dextromethorphan', 'Benylin', 'medicine', 'syrup',
     'MED-SYR-009', '8901234567898', 'Johnson & Johnson', 'a1000000-0000-0000-0000-000000000002',
     5.00, 9.00, 10.00, 5.00, 'bottle', 100, 20, 200, 40, 'Store below 25°C', 1095, false, true,
     '10000000-0000-0000-0000-000000000010');

-- Eye Drops Moxifloxacin - Antibiotic eye drops
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001',
     'Moxifloxacin Eye Drops', 'Moxifloxacin', 'Moxiflox', 'medicine', 'drops',
     'MED-DRP-010', '8901234567899', 'Alcon', 'a1000000-0000-0000-0000-000000000003',
     7.00, 12.00, 13.00, 5.00, 'bottle', 5, 15, 150, 30, 'Store in refrigerator (2-8°C)', 730, true, true,
     '10000000-0000-0000-0000-000000000010');

-- Insulin Glargine - Diabetes injection (requires refrigeration)
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_refrigeration, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001',
     'Insulin Glargine', 'Insulin Glargine', 'Lantus', 'medicine', 'injection',
     'MED-INJ-011', '8901234567900', 'Sanofi', 'a1000000-0000-0000-0000-000000000001',
     250.00, 350.00, 380.00, 5.00, 'vial', 10, 10, 100, 20, 'Store in refrigerator (2-8°C)', 730, true, true, true,
     '10000000-0000-0000-0000-000000000010');

-- Morphine Injection - Narcotic (controlled substance)
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_narcotic, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001',
     'Morphine Sulfate 10mg/ml', 'Morphine', 'Morphine', 'medicine', 'injection',
     'MED-INJ-012', '8901234567901', 'Hameln Pharma', 'a1000000-0000-0000-0000-000000000001',
     50.00, 80.00, 90.00, 5.00, 'ampoule', 10, 5, 50, 10, 'Store in locked cabinet, protect from light', 1095, true, true, true,
     '10000000-0000-0000-0000-000000000010');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.2 Optical Products
-- ─────────────────────────────────────────────────────────────────────────────

-- Classic Round Frame - Eyeglass frame
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001',
     'Classic Round Frame', 'Eyeglass Frame', 'RayBan', 'optical', 'frame',
     'OPT-FRM-020', '8902234567890', 'Luxottica', 'a1000000-0000-0000-0000-000000000003',
     80.00, 150.00, 165.00, 12.00, 'piece', 1, 10, 100, 20, 'Store in dry place, avoid pressure', true,
     '10000000-0000-0000-0000-000000000010');

-- Aviator Sunglass Frame
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001',
     'Aviator Sunglass Frame', 'Sunglass Frame', 'Oakley', 'optical', 'frame',
     'OPT-FRM-021', '8902234567891', 'Oakley Inc', 'a1000000-0000-0000-0000-000000000003',
     120.00, 220.00, 240.00, 12.00, 'piece', 1, 5, 50, 10, 'Store in protective case', true,
     '10000000-0000-0000-0000-000000000010');

-- Single Vision Lens - Standard
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000001',
     'Single Vision Lens', 'Optical Lens', 'Essilor', 'optical', 'lens',
     'OPT-LNS-022', '8902234567892', 'Essilor', 'a1000000-0000-0000-0000-000000000003',
     35.00, 70.00, 77.00, 12.00, 'pair', 1, 20, 200, 40, 'Store in original packaging', true,
     '10000000-0000-0000-0000-000000000010');

-- Progressive Lens - Premium
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000001',
     'Progressive Lens Premium', 'Progressive Lens', 'Varilux', 'optical', 'lens',
     'OPT-LNS-023', '8902234567893', 'Essilor', 'a1000000-0000-0000-0000-000000000003',
     110.00, 200.00, 220.00, 12.00, 'pair', 1, 10, 100, 20, 'Store in original packaging', true,
     '10000000-0000-0000-0000-000000000010');

-- Contact Lens Solution
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000001',
     'Contact Lens Solution', 'Cleaning Solution', 'Opti-Free', 'optical', 'accessory',
     'OPT-ACC-024', '8902234567894', 'Alcon', 'a1000000-0000-0000-0000-000000000003',
     7.00, 14.00, 15.00, 12.00, 'bottle', 360, 30, 300, 60, 'Store at room temperature', 730, true,
     '10000000-0000-0000-0000-000000000010');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.3 Surgical & Medical Supplies
-- ─────────────────────────────────────────────────────────────────────────────

-- Surgical Gloves (Sterile)
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000001',
     'Surgical Gloves Sterile L', 'Latex Gloves', 'MediGlove', 'surgical', 'disposable',
     'SUR-DIS-030', '8903234567890', 'Hartalega', 'a1000000-0000-0000-0000-000000000002',
     0.50, 1.00, 1.20, 12.00, 'pair', 100, 500, 5000, 1000, 'Store in cool dry place, avoid direct sunlight', 1825, true,
     '10000000-0000-0000-0000-000000000010');

-- Surgical Mask 3-Ply
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000001',
     'Surgical Mask 3-Ply', 'Face Mask', 'SafeMask', 'surgical', 'disposable',
     'SUR-DIS-031', '8903234567891', '3M', 'a1000000-0000-0000-0000-000000000002',
     0.10, 0.25, 0.30, 12.00, 'piece', 50, 1000, 10000, 2000, 'Store in clean dry area', 1825, true,
     '10000000-0000-0000-0000-000000000010');

-- Syringe 5ml with Needle
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000001',
     'Syringe 5ml with Needle', 'Disposable Syringe', 'Becton Dickinson', 'surgical', 'disposable',
     'SUR-DIS-032', '8903234567892', 'BD Medical', 'a1000000-0000-0000-0000-000000000002',
     0.30, 0.60, 0.70, 12.00, 'piece', 100, 500, 5000, 1000, 'Store in sterile condition', 1825, true,
     '10000000-0000-0000-0000-000000000010');

-- Gauze Sterile 4x4
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000001',
     'Gauze Sterile 4x4 inches', 'Surgical Gauze', 'MedGauze', 'surgical', 'dressing',
     'SUR-DRS-033', '8903234567893', 'Johnson & Johnson', 'a1000000-0000-0000-0000-000000000002',
     0.05, 0.15, 0.20, 12.00, 'piece', 100, 1000, 10000, 2000, 'Keep in sterile packaging', 1825, true,
     '10000000-0000-0000-0000-000000000010');

-- Bandage Elastic 4 inch
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000034', 'a0000000-0000-0000-0000-000000000001',
     'Bandage Elastic 4 inch', 'Elastic Bandage', 'Crepe', 'surgical', 'dressing',
     'SUR-DRS-034', '8903234567894', 'BSN Medical', 'a1000000-0000-0000-0000-000000000002',
     2.00, 4.00, 4.50, 12.00, 'roll', 1, 50, 500, 100, 'Store in dry place', true,
     '10000000-0000-0000-0000-000000000010');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.4 Laboratory Supplies
-- ─────────────────────────────────────────────────────────────────────────────

-- Blood Collection Tube EDTA
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000040', 'a0000000-0000-0000-0000-000000000001',
     'Blood Collection Tube EDTA 2ml', 'Vacutainer', 'BD Vacutainer', 'laboratory', 'consumable',
     'LAB-CON-040', '8904234567890', 'BD Medical', 'a1000000-0000-0000-0000-000000000002',
     0.40, 0.80, 0.90, 12.00, 'tube', 100, 500, 5000, 1000, 'Store at room temperature', 1825, true,
     '10000000-0000-0000-0000-000000000010');

-- Glucose Test Strips
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000001',
     'Glucose Test Strips', 'Blood Glucose Strip', 'Accu-Chek', 'laboratory', 'consumable',
     'LAB-CON-041', '8904234567891', 'Roche', 'a1000000-0000-0000-0000-000000000002',
     0.50, 1.00, 1.20, 12.00, 'strip', 50, 200, 2000, 400, 'Store in cool dry place, keep vial closed', 545, true,
     '10000000-0000-0000-0000-000000000010');

-- Pregnancy Test Kit
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-000000000001',
     'Pregnancy Test Kit', 'hCG Test', 'Clearblue', 'laboratory', 'diagnostic',
     'LAB-DIA-042', '8904234567892', 'Procter & Gamble', 'a1000000-0000-0000-0000-000000000002',
     3.00, 6.00, 7.00, 12.00, 'kit', 1, 50, 500, 100, 'Store at room temperature', 730, true,
     '10000000-0000-0000-0000-000000000010');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.5 Equipment & Devices
-- ─────────────────────────────────────────────────────────────────────────────

-- Digital Thermometer
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000050', 'a0000000-0000-0000-0000-000000000001',
     'Digital Thermometer', 'Clinical Thermometer', 'Omron', 'equipment', 'diagnostic',
     'EQP-DIA-050', '8905234567890', 'Omron Healthcare', 'a1000000-0000-0000-0000-000000000002',
     15.00, 30.00, 35.00, 12.00, 'piece', 1, 10, 100, 20, 'Store in protective case', 1825, true,
     '10000000-0000-0000-0000-000000000010');

-- Blood Pressure Monitor Automatic
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000001',
     'Blood Pressure Monitor Automatic', 'BP Monitor', 'Omron', 'equipment', 'diagnostic',
     'EQP-DIA-051', '8905234567891', 'Omron Healthcare', 'a1000000-0000-0000-0000-000000000002',
     40.00, 75.00, 85.00, 12.00, 'piece', 1, 5, 50, 10, 'Store in protective case, avoid humidity', 1825, true,
     '10000000-0000-0000-0000-000000000010');

-- Pulse Oximeter
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000052', 'a0000000-0000-0000-0000-000000000001',
     'Pulse Oximeter Fingertip', 'SpO2 Monitor', 'ChoiceMMed', 'equipment', 'diagnostic',
     'EQP-DIA-052', '8905234567892', 'ChoiceMMed', 'a1000000-0000-0000-0000-000000000002',
     25.00, 50.00, 55.00, 12.00, 'piece', 1, 10, 100, 20, 'Store in protective case', 1825, true,
     '10000000-0000-0000-0000-000000000010');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SEED STOCK SUMMARY TABLE - REAL-TIME STOCK LEVELS
-- ─────────────────────────────────────────────────────────────────────────────

-- Stock summary for medicines (calculated from medicine_batches and stock_movements)
INSERT INTO stock_summary (id, hospital_id, product_id, total_stock, available_stock, reserved_stock, damaged_stock, expired_stock, total_batches, earliest_expiry, avg_cost_price, total_value, is_low_stock, is_expiring_soon, last_movement_at)
VALUES
    -- Paracetamol 500mg - High stock item
    ('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000001',
     120, 115, 0, 3, 2, 3, '2026-06-15', 3.00, 360.00, false, false, '2026-01-22 11:00:00+00'),

    -- Amoxicillin 250mg - Moderate stock
    ('70000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000002',
     45, 42, 2, 1, 0, 2, '2026-09-20', 7.50, 337.50, false, false, '2026-01-20 10:00:00+00'),

    -- Omeprazole 20mg - Good stock
    ('70000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000003',
     63, 60, 0, 3, 0, 2, '2026-07-20', 4.50, 283.50, false, false, '2026-01-21 14:00:00+00'),

    -- Atorvastatin 10mg - Low stock alert
    ('70000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000004',
     22, 20, 0, 2, 0, 1, '2026-08-15', 9.00, 198.00, true, false, '2026-01-19 09:00:00+00'),

    -- Metformin 500mg - Good stock
    ('70000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000005',
     85, 80, 0, 5, 0, 2, '2026-10-10', 3.50, 297.50, false, false, '2026-01-18 15:00:00+00'),

    -- Ciprofloxacin 500mg - Moderate stock
    ('70000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000006',
     35, 33, 0, 2, 0, 1, '2026-11-05', 11.00, 385.00, false, false, '2026-01-17 11:00:00+00'),

    -- Cetirizine 10mg - Good stock
    ('70000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000007',
     85, 82, 0, 3, 0, 2, '2026-03-10', 2.00, 170.00, false, true, '2026-01-17 16:30:00+00'),

    -- Ibuprofen 400mg - Good stock
    ('70000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000008',
     73, 70, 0, 3, 0, 2, '2026-05-30', 4.00, 292.00, false, false, '2026-01-19 09:15:00+00'),

    -- Cough Syrup DX - Low stock
    ('70000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000009',
     18, 15, 0, 3, 0, 1, '2027-01-15', 5.00, 90.00, true, false, '2026-01-16 10:00:00+00'),

    -- Eye Drops Moxifloxacin - Very low stock (expired some)
    ('70000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000010',
     10, 8, 0, 2, 0, 1, '2026-04-20', 7.00, 70.00, true, true, '2026-01-20 08:00:00+00'),

    -- Insulin Glargine - Requires refrigeration, moderate stock
    ('70000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000011',
     25, 23, 0, 2, 0, 2, '2026-08-30', 250.00, 6250.00, false, false, '2026-01-15 14:00:00+00'),

    -- Morphine Injection - Controlled, low stock
    ('70000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000012',
     15, 14, 0, 1, 0, 1, '2027-06-15', 50.00, 750.00, false, false, '2026-01-14 16:00:00+00'),

    -- Classic Round Frame - Optical
    ('70000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000020',
     25, 24, 1, 0, 0, 1, NULL, 80.00, 2000.00, false, false, '2026-01-10 11:00:00+00'),

    -- Aviator Sunglass Frame - Optical
    ('70000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000021',
     12, 12, 0, 0, 0, 1, NULL, 120.00, 1440.00, false, false, '2026-01-08 10:00:00+00'),

    -- Single Vision Lens - Optical
    ('70000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000022',
     50, 48, 2, 0, 0, 2, NULL, 35.00, 1750.00, false, false, '2026-01-12 14:00:00+00'),

    -- Progressive Lens - Optical premium
    ('70000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000023',
     18, 17, 1, 0, 0, 1, NULL, 110.00, 1980.00, false, false, '2026-01-11 15:00:00+00'),

    -- Contact Lens Solution - Optical accessory
    ('70000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000024',
     148, 145, 0, 3, 0, 2, '2026-12-31', 7.00, 1036.00, false, false, '2026-01-21 10:30:00+00'),

    -- Surgical Gloves - High consumption
    ('70000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000030',
     4500, 4400, 0, 100, 0, 5, '2028-01-15', 0.50, 2250.00, false, false, '2026-01-20 08:00:00+00'),

    -- Surgical Mask - High consumption
    ('70000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000031',
     8500, 8300, 0, 200, 0, 10, '2028-06-20', 0.10, 850.00, false, false, '2026-01-21 07:00:00+00'),

    -- Syringe 5ml - High consumption
    ('70000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000032',
     4800, 4700, 0, 100, 0, 5, '2028-03-10', 0.30, 1440.00, false, false, '2026-01-21 09:00:00+00'),

    -- Digital Thermometer - Equipment
    ('70000000-0000-0000-0000-000000000050', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000050',
     25, 24, 1, 0, 0, 1, NULL, 15.00, 375.00, false, false, '2026-01-05 10:00:00+00'),

    -- BP Monitor - Equipment
    ('70000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000051',
     8, 7, 1, 0, 0, 1, NULL, 40.00, 320.00, false, false, '2026-01-03 11:00:00+00'),

    -- Pulse Oximeter - Equipment
    ('70000000-0000-0000-0000-000000000052', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000052',
     30, 28, 2, 0, 0, 2, NULL, 25.00, 750.00, false, false, '2026-01-07 14:00:00+00');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SEED STOCK ALERTS TABLE - ACTIVE ALERTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Low stock alerts
INSERT INTO stock_alerts (id, hospital_id, product_id, alert_type, severity, title, message, current_stock, threshold_stock, is_resolved, created_at)
VALUES
    -- Atorvastatin - Low stock (high severity)
    ('80000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000004',
     'low_stock', 'high',
     'Low Stock Alert: Atorvastatin 10mg',
     'Current stock (22) is below reorder level (25). Please create a purchase order.',
     22, 25, false, '2026-01-19 09:00:00+00'),

    -- Cough Syrup - Low stock
    ('80000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000009',
     'low_stock', 'medium',
     'Low Stock Alert: Cough Syrup DX',
     'Current stock (18) is below reorder level (20). Consider restocking.',
     18, 20, false, '2026-01-16 10:00:00+00'),

    -- Eye Drops - Low stock and expiring soon
    ('80000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000010',
     'low_stock', 'high',
     'Low Stock Alert: Moxifloxacin Eye Drops',
     'Current stock (10) is below reorder level (15). Urgent restocking needed.',
     10, 15, false, '2026-01-20 08:00:00+00'),

    -- Cetirizine - Expiring soon (within 60 days)
    ('80000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000007',
     'expiring_soon', 'medium',
     'Expiry Alert: Cetirizine 10mg',
     'Batch expires on 2026-03-10 (48 days remaining). Consider using FIFO.',
     85, NULL, false, '2026-01-15 08:00:00+00'),

    -- Eye Drops - Also expiring soon
    ('80000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
     '60000000-0000-0000-0000-000000000010',
     'expiring_soon', 'high',
     'Expiry Alert: Moxifloxacin Eye Drops',
     'Batch expires on 2026-04-20 (89 days remaining). Monitor closely.',
     10, NULL, false, '2026-01-15 08:00:00+00');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CREATE LINKING VIEW: Products with Medicine Data
-- ─────────────────────────────────────────────────────────────────────────────

-- This view shows how products link to medicines table for pharmacy operations
CREATE OR REPLACE VIEW v_product_medicine_link AS
SELECT 
    p.id AS product_id,
    p.product_name,
    p.generic_name,
    p.category,
    p.sku,
    p.barcode,
    m.id AS medicine_id,
    m.name AS medicine_name,
    m.category AS medicine_category,
    m.strength,
    m.unit_of_measure,
    m.requires_prescription,
    ss.total_stock,
    ss.available_stock,
    ss.is_low_stock,
    ss.is_expiring_soon,
    ss.total_value
FROM products p
LEFT JOIN medicines m ON p.generic_name = m.generic_name 
    AND p.hospital_id = m.hospital_id
    AND p.category = 'medicine'
LEFT JOIN stock_summary ss ON p.id = ss.product_id
WHERE p.is_deleted = false 
    AND p.is_active = true
    AND p.hospital_id = 'a0000000-0000-0000-0000-000000000001';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CREATE VIEW: Stock Movement Summary by Product
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_product_stock_movements AS
SELECT 
    p.id AS product_id,
    p.product_name,
    p.category,
    sm.movement_type,
    COUNT(sm.id) AS movement_count,
    SUM(sm.quantity) AS total_quantity,
    SUM(sm.quantity * COALESCE(sm.unit_cost, 0)) AS total_value
FROM products p
LEFT JOIN stock_movements sm ON p.id = sm.item_id 
    AND sm.item_type IN ('medicine', 'optical_product')
WHERE p.is_deleted = false 
    AND p.hospital_id = 'a0000000-0000-0000-0000-000000000001'
GROUP BY p.id, p.product_name, p.category, sm.movement_type
ORDER BY p.product_name, sm.movement_type;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CREATE VIEW: Complete Inventory Dashboard
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_inventory_dashboard AS
SELECT 
    p.hospital_id,
    COUNT(DISTINCT p.id) AS total_products,
    COUNT(DISTINCT CASE WHEN p.category = 'medicine' THEN p.id END) AS total_medicines,
    COUNT(DISTINCT CASE WHEN p.category = 'optical' THEN p.id END) AS total_optical,
    COUNT(DISTINCT CASE WHEN p.category = 'surgical' THEN p.id END) AS total_surgical,
    COUNT(DISTINCT CASE WHEN p.category = 'laboratory' THEN p.id END) AS total_laboratory,
    COUNT(DISTINCT CASE WHEN p.category = 'equipment' THEN p.id END) AS total_equipment,
    SUM(ss.total_stock) AS total_stock_units,
    SUM(ss.total_value) AS total_inventory_value,
    COUNT(DISTINCT CASE WHEN ss.is_low_stock = true THEN p.id END) AS low_stock_products,
    COUNT(DISTINCT CASE WHEN ss.is_expiring_soon = true THEN p.id END) AS expiring_soon_products,
    COUNT(DISTINCT sa.id) FILTER (WHERE sa.is_resolved = false) AS active_alerts
FROM products p
LEFT JOIN stock_summary ss ON p.id = ss.product_id
LEFT JOIN stock_alerts sa ON p.id = sa.product_id
WHERE p.is_deleted = false 
    AND p.is_active = true
GROUP BY p.hospital_id;

-- ============================================================================
-- VERIFICATION QUERIES (Commented out - run manually if needed)
-- ============================================================================

-- Verify products created:
-- SELECT category, COUNT(*) FROM products WHERE hospital_id = 'a0000000-0000-0000-0000-000000000001' AND is_deleted = false GROUP BY category;

-- Verify stock summary:
-- SELECT COUNT(*) FROM stock_summary WHERE hospital_id = 'a0000000-0000-0000-0000-000000000001';

-- Verify low stock items:
-- SELECT p.product_name, ss.available_stock, ss.is_low_stock FROM products p JOIN stock_summary ss ON p.id = ss.product_id WHERE ss.is_low_stock = true;

-- Verify alerts:
-- SELECT alert_type, severity, title FROM stock_alerts WHERE is_resolved = false;

-- Test dashboard view:
-- SELECT * FROM v_inventory_dashboard WHERE hospital_id = 'a0000000-0000-0000-0000-000000000001';

-- ============================================================================
-- END OF PRODUCTS SEED DATA
-- ============================================================================
