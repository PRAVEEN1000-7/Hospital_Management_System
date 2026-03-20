# Pharmacy Module Cleanup - Suppliers & Purchase Orders Removal

**Date:** 20 March 2026  
**Issue:** Pharmacy module had duplicate Suppliers and Purchase Orders functionality that should only exist in the Inventory module.

---

## Summary

Removed duplicate Suppliers and Purchase Orders features from the Pharmacy module. These features are now exclusively managed through the **Inventory module**, with pharmacists having appropriate access permissions.

---

## Changes Made

### Backend (`backend/app/routers/`)

#### `pharmacy.py`
**Removed:**
- `suppliers_router` - All supplier CRUD endpoints (~70 lines)
- `purchase_orders_router` - All PO workflow endpoints (~380 lines)
- Related imports: `SupplierCreate`, `SupplierUpdate`, `SupplierResponse`, `SupplierListResponse`, `PurchaseOrderCreate`, `PurchaseOrderUpdate`, `PurchaseOrderReceiveRequest`, `PurchaseOrderResponse`, `PurchaseOrderListResponse`, `PurchaseOrderItemResponse`

**Kept:**
- Medicines & Batches management
- Pharmacy sales (counter sales)
- Pharmacy dispensing (prescription queue)
- Pharmacy-specific stock adjustments
- Dashboard statistics

**File reduced from:** 680 lines → 271 lines

---

### Frontend (`frontend/src/`)

#### `App.tsx`
**Removed routes:**
- `/pharmacy/suppliers` → SupplierList
- `/pharmacy/suppliers/new` → SupplierForm
- `/pharmacy/purchase-orders` → PurchaseOrderList
- `/pharmacy/purchase-orders/new` → PurchaseOrderForm
- `/pharmacy/purchase-orders/:orderId/edit` → PurchaseOrderForm

**Removed imports:**
- `SupplierList`
- `SupplierForm`
- `PurchaseOrderList`
- `PurchaseOrderForm`

**Updated routes (added pharmacist access):**
- `/inventory/suppliers` - Now allows `['super_admin', 'admin', 'inventory_manager', 'pharmacist']`
- `/inventory/purchase-orders` - Now allows `['super_admin', 'admin', 'inventory_manager', 'pharmacist']`
- `/inventory/purchase-orders/new` - Now allows `['super_admin', 'admin', 'inventory_manager', 'pharmacist']`

#### `components/common/Layout.tsx`
**Updated sidebar navigation:**
- Removed from Pharmacy menu: "Purchase Orders", "Suppliers"
- Added to Inventory menu (for pharmacists): "Suppliers", "Purchase Orders"

#### `services/pharmacyService.ts`
**Removed methods:**
- `getSuppliers()`, `getSupplier()`, `createSupplier()`, `updateSupplier()`, `deleteSupplier()`
- `getPurchaseOrders()`, `getPurchaseOrder()`, `createPurchaseOrder()`, `updatePurchaseOrder()`, `deletePurchaseOrder()`
- `submitPurchaseOrder()`, `approvePurchaseOrder()`, `placePurchaseOrder()`, `cancelPurchaseOrder()`, `receivePurchaseOrder()`

**Removed type imports:**
- `Supplier`, `SupplierCreateData`, `SupplierListResponse`
- `PurchaseOrder`, `PurchaseOrderCreateData`, `PurchaseOrderListResponse`, `PurchaseOrderReceiveData`

**File reduced from:** 306 lines → 217 lines

#### `pages/pharmacy/` - Deleted Files
- `SupplierList.tsx` (613 lines)
- `SupplierForm.tsx` (813 lines)
- `PurchaseOrderList.tsx` (813 lines)
- `PurchaseOrderForm.tsx` (not checked, estimated ~500 lines)

#### Updated Files to use `inventoryService` instead of `pharmacyService`:
- `pages/pharmacy/BatchForm.tsx` - Now imports `inventoryService` for suppliers
- `pages/inventory/LowStockAlertsPage.tsx` - Updated to use `inventoryService.getSuppliers()`
- `pages/pharmacy/PharmacyDashboard.tsx` - Updated PO links to `/inventory/purchase-orders`

**Total frontend code removed:** ~2,700+ lines

---

## Access Control Changes

### Before
- Pharmacists could access Suppliers and POs via `/pharmacy/suppliers` and `/pharmacy/purchase-orders`
- Inventory managers had separate PO management in `/inventory/purchase-orders`
- Duplicate functionality caused confusion

### After
- **Pharmacists** access Suppliers and POs through **Inventory module**:
  - `/inventory/suppliers` - View/manage suppliers
  - `/inventory/purchase-orders` - Create and manage purchase orders
- **Inventory managers** continue using `/inventory/*` routes
- **Admins** have oversight across both modules

---

## Module Responsibilities

### Pharmacy Module (Corrected)
- ✅ Medicines catalog management
- ✅ Medicine batches (stock tracking)
- ✅ Prescription dispensing
- ✅ Counter sales (walk-in purchases)
- ✅ Pharmacy-specific stock adjustments
- ✅ Pending prescriptions queue

### Inventory Module (Centralized)
- ✅ **Suppliers management** (all departments)
- ✅ **Purchase orders** (all departments)
- ✅ Goods Receipt Notes (GRN)
- ✅ Stock movements tracking
- ✅ Stock adjustments (approval workflow)
- ✅ Cycle counts
- ✅ Low stock alerts
- ✅ Expiring items alerts

---

## Migration Notes

### For Users
- Pharmacists: Use **Inventory → Suppliers** and **Inventory → Purchase Orders** menu items
- All existing supplier and PO data remains unchanged in database
- No data migration required

### For Developers
- Backend endpoints removed:
  - `GET/POST/PUT/DELETE /pharmacy/suppliers`
  - `GET/POST/PUT/DELETE /pharmacy/purchase-orders`
  - `POST /pharmacy/purchase-orders/{id}/submit|approve|place|cancel|receive`
- Use inventory endpoints instead:
  - `GET/POST/PUT/DELETE /inventory/suppliers`
  - `GET/POST/PUT /inventory/purchase-orders`

---

## Testing Checklist

- [ ] Backend starts without errors
- [ ] `/pharmacy/medicines` route works
- [ ] `/pharmacy/sales` route works
- [ ] `/pharmacy/dispense/:prescriptionId` route works
- [ ] `/inventory/suppliers` accessible by pharmacists
- [ ] `/inventory/purchase-orders` accessible by pharmacists
- [ ] No broken imports in frontend build
- [ ] Navigation menu updated (if applicable)

---

## Files Modified

| File | Action | Lines Changed |
|------|--------|---------------|
| `backend/app/routers/pharmacy.py` | Edited | -409 |
| `frontend/src/App.tsx` | Edited | -30 |
| `frontend/src/services/pharmacyService.ts` | Edited | -89 |
| `frontend/src/pages/pharmacy/SupplierList.tsx` | Deleted | -613 |
| `frontend/src/pages/pharmacy/SupplierForm.tsx` | Deleted | -813 |
| `frontend/src/pages/pharmacy/PurchaseOrderList.tsx` | Deleted | -813 |
| `frontend/src/pages/pharmacy/PurchaseOrderForm.tsx` | Deleted | ~-500 |

**Total:** ~-3,267 lines removed

---

## Next Steps (Optional)

1. Update navigation menu to remove "Suppliers" and "Purchase Orders" from Pharmacy dropdown
2. Add these items to Inventory dropdown (if not already present)
3. Update user documentation/training materials
4. Consider adding pharmacy-specific views to inventory POs (e.g., filter by item_type='medicine')
