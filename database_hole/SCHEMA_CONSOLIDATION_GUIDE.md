# Database Schema Consolidation - Implementation Guide

**Date:** 22 March 2026  
**Task:** Consolidate migrations 05-10 into 01_schema.sql and 02_seed_data.sql

---

## Part 1: Update 01_schema.sql

### 1.1 Update `purchase_order_items` Table (Line ~1114)

**Find:**
```sql
CREATE TABLE purchase_order_items (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID          NOT NULL REFERENCES purchase_orders(id),
    item_type         VARCHAR(20)   NOT NULL,
    item_id           UUID          NOT NULL,
    quantity_ordered  INTEGER       NOT NULL,
    quantity_received INTEGER       DEFAULT 0,
    unit_price        DECIMAL(12,2) NOT NULL,
    total_price       DECIMAL(12,2) NOT NULL,
    created_at        TIMESTAMPTZ   DEFAULT NOW()
);
```

**Replace with:**
```sql
CREATE TABLE purchase_order_items (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID          NOT NULL REFERENCES purchase_orders(id),
    item_type         VARCHAR(50)   NOT NULL,
    item_id           UUID,                      -- Nullable for manual entries
    product_id        UUID          REFERENCES products(id),
    item_name         VARCHAR(200)  NOT NULL,
    quantity_ordered  INTEGER       NOT NULL,
    quantity_received INTEGER       DEFAULT 0,
    unit_price        DECIMAL(12,2) NOT NULL,
    total_price       DECIMAL(12,2) NOT NULL,
    created_at        TIMESTAMPTZ   DEFAULT NOW()
);
```

---

### 1.2 Update `grn_items` Table (Line ~1157)

**Find:**
```sql
CREATE TABLE grn_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id            UUID NOT NULL REFERENCES goods_receipt_notes(id),
    item_type         VARCHAR(20) NOT NULL,
    item_id           UUID NOT NULL,
    batch_number      VARCHAR(50),
    manufactured_date DATE,
    expiry_date       DATE,
    quantity_received INTEGER NOT NULL,
    quantity_accepted INTEGER,
    quantity_rejected INTEGER DEFAULT 0,
    unit_price        DECIMAL(12,2) NOT NULL,
    total_price       DECIMAL(12,2) NOT NULL,
    rejection_reason  VARCHAR(255),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

**Replace with:**
```sql
CREATE TABLE grn_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id            UUID NOT NULL REFERENCES goods_receipt_notes(id),
    item_type         VARCHAR(50) NOT NULL,
    item_id           UUID,                      -- Nullable for manual entries
    product_id        UUID REFERENCES products(id),
    item_name         VARCHAR(200) NOT NULL,
    batch_number      VARCHAR(50),
    manufactured_date DATE,
    expiry_date       DATE,
    quantity_received INTEGER NOT NULL,
    quantity_accepted INTEGER,
    quantity_rejected INTEGER DEFAULT 0,
    unit_price        DECIMAL(12,2) NOT NULL,
    total_price       DECIMAL(12,2) NOT NULL,
    rejection_reason  VARCHAR(255),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 1.3 Update `stock_movements` Table (Line ~1196)

**Find:**
```sql
CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    item_type       VARCHAR(20) NOT NULL,
    item_id         UUID NOT NULL,
    batch_id        UUID,
    movement_type   VARCHAR(20) NOT NULL,
    reference_type  VARCHAR(30),
    reference_id    UUID,
    quantity        INTEGER NOT NULL,
    balance_after   INTEGER NOT NULL,
    unit_cost       DECIMAL(12,2),
    notes           VARCHAR(255),
    performed_by    UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Replace with:**
```sql
CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    item_type       VARCHAR(50) NOT NULL,
    item_id         UUID,                      -- Nullable for manual entries
    product_id      UUID REFERENCES products(id),
    batch_id        UUID,
    movement_type   VARCHAR(20) NOT NULL,
    reference_type  VARCHAR(30),
    reference_id    UUID,
    quantity        INTEGER NOT NULL,
    balance_after   INTEGER NOT NULL,
    unit_cost       DECIMAL(12,2),
    notes           VARCHAR(255),
    performed_by    UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 1.4 Update `stock_adjustments` Table (Line ~1235)

**Find:**
```sql
CREATE TABLE stock_adjustments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id       UUID NOT NULL REFERENCES hospitals(id),
    adjustment_number VARCHAR(30) NOT NULL UNIQUE,
    item_type         VARCHAR(20) NOT NULL,
    item_id           UUID NOT NULL,
    batch_id          UUID,
    adjustment_type   VARCHAR(20) NOT NULL,
    quantity          INTEGER NOT NULL,
    reason            VARCHAR(255) NOT NULL,
    approved_by       UUID REFERENCES users(id),
    status            VARCHAR(20) DEFAULT 'pending',
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

**Replace with:**
```sql
CREATE TABLE stock_adjustments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id       UUID NOT NULL REFERENCES hospitals(id),
    adjustment_number VARCHAR(30) NOT NULL UNIQUE,
    item_type         VARCHAR(50) NOT NULL,
    item_id           UUID,                      -- Nullable for manual entries
    product_id        UUID REFERENCES products(id),
    batch_id          UUID,
    adjustment_type   VARCHAR(20) NOT NULL,
    quantity          INTEGER NOT NULL,
    reason            VARCHAR(255) NOT NULL,
    approved_by       UUID REFERENCES users(id),
    status            VARCHAR(20) DEFAULT 'pending',
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 1.5 Update `cycle_count_items` Table (Line ~1274)

**Find:**
```sql
CREATE TABLE cycle_count_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_count_id    UUID NOT NULL REFERENCES cycle_counts(id),
    item_type         VARCHAR(20) NOT NULL,
    item_id           UUID NOT NULL,
    batch_id          UUID,
    system_quantity   INTEGER NOT NULL,
    counted_quantity  INTEGER NOT NULL,
    variance          INTEGER NOT NULL,
    variance_reason   VARCHAR(255),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

**Replace with:**
```sql
CREATE TABLE cycle_count_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_count_id    UUID NOT NULL REFERENCES cycle_counts(id),
    item_type         VARCHAR(50) NOT NULL,
    item_id           UUID,                      -- Nullable for manual entries
    product_id        UUID REFERENCES products(id),
    batch_id          UUID,
    system_quantity   INTEGER NOT NULL,
    counted_quantity  INTEGER NOT NULL,
    variance          INTEGER NOT NULL,
    variance_reason   VARCHAR(255),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 1.6 Update `medicine_batches` Table (Line ~1078)

**Find:**
```sql
CREATE TABLE medicine_batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id     UUID NOT NULL REFERENCES medicines(id),
    batch_number    VARCHAR(50) NOT NULL,
    grn_id          UUID REFERENCES goods_receipt_notes(id),
    manufactured_date DATE,
    expiry_date     DATE NOT NULL,
    purchase_price  DECIMAL(12,2),
    selling_price   DECIMAL(12,2),
    initial_quantity INTEGER NOT NULL,
    current_quantity INTEGER NOT NULL,
    is_expired      BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (medicine_id, batch_number)
);
```

**Replace with:**
```sql
CREATE TABLE medicine_batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id     UUID NOT NULL REFERENCES medicines(id),
    product_id      UUID REFERENCES products(id),
    batch_number    VARCHAR(50) NOT NULL,
    grn_id          UUID REFERENCES goods_receipt_notes(id),
    manufactured_date DATE,
    expiry_date     DATE NOT NULL,
    purchase_price  DECIMAL(12,2),
    selling_price   DECIMAL(12,2),
    initial_quantity INTEGER NOT NULL,
    current_quantity INTEGER NOT NULL,
    is_expired      BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (medicine_id, batch_number)
);
```

---

### 1.7 Add Indexes (End of 01_schema.sql, before final comments)

**Add after all table definitions:**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes for product_id columns (from 08_link_products_with_inventory.sql)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_product_id ON grn_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_product_id ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_cycle_count_items_product_id ON cycle_count_items(product_id);
CREATE INDEX IF NOT EXISTS idx_medicine_batches_product_id ON medicine_batches(product_id);
```

---

### 1.8 Add Views (End of 01_schema.sql, after indexes)

**Add after indexes:**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Inventory Views (from 08_link_products_with_inventory.sql)
-- ─────────────────────────────────────────────────────────────────────────────

-- View: Purchase Orders with Product Details
CREATE OR REPLACE VIEW v_purchase_orders_with_products AS
SELECT
    po.id,
    po.po_number,
    po.hospital_id,
    po.supplier_id,
    s.name AS supplier_name,
    po.order_date,
    po.expected_delivery_date,
    po.status,
    po.total_amount,
    po.notes,
    po.created_by,
    po.approved_by,
    po.created_at,
    po.updated_at,
    poi.id AS item_id,
    poi.item_type,
    poi.item_id AS catalog_item_id,
    poi.product_id,
    p.product_name,
    p.generic_name,
    p.category,
    p.sku,
    p.barcode,
    poi.item_name,
    poi.quantity_ordered,
    poi.quantity_received,
    poi.unit_price,
    poi.total_price AS item_total
FROM purchase_orders po
JOIN suppliers s ON po.supplier_id = s.id
LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
LEFT JOIN products p ON poi.product_id = p.id
ORDER BY po.created_at DESC;

-- View: GRNs with Product Details
CREATE OR REPLACE VIEW v_grns_with_products AS
SELECT
    grn.id,
    grn.grn_number,
    grn.hospital_id,
    grn.purchase_order_id,
    grn.supplier_id,
    s.name AS supplier_name,
    grn.receipt_date,
    grn.invoice_number,
    grn.invoice_date,
    grn.total_amount,
    grn.status,
    grn.verified_by,
    grn.notes,
    grn.created_by,
    grn.created_at,
    grn.updated_at,
    grni.id AS grn_item_id,
    grni.item_type,
    grni.item_id AS catalog_item_id,
    grni.product_id,
    p.product_name,
    p.generic_name,
    p.category,
    grni.item_name,
    grni.batch_number,
    grni.expiry_date,
    grni.quantity_received,
    grni.quantity_accepted,
    grni.quantity_rejected,
    grni.unit_price,
    grni.total_price AS item_total
FROM goods_receipt_notes grn
JOIN suppliers s ON grn.supplier_id = s.id
LEFT JOIN grn_items grni ON grn.id = grni.grn_id
LEFT JOIN products p ON grni.product_id = p.id
ORDER BY grn.created_at DESC;

-- View: Stock Movements with Product Details
CREATE OR REPLACE VIEW v_stock_movements_with_products AS
SELECT
    sm.id,
    sm.hospital_id,
    sm.item_type,
    sm.item_id AS catalog_item_id,
    sm.product_id,
    COALESCE(p.product_name, sm.item_name) AS product_name,
    COALESCE(p.generic_name, sm.item_name) AS generic_name,
    COALESCE(p.category, sm.item_type) AS category,
    p.sku,
    p.barcode,
    sm.batch_id,
    sm.movement_type,
    sm.reference_type,
    sm.reference_id,
    sm.quantity,
    sm.balance_after,
    sm.unit_cost,
    (sm.quantity * COALESCE(sm.unit_cost, 0)) AS total_cost,
    sm.notes,
    sm.performed_by,
    sm.created_at
FROM stock_movements sm
LEFT JOIN products p ON sm.product_id = p.id
ORDER BY sm.created_at DESC;

-- View: Low Stock Products
CREATE OR REPLACE VIEW v_low_stock_products AS
SELECT
    p.id AS product_id,
    p.product_name,
    p.generic_name,
    p.category,
    p.subcategory,
    p.sku,
    p.barcode,
    p.purchase_price,
    p.selling_price,
    p.mrp,
    p.reorder_level,
    p.min_stock_level,
    p.max_stock_level,
    ss.total_stock,
    ss.available_stock,
    ss.total_value,
    ss.is_low_stock,
    ss.is_expiring_soon,
    ss.earliest_expiry,
    s.name AS supplier_name,
    s.contact_person,
    s.phone AS supplier_phone,
    s.email AS supplier_email
FROM products p
JOIN stock_summary ss ON p.id = ss.product_id
LEFT JOIN suppliers s ON p.supplier_id = s.id
WHERE p.is_active = true
  AND p.is_deleted = false
  AND ss.is_low_stock = true
ORDER BY ss.available_stock ASC;

-- View: Expiring Products
CREATE OR REPLACE VIEW v_expiring_products AS
SELECT
    p.id AS product_id,
    p.product_name,
    p.generic_name,
    p.category,
    p.sku,
    p.shelf_life_days,
    mb.batch_number,
    mb.expiry_date,
    mb.current_quantity AS current_quantity,
    mb.purchase_price,
    mb.selling_price,
    (mb.expiry_date - CURRENT_DATE) AS days_until_expiry,
    CASE
        WHEN mb.expiry_date < CURRENT_DATE THEN 'expired'
        WHEN mb.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical'
        WHEN mb.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'warning'
        ELSE 'normal'
    END AS expiry_status
FROM products p
JOIN medicine_batches mb ON p.id = mb.product_id
WHERE p.is_active = true
  AND p.is_deleted = false
  AND mb.is_active = true
  AND mb.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
ORDER BY mb.expiry_date ASC;
```

---

## Part 2: Update 02_seed_data.sql

### 2.1 Update Medicines Section (Line ~470)

**Find the medicines INSERT and ensure all have SKU:**

```sql
INSERT INTO medicines (id, hospital_id, name, generic_name, category, manufacturer, strength, unit_of_measure, units_per_pack, selling_price, purchase_price, tax_config_id, reorder_level, sku)
VALUES
    ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'Paracetamol 500mg', 'Paracetamol', 'tablet', 'PharmaCorp', '500mg', 'strip', 10,
     5.00, 3.00, 'd0000000-0000-0000-0000-000000000005', 50, 'MED-TAB-PARACETAMOL500-001'),
    -- ... all other medicines with SKUs
```

**Note:** This is already updated in the current file.

---

### 2.2 Add Products Section (After section 18, as section 19)

**Add after prescriptions section:**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 19. PRODUCTS & STOCK SUMMARY
-- ─────────────────────────────────────────────────────────────────────────────

-- 19.1 Medicine Products (linked to medicines table)
INSERT INTO products (id, hospital_id, product_name, generic_name, brand_name, category, subcategory, sku, barcode, manufacturer, supplier_id, purchase_price, selling_price, mrp, tax_percentage, unit_type, pack_size, min_stock_level, max_stock_level, reorder_level, storage_conditions, shelf_life_days, requires_prescription, is_active, created_by)
VALUES
    ('60000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'Paracetamol 500mg', 'Paracetamol', 'Calpol', 'medicine', 'tablet',
     'MED-TAB-001', '8901234567890', 'GlaxoSmithKline', 'a1000000-0000-0000-0000-000000000001',
     3.00, 5.00, 5.50, 5.00, 'strip', 10, 50, 500, 100, 'Store in cool dry place', 730, false, true,
     '10000000-0000-0000-0000-000000000010'),
    -- [Continue with all 52 products from 07_seed_products.sql]
```

**Note:** Due to file size, copy all INSERT statements from `07_seed_products.sql` section 1.

---

## Summary

### Files to Update:
1. ✅ `01_schema.sql` - Add columns, indexes, and views
2. ✅ `02_seed_data.sql` - Add products section

### Files to Keep (for existing databases):
- ✅ `05_add_item_name_columns.sql`
- ✅ `07_seed_products.sql`
- ✅ `08_link_products_with_inventory.sql`
- ✅ `09_update_medicine_skus.sql`
- ✅ `10_sync_medicine_skus_to_products.sql`

### Files to Remove:
- ❌ `06_add_product_stock_tables.sql` (already in 01_schema.sql)

---

**Status:** ✅ **READY** - Implementation guide created
