# Simple Inventory Flow Guide

**Quick Reference:** How data flows through the inventory system with Products integration.

---

## 📦 The Simple Flow (4 Steps)

```
1. LOW STOCK DETECTED → 2. CREATE PO → 3. RECEIVE GRN → 4. STOCK UPDATED
```

---

## Step-by-Step with Sample Data

### Scenario: Paracetamol stock is running low

### **Step 1: Low Stock Alert** 🚨

**What happens:**
- System detects Paracetamol stock (8 units) is below reorder level (30 units)
- Alert appears on Low Stock Alerts page

**Data:**
```
Product: Paracetamol 500mg
Current Stock: 8
Reorder Level: 30
Status: LOW STOCK ⚠️
```

**Database:**
```sql
-- Stock summary shows low stock flag
SELECT product_name, available_stock, is_low_stock 
FROM stock_summary ss
JOIN products p ON ss.product_id = p.id
WHERE p.product_name = 'Paracetamol 500mg';

-- Result:
-- Paracetamol 500mg | 8 | true
```

---

### **Step 2: Create Purchase Order (PO)** 📝

**What happens:**
1. User selects low stock items
2. Chooses supplier (e.g., "PharmaCorp")
3. System creates PO with status "draft"
4. Admin approves PO → status becomes "approved"

**Sample PO Data:**
```
PO Number: PO-20260321-001
Supplier: PharmaCorp
Items:
  - Paracetamol 500mg: 100 strips @ ₹3.00 = ₹300.00
  - Ibuprofen 400mg: 50 strips @ ₹4.00 = ₹200.00
Total: ₹500.00
Status: approved
```

**Database Actions:**
```sql
-- 1. Insert PO
INSERT INTO purchase_orders (po_number, supplier_id, status, total_amount)
VALUES ('PO-20260321-001', supplier_uuid, 'approved', 500.00);

-- 2. Insert PO Items
INSERT INTO purchase_order_items (purchase_order_id, item_type, product_id, quantity_ordered, unit_price)
VALUES 
  (po_uuid, 'product', paracetamol_product_uuid, 100, 3.00),
  (po_uuid, 'product', ibuprofen_product_uuid, 50, 4.00);
```

**Logs Generated:**
```
[INFO] Purchase order created: PO-20260321-001 (total=500.00)
[INFO] Notification sent to: admin, inventory_manager
```

---

### **Step 3: Receive Goods Receipt Note (GRN)** 📦

**What happens:**
1. Goods arrive from supplier
2. User creates GRN against PO
3. Enter batch numbers and expiry dates
4. Verify quantities (accept/reject)
5. System creates stock movements
6. Medicine batches created/updated
7. PO status updated to "received" or "partially_received"

**Sample GRN Data:**
```
GRN Number: GRN-20260321-001
PO Reference: PO-20260321-001
Supplier: PharmaCorp
Received Items:
  ┌─────────────────────┬─────────────┬──────────┬────────────┬──────────┐
  │ Item                │ Qty Ordered │ Received │ Batch No   │ Expiry   │
  ├─────────────────────┼─────────────┼──────────┼────────────┼──────────┤
  │ Paracetamol 500mg   │ 100         │ 100 ✓    │ B-2026-001 │ 2028-03  │
  │ Ibuprofen 400mg     │ 50          │ 50 ✓     │ B-2026-002 │ 2028-06  │
  └─────────────────────┴─────────────┴──────────┴────────────┴──────────┘
Status: accepted
```

**Database Actions:**
```sql
-- 1. Insert GRN
INSERT INTO goods_receipt_notes (grn_number, purchase_order_id, supplier_id, status)
VALUES ('GRN-20260321-001', po_uuid, supplier_uuid, 'accepted');

-- 2. Insert GRN Items with batch details
INSERT INTO grn_items (grn_id, item_type, product_id, batch_number, expiry_date, quantity_accepted, unit_price)
VALUES 
  (grn_uuid, 'product', paracetamol_uuid, 'B-2026-001', '2028-03-21', 100, 3.00),
  (grn_uuid, 'product', ibuprofen_uuid, 'B-2026-002', '2028-06-15', 50, 4.00);

-- 3. Create Stock Movements (audit trail)
INSERT INTO stock_movements (item_type, product_id, movement_type, reference_type, reference_id, quantity, balance_after)
VALUES 
  ('product', paracetamol_uuid, 'stock_in', 'grn', grn_uuid, 100, 108),  -- 8 + 100 = 108
  ('product', ibuprofen_uuid, 'stock_in', 'grn', grn_uuid, 50, 75);       -- 25 + 50 = 75

-- 4. Create/Update Medicine Batches (for pharmacy dispensing)
INSERT INTO medicine_batches (medicine_id, product_id, batch_number, expiry_date, quantity, initial_quantity)
VALUES 
  (med_uuid, paracetamol_uuid, 'B-2026-001', '2028-03-21', 100, 100),
  (med_uuid, ibuprofen_uuid, 'B-2026-002', '2028-06-15', 50, 50);

-- 5. Update PO received quantities
UPDATE purchase_order_items SET quantity_received = 100 WHERE item_id = paracetamol_item_uuid;
UPDATE purchase_order_items SET quantity_received = 50 WHERE item_id = ibuprofen_item_uuid;

-- 6. Update PO status
UPDATE purchase_orders SET status = 'received' WHERE id = po_uuid;

-- 7. Update Stock Summary
UPDATE stock_summary 
SET total_stock = 108, 
    available_stock = 108,
    total_value = 324.00,  -- 108 * 3.00
    is_low_stock = false,
    total_batches = 2
WHERE product_id = paracetamol_uuid;
```

**Logs Generated:**
```
[INFO] GRN created: GRN-20260321-001 (total=500.00)
[INFO] Stock movement created: stock_in for Paracetamol (qty=100)
[INFO] Stock movement created: stock_in for Ibuprofen (qty=50)
[INFO] Medicine batch created: B-2026-001 for Paracetamol
[INFO] Medicine batch created: B-2026-002 for Ibuprofen
[INFO] PO status updated: PO-20260321-001 → received
[INFO] Stock summary synced for product: Paracetamol 500mg
```

---

### **Step 4: Stock Updated & Available** ✅

**What happens:**
- Stock summary shows new quantities
- Low stock alert disappears
- Products available for dispensing/sale

**Final State:**
```
┌─────────────────────┬──────────────┬──────────────┬─────────────┐
│ Product             │ Before GRN   │ After GRN    │ Change      │
├─────────────────────┼──────────────┼──────────────┼─────────────┤
│ Paracetamol 500mg   │ 8            │ 108          │ +100 ✓      │
│ Ibuprofen 400mg     │ 25           │ 75           │ +50 ✓       │
└─────────────────────┴──────────────┴──────────────┴─────────────┘

Low Stock Status:
  Paracetamol: false (was true)
  Ibuprofen: false (was false)
```

**Database Verification:**
```sql
-- Check stock summary
SELECT p.product_name, ss.available_stock, ss.is_low_stock, ss.total_value
FROM stock_summary ss
JOIN products p ON ss.product_id = p.id
WHERE p.product_name IN ('Paracetamol 500mg', 'Ibuprofen 400mg');

-- Result:
-- Paracetamol 500mg | 108 | false | 324.00
-- Ibuprofen 400mg   | 75  | false | 300.00

-- Check stock movements (audit trail)
SELECT movement_type, quantity, balance_after, created_at
FROM stock_movements
WHERE product_id = paracetamol_uuid
ORDER BY created_at DESC
LIMIT 5;

-- Result:
-- stock_in | 100 | 108 | 2026-03-21 14:30:00
-- dispensing | -2 | 8 | 2026-03-20 10:15:00
-- dispensing | -5 | 10 | 2026-03-19 16:45:00
```

---

## 🔄 Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     INVENTORY FLOW OVERVIEW                         │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐
  │ 1. LOW STOCK │
  │   DETECTED   │
  └──────┬───────┘
         │
         │ Alert generated
         │ is_low_stock = true
         │
         ▼
  ┌──────────────┐
  │ 2. CREATE PO │
  │   (Draft)    │
  └──────┬───────┘
         │
         │ Admin approves
         │ status = 'approved'
         │
         ▼
  ┌──────────────┐
  │ 3. RECEIVE   │
  │   GRN        │
  └──────┬───────┘
         │
         ├─────────────┬──────────────┬──────────────┐
         │             │              │              │
         ▼             ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │   STOCK  │  │  BATCH   │  │    PO    │  │  STOCK   │
  │ MOVEMENT │  │  CREATED │  │ UPDATED  │  │ SUMMARY  │
  └──────────┘  └──────────┘  └──────────┘  └──────────┘
         │             │              │              │
         │ movement_   │ batch_       │ quantity_    │ available_
         │ type =      │ number =     │ received =   │ stock =
         │ 'stock_in'  │ 'B-2026-001' │ 100          │ 108
         │             │              │              │
         └─────────────┴──────────────┴──────────────┘
                           │
                           ▼
                  ┌────────────────┐
                  │ 4. STOCK       │
                  │    AVAILABLE   │
                  │  is_low_stock  │
                  │    = false     │
                  └────────────────┘
```

---

## 📊 Key Tables & Their Roles

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `products` | Master catalog | `id`, `product_name`, `category`, `reorder_level` |
| `stock_summary` | Real-time stock levels | `product_id`, `available_stock`, `is_low_stock` |
| `purchase_orders` | Purchase orders | `po_number`, `supplier_id`, `status` |
| `purchase_order_items` | PO line items | `product_id`, `quantity_ordered`, `quantity_received` |
| `goods_receipt_notes` | Goods received | `grn_number`, `purchase_order_id`, `status` |
| `grn_items` | GRN line items with batches | `product_id`, `batch_number`, `expiry_date` |
| `stock_movements` | Audit trail | `movement_type`, `quantity`, `balance_after` |
| `medicine_batches` | Batch tracking for pharmacy | `batch_number`, `expiry_date`, `quantity` |

---

## 🔍 Common Queries

### Check current stock
```sql
SELECT p.product_name, ss.available_stock, ss.is_low_stock
FROM stock_summary ss
JOIN products p ON ss.product_id = p.id
WHERE p.category = 'medicine'
ORDER BY ss.available_stock ASC;
```

### View stock movements (audit trail)
```sql
SELECT 
  p.product_name,
  sm.movement_type,
  sm.quantity,
  sm.balance_after,
  sm.created_at
FROM stock_movements sm
JOIN products p ON sm.product_id = p.id
WHERE p.product_name = 'Paracetamol 500mg'
ORDER BY sm.created_at DESC;
```

### Track batch expiry
```sql
SELECT 
  p.product_name,
  mb.batch_number,
  mb.expiry_date,
  mb.quantity,
  (mb.expiry_date - CURRENT_DATE) as days_until_expiry
FROM medicine_batches mb
JOIN products p ON mb.product_id = p.id
WHERE mb.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
ORDER BY mb.expiry_date;
```

---

## ⚠️ Important Notes

1. **Every GRN acceptance creates:**
   - Stock movement record (audit trail)
   - Medicine batch (for pharmacy dispensing)
   - Stock summary update
   - PO status update

2. **Stock movements are immutable** - they are never deleted, only appended

3. **Batch tracking is critical** for:
   - Expiry management (FEFO: First Expiry, First Out)
   - Recall tracking
   - Quality control

4. **Products table is the master catalog** - all inventory operations should reference products

---

**Last Updated:** 21 March 2026  
**Version:** 1.0
