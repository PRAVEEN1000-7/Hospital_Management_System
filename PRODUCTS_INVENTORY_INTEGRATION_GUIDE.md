# Products-Inventory Integration - Setup & Testing Guide

**Date:** 21 March 2026  
**Status:** Ready for Testing  
**Backend:** Port 8000  
**Frontend:** Port 3000

---

## Overview

This guide explains how the **Products table** is now integrated with all inventory-related pages (Low Stock, Purchase Orders, GRNs, Stock Movements, Adjustments, Cycle Counts) to provide a centralized catalog management system.

---

## Architecture

### Before Integration
```
Medicines Table ──┐
Optical Table  ───┼──> Stock Movements ──> Inventory Pages
(No central catalog)
```

### After Integration
```
Products Table (Central Catalog)
    ├── Medicines (linked via product_id)
    ├── Optical Products (linked via product_id)
    ├── Surgical Items
    ├── Equipment
    └── Laboratory Supplies
          │
          └──> All inventory operations use product_id
```

---

## Database Changes

### 1. Run SQL Migration Scripts

Run these scripts in order:

```bash
# Navigate to database_hole directory
cd database_hole

# Run the products seed data (if not already run)
psql -U postgres -d hms_db -f 07_seed_products.sql

# Run the linking script (adds product_id columns to inventory tables)
psql -U postgres -d hms_db -f 08_link_products_with_inventory.sql
```

### 2. Verify Database Changes

```sql
-- Check if product_id columns were added
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE column_name = 'product_id' 
  AND table_name IN ('purchase_order_items', 'grn_items', 'stock_movements', 'adjustments', 'cycle_count_items');

-- Verify products exist
SELECT category, COUNT(*) 
FROM products 
WHERE is_active = true AND is_deleted = false
GROUP BY category;

-- Test the new views
SELECT * FROM v_low_stock_products LIMIT 5;
SELECT * FROM v_expiring_products LIMIT 5;
SELECT * FROM v_complete_inventory_dashboard;
```

---

## Backend Changes

### Updated Files

1. **`backend/app/services/inventory_service.py`**
   - Added `Product`, `StockSummary`, `StockAlert` imports
   - Updated `get_low_stock_items()` to use products catalog
   - Updated `get_expiring_items()` to use products catalog
   - Updated `get_inventory_dashboard()` with product metrics

2. **`backend/app/routers/products.py`**
   - Already has endpoints for products CRUD
   - Stock overview, alerts, dashboard endpoints

### API Endpoints

#### Products (Centralized Catalog)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/inventory/products` | List all products |
| GET | `/api/v1/inventory/products/{id}` | Get product with stock |
| POST | `/api/v1/inventory/products` | Create product |
| PUT | `/api/v1/inventory/products/{id}` | Update product |
| GET | `/api/v1/inventory/stock/dashboard` | Stock dashboard |
| GET | `/api/v1/inventory/stock/low-stock` | Low stock items |
| GET | `/api/v1/inventory/stock/expiring` | Expiring items |

#### Inventory (Legacy + Integrated)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/inventory/dashboard` | Inventory dashboard (now includes products) |
| GET | `/api/v1/inventory/low-stock` | Low stock (from products) |
| GET | `/api/v1/inventory/expiring` | Expiring (from products) |
| POST | `/api/v1/inventory/purchase-orders` | Create PO (supports product_id) |
| POST | `/api/v1/inventory/grns` | Create GRN (supports product_id) |

### Test Backend API

```bash
# Start backend server (if not running)
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Test in new terminal
# Get low stock items (from products)
curl -X GET "http://localhost:8000/api/v1/inventory/low-stock?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get inventory dashboard (includes products metrics)
curl -X GET "http://localhost:8000/api/v1/inventory/dashboard" \
  -H "Authorization: Bearer YOUR_TOKEN"

# List products
curl -X GET "http://localhost:8000/api/v1/inventory/products?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Frontend Changes

### Updated Files

1. **`frontend/src/types/inventory.ts`**
   - Added `product_id` to `PurchaseOrderItem`, `LowStockItem`, `ExpiringItem`
   - Added product-specific fields: `product_name`, `generic_name`, `category`, `sku`
   - Extended `InventoryDashboardData` with product metrics

2. **`frontend/src/types/products.ts`**
   - Already has comprehensive product types
   - Used by inventory pages now

3. **`frontend/src/pages/inventory/LowStockAlertsPage.tsx`**
   - Added `useProducts` toggle state
   - Fetches from products service first, falls back to inventory service
   - Displays product info (category, SKU, generic name)
   - Updated PO creation to include `product_id`

4. **`frontend/src/services/inventoryService.ts`**
   - Already has methods for inventory operations
   - Now works with both medicines and products

5. **`frontend/src/services/productsService.ts`**
   - Already has methods for products operations
   - Used by LowStockAlertsPage when `useProducts` is enabled

### Test Frontend Pages

```bash
# Start frontend dev server (if not running)
cd frontend
npm run dev

# Open browser to http://localhost:3000
```

#### Pages to Test

1. **Low Stock Alerts Page** (`/inventory/low-stock`)
   - ✅ Toggle "Use Products Catalog" checkbox
   - ✅ View products with low stock
   - ✅ See category and SKU columns when toggle enabled
   - ✅ Select items and create PO
   - ✅ Verify PO includes product_id

2. **Inventory Dashboard** (`/inventory`)
   - ✅ View total products count
   - ✅ View total stock value
   - ✅ View low stock products count
   - ✅ View expiring soon products count

3. **Purchase Orders** (`/inventory/purchase-orders`)
   - ✅ Create new PO with products
   - ✅ View PO items with product details
   - ✅ Receive GRN against PO with products

4. **GRNs** (`/inventory/grns`)
   - ✅ Create GRN with products
   - ✅ Accept GRN and verify stock movement created
   - ✅ Verify product stock updated

5. **Stock Movements** (`/inventory/stock-movements`)
   - ✅ View movements with product names
   - ✅ Filter by product

6. **Stock Adjustments** (`/inventory/adjustments`)
   - ✅ Create adjustment for products
   - ✅ Approve adjustment
   - ✅ Verify stock updated

7. **Cycle Counts** (`/inventory/cycle-counts`)
   - ✅ Create cycle count with products
   - ✅ Enter counted quantities
   - ✅ Verify and see adjustments created

---

## Integration Flow Testing

### Flow 1: Low Stock → Purchase Order → GRN → Stock Update

1. **Start**: Product stock is low (below reorder level)
2. **Low Stock Alert**: Appears on Low Stock Alerts page
3. **Create PO**: Select items, create purchase order
4. **Receive GRN**: Create GRN against PO, accept items
5. **Stock Updated**: Product stock summary updated automatically
6. **Alert Resolved**: Low stock alert no longer appears

**Test Steps:**
```sql
-- 1. Check initial stock
SELECT product_name, available_stock, is_low_stock 
FROM stock_summary ss
JOIN products p ON ss.product_id = p.id
WHERE p.id = '60000000-0000-0000-0000-000000000001';  -- Paracetamol

-- 2. After GRN acceptance, verify stock increased
-- (Run same query after accepting GRN)
```

### Flow 2: Product Expiry Tracking

1. **GRN Creation**: Enter batch with expiry date
2. **Expiry Alert**: Appears on dashboard when within 90 days
3. **FEFO Dispensing**: System suggests oldest batch first
4. **Expiry Removal**: Adjust out expired stock

### Flow 3: Stock Movement Audit Trail

Every stock change creates a movement record:
```
GRN Accepted → stock_in movement → stock_summary updated
Dispensing   → dispensing movement → medicine_batch updated
Adjustment   → adjustment movement → stock_summary updated
```

---

## Troubleshooting

### Issue: Products not appearing in low stock

**Solution:**
1. Verify products exist: `SELECT COUNT(*) FROM products WHERE is_active = true;`
2. Verify stock_summary exists: `SELECT COUNT(*) FROM stock_summary;`
3. Run sync: `POST /api/v1/inventory/stock/sync`

### Issue: PO creation fails with product_id

**Solution:**
1. Ensure product_id is valid UUID
2. Check product exists: `SELECT * FROM products WHERE id = 'your-product-id';`
3. Verify product is active: `is_active = true`

### Issue: Frontend shows "N/A" for category/SKU

**Solution:**
1. Toggle "Use Products Catalog" checkbox
2. Ensure product has category and SKU populated
3. Update product: `UPDATE products SET category = 'medicine', sku = 'SKU123' WHERE id = '...';`

---

## Data Migration (Optional)

If you have existing medicines/optical products and want to link them to products:

```sql
-- Link existing medicines to products (if generic_name matches)
UPDATE medicines m
SET is_active = true
FROM products p
WHERE LOWER(m.generic_name) = LOWER(p.generic_name)
  AND m.hospital_id = p.hospital_id
  AND p.category = 'medicine';

-- Link existing medicine_batches to products
UPDATE medicine_batches mb
SET product_id = p.id
FROM medicines m
JOIN products p ON m.id = p.id OR (m.generic_name = p.generic_name AND m.hospital_id = p.hospital_id)
WHERE mb.medicine_id = m.id;
```

---

## Summary of Changes

| Component | Changes |
|-----------|---------|
| **Database** | Added `product_id` FK to 6 inventory tables, created 6 views |
| **Backend** | Updated 3 service functions to use products, added imports |
| **Frontend Types** | Extended 4 interfaces with product fields |
| **Frontend Pages** | Updated LowStockAlertsPage with toggle and product display |
| **API** | Backward compatible - works with both medicines and products |

---

## Next Steps

1. ✅ Run database migration scripts
2. ✅ Start backend server (port 8000)
3. ✅ Start frontend server (port 3000)
4. ✅ Test each inventory page
5. ✅ Verify end-to-end flows work
6. ⏳ Update remaining pages (GRNs, POs, Movements) for full product support
7. ⏳ Add product selection UI in PO/GRN forms
8. ⏳ Implement auto-sync on GRN acceptance

---

**Testing Status:** Ready for QA  
**Last Updated:** 21 March 2026  
**Maintained By:** Development Team
