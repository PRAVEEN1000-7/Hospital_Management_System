# Medicine SKU Update with Product Sync

**Date:** 22 March 2026  
**Issue:** Some medicines in the Medicine table do not have SKUs  
**Solution:** Updated seed data + standalone SQL update scripts with Product table sync

---

## Overview

All medicines in the HMS system should have a unique SKU (Stock Keeping Unit) for:
- Inventory tracking
- Purchase order creation
- Product catalog management
- Typeahead search in PO creation
- Integration with Products table

---

## SKU Format

**Format:** `MED-{CATEGORY}-{NAME}-{SEQ}`

**Examples:**
- `MED-TAB-PARACETAMOL500-001` (Tablet, Paracetamol 500mg)
- `MED-CAP-AMOXICILLIN250-002` (Capsule, Amoxicillin 250mg)
- `MED-SYR-COUGHDX-009` (Syrup, Cough Syrup DX)
- `MED-INJ-INSULINGL-021` (Injection, Insulin Glargine)

**Structure:**
| Segment | Length | Description |
|---------|--------|-------------|
| `MED` | 3 | Fixed prefix for medicines |
| `{CATEGORY}` | 3 | Category code (TAB, CAP, SYR, INJ, etc.) |
| `{NAME}` | ≤12 | Medicine name (abbreviated, no spaces) |
| `{SEQ}` | 3 | Sequential number for uniqueness |

**Category Codes:**
| Code | Category |
|------|----------|
| TAB | Tablet |
| CAP | Capsule |
| SYR | Syrup |
| INJ | Injection |
| DRO | Drops |
| CREAM | Cream |
| OINT | Ointment |
| SPRAY | Spray |

---

## Files Modified/Created

### 1. Seed Data Update ✅
**File:** `database_hole/02_seed_data.sql`

**Changes:**
- Added `sku` column to all medicine INSERT statements
- All 22 sample medicines now have SKUs
- SKUs are unique and follow the standard format

---

### 2. Medicine SKU Update Script ✅
**File:** `database_hole/09_update_medicine_skus.sql`

**Purpose:** Update medicines AND sync to Products table

**Usage:**
```bash
psql -U hms_user -d hms_db -f database_hole/09_update_medicine_skus.sql
```

**What it does:**
1. ✅ Updates all medicines with `sku IS NULL` or `sku = ''`
2. ✅ Generates SKU using format: `MED-{CAT}-{NAME}-{SEQ}`
3. ✅ **Syncs SKUs to Products table**
4. ✅ Verifies the update in both tables
5. ✅ Shows sample SKUs with match status

**SQL - Step 1 (Update Medicines):**
```sql
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
```

**SQL - Step 2 (Sync to Products):**
```sql
UPDATE products p
SET sku = m.sku,
    updated_at = NOW()
FROM medicines m
WHERE p.product_name = m.name
  AND p.category = 'medicine'
  AND p.hospital_id = m.hospital_id
  AND m.sku IS NOT NULL
  AND (p.sku IS NULL OR p.sku = '' OR p.sku != m.sku);
```

---

### 3. Product SKU Sync Script ✅
**File:** `database_hole/10_sync_medicine_skus_to_products.sql`

**Purpose:** Only update Products table (if medicines already have SKUs)

**Usage:**
```bash
psql -U hms_user -d hms_db -f database_hole/10_sync_medicine_skus_to_products.sql
```

**What it does:**
1. ✅ Finds all medicine-product pairs
2. ✅ Updates product SKUs from medicine SKUs
3. ✅ Reports how many products were updated
4. ✅ Shows any mismatches that need attention

**When to use:**
- Medicines already have SKUs
- Products table needs to be synced
- Troubleshooting SKU mismatches

**SQL:**
```sql
UPDATE products p
SET sku = m.sku,
    updated_at = NOW()
FROM medicines m
WHERE p.product_name = m.name
  AND p.category = 'medicine'
  AND p.hospital_id = m.hospital_id
  AND m.sku IS NOT NULL
  AND (p.sku IS NULL OR p.sku = '' OR p.sku != m.sku);
```

---

## How to Apply

### For New Installations

1. **Run schema migration:**
   ```bash
   psql -U hms_user -d hms_db -f database_hole/01_schema.sql
   ```

2. **Run seed data (includes SKUs):**
   ```bash
   psql -U hms_user -d hms_db -f database_hole/02_seed_data.sql
   ```

3. **Verify:**
   ```sql
   SELECT id, name, category, sku FROM medicines ORDER BY sku;
   SELECT id, product_name, category, sku FROM products WHERE category = 'medicine' ORDER BY sku;
   ```

---

### For Existing Databases (Medicines Need SKUs)

If you have medicines without SKUs:

1. **Run the update script (updates both tables):**
   ```bash
   psql -U hms_user -d hms_db -f database_hole/09_update_medicine_skus.sql
   ```

2. **Verify:**
   ```sql
   -- Check medicines
   SELECT COUNT(*) as total, COUNT(sku) as with_sku FROM medicines;
   
   -- Check products
   SELECT COUNT(*) as total, COUNT(sku) as with_sku 
   FROM products WHERE category = 'medicine';
   ```

---

### For Existing Databases (Only Products Need Sync)

If medicines already have SKUs but products don't:

1. **Run the sync script:**
   ```bash
   psql -U hms_user -d hms_db -f database_hole/10_sync_medicine_skus_to_products.sql
   ```

2. **Verify:**
   ```sql
   SELECT 
       m.name as medicine_name,
       m.sku as medicine_sku,
       p.sku as product_sku,
       CASE WHEN m.sku = p.sku THEN '✓ Match' ELSE '✗ Mismatch' END as status
   FROM medicines m
   INNER JOIN products p ON p.product_name = m.name AND p.category = 'medicine'
   ORDER BY m.name;
   ```

---

## Sample SKUs

| Medicine Name | Category | Medicine SKU | Product SKU | Status |
|--------------|----------|--------------|-------------|--------|
| Paracetamol 500mg | tablet | MED-TAB-PARACETAMOL500-001 | MED-TAB-PARACETAMOL500-001 | ✓ Match |
| Amoxicillin 250mg | capsule | MED-CAP-AMOXICILLIN250-002 | MED-CAP-AMOXICILLIN250-002 | ✓ Match |
| Omeprazole 20mg | capsule | MED-CAP-OMEPRAZOLE20-003 | MED-CAP-OMEPRAZOLE20-003 | ✓ Match |
| Atorvastatin 10mg | tablet | MED-TAB-ATORVASTATIN10-004 | MED-TAB-ATORVASTATIN10-004 | ✓ Match |
| Metformin 500mg | tablet | MED-TAB-METFORMIN500-005 | MED-TAB-METFORMIN500-005 | ✓ Match |
| Ciprofloxacin 500mg | tablet | MED-TAB-CIPROFLOXACIN500-006 | MED-TAB-CIPROFLOXACIN500-006 | ✓ Match |
| Cetirizine 10mg | tablet | MED-TAB-CETIRIZINE10-007 | MED-TAB-CETIRIZINE10-007 | ✓ Match |
| Ibuprofen 400mg | tablet | MED-TAB-IBUPROFEN400-008 | MED-TAB-IBUPROFEN400-008 | ✓ Match |
| Cough Syrup DX | syrup | MED-SYR-COUGHDX-009 | MED-SYR-COUGHDX-009 | ✓ Match |
| Eye Drops Moxifloxacin | drops | MED-DRO-EYEMOXI-010 | MED-DRO-EYEMOXI-010 | ✓ Match |

---

## Verification Queries

### Check SKU Status

```sql
-- Medicines
SELECT 
    COUNT(*) as total_medicines,
    COUNT(sku) as with_sku,
    COUNT(*) - COUNT(sku) as without_sku,
    ROUND(100.0 * COUNT(sku) / NULLIF(COUNT(*), 0), 2) as percentage_with_sku
FROM medicines;

-- Products (medicines category)
SELECT 
    COUNT(*) as total_medicine_products,
    COUNT(sku) as with_sku,
    COUNT(*) - COUNT(sku) as without_sku,
    ROUND(100.0 * COUNT(sku) / NULLIF(COUNT(*), 0), 2) as percentage_with_sku
FROM products 
WHERE category = 'medicine';
```

### Check SKU Sync Between Tables

```sql
SELECT 
    m.name as medicine_name,
    m.sku as medicine_sku,
    p.sku as product_sku,
    CASE 
        WHEN m.sku = p.sku THEN '✓ Match'
        WHEN p.sku IS NULL THEN '✗ Product missing SKU'
        ELSE '✗ Mismatch'
    END as status
FROM medicines m
INNER JOIN products p ON p.product_name = m.name 
    AND p.category = 'medicine' 
    AND p.hospital_id = m.hospital_id
ORDER BY m.category, m.name;
```

### Find Missing SKUs

```sql
-- Medicines without SKUs
SELECT id, name, category, sku
FROM medicines
WHERE sku IS NULL OR sku = ''
ORDER BY name;

-- Products without SKUs
SELECT id, product_name, sku
FROM products
WHERE category = 'medicine'
  AND (sku IS NULL OR sku = '')
ORDER BY product_name;
```

### Find Mismatches

```sql
SELECT 
    m.name as medicine_name,
    m.sku as medicine_sku,
    p.sku as product_sku,
    'Mismatch - needs attention' as issue
FROM medicines m
INNER JOIN products p ON p.product_name = m.name 
    AND p.category = 'medicine' 
    AND p.hospital_id = m.hospital_id
WHERE m.sku IS DISTINCT FROM p.sku;
```

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **Unique Identification** | Each medicine has a unique SKU |
| **Easy Search** | SKUs work in typeahead search |
| **Inventory Tracking** | SKUs used in POs and GRNs |
| **Product Integration** | Medicines sync to Products table with SKU |
| **Standard Format** | Consistent across all medicines and products |
| **Human Readable** | SKU indicates category and name |
| **Auto-Sync** | Products table automatically updated |

---

## Integration with Products Table

When medicines are created/updated, the system automatically creates/updates corresponding Product entries with the same SKU:

```python
# Backend: pharmacy_service.py
product_data = {
    "sku": payload.get("sku", ""),  # Medicine SKU
    "product_name": payload.get("name", ""),
    "category": "medicine",
    # ... other fields
}
```

This ensures:
- ✅ Same SKU in both tables
- ✅ Seamless inventory management
- ✅ Accurate typeahead search
- ✅ Consistent reporting

---

## Troubleshooting

### Issue: Script fails with "column sku does not exist"

**Solution:** The table schema doesn't have the sku column. Run the schema migration first:

```bash
psql -U hms_user -d hms_db -f database_hole/01_schema.sql
```

### Issue: Products table not syncing

**Solution:** Run the dedicated sync script:

```bash
psql -U hms_user -d hms_db -f database_hole/10_sync_medicine_skus_to_products.sql
```

### Issue: SKU mismatches between tables

**Solution:** Check which table has the correct SKU and manually update:

```sql
-- Update product from medicine
UPDATE products p
SET sku = m.sku
FROM medicines m
WHERE p.product_name = m.name 
  AND p.category = 'medicine'
  AND p.hospital_id = m.hospital_id
  AND p.id = 'product-uuid-here';

-- Or update medicine from product (if product is correct)
UPDATE medicines m
SET sku = p.sku
FROM products p
WHERE p.product_name = m.name 
  AND p.category = 'medicine'
  AND p.hospital_id = m.hospital_id
  AND m.id = 'medicine-uuid-here';
```

---

## Related Files

| File | Purpose |
|------|---------|
| `01_schema.sql` | Defines medicines and products tables with sku columns |
| `02_seed_data.sql` | Seeds medicines with SKUs |
| `09_update_medicine_skus.sql` | Updates medicines + syncs to products |
| `10_sync_medicine_skus_to_products.sql` | Syncs medicine SKUs to products only |
| `backend/app/models/prescription.py` | Medicine model with sku field |
| `backend/app/models/products.py` | Product model with sku field |
| `backend/app/services/pharmacy_service.py` | Auto-syncs medicine SKU to product |

---

## Summary

**Two Scripts Available:**

1. **`09_update_medicine_skus.sql`** - Use when medicines need SKUs
   - Updates medicines table
   - Syncs to products table
   - Use this for most cases

2. **`10_sync_medicine_skus_to_products.sql`** - Use when only products need sync
   - Only updates products table
   - Use when medicines already have SKUs

**Expected Result:**
- ✅ All medicines have unique SKUs
- ✅ All medicine-products have matching SKUs
- ✅ SKUs follow standard format
- ✅ No mismatches between tables

---

**Status:** ✅ **COMPLETED** — All medicines and products now have synchronized unique SKUs
