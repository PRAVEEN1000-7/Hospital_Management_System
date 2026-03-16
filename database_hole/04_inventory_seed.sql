-- ============================================================================
-- HMS — Inventory Module Seed Data
-- Run AFTER 02_seed_data.sql (requires hospitals, users, suppliers, medicines,
-- optical_products to already exist)
-- ============================================================================
-- This script inserts realistic inventory sample data to demonstrate the full
-- purchase → receipt → stock → adjustment → cycle-count workflow.
-- ============================================================================

-- Constants used:
--   Hospital:           a0000000-0000-0000-0000-000000000001  (HMS Core Hospital)
--   Inventory Manager:  10000000-0000-0000-0000-000000000010  (Robert Taylor)
--   Admin (approver):   10000000-0000-0000-0000-000000000002  (Hospital Admin)
--   Pharmacist:         10000000-0000-0000-0000-000000000007  (Michael Brown)
--   Suppliers:          a1000000-...-001 (PharmaCorp), -002 (MedSupply), -003 (OptiVision)
--   Medicines:          50000000-...-001 through 010
--   Optical Products:   90000000-...-001 through 007

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PURCHASE ORDERS
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
-- 2. PURCHASE ORDER ITEMS
-- ─────────────────────────────────────────────────────────────────────────────

-- PO-1 items (medicines)
INSERT INTO purchase_order_items (id, purchase_order_id, item_type, item_id, quantity_ordered, quantity_received, unit_price, total_price)
VALUES
    ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000001', 100, 100, 3.00, 300.00),   -- Paracetamol (fully received)
    ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000003', 50, 20, 4.50, 225.00),      -- Omeprazole (partially received)
    ('b2000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000005', 80, 0, 3.50, 280.00)        -- Metformin (not yet received)
ON CONFLICT (id) DO NOTHING;

-- PO-2 items (optical products)
INSERT INTO purchase_order_items (id, purchase_order_id, item_type, item_id, quantity_ordered, quantity_received, unit_price, total_price)
VALUES
    ('b2000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000001', 10, 0, 80.00, 800.00),    -- Classic Round Frame
    ('b2000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000003', 20, 0, 35.00, 700.00),    -- Single Vision Lens
    ('b2000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000004', 10, 0, 110.00, 1100.00)   -- Progressive Lens
ON CONFLICT (id) DO NOTHING;

-- PO-3 items (medicines — urgent)
INSERT INTO purchase_order_items (id, purchase_order_id, item_type, item_id, quantity_ordered, quantity_received, unit_price, total_price)
VALUES
    ('b2000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000003',
     'medicine', '50000000-0000-0000-0000-000000000002', 40, 0, 7.50, 300.00),    -- Amoxicillin
    ('b2000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000003',
     'medicine', '50000000-0000-0000-0000-000000000006', 20, 0, 11.00, 220.00)    -- Ciprofloxacin
ON CONFLICT (id) DO NOTHING;

-- PO-4 items (draft)
INSERT INTO purchase_order_items (id, purchase_order_id, item_type, item_id, quantity_ordered, quantity_received, unit_price, total_price)
VALUES
    ('b2000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000004',
     'medicine', '50000000-0000-0000-0000-000000000010', 30, 0, 7.00, 210.00),    -- Eye Drops Moxifloxacin
    ('b2000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000004',
     'medicine', '50000000-0000-0000-0000-000000000009', 25, 0, 5.00, 125.00)     -- Cough Syrup DX
ON CONFLICT (id) DO NOTHING;

-- PO-5 items (fully received)
INSERT INTO purchase_order_items (id, purchase_order_id, item_type, item_id, quantity_ordered, quantity_received, unit_price, total_price)
VALUES
    ('b2000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000005',
     'medicine', '50000000-0000-0000-0000-000000000007', 50, 50, 2.00, 100.00),   -- Cetirizine
    ('b2000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000005',
     'medicine', '50000000-0000-0000-0000-000000000008', 30, 30, 4.00, 120.00)    -- Ibuprofen
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. GOODS RECEIPT NOTES (GRNs)
-- ─────────────────────────────────────────────────────────────────────────────

-- GRN-1: First receipt against PO-1 (Paracetamol full + Omeprazole partial)
INSERT INTO goods_receipt_notes (id, hospital_id, grn_number, purchase_order_id, supplier_id, receipt_date, invoice_number, invoice_date, total_amount, status, verified_by, notes, created_by)
VALUES
    ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'GRN-2025-0001', 'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
     '2025-01-15', 'INV-PC-2025-0042', '2025-01-14', 390.00, 'accepted',
     '10000000-0000-0000-0000-000000000007', 'First delivery from PharmaCorp — Paracetamol complete, Omeprazole partial',
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- GRN-2: Full receipt of PO-5 (Cetirizine + Ibuprofen)
INSERT INTO goods_receipt_notes (id, hospital_id, grn_number, purchase_order_id, supplier_id, receipt_date, invoice_number, invoice_date, total_amount, status, verified_by, notes, created_by)
VALUES
    ('c1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'GRN-2025-0002', 'b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002',
     '2025-01-09', 'INV-MS-2025-0018', '2025-01-08', 220.00, 'accepted',
     '10000000-0000-0000-0000-000000000007', 'MedSupply delivery — all quantities matched',
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- GRN-3: Standalone receipt (no PO) — Contact Lens solution
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
-- 4. GRN ITEMS
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
-- 5. STOCK MOVEMENTS (generated from accepted GRNs + sales + adjustments)
-- ─────────────────────────────────────────────────────────────────────────────

-- Stock-in from GRN-1 (Paracetamol)
INSERT INTO stock_movements (id, hospital_id, item_type, item_id, movement_type, reference_type, reference_id, quantity, balance_after, unit_cost, notes, performed_by, created_at)
VALUES
    ('d1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000001', 'stock_in', 'grn', 'c1000000-0000-0000-0000-000000000001',
     100, 150, 3.00, 'GRN-2025-0001: Paracetamol 500mg received',
     '10000000-0000-0000-0000-000000000010', '2025-01-15 09:30:00+00'),

    -- Stock-in from GRN-1 (Omeprazole — accepted qty)
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

    -- Stock-in from GRN-3 (Cleaning Solution — standalone)
    ('d1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
     'optical_product', '90000000-0000-0000-0000-000000000007', 'stock_in', 'grn', 'c1000000-0000-0000-0000-000000000003',
     50, 150, 7.00, 'GRN-2025-0003: Lens Cleaning Solution standalone receipt',
     '10000000-0000-0000-0000-000000000010', '2025-01-18 11:00:00+00'),

    -- Dispensing (sale) of Paracetamol
    ('d1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000001', 'dispensing', 'dispensing', NULL,
     -10, 140, 3.00, 'Pharmacy dispensing — prescription #RX-001',
     '10000000-0000-0000-0000-000000000007', '2025-01-16 14:00:00+00'),

    -- Sale of Cetirizine
    ('d1000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000007', 'sale', NULL, NULL,
     -5, 85, 2.00, 'Over-the-counter sale',
     '10000000-0000-0000-0000-000000000007', '2025-01-17 16:30:00+00'),

    -- Return of Ibuprofen (patient return)
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

    -- Adjustment (increase) — Omeprazole found in secondary storage
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
-- 6. STOCK ADJUSTMENTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Adjustment 1: Increase — found extra Omeprazole (approved)
INSERT INTO stock_adjustments (id, hospital_id, adjustment_number, item_type, item_id, adjustment_type, quantity, reason, approved_by, status, created_by)
VALUES
    ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'ADJ-2025-0001', 'medicine', '50000000-0000-0000-0000-000000000003',
     'increase', 5, 'Found 5 extra Omeprazole strips in secondary storage during audit',
     '10000000-0000-0000-0000-000000000002', 'approved', '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Adjustment 2: Write-off — expired Eye Drops (approved)
INSERT INTO stock_adjustments (id, hospital_id, adjustment_number, item_type, item_id, adjustment_type, quantity, reason, approved_by, status, created_by)
VALUES
    ('e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'ADJ-2025-0002', 'medicine', '50000000-0000-0000-0000-000000000010',
     'write_off', 5, 'Expired Moxifloxacin Eye Drops — batch BATCH-ED-2024 expired 2024-12-31',
     '10000000-0000-0000-0000-000000000002', 'approved', '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Adjustment 3: Decrease — damaged Cleaning Solution (approved)
INSERT INTO stock_adjustments (id, hospital_id, adjustment_number, item_type, item_id, adjustment_type, quantity, reason, approved_by, status, created_by)
VALUES
    ('e1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     'ADJ-2025-0003', 'optical_product', '90000000-0000-0000-0000-000000000007',
     'decrease', 2, 'Two bottles of Lens Cleaning Solution found leaking during inspection',
     '10000000-0000-0000-0000-000000000002', 'approved', '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Adjustment 4: Pending approval
INSERT INTO stock_adjustments (id, hospital_id, adjustment_number, item_type, item_id, adjustment_type, quantity, reason, status, created_by)
VALUES
    ('e1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
     'ADJ-2025-0004', 'medicine', '50000000-0000-0000-0000-000000000004',
     'decrease', 3, 'Atorvastatin 10mg — 3 strips found damaged in storage',
     'pending', '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Adjustment 5: Rejected example
INSERT INTO stock_adjustments (id, hospital_id, adjustment_number, item_type, item_id, adjustment_type, quantity, reason, approved_by, status, created_by)
VALUES
    ('e1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
     'ADJ-2025-0005', 'medicine', '50000000-0000-0000-0000-000000000005',
     'increase', 20, 'Claimed to find 20 Metformin strips — rejected due to no corroborating evidence',
     '10000000-0000-0000-0000-000000000002', 'rejected', '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. CYCLE COUNTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Cycle Count 1: Completed and verified
INSERT INTO cycle_counts (id, hospital_id, count_number, count_date, status, notes, counted_by, verified_by)
VALUES
    ('f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'CC-2025-0001', '2025-01-20', 'verified',
     'Monthly physical count — Pharmacy shelf A (medicines)',
     '10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000007')
ON CONFLICT (id) DO NOTHING;

-- Cycle Count 2: In progress
INSERT INTO cycle_counts (id, hospital_id, count_number, count_date, status, notes, counted_by)
VALUES
    ('f1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'CC-2025-0002', '2025-01-25', 'in_progress',
     'Optical department quarterly count — frames and lenses',
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- Cycle Count 3: Completed, awaiting verification
INSERT INTO cycle_counts (id, hospital_id, count_number, count_date, status, notes, counted_by)
VALUES
    ('f1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     'CC-2025-0003', '2025-01-23', 'completed',
     'Spot check — fast-moving OTC medicines',
     '10000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. CYCLE COUNT ITEMS
-- ─────────────────────────────────────────────────────────────────────────────

-- CC-1 items (verified — some variances)
INSERT INTO cycle_count_items (id, cycle_count_id, item_type, item_id, system_quantity, counted_quantity, variance, variance_reason)
VALUES
    ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000001', 150, 148, -2,
     'Minor discrepancy — possible unrecorded dispensing'),
    ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000003', 58, 58, 0, NULL),
    ('f2000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000007', 90, 89, -1,
     'One strip possibly misplaced — search in progress'),
    ('f2000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001',
     'medicine', '50000000-0000-0000-0000-000000000008', 70, 70, 0, NULL)
ON CONFLICT (id) DO NOTHING;

-- CC-2 items (in progress — optical)
INSERT INTO cycle_count_items (id, cycle_count_id, item_type, item_id, system_quantity, counted_quantity, variance)
VALUES
    ('f2000000-0000-0000-0000-000000000005', 'f1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000001', 25, 25, 0),
    ('f2000000-0000-0000-0000-000000000006', 'f1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000003', 50, 49, -1),
    ('f2000000-0000-0000-0000-000000000007', 'f1000000-0000-0000-0000-000000000002',
     'optical_product', '90000000-0000-0000-0000-000000000007', 150, 148, -2)
ON CONFLICT (id) DO NOTHING;

-- CC-3 items (completed — OTC spot check)
INSERT INTO cycle_count_items (id, cycle_count_id, item_type, item_id, system_quantity, counted_quantity, variance, variance_reason)
VALUES
    ('f2000000-0000-0000-0000-000000000008', 'f1000000-0000-0000-0000-000000000003',
     'medicine', '50000000-0000-0000-0000-000000000001', 140, 140, 0, NULL),
    ('f2000000-0000-0000-0000-000000000009', 'f1000000-0000-0000-0000-000000000003',
     'medicine', '50000000-0000-0000-0000-000000000007', 85, 85, 0, NULL),
    ('f2000000-0000-0000-0000-000000000010', 'f1000000-0000-0000-0000-000000000003',
     'medicine', '50000000-0000-0000-0000-000000000009', 20, 18, -2,
     'Cough Syrup — 2 bottles likely dispensed without record')
ON CONFLICT (id) DO NOTHING;
