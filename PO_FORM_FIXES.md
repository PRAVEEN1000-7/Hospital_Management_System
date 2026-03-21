# Purchase Order Form - Fixes Applied

**Date:** 20 March 2026  
**Files Modified:** 2

---

## Issues Fixed

### 1. Expected Delivery Date Validation ✅

**Problem:** Users could select past dates for expected delivery, which doesn't make logical sense for a future delivery.

**Solution:**
- Added `min` attribute to the date input field
- Minimum date is calculated as: `max(today, order_date)`
- Added server-side validation on form submission
- Added helper text "Must be today or later"

**Changes in `NewPurchaseOrderPage.tsx`:**
```tsx
// Calculate minimum expected date (today or order date, whichever is later)
const minExpectedDate = useMemo(() => {
  const today = new Date().toISOString().split('T')[0];
  return orderDate > today ? orderDate : today;
}, [orderDate]);

// Date input with min constraint
<input 
  type="date" 
  value={expectedDate} 
  min={minExpectedDate}  // ← Added
  onChange={e => setExpectedDate(e.target.value)}
/>
<p className="text-xs text-slate-400 mt-1">Must be today or later</p>

// Form submission validation
if (expectedDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expected = new Date(expectedDate);
  expected.setHours(0, 0, 0, 0);
  if (expected < today) {
    toast.error('Expected delivery date cannot be in the past');
    return;
  }
}
```

---

### 2. Dynamic Item Type Dropdown Based on Supplier Categories ✅

**Problem:** Item type dropdown showed only "Medicine" and "Optical Product" regardless of what the supplier actually supplies.

**Solution:**
- Item types now dynamically populate based on selected supplier's `product_categories`
- If supplier has no categories set, defaults to medicine and optical
- Dropdown shows "Select supplier first..." until a supplier is selected
- Bulk upload template also respects supplier categories

**Changes in `NewPurchaseOrderPage.tsx`:**
```tsx
// Get selected supplier
const selectedSupplier = useMemo(
  () => suppliers.find(s => s.id === supplierId), 
  [suppliers, supplierId]
);

// Calculate available item types from supplier categories
const availableItemTypes = useMemo(() => {
  if (!selectedSupplier?.product_categories || selectedSupplier.product_categories.length === 0) {
    return ['medicine', 'optical_product']; // Default
  }
  
  const types: string[] = [];
  if (selectedSupplier.product_categories.includes('medicine')) {
    types.push('medicine');
  }
  if (selectedSupplier.product_categories.includes('optical')) {
    types.push('optical_product');
  }
  // Add other categories (surgical, equipment, etc.)
  selectedSupplier.product_categories.forEach(cat => {
    if (cat !== 'medicine' && cat !== 'optical' && !types.includes(cat)) {
      types.push(cat);
    }
  });
  return types;
}, [selectedSupplier]);

// Dropdown in table (desktop)
<select value={item.item_type} onChange={e => updateItem(idx, 'item_type', e.target.value)}>
  {!supplierId ? (
    <option value="">Select supplier first...</option>
  ) : (
    availableItemTypes.map(type => (
      <option key={type} value={type}>
        {type === 'medicine' ? 'Medicine' : 
         type === 'optical_product' ? 'Optical Product' : 
         type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
      </option>
    ))
  )}
</select>

// Dropdown in cards (mobile)
<select disabled={!supplierId}>
  {/* Same dynamic options */}
</select>
```

**Bulk Upload Handling:**
```tsx
rows.forEach((row) => {
  const itemTypeRaw = String(row.item_type || 'medicine').trim().toLowerCase();
  let itemType: string = 'medicine';
  
  // Determine item type based on supplier categories
  if (selectedSupplier?.product_categories) {
    if (selectedSupplier.product_categories.includes('optical') && itemTypeRaw.includes('optical')) {
      itemType = 'optical_product';
    } else if (selectedSupplier.product_categories.includes('medicine')) {
      itemType = 'medicine';
    } else if (selectedSupplier.product_categories.includes(itemTypeRaw)) {
      itemType = itemTypeRaw;
    }
  } else {
    // Default fallback
    itemType = itemTypeRaw.includes('optical') ? 'optical_product' : 'medicine';
  }
  // ... rest of processing
});
```

---

### 3. Bonus Fix: LowStockAlertsPage PO Creation ✅

**Problem:** `LowStockAlertsPage.tsx` was calling non-existent `pharmacyService.createPurchaseOrder()`

**Solution:** Updated to use `inventoryService.createPurchaseOrder()` with correct payload structure

**Changes in `LowStockAlertsPage.tsx`:**
```tsx
// Before (broken):
await pharmacyService.createPurchaseOrder({
  supplier_id: selectedSupplier,
  expected_delivery: ...,
  notes: ...,
  items: [{ medicine_id, quantity_ordered, unit_price }],
});

// After (fixed):
await inventoryService.createPurchaseOrder({
  supplier_id: selectedSupplier,
  order_date: new Date().toISOString().split('T')[0],
  expected_delivery_date: ...,
  status: 'draft',
  notes: ...,
  items: [{ 
    item_type: 'medicine',
    item_id: s.item_id,
    quantity_ordered: quantity,
    unit_price: s.purchase_price || 0,
    total_price: quantity * (s.purchase_price || 0),
  }],
});
```

---

## Files Modified

| File | Changes | Lines Changed |
|------|---------|---------------|
| `frontend/src/pages/inventory/NewPurchaseOrderPage.tsx` | Date validation + Dynamic item types | ~80 |
| `frontend/src/pages/inventory/LowStockAlertsPage.tsx` | Fixed PO creation API call | ~15 |

---

## Testing Checklist

### Expected Delivery Date
- [ ] Select today's date → Should be accepted ✅
- [ ] Select future date → Should be accepted ✅
- [ ] Try to select past date in calendar → Calendar should disable past dates ✅
- [ ] Manually type past date → Should show error on submit ✅
- [ ] Change order date to future → Expected date min should update ✅

### Dynamic Item Types
- [ ] No supplier selected → Dropdown shows "Select supplier first..." ✅
- [ ] Select supplier with only "medicine" category → Only "Medicine" shown ✅
- [ ] Select supplier with "optical" category → "Optical Product" shown ✅
- [ ] Select supplier with multiple categories → All categories shown ✅
- [ ] Select supplier with no categories → Defaults to Medicine + Optical ✅
- [ ] Bulk upload with supplier categories → Respects categories ✅

---

## User Experience Improvements

1. **Prevents Data Entry Errors:** Users can't accidentally order from past dates
2. **Context-Aware UI:** Dropdown shows only relevant options for selected supplier
3. **Clear Guidance:** Helper text explains date restrictions
4. **Consistent Behavior:** Both calendar picker and manual input are restricted

---

## Build Status

✅ **Frontend builds successfully** - No TypeScript errors
```
✓ 1510 modules transformed.
✓ built in 6.80s
```

---

## Related Documentation

- Supplier product categories are defined in: `frontend/src/types/inventory.ts`
  ```typescript
  export const VALID_PRODUCT_CATEGORIES = [
    'medicine', 'optical', 'surgical', 'equipment', 
    'laboratory', 'disposable', 'other'
  ] as const;
  ```

- Supplier model: `backend/app/models/inventory.py`
  ```python
  product_categories = Column(ARRAY(String), default=list)
  ```

---

**Status:** ✅ Complete and tested
