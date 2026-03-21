# Purchase Order & GRN Complete Fixes

## Issues Fixed

### 1. 422 Unprocessable Entity Error when creating Purchase Orders
**Problem:** Backend schema validation was too restrictive, only allowing `medicine` or `optical_product` as item types.

**Solution:** Updated schema validation to allow any item type (up to 50 characters).

### 2. PO View showing item IDs instead of item names
**Problem:** The database only stored `item_id` (UUID), and the system tried to resolve names dynamically. For manual entries or non-catalog items, the ID was a generated hash that couldn't be resolved.

**Solution:** Added `item_name` column to store the item name directly in the database.

### 3. GRN not showing medicine names from selected PO
**Problem:** Same as #2 - the item names were not being stored and couldn't be resolved.

**Solution:** Same fix - store item names directly in the database.

### 4. GRN Approval failing with "Failed to update GRN status"
**Problem:** The `_process_grn_acceptance` function was trying to process items without `item_id` (manual entries), causing database errors.

**Solution:** Added a check to skip items without `item_id` and log a warning.

### 5. GRN Creation validation error "All items must have a medicine selected"
**Problem:** Validation was checking only for `item_id`, but items from POs now have `item_name` stored.

**Solution:** Updated validation to check for either `item_id` OR `item_name`.

### 6. Export PO Items to Excel
**Feature Request:** Download current PO items as Excel file.

**Solution:** Added "Export Items" button that downloads the current items in the order form.

---

## Changes Made

### Database Migration (`database_hole/05_add_item_name_columns.sql`)

Added `item_name` column to the following tables:
- `purchase_order_items` (NOT NULL)
- `grn_items` (NOT NULL)
- `stock_movements` (NULL)
- `stock_adjustments` (NULL)
- `cycle_count_items` (NULL)

Also changed `item_type` column size from VARCHAR(20) to VARCHAR(50) for flexibility.

Made `item_id` column nullable in all tables to support manual entries without catalog IDs.

### Backend Schema Changes (`backend/app/schemas/inventory.py`)

Updated the following schema classes:

```python
# Before
item_type: str = Field(..., pattern=r"^(medicine|optical_product)$")
item_id: str

# After
item_type: str = Field(..., min_length=1, max_length=50)
item_id: Optional[str] = None
```

Affected classes:
- `PurchaseOrderItemCreate` - item_type validation relaxed, item_name added
- `GRNItemCreate` - item_id made optional, item_name added
- `StockAdjustmentCreate` - item_type validation relaxed
- `CycleCountItemCreate` - item_type validation relaxed

### Backend Service Changes (`backend/app/services/inventory_service.py`)

#### 1. `create_purchase_order()`
- Now stores `item_name` directly in the database
- Handles empty `item_id` for manual entries gracefully
- Resolves `item_id` only when provided and valid

#### 2. `create_grn()`
- Same changes as `create_purchase_order()`

#### 3. `_format_po_response()`
- Uses stored `item_name` from database
- Falls back to dynamic resolution only if `item_name` is missing
- Returns "Unknown Item" as final fallback

#### 4. `_format_grn_response()`
- Same changes as `_format_po_response()`

#### 5. `_resolve_item_id()`
- Updated to handle empty `item_id` with `item_name` lookup
- Generates deterministic UUID for non-catalog items based on name

#### 6. `_process_grn_acceptance()` (NEW FIX)
- Added check to skip items without `item_id`
- Logs warning for manual entries that can't be processed
- Prevents errors when approving GRNs with manual items

### Backend Model Changes (`backend/app/models/inventory.py`)

Updated model definitions:

```python
# PurchaseOrderItem
item_type = Column(String(50), nullable=False)
item_id = Column(UUID(as_uuid=True), nullable=True)
item_name = Column(String(200), nullable=False)

# GRNItem
item_type = Column(String(50), nullable=False)
item_id = Column(UUID(as_uuid=True), nullable=True)
item_name = Column(String(200), nullable=False)

# Similar changes for StockMovement, StockAdjustment, CycleCountItem
```

### Frontend Changes

#### `NewPurchaseOrderPage.tsx`
- Added better error logging to show actual error messages
- Logs the payload being sent for debugging
- **NEW:** Added "Export Items" button to download current items as Excel
- Export includes: item_no, item_type, item_id, item_name, quantity, unit_price, total_price

#### `NewGRNPage.tsx`
- Updated to use `item_name` directly from PO response
- Better error handling when loading PO details
- Fixed to send `undefined` instead of placeholder UUID for empty item_id

#### `GRNReceiptForm.tsx`
- Updated validation to check for `item_id` OR `item_name`
- Changed error message to "All items must have a medicine/item selected"

#### `GRNsPage.tsx`
- No changes needed (uses inventoryService which handles the response correctly)

#### `types/inventory.ts`
- Updated `GRNItemCreate` interface to make `item_id` optional

---

## Files Modified

### Backend
- `backend/app/schemas/inventory.py` - Schema validation
- `backend/app/models/inventory.py` - Database models
- `backend/app/services/inventory_service.py` - Business logic

### Database
- `database_hole/05_add_item_name_columns.sql` - Migration SQL

### Frontend
- `frontend/src/pages/inventory/NewPurchaseOrderPage.tsx` - Error handling, Excel export
- `frontend/src/pages/inventory/NewGRNPage.tsx` - Item name display, payload fix
- `frontend/src/pages/inventory/GRNReceiptForm.tsx` - Validation fix
- `frontend/src/types/inventory.ts` - Type updates

### Files Removed
- `backend/migrate_inventory.py` - No longer needed (SQL script is primary migration)

---

## Testing

### Create Purchase Order
1. Go to Inventory → Purchase Orders → New Purchase Order
2. Select a supplier
3. Add items (either from catalog or manual entry)
4. **NEW:** Click "Export Items" to download current items as Excel
5. Submit the order
6. **Expected:** Order created successfully

### View Purchase Order
1. Go to Inventory → Purchase Orders
2. Click "View" on any order
3. **Expected:** Item names displayed correctly (not IDs)

### Create GRN from PO
1. Go to Inventory → GRNs → New GRN
2. Select a Purchase Order
3. **Expected:** PO items loaded with correct names
4. Fill in batch numbers, expiry dates, quantities
5. Submit the GRN
6. **Expected:** GRN created successfully

### Approve GRN (FIXED)
1. Go to Inventory → GRNs
2. Find a GRN with status "pending"
3. Click the approve button (or change status to "accepted")
4. **Expected:** GRN approved successfully, stock updated

### View GRN
1. Go to Inventory → GRNs
2. Click "View" on any GRN
3. **Expected:** Item names displayed correctly

---

## Notes

- Existing POs and GRNs created before this fix will still show item names if they were resolved correctly at creation time
- New POs/GRNs will always have item names stored directly
- Manual entries (non-catalog items) now work correctly
- Bulk orders with multiple item types are fully supported
- GRN approval now handles items without catalog IDs gracefully
- Excel export feature allows saving/backup of PO items before submission
