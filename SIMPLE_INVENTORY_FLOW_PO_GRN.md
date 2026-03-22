# Simple Inventory Flow Guide - PO & GRN

**Quick Reference:** Complete flow from Low Stock → PO → GRN → Stock Updated

---

## 🎭 User Roles & Permissions

| Role | Can Create PO | Can Approve PO | Can Create GRN | Can Verify GRN |
|------|--------------|----------------|----------------|----------------|
| **Admin** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes (own GRNs) |
| **Inventory Manager** | ✅ Yes | ❌ No | ✅ Yes | ❌ No (needs Admin) |
| **Pharmacist** | ❌ No | ❌ No | ✅ Yes | ✅ Yes (Admin only) |

---

## 📊 Complete Flow (Step-by-Step)

### **Scenario: Paracetamol stock is low (8 units, reorder level is 30)**

---

## **STEP 1: Low Stock Detected** 🚨

**URL:** `http://localhost:3000/inventory/low-stock`

**What You See:**
```
┌────────────────────────────────────────────────────────────┐
│ Low Stock Alerts                                           │
├────────────────────────────────────────────────────────────┤
│ ☑ Paracetamol 500mg                                        │
│   Current Stock: 8  |  Reorder Level: 30  |  CRITICAL     │
│   Suggested Order Qty: 120 strips                          │
└────────────────────────────────────────────────────────────┘
```

**Action:**
1. Toggle **"Use Products Catalog"** ON (top right)
2. Check the box next to "Paracetamol 500mg"
3. Click **"Create PO"** button

---

## **STEP 2: Create Purchase Order** 📝

**URL:** `http://localhost:3000/inventory/purchase-orders`

**PO Creation Form:**
```
┌────────────────────────────────────────────────────────────┐
│ Create Purchase Order                                      │
├────────────────────────────────────────────────────────────┤
│ Supplier: PharmaCorp ▼                                     │
│                                                            │
│ Items to Order:                                            │
│ ┌──────────────────┬─────────┬──────────┬───────────────┐ │
│ │ Item             │ Qty     │ Unit     │ Total         │ │
│ ├──────────────────┼─────────┼──────────┼───────────────┤ │
│ │ Paracetamol 500mg│ 120     │ ₹3.00    │ ₹360.00       │ │
│ └──────────────────┴─────────┴──────────┴───────────────┘ │
│                                                            │
│ Total: ₹360.00                                             │
│ Notes: Auto-generated reorder for low stock items         │
└────────────────────────────────────────────────────────────┘
```

**Action:**
1. Select Supplier: **PharmaCorp**
2. Review items (auto-filled from low stock)
3. Click **"Create Purchase Order"**

**Result:**
```
✅ Purchase Order Created!
PO Number: PO-20260321-0010
Status: draft
Total: ₹360.00
```

---

## **STEP 3: Approve Purchase Order** ✅

**URL:** `http://localhost:3000/inventory/purchase-orders`

**What You See:**
```
┌────────────────────────────────────────────────────────────┐
│ Purchase Orders                                            │
├────────────────────────────────────────────────────────────┤
│ PO-20260321-0010 | PharmaCorp | ₹360.00 | [draft]         │
│   Items: Paracetamol 500mg (120 strips)                   │
│   [Submit] [Approve] [Cancel]                             │
└────────────────────────────────────────────────────────────┘
```

**Action (Admin User):**
1. Click on PO number to open details
2. Change status: **draft → submitted → approved**
   - Or click "Approve" button directly

**Result:**
```
✅ PO Approved!
PO Number: PO-20260321-0010
Status: approved
Ready for GRN creation
```

---

## **STEP 4: Create Goods Receipt Note (GRN)** 📦

**URL:** `http://localhost:3000/inventory/grns`

**GRN Creation Form:**
```
┌────────────────────────────────────────────────────────────┐
│ Create Goods Receipt Note                                  │
├────────────────────────────────────────────────────────────┤
│ Reference PO: PO-20260321-0010 ▼                          │
│ Supplier: PharmaCorp (auto-filled)                        │
│ Invoice No: INV-PC-2026-0123                              │
│ Invoice Date: 2026-03-21                                  │
│                                                            │
│ Received Items:                                            │
│ ┌──────────────────┬─────────┬──────────┬───────────────┐ │
│ │ Item             │ Ordered │ Received │ Batch/Expiry  │ │
│ ├──────────────────┼─────────┼──────────┼───────────────┤ │
│ │ Paracetamol 500mg│ 120     │ [120]    │ B-2026-001    │ │
│ │                  │         │          │ Exp: 2028-03  │ │
│ └──────────────────┴─────────┴──────────┴───────────────┘ │
│                                                            │
│ [Create GRN]                                               │
└────────────────────────────────────────────────────────────┘
```

**Action:**
1. Select PO: **PO-20260321-0010**
2. Enter Invoice Number: **INV-PC-2026-0123**
3. Enter Batch Details:
   - Batch Number: **B-2026-001**
   - Expiry Date: **2028-03-21**
   - Quantity Received: **120** (matches ordered)
4. Click **"Create GRN"**

**Result:**
```
✅ GRN Created!
GRN Number: GRN-20260321-0006
Status: pending
Items: Paracetamol 500mg (120 strips, Batch B-2026-001)
```

---

## **STEP 5: Verify/Accept GRN** ✔️

**URL:** `http://localhost:3000/inventory/grns`

**GRN Details View:**
```
┌────────────────────────────────────────────────────────────┐
│ GRN-20260321-0006                                          │
├────────────────────────────────────────────────────────────┤
│ PO Reference: PO-20260321-0010                            │
│ Supplier: PharmaCorp                                       │
│ Status: pending                                            │
│ Created By: inventory_manager                              │
│                                                            │
│ Received Items:                                            │
│ ┌──────────────────┬─────────┬──────────┬───────────────┐ │
│ │ Item             │ Qty     │ Batch    │ Expiry        │ │
│ ├──────────────────┼─────────┼──────────┼───────────────┤ │
│ │ Paracetamol 500mg│ 120     │ B-2026-001│ 2028-03-21   │ │
│ └──────────────────┴─────────┴──────────┴───────────────┘ │
│                                                            │
│ Actions: [Accept] [Reject]                                 │
└────────────────────────────────────────────────────────────┘
```

**Action (Admin User):**
1. Click on GRN number to open details
2. Review items and batch details
3. Click **"Accept"** button
4. Confirm verification

**⚠️ If You Get Segregation Error:**
```
❌ Segregation of duties violation
```
**Solution:** Login as **Admin** user (not the user who created GRN)

**Result:**
```
✅ GRN Accepted!
GRN Number: GRN-20260321-0006
Status: accepted
Stock movements created
Medicine batches updated
PO status updated to "received"
```

---

## **STEP 6: Verify Stock Updated** 📊

**URL:** `http://localhost:3000/inventory/products`

**What You See:**
```
┌────────────────────────────────────────────────────────────┐
│ Products Catalog                                           │
├────────────────────────────────────────────────────────────┤
│ Paracetamol 500mg                                          │
│   Current Stock: 128  (was 8)  ✅ INCREASED               │
│   Min: 10 | Reorder: 30 | Max: 500                        │
│   Status: Active (Green)                                   │
└────────────────────────────────────────────────────────────┘
```

**Verify Stock Movement:**

**URL:** `http://localhost:3000/inventory/stock-movements`

```
┌────────────────────────────────────────────────────────────┐
│ Stock Movements                                            │
├────────────────────────────────────────────────────────────┤
│ Paracetamol 500mg | stock_in | +120 | Balance: 128       │
│   Reference: GRN-20260321-0006                            │
│   Date: 2026-03-21 14:30                                  │
└────────────────────────────────────────────────────────────┘
```

---

## 📋 Sample Data Summary

### **Test Data to Enter:**

| Step | Field | Value |
|------|-------|-------|
| **PO Creation** | Supplier | PharmaCorp |
| | Items | Paracetamol 500mg (120 strips) |
| | Total | ₹360.00 |
| **GRN Creation** | Invoice No | INV-PC-2026-0123 |
| | Batch Number | B-2026-001 |
| | Expiry Date | 2028-03-21 |
| | Quantity | 120 |
| **GRN Verification** | Action | Accept |
| | Verified By | Admin user |

---

## 🔄 Quick Test Checklist

```
□ 1. Go to Low Stock page
□ 2. Select Paracetamol, create PO
□ 3. Approve PO (as Admin)
□ 4. Create GRN against PO
□ 5. Verify GRN (as Admin)
□ 6. Check Products page - stock increased
□ 7. Check Stock Movements - new entry created
```

---

## 🎯 Expected Results

### **Before GRN:**
```
Paracetamol 500mg: 8 units (LOW STOCK 🔴)
```

### **After GRN Accepted:**
```
Paracetamol 500mg: 128 units (ADEQUATE ✅)
Stock Movement: +120 units (stock_in)
Batch Created: B-2026-001 (Expiry: 2028-03-21)
PO Status: received
```

---

## ⚠️ Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Unknown Item" in GRN | Restart backend, ensure frontend sends `item_name` |
| Segregation error | Login as Admin to verify GRN |
| Stock not updating | Check GRN status is "accepted" not "pending" |
| PO not showing in GRN | Ensure PO status is "approved" |

---

## 📖 Database Verification (Optional)

```sql
-- Check PO status
SELECT po_number, status, total_amount 
FROM purchase_orders 
WHERE po_number = 'PO-20260321-0010';

-- Check GRN status
SELECT grn_number, status, verified_by 
FROM goods_receipt_notes 
WHERE grn_number = 'GRN-20260321-0006';

-- Check stock movement
SELECT movement_type, quantity, balance_after 
FROM stock_movements 
WHERE reference_id = (SELECT id FROM goods_receipt_notes WHERE grn_number = 'GRN-20260321-0006');

-- Check product stock
SELECT product_name, available_stock, is_low_stock 
FROM stock_summary ss
JOIN products p ON ss.product_id = p.id
WHERE p.product_name = 'Paracetamol 500mg';
```

---

**Last Updated:** 21 March 2026  
**Version:** 1.0 (Simple Flow)
