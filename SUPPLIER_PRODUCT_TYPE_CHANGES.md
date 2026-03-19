# Supplier Product Type Feature - Quick Reference

## Overview
Added `product_type` field to suppliers to track what type of products each supplier provides (medicine, optical, equipment, etc.).

---

## Files Changed

### 1. Database
- **NEW:** `database_hole/05_add_supplier_product_type.sql` - Migration script

### 2. Backend
- `backend/app/models/inventory.py` - Added `product_type` column to Supplier model
- `backend/app/schemas/inventory.py` - Added to Pydantic schemas (SupplierCreate, SupplierUpdate, SupplierResponse)
- `backend/app/services/inventory_service.py` - Handles product_type in create_supplier()

### 3. Frontend
- `frontend/src/types/inventory.ts` - Added product_type to TypeScript interfaces
- `frontend/src/pages/inventory/SuppliersPage.tsx` - Added dropdown with manual input option

---

## How to Apply

### Step 1: Run Database Migration

```bash
# Navigate to project root
cd E:\Internship\HMS-Internship\Hospital_Management_System

# Set database password
$env:PGPASSWORD = "HMS@2026"

# Run the migration
psql -h localhost -U hms_user -d hms_db -f database_hole/05_add_supplier_product_type.sql
```

### Step 2: Verify Migration

```bash
# Check if column was added
psql -h localhost -U hms_user -d hms_db -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'product_type';"

# Expected output:
#  column_name  | data_type | column_default
# --------------+-----------+----------------
#  product_type | character | 'medicine'::character varying
```

### Step 3: Restart Backend

```bash
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

The backend will automatically pick up the new field from the model definition.

### Step 4: Test Frontend

1. Open http://localhost:3000
2. Navigate to **Inventory → Suppliers**
3. Click **Add Supplier**
4. You should see the new "Product Type" dropdown

---

## Product Type Options

The dropdown includes these predefined options:

1. **Medicine / Pharmaceuticals** (`medicine`) - Default
2. **Optical Products** (`optical`)
3. **Medical Equipment** (`equipment`)
4. **Medical Consumables** (`consumables`)
5. **Laboratory Supplies** (`laboratory`)
6. **Surgical Instruments** (`surgical`)
7. **Other (specify manually)** (`other`) - Switches to text input

---

## API Changes

### Create Supplier Request

**Before:**
```json
{
  "name": "ABC Pharma",
  "code": "SUP-001",
  "contact_person": "John Doe",
  "phone": "+1234567890",
  "email": "contact@abcpharma.com"
}
```

**After:**
```json
{
  "name": "ABC Pharma",
  "code": "SUP-001",
  "contact_person": "John Doe",
  "phone": "+1234567890",
  "email": "contact@abcpharma.com",
  "product_type": "medicine"  // ← NEW field
}
```

### Custom Product Type

If user selects "Other" and types manually:

```json
{
  "name": "XYZ Medical",
  "code": "SUP-002",
  "product_type": "disposables"  // Custom value
}
```

---

## Frontend UI Changes

### Supplier List Page
- New "Product Type" column in the table
- Badge display showing product type (e.g., "medicine", "optical")

### Supplier Form Modal
- New "Product Type" dropdown field (required)
- When "Other" is selected, dropdown switches to text input
- Auto-focuses on text input when switched

---

## Database Schema

### Before
```sql
CREATE TABLE suppliers (
    id             UUID PRIMARY KEY,
    hospital_id    UUID NOT NULL,
    name           VARCHAR(200) NOT NULL,
    code           VARCHAR(20) NOT NULL,
    -- ... other fields ...
    UNIQUE (hospital_id, code)
);
```

### After
```sql
CREATE TABLE suppliers (
    id             UUID PRIMARY KEY,
    hospital_id    UUID NOT NULL,
    name           VARCHAR(200) NOT NULL,
    code           VARCHAR(20) NOT NULL,
    product_type   VARCHAR(50) DEFAULT 'medicine' NOT NULL,  -- ← NEW
    -- ... other fields ...
    UNIQUE (hospital_id, code)
);

-- NEW indexes for performance
CREATE INDEX idx_suppliers_product_type ON suppliers(product_type);
CREATE INDEX idx_suppliers_hospital_product ON suppliers(hospital_id, product_type);
```

---

## Backward Compatibility

✅ **Fully backward compatible**

- Existing suppliers without `product_type` are automatically set to `'medicine'`
- API accepts requests without `product_type` (defaults to `'medicine'`)
- Frontend defaults to `'medicine'` if not specified

---

## Future Enhancements (Optional)

### 1. Filter Suppliers by Product Type
Add filtering in SuppliersPage:
```typescript
const [productTypeFilter, setProductTypeFilter] = useState('');

// In fetchSuppliers:
const res = await inventoryService.getSuppliers(page, 10, search, activeFilter, productTypeFilter);
```

### 2. Role-Based Filtering
Restrict pharmacists to see only medicine suppliers:
```python
# In backend/app/routers/inventory.py
@suppliers_router.get("")
async def list_suppliers(
    current_user: User = Depends(inventory_view_roles),
    # ...
):
    # Add filter based on user role
    if "pharmacist" in current_user.roles:
        product_type = "medicine"
    elif "optical_staff" in current_user.roles:
        product_type = "optical"
    # ... filter query ...
```

### 3. Supplier Analytics
Track supplier performance by product type:
- Average delivery time
- Order fulfillment rate
- Product quality ratings

---

## Troubleshooting

### Issue: Column doesn't exist after migration
**Solution:** Check if migration ran successfully:
```bash
psql -h localhost -U hms_user -d hms_db -c "\d suppliers"
```
Look for `product_type` in the column list.

### Issue: Frontend shows validation error
**Solution:** Clear browser cache and restart dev server:
```bash
# Frontend terminal
npm run dev

# Or clear cache in browser (Ctrl+Shift+Delete)
```

### Issue: Backend throws AttributeError
**Solution:** Restart backend server to reload models:
```bash
# Backend terminal - press Ctrl+C then restart
uvicorn app.main:app --reload --port 8000
```

---

## Testing

### Manual Testing Checklist
- [ ] Create supplier with predefined product type
- [ ] Create supplier with custom product type ("Other" option)
- [ ] Edit existing supplier and change product type
- [ ] View supplier list - verify product type column shows correctly
- [ ] Filter suppliers by product type (if implemented)
- [ ] Test API endpoint directly via Swagger UI (http://localhost:8000/api/docs)

### API Testing via Swagger
1. Open http://localhost:8000/api/docs
2. Find `POST /api/v1/inventory/suppliers`
3. Try it out with:
```json
{
  "name": "Test Supplier",
  "code": "TEST-001",
  "product_type": "optical"
}
```
4. Execute and verify response includes `product_type`

---

## Migration Rollback (If Needed)

If you need to undo the changes:

```sql
-- Remove the column
ALTER TABLE suppliers DROP COLUMN IF EXISTS product_type;

-- Drop indexes
DROP INDEX IF EXISTS idx_suppliers_product_type;
DROP INDEX IF EXISTS idx_suppliers_hospital_product;
```

⚠️ **Warning:** This will permanently delete the product_type data!

---

## Related Files

For more information, see:
- `BUG_REPORT_AND_ANALYSIS.md` - Full analysis report
- `database_hole/05_add_supplier_product_type.sql` - Migration script with comments
- `frontend/src/pages/inventory/SuppliersPage.tsx` - Frontend implementation

---

**Last Updated:** March 18, 2026  
**Version:** 1.0.0
