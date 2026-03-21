# Database Migration Consolidation Plan

**Date:** 22 March 2026  
**Purpose:** Consolidate migrations 05-10 into main schema (01) and seed data (02)

---

## Migration Files Review

### File 05: `05_add_item_name_columns.sql`
**Purpose:** Add `item_name` columns to inventory tables

**Changes:**
- ✅ Add `item_name VARCHAR(200)` to `purchase_order_items`
- ✅ Add `item_name VARCHAR(200)` to `grn_items`
- ✅ Add `item_name VARCHAR(200)` to `stock_movements`
- ✅ Add `item_name VARCHAR(200)` to `stock_adjustments`
- ✅ Add `item_name VARCHAR(200)` to `cycle_count_items`
- ✅ Make `item_id` nullable in all above tables
- ✅ Update `item_type` to `VARCHAR(50)` in all above tables

**Action:** ✅ Consolidate into 01_schema.sql

---

### File 06: `06_add_product_stock_tables.sql`
**Status:** ❌ File not found (already integrated in 01_schema.sql)

**Action:** Skip - tables already exist in 01_schema.sql

---

### File 07: `07_seed_products.sql`
**Purpose:** Seed products table with comprehensive data

**Changes:**
- ✅ Seed 52 products (medicines, optical, surgical, laboratory, equipment)
- ✅ Seed stock_summary records
- ✅ Seed stock_alerts records

**Action:** ✅ Consolidate into 02_seed_data.sql as new section 19

---

### File 08: `08_link_products_with_inventory.sql`
**Purpose:** Add product_id FKs and create views

**Changes:**
- ✅ Add `product_id UUID` FK to:
  - `purchase_order_items`
  - `grn_items`
  - `stock_movements`
  - `stock_adjustments`
  - `cycle_count_items`
  - `medicine_batches`
- ✅ Create indexes on all product_id columns
- ✅ Update medicine_batches to link with products
- ✅ Create 7 views:
  - `v_purchase_orders_with_products`
  - `v_grns_with_products`
  - `v_stock_movements_with_products`
  - `v_adjustments_with_products`
  - `v_cycle_counts_with_products`
  - `v_low_stock_products`
  - `v_expiring_products`
  - `v_complete_inventory_dashboard`
- ✅ Create function `link_medicine_with_product()`

**Action:** 
- ✅ Consolidate ALTER TABLE into 01_schema.sql (column definitions)
- ✅ Consolidate views into 01_schema.sql (end of file)
- ✅ Keep 08_link_products_with_inventory.sql for existing databases

---

### File 09: `09_update_medicine_skus.sql`
**Purpose:** Update missing SKUs for medicines and sync to products

**Changes:**
- ✅ Update medicines with missing SKUs
- ✅ Sync SKUs to products table
- ✅ Verification queries

**Action:**
- ✅ Update 02_seed_data.sql to include SKUs for all medicines
- ✅ Keep 09_update_medicine_skus.sql for existing databases

---

### File 10: `10_sync_medicine_skus_to_products.sql`
**Purpose:** Sync medicine SKUs to products table only

**Changes:**
- ✅ Update product SKUs from medicines
- ✅ Verification queries

**Action:**
- ✅ Keep 10_sync_medicine_skus_to_products.sql for existing databases

---

## Consolidation Plan

### Step 1: Update 01_schema.sql

**Add to existing table definitions:**

1. **purchase_order_items** (Line ~1114):
   ```sql
   item_name VARCHAR(200) NOT NULL,
   item_type VARCHAR(50) NOT NULL,
   item_id UUID,  -- nullable
   product_id UUID REFERENCES products(id),
   ```

2. **grn_items** (Line ~1157):
   ```sql
   item_name VARCHAR(200) NOT NULL,
   item_type VARCHAR(50) NOT NULL,
   item_id UUID,  -- nullable
   product_id UUID REFERENCES products(id),
   ```

3. **stock_movements** (Line ~1196):
   ```sql
   item_name VARCHAR(200),
   item_type VARCHAR(50) NOT NULL,
   item_id UUID,  -- nullable
   product_id UUID REFERENCES products(id),
   ```

4. **stock_adjustments** (Line ~1235):
   ```sql
   item_name VARCHAR(200),
   item_type VARCHAR(50) NOT NULL,
   item_id UUID,  -- nullable
   product_id UUID REFERENCES products(id),
   ```

5. **cycle_count_items** (Line ~1274):
   ```sql
   item_name VARCHAR(200),
   item_type VARCHAR(50) NOT NULL,
   item_id UUID,  -- nullable
   product_id UUID REFERENCES products(id),
   ```

6. **medicine_batches** (Line ~1078):
   ```sql
   product_id UUID REFERENCES products(id),
   ```

**Add at end of 01_schema.sql (before final comments):**
```sql
-- Create indexes for product_id columns
CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_product_id ON grn_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_product_id ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_cycle_count_items_product_id ON cycle_count_items(product_id);
CREATE INDEX IF NOT EXISTS idx_medicine_batches_product_id ON medicine_batches(product_id);

-- Create views (from 08_link_products_with_inventory.sql)
-- [All 7 views]
```

---

### Step 2: Update 02_seed_data.sql

**Add new section 19 after medicines section:**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 19. PRODUCTS & STOCK SUMMARY
-- ─────────────────────────────────────────────────────────────────────────────

-- 19.1 Seed products table (52 products)
-- [All INSERT statements from 07_seed_products.sql]

-- 19.2 Seed stock_summary table
-- [Stock summary INSERTs from 07_seed_products.sql]

-- 19.3 Seed stock_alerts table
-- [Stock alerts INSERTs from 07_seed_products.sql]
```

**Update medicines INSERT (section 16):**
- ✅ Ensure all medicines have `sku` column populated
- ✅ Use format: `MED-{CAT}-{NAME}-{SEQ}`

---

### Step 3: Keep Migration Files for Existing Databases

**Retain files 05-10** for:
- ✅ Existing database migrations
- ✅ ALTER TABLE operations
- ✅ View creation
- ✅ Data updates

**Update README in database_hole folder:**
```markdown
## Migration Files

- `01_schema.sql` - **Main schema** (use for NEW installations)
- `02_seed_data.sql` - **Seed data** (use for NEW installations)
- `05_add_item_name_columns.sql` - ALTER TABLE for item_name (use for EXISTING databases)
- `07_seed_products.sql` - Product seed data (use for EXISTING databases)
- `08_link_products_with_inventory.sql` - Add product_id FKs and views (use for EXISTING databases)
- `09_update_medicine_skus.sql` - Update medicine SKUs (use for EXISTING databases)
- `10_sync_medicine_skus_to_products.sql` - Sync SKUs to products (use for EXISTING databases)
```

---

## File Structure After Consolidation

```
database_hole/
├── 01_schema.sql                    # ✅ UPDATED - Complete schema with all columns and views
├── 02_seed_data.sql                 # ✅ UPDATED - Includes products and SKUs
├── 03_queries.sql                   # Unchanged
├── 04_inventory_seed.sql            # Unchanged
├── 05_add_item_name_columns.sql     # ✅ KEPT - For existing databases
├── 06_add_product_stock_tables.sql  # ❌ REMOVED - Already in 01_schema.sql
├── 07_seed_products.sql             # ✅ KEPT - For existing databases
├── 08_link_products_with_inventory.sql  # ✅ KEPT - For existing databases
├── 09_update_medicine_skus.sql      # ✅ KEPT - For existing databases
└── 10_sync_medicine_skus_to_products.sql  # ✅ KEPT - For existing databases
```

---

## Usage Guide

### For NEW Installations:
```bash
# 1. Create schema (includes all columns, FKs, and views)
psql -U hms_user -d hms_db -f database_hole/01_schema.sql

# 2. Seed data (includes products with SKUs)
psql -U hms_user -d hms_db -f database_hole/02_seed_data.sql
```

### For EXISTING Databases:
```bash
# Run migrations in order
psql -U hms_user -d hms_db -f database_hole/05_add_item_name_columns.sql
psql -U hms_user -d hms_db -f database_hole/07_seed_products.sql
psql -U hms_user -d hms_db -f database_hole/08_link_products_with_inventory.sql
psql -U hms_user -d hms_db -f database_hole/09_update_medicine_skus.sql
psql -U hms_user -d hms_db -f database_hole/10_sync_medicine_skus_to_products.sql
```

---

## Benefits of Consolidation

| Benefit | Description |
|---------|-------------|
| **Single Source of Truth** | 01_schema.sql has complete schema |
| **Simplified Setup** | New installs need only 2 files |
| **Backward Compatible** | Migration files kept for existing DBs |
| **No Duplication** | Changes documented in one place |
| **Easy Maintenance** | Clear separation of concerns |
| **Version Control** | Migration history preserved |

---

## Next Steps

1. ✅ Update 01_schema.sql with all column changes
2. ✅ Add views to 01_schema.sql
3. ✅ Update 02_seed_data.sql with products section
4. ✅ Ensure all medicines have SKUs in seed data
5. ✅ Update database_hole README
6. ✅ Test new installation with consolidated files
7. ✅ Test migration path with existing files

---

**Status:** ✅ **PLAN CREATED** - Ready to implement consolidation
