# Medicine to Product Auto-Sync

**Date:** 22 March 2026  
**Feature:** Automatic Product entry creation when medicines are added

---

## Overview

When a new medicine is added through the **Pharmacy → Medicines** page, the system now **automatically creates a corresponding entry in the Products table**. This ensures all medicines are available in the central Product catalog for inventory and purchase operations.

---

## Problem Solved

### Before (❌ Issue)
- Medicines were only stored in the `medicines` table
- Products table was separate and manual
- When creating Purchase Orders, medicines had to be manually added to Products
- Inconsistent data between Pharmacy and Inventory modules
- Difficult to track medicine inventory across the system

### After (✅ Solution)
- Medicine creation → Auto-creates Product entry ✅
- Medicine update → Auto-syncs Product details ✅
- Medicine deletion → Auto-deactivates Product ✅
- Centralized Product catalog always up-to-date ✅
- Seamless inventory management ✅

---

## Implementation Details

### Field Mapping: Medicine → Product

| Medicine Field | Product Field | Mapping Logic |
|---------------|---------------|---------------|
| `name` | `product_name` | Direct copy |
| `generic_name` | `generic_name` | Direct copy |
| `manufacturer` | `brand_name` | Mapped to brand |
| `manufacturer` | `manufacturer` | Direct copy |
| `category` | `subcategory` | tablet, capsule, syrup, etc. |
| `category` | `category` | Fixed: `"medicine"` |
| `sku` | `sku` | Direct copy |
| `barcode` | `barcode` | Direct copy |
| `purchase_price` | `purchase_price` | Direct copy |
| `selling_price` | `selling_price` | Direct copy |
| `selling_price` | `mrp` | Use selling price as MRP |
| `unit_of_measure` | `unit_type` | strip, bottle, tube, etc. |
| `units_per_pack` | `pack_size` | Direct copy |
| `reorder_level` | `reorder_level` | Direct copy |
| `max_stock_level` | `max_stock_level` | Direct copy |
| `storage_instructions` | `storage_conditions` | Direct copy |
| `requires_prescription` | `requires_prescription` | Direct copy |
| `hospital_id` | `hospital_id` | Same hospital |
| `created_by` | `created_by` | Same user |

---

## Code Changes

### File: `backend/app/services/pharmacy_service.py`

#### 1. `create_medicine()` - Auto-create Product

**Location:** Line 53-116

```python
def create_medicine(db: Session, hospital_id: uuid.UUID, data: dict, user_id: uuid.UUID) -> Medicine:
    """
    Create a new medicine and automatically create a corresponding Product entry.
    This ensures all medicines are available in the central Product catalog for
    inventory and purchase operations.
    """
    payload = _filter_model_data(Medicine, _normalize_medicine_payload(data))
    if not payload.get("generic_name"):
        payload["generic_name"] = payload.get("name", "")
    if not payload.get("unit_of_measure"):
        payload["unit_of_measure"] = "Nos"
    
    # Create medicine
    med = Medicine(hospital_id=hospital_id, **payload)
    db.add(med)
    db.flush()  # Get the medicine ID
    
    # Automatically create corresponding Product entry
    try:
        from ..models.products import Product
        
        # Map medicine fields to product fields
        product_data = {
            "hospital_id": hospital_id,
            "product_name": payload.get("name", ""),
            "generic_name": payload.get("generic_name", ""),
            "brand_name": payload.get("manufacturer", ""),
            "category": "medicine",  # All medicines are categorized as 'medicine'
            "subcategory": payload.get("category", ""),  # tablet, capsule, syrup, etc.
            "sku": payload.get("sku", ""),
            "barcode": payload.get("barcode", ""),
            "manufacturer": payload.get("manufacturer", ""),
            "purchase_price": payload.get("purchase_price", 0),
            "selling_price": payload.get("selling_price", 0),
            "mrp": payload.get("selling_price", 0),  # Use selling_price as MRP
            "unit_type": payload.get("unit_of_measure", "unit"),
            "pack_size": payload.get("units_per_pack", 1),
            "reorder_level": payload.get("reorder_level", 10),
            "min_stock_level": 10,
            "max_stock_level": payload.get("max_stock_level", 1000),
            "storage_conditions": payload.get("storage_instructions", ""),
            "requires_prescription": payload.get("requires_prescription", True),
            "is_active": True,
            "is_deleted": False,
            "created_by": user_id,
            "updated_by": user_id,
        }
        
        product = Product(**product_data)
        db.add(product)
        db.flush()
        
        logger.info(
            f"Created Product entry for medicine {med.name} (medicine_id={med.id}, product_id={product.id})"
        )
        
    except Exception as e:
        # Log error but don't fail medicine creation
        logger.error(f"Failed to create Product for medicine {med.name}: {str(e)}")
    
    db.commit()
    db.refresh(med)
    return med
```

**Key Features:**
- ✅ Creates Product immediately after Medicine
- ✅ Uses `db.flush()` to get medicine ID first
- ✅ Maps all relevant fields
- ✅ Sets category to `"medicine"`
- ✅ Logs success/failure
- ✅ Doesn't fail medicine creation if product creation fails

---

#### 2. `update_medicine()` - Auto-sync Product

**Location:** Line 176-239

```python
def update_medicine(db: Session, medicine_id: str | uuid.UUID, data: dict) -> Optional[Medicine]:
    """
    Update medicine details and automatically sync changes to the corresponding Product entry.
    This keeps the Product catalog in sync with medicine updates.
    """
    med = get_medicine_by_id(db, medicine_id)
    if not med:
        return None
    
    normalized_data = _normalize_medicine_payload(data)
    
    # Update medicine
    for key, value in normalized_data.items():
        if hasattr(med, key) and value is not None:
            setattr(med, key, value)
    
    # Sync changes to Product table
    try:
        from ..models.products import Product
        
        # Find corresponding product by matching key fields
        product = db.query(Product).filter(
            Product.hospital_id == med.hospital_id,
            Product.product_name == med.name,
            Product.category == "medicine"
        ).first()
        
        if product:
            # Update product with medicine changes
            update_fields = {
                "generic_name": normalized_data.get("generic_name"),
                "brand_name": normalized_data.get("manufacturer"),
                "subcategory": normalized_data.get("category"),
                "sku": normalized_data.get("sku"),
                "barcode": normalized_data.get("barcode"),
                "manufacturer": normalized_data.get("manufacturer"),
                "purchase_price": normalized_data.get("purchase_price"),
                "selling_price": normalized_data.get("selling_price"),
                "mrp": normalized_data.get("selling_price"),
                "unit_type": normalized_data.get("unit_of_measure"),
                "pack_size": normalized_data.get("units_per_pack"),
                "reorder_level": normalized_data.get("reorder_level"),
                "max_stock_level": normalized_data.get("max_stock_level"),
                "storage_conditions": normalized_data.get("storage_instructions"),
                "requires_prescription": normalized_data.get("requires_prescription"),
            }
            
            for field, value in update_fields.items():
                if value is not None and hasattr(product, field):
                    setattr(product, field, value)
            
            product.updated_by = med.hospital_id
            
            logger.info(
                f"Updated Product entry for medicine {med.name} (product_id={product.id})"
            )
        
    except Exception as e:
        # Log error but don't fail medicine update
        logger.error(f"Failed to update Product for medicine {med.name}: {str(e)}")
    
    db.commit()
    db.refresh(med)
    return med
```

**Key Features:**
- ✅ Finds Product by matching name and category
- ✅ Updates all mapped fields
- ✅ Only updates if Product exists
- ✅ Graceful error handling

---

#### 3. `delete_medicine()` - Auto-deactivate Product

**Location:** Line 242-276

```python
def delete_medicine(db: Session, medicine_id: str | uuid.UUID) -> bool:
    """
    Soft delete medicine and automatically deactivate the corresponding Product entry.
    This ensures the Product catalog reflects the medicine's inactive status.
    """
    med = get_medicine_by_id(db, medicine_id)
    if not med:
        return False
    
    # Mark medicine as inactive
    med.is_active = False
    
    # Also deactivate corresponding Product
    try:
        from ..models.products import Product
        
        product = db.query(Product).filter(
            Product.hospital_id == med.hospital_id,
            Product.product_name == med.name,
            Product.category == "medicine"
        ).first()
        
        if product:
            product.is_active = False
            logger.info(
                f"Deactivated Product entry for medicine {med.name} (product_id={product.id})"
            )
        
    except Exception as e:
        # Log error but don't fail medicine deletion
        logger.error(f"Failed to deactivate Product for medicine {med.name}: {str(e)}")
    
    db.commit()
    return True
```

**Key Features:**
- ✅ Soft delete (is_active = False)
- ✅ Deactivates Product as well
- ✅ Maintains data integrity

---

## How It Works

### Create Medicine Flow

```
User creates medicine via Pharmacy page
         ↓
Frontend: POST /api/v1/pharmacy/medicines
         ↓
Backend: create_medicine()
         ↓
1. Create Medicine record
   - db.add(medicine)
   - db.flush() → gets medicine.id
         ↓
2. Create Product record (automatic)
   - Map medicine fields → product fields
   - db.add(product)
   - db.flush() → gets product.id
         ↓
3. Commit transaction
   - db.commit()
         ↓
4. Return medicine with success
         ↓
✅ Medicine created
✅ Product created
```

### Update Medicine Flow

```
User updates medicine details
         ↓
Frontend: PUT /api/v1/pharmacy/medicines/{id}
         ↓
Backend: update_medicine()
         ↓
1. Update Medicine record
   - Set new values
         ↓
2. Find matching Product
   - Filter by hospital_id, name, category='medicine'
         ↓
3. Update Product (if found)
   - Sync changed fields
         ↓
4. Commit transaction
         ↓
✅ Medicine updated
✅ Product synced
```

### Delete Medicine Flow

```
User deletes medicine
         ↓
Frontend: DELETE /api/v1/pharmacy/medicines/{id}
         ↓
Backend: delete_medicine()
         ↓
1. Mark Medicine inactive
   - med.is_active = False
         ↓
2. Find matching Product
         ↓
3. Mark Product inactive
   - product.is_active = False
         ↓
4. Commit transaction
         ↓
✅ Medicine deactivated
✅ Product deactivated
```

---

## Database Schema

### Medicine Table
```sql
CREATE TABLE medicines (
    id                      UUID PRIMARY KEY,
    hospital_id             UUID NOT NULL REFERENCES hospitals(id),
    name                    VARCHAR(200) NOT NULL,
    generic_name            VARCHAR(200) NOT NULL,
    category                VARCHAR(50),          -- tablet, capsule, syrup, etc.
    manufacturer            VARCHAR(200),
    strength                VARCHAR(50),
    unit_of_measure         VARCHAR(20) NOT NULL,  -- strip, bottle, tube, etc.
    units_per_pack          INTEGER DEFAULT 1,
    sku                     VARCHAR(50),
    barcode                 VARCHAR(50),
    selling_price           DECIMAL(12,2) NOT NULL,
    purchase_price          DECIMAL(12,2),
    reorder_level           INTEGER DEFAULT 10,
    is_active               BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
```

### Product Table
```sql
CREATE TABLE products (
    id                      UUID PRIMARY KEY,
    hospital_id             UUID NOT NULL REFERENCES hospitals(id),
    product_name            VARCHAR(200) NOT NULL,
    generic_name            VARCHAR(200),
    category                VARCHAR(50) NOT NULL,   -- 'medicine' (fixed)
    subcategory             VARCHAR(100),           -- tablet, capsule, syrup, etc.
    sku                     VARCHAR(50) UNIQUE,
    barcode                 VARCHAR(100),
    manufacturer            VARCHAR(200),
    selling_price           DECIMAL(12,2) DEFAULT 0,
    purchase_price          DECIMAL(12,2) DEFAULT 0,
    mrp                     DECIMAL(12,2) DEFAULT 0,
    unit_type               VARCHAR(50) DEFAULT 'unit',
    pack_size               INTEGER DEFAULT 1,
    reorder_level           INTEGER DEFAULT 20,
    requires_prescription   BOOLEAN DEFAULT FALSE,
    is_active               BOOLEAN DEFAULT TRUE,
    is_deleted              BOOLEAN DEFAULT FALSE,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API Examples

### Create Medicine

**Request:**
```http
POST /api/v1/pharmacy/medicines
Content-Type: application/json
Authorization: Bearer {token}

{
  "name": "Paracetamol 500mg",
  "generic_name": "Paracetamol",
  "category": "tablet",
  "manufacturer": "PharmaCorp",
  "strength": "500mg",
  "unit_of_measure": "strip",
  "units_per_pack": 10,
  "sku": "PAR-500-TAB",
  "barcode": "1234567890123",
  "selling_price": 5.00,
  "purchase_price": 3.50,
  "reorder_level": 100,
  "requires_prescription": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "med-uuid",
    "name": "Paracetamol 500mg",
    "generic_name": "Paracetamol",
    "category": "tablet",
    "selling_price": 5.00,
    "is_active": true,
    "created_at": "2026-03-22T10:00:00Z"
  },
  "message": "Medicine created successfully. Product entry auto-created."
}
```

**Database Result:**
```sql
-- Medicine created
INSERT INTO medicines (id, name, generic_name, ...)
VALUES ('med-uuid', 'Paracetamol 500mg', 'Paracetamol', ...);

-- Product auto-created
INSERT INTO products (id, product_name, generic_name, category, subcategory, ...)
VALUES ('prod-uuid', 'Paracetamol 500mg', 'Paracetamol', 'medicine', 'tablet', ...);
```

---

### Update Medicine

**Request:**
```http
PUT /api/v1/pharmacy/medicines/{med_id}
Content-Type: application/json
Authorization: Bearer {token}

{
  "selling_price": 6.00,
  "reorder_level": 150
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "med-uuid",
    "name": "Paracetamol 500mg",
    "selling_price": 6.00,
    "reorder_level": 150,
    "updated_at": "2026-03-22T11:00:00Z"
  }
}
```

**Database Result:**
```sql
-- Medicine updated
UPDATE medicines
SET selling_price = 6.00, reorder_level = 150, updated_at = NOW()
WHERE id = 'med-uuid';

-- Product auto-synced
UPDATE products
SET selling_price = 6.00, mrp = 6.00, reorder_level = 150, updated_at = NOW()
WHERE product_name = 'Paracetamol 500mg' AND category = 'medicine';
```

---

## Testing Checklist

### Manual Testing

1. **Create New Medicine**
   ```
   Pharmacy → Medicines → Add Medicine
   Fill in all details
   Click "Save"
   ```
   **Expected:**
   - ✅ Medicine created in `medicines` table
   - ✅ Product created in `products` table
   - ✅ Product category = "medicine"
   - ✅ All fields properly mapped

2. **Verify Product Creation**
   ```sql
   SELECT 
       p.product_name,
       p.generic_name,
       p.category,
       p.subcategory,
       p.sku,
       p.selling_price
   FROM products p
   WHERE p.product_name = 'Paracetamol 500mg'
     AND p.category = 'medicine';
   ```
   **Expected:** Product record exists with correct data

3. **Update Medicine**
   ```
   Pharmacy → Medicines → Edit Medicine
   Change price to ₹6.00
   Click "Update"
   ```
   **Expected:**
   - ✅ Medicine updated
   - ✅ Product price also updated

4. **Verify Product Sync**
   ```sql
   SELECT 
       m.name,
       m.selling_price as med_price,
       p.product_name,
       p.selling_price as prod_price,
       p.mrp
   FROM medicines m
   LEFT JOIN products p ON p.product_name = m.name AND p.category = 'medicine'
   WHERE m.name = 'Paracetamol 500mg';
   ```
   **Expected:** Prices match between medicine and product

5. **Delete Medicine**
   ```
   Pharmacy → Medicines → Delete Medicine
   Confirm deletion
   ```
   **Expected:**
   - ✅ Medicine `is_active` = FALSE
   - ✅ Product `is_active` = FALSE

---

### Backend Verification

```sql
-- Check medicine-product mapping
SELECT 
    m.id as medicine_id,
    m.name as medicine_name,
    p.id as product_id,
    p.product_name,
    p.category,
    p.subcategory,
    m.is_active as med_active,
    p.is_active as prod_active
FROM medicines m
LEFT JOIN products p 
    ON p.product_name = m.name 
    AND p.category = 'medicine'
    AND p.hospital_id = m.hospital_id
ORDER BY m.created_at DESC
LIMIT 10;
```

**Expected:** All medicines have corresponding products with `is_active = TRUE`

---

## Logging

### Success Log (Create)
```
INFO: Created Product entry for medicine Paracetamol 500mg (medicine_id=uuid, product_id=uuid)
```

### Success Log (Update)
```
INFO: Updated Product entry for medicine Paracetamol 500mg (product_id=uuid)
```

### Success Log (Delete)
```
INFO: Deactivated Product entry for medicine Paracetamol 500mg (product_id=uuid)
```

### Error Log
```
ERROR: Failed to create Product for medicine Paracetamol 500mg: <error message>
```

---

## Error Handling

### Graceful Degradation

If Product creation fails:
- ✅ Medicine is still created successfully
- ✅ Error is logged
- ✅ System continues to work
- ✅ User sees success message (medicine created)

**Rationale:**
- Medicine functionality is critical
- Product catalog is secondary (can be created later)
- Prevents data loss

### Manual Recovery

If Product creation fails, admin can:
1. Check error logs
2. Manually create Product entry
3. Or re-save medicine to trigger auto-sync

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **Data Consistency** | Medicines and Products always in sync |
| **Reduced Manual Work** | No need to manually add products |
| **Better Inventory Tracking** | All medicines available for PO creation |
| **Centralized Catalog** | Single source of truth for products |
| **Audit Trail** | Logs track auto-creation events |
| **Error Resilience** | Medicine creation doesn't fail if product creation fails |

---

## Related Features

This feature enables:
- ✅ Create Purchase Orders for medicines directly
- ✅ Low stock alerts for medicines
- ✅ Inventory reports including medicines
- ✅ Supplier performance tracking per medicine
- ✅ Price history tracking for medicines

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/app/services/pharmacy_service.py` | Updated `create_medicine()`, `update_medicine()`, `delete_medicine()` to sync with Products table |

---

## Important Notes

1. **Category Fixed**: All medicine products have `category = "medicine"`
2. **Subcategory**: Medicine's category (tablet, capsule, etc.) → Product's subcategory
3. **MRP Mapping**: Product MRP is set to medicine's selling price
4. **Soft Delete**: Both medicine and product are deactivated (not deleted)
5. **Error Handling**: Product creation failures don't block medicine creation

---

**Status:** ✅ **IMPLEMENTED** — Medicines automatically create/sync with Product entries
