# Database Migration Files - Usage Guide

**Date:** 22 March 2026  
**Version:** 1.0

---

## Quick Start

### For NEW Installations (Fresh Database)

```bash
# Step 1: Create database schema
psql -U hms_user -d hms_db -f database_hole/01_schema.sql

# Step 2: Seed initial data
psql -U hms_user -d hms_db -f database_hole/02_seed_data.sql
```

**That's it!** The consolidated schema includes:
- ✅ All tables with latest columns (item_name, product_id, etc.)
- ✅ All foreign key relationships
- ✅ All indexes for performance
- ✅ All views for reporting
- ✅ Complete seed data with products and SKUs

---

### For EXISTING Databases (Upgrade Path)

```bash
# Run migrations in order
psql -U hms_user -d hms_db -f database_hole/05_add_item_name_columns.sql
psql -U hms_user -d hms_db -f database_hole/07_seed_products.sql
psql -U hms_user -d hms_db -f database_hole/08_link_products_with_inventory.sql
psql -U hms_user -d hms_db -f database_hole/09_update_medicine_skus.sql
psql -U hms_user -d hms_db -f database_hole/10_sync_medicine_skus_to_products.sql
```

---

## File Descriptions

### Core Files (New Installations)

| File | Purpose | When to Use |
|------|---------|-------------|
| `01_schema.sql` | **Complete database schema** with all tables, columns, FKs, indexes, and views | ✅ NEW installations |
| `02_seed_data.sql` | **Seed data** with hospitals, users, roles, medicines, and products | ✅ NEW installations |

### Migration Files (Existing Databases)

| File | Purpose | When to Use |
|------|---------|-------------|
| `05_add_item_name_columns.sql` | Adds `item_name` columns to inventory tables | ⚠️ EXISTING databases |
| `07_seed_products.sql` | Seeds products table with 52 products | ⚠️ EXISTING databases |
| `08_link_products_with_inventory.sql` | Adds `product_id` FKs and creates views | ⚠️ EXISTING databases |
| `09_update_medicine_skus.sql` | Updates medicines with SKUs and syncs to products | ⚠️ EXISTING databases |
| `10_sync_medicine_skus_to_products.sql` | Syncs medicine SKUs to products only | ⚠️ EXISTING databases |

### Reference Files

| File | Purpose |
|------|---------|
| `03_queries.sql` | Sample queries for testing (DO NOT run - reference only) |
| `04_inventory_seed.sql` | Legacy inventory seed (superseded by 07_seed_products.sql) |

---

## What Changed in Consolidation

### Schema Changes (01_schema.sql)

**Tables Updated:**
1. ✅ `purchase_order_items` - Added `item_name`, `product_id`; made `item_id` nullable
2. ✅ `grn_items` - Added `item_name`, `product_id`; made `item_id` nullable
3. ✅ `stock_movements` - Added `item_name`, `product_id`; made `item_id` nullable
4. ✅ `stock_adjustments` - Added `item_name`, `product_id`; made `item_id` nullable
5. ✅ `cycle_count_items` - Added `item_name`, `product_id`; made `item_id` nullable
6. ✅ `medicine_batches` - Added `product_id` column

**Indexes Added:**
- ✅ `idx_po_items_product_id`
- ✅ `idx_grn_items_product_id`
- ✅ `idx_stock_movements_product_id`
- ✅ `idx_adjustments_product_id`
- ✅ `idx_cycle_count_items_product_id`
- ✅ `idx_medicine_batches_product_id`

**Views Added:**
- ✅ `v_purchase_orders_with_products`
- ✅ `v_grns_with_products`
- ✅ `v_stock_movements_with_products`
- ✅ `v_low_stock_products`
- ✅ `v_expiring_products`

### Seed Data Changes (02_seed_data.sql)

**Section 16 - Medicines:**
- ✅ All 22 medicines now have SKUs (format: `MED-{CAT}-{NAME}-{SEQ}`)

**Section 19 - Products (NEW):**
- ✅ 52 products seeded (medicines, optical, surgical, laboratory, equipment)
- ✅ Stock summary records for all products
- ✅ Stock alerts for low stock items

---

## Verification After Installation

### For New Installations

```sql
-- Check table count (should be 63+)
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check medicines have SKUs
SELECT COUNT(*) as total, COUNT(sku) as with_sku FROM medicines;

-- Check products seeded
SELECT COUNT(*) as total_products FROM products;

-- Check views created
SELECT viewname FROM pg_views 
WHERE schemaname = 'public' 
AND viewname LIKE 'v_%'
ORDER BY viewname;
```

### For Existing Databases (After Migration)

```sql
-- Check item_name columns added
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE column_name = 'item_name'
AND table_schema = 'public'
ORDER BY table_name;

-- Check product_id columns added
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE column_name = 'product_id'
AND table_schema = 'public'
ORDER BY table_name;

-- Check SKUs updated
SELECT 'medicines' as table_name, COUNT(*) as total, COUNT(sku) as with_sku FROM medicines
UNION ALL
SELECT 'products', COUNT(*), COUNT(sku) FROM products WHERE category = 'medicine';

-- Check views created
SELECT viewname FROM pg_views 
WHERE schemaname = 'public' 
AND viewname LIKE 'v_%'
ORDER BY viewname;
```

---

## Troubleshooting

### Issue: "column already exists" error during migration

**Solution:** The column might already exist from a previous migration. Use:
```bash
# Skip that migration and continue with the next
# Or use the consolidated 01_schema.sql for fresh install
```

### Issue: "relation does not exist" error

**Solution:** Ensure migrations are run in correct order:
```bash
# Correct order:
05 → 07 → 08 → 09 → 10
```

### Issue: Views not showing data

**Solution:** Check if products table is seeded:
```bash
psql -U hms_user -d hms_db -f database_hole/07_seed_products.sql
```

### Issue: SKU mismatch between medicines and products

**Solution:** Run sync script:
```bash
psql -U hms_user -d hms_db -f database_hole/10_sync_medicine_skus_to_products.sql
```

---

## Migration History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 22 Mar 2026 | Consolidated migrations 05-10 into 01/02 |
| 0.9 | 20 Mar 2026 | Added medicine SKU update scripts (09, 10) |
| 0.8 | 18 Mar 2026 | Added product-inventory linking (08) |
| 0.7 | 15 Mar 2026 | Added products seed data (07) |
| 0.6 | 10 Mar 2026 | Added item_name columns (05) |
| 0.5 | 01 Mar 2026 | Initial schema and seed data |

---

## Related Documentation

- `CONSOLIDATION_PLAN.md` - Detailed consolidation plan
- `SCHEMA_CONSOLIDATION_GUIDE.md` - Step-by-step implementation guide
- `MEDICINE_SKU_UPDATE.md` - Medicine SKU update documentation
- `PO_TYPEAHEAD_SEARCH.md` - Product typeahead search feature
- `MEDICINE_PRODUCT_AUTO_SYNC.md` - Medicine-product auto-sync feature

---

## Support

For issues or questions:
1. Check verification queries above
2. Review migration file comments
3. Consult project documentation in `/project-plan` folder

---

**Status:** ✅ **COMPLETE** - Ready for production use
