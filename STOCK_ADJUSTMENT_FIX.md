# 🔧 Stock Adjustment Unification Fix

## Date: 2026-03-17
## Issue: Inconsistent Stock Adjustment Between Inventory & Pharmacy

---

## 🐛 Problem Identified

The Hospital Management System had **TWO separate stock adjustment implementations**:

### 1. Inventory Module Stock Adjustment
- **Model:** `StockAdjustment` in `models/inventory.py`
- **Fields:** `item_id`, `item_type`, `batch_id`, `status` (pending/approved/rejected)
- **Workflow:** Requires approval (pending → approved/rejected)
- **Use Case:** General hospital inventory adjustments

### 2. Pharmacy Module Stock Adjustment
- **Model:** Was using same `StockAdjustment` from inventory BUT...
- **Fields:** Using `medicine_id` instead of `item_id` ❌
- **Workflow:** Auto-approved (status = "approved") ✅
- **Use Case:** Pharmacy-specific adjustments (damage, expired, returns)

---

## ❌ Inconsistencies Found

| Aspect | Inventory Module | Pharmacy Module | Issue |
|--------|-----------------|-----------------|-------|
| **Field Name** | `item_id` | `medicine_id` | ❌ Schema mismatch |
| **Status** | pending/approved/rejected | always "approved" | ⚠️ Different workflow |
| **Quantity** | Positive/negative | Always positive | ❌ Inconsistent direction |
| **Response** | Includes item_name | No medicine name | ❌ Poor UX |
| **Adjustment Types** | increase/decrease/write_off | damage/expired/correction/return | ⚠️ Different types |

---

## ✅ Solution Implemented

### 1. **Unified Data Model**
Pharmacy now properly uses the inventory `StockAdjustment` model with correct field names:

```python
# Before (WRONG):
adj = StockAdjustment(
    medicine_id=medicine_id,  # ❌ Wrong field name
    adjusted_by=user_id,       # ❌ Wrong field name
)

# After (CORRECT):
adj = StockAdjustment(
    item_id=medicine_id,       # ✅ Correct field name
    approved_by=user_id,       # ✅ Correct field name
    created_by=user_id,        # ✅ Added missing field
)
```

### 2. **Quantity Direction Logic**
Implemented consistent quantity handling:

```python
# Determine quantity direction based on adjustment type
if adj_type in ["damage", "expired"]:
    qty = -abs(qty)  # Always negative (stock out)
elif adj_type == "return":
    qty = abs(qty)   # Always positive (stock in)
# correction keeps the sign as provided
```

### 3. **Auto-Approval for Pharmacy**
Pharmacy adjustments are auto-approved (as before) but now with proper fields:

```python
adj = StockAdjustment(
    status="approved",      # Auto-approved for pharmacy
    approved_by=user_id,    # Approved by creating user
    created_by=user_id,     # Created by user
)
```

### 4. **Enhanced Response Schema**
Updated pharmacy response to include medicine names:

```python
class StockAdjustmentResponse(BaseModel):
    id: str
    item_id: str           # ✅ Correct field name
    medicine_name: str     # ✅ Computed field for display
    status: str            # ✅ Added status
    approved_by: str       # ✅ Correct field name
    
    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        """Transform inventory StockAdjustment to pharmacy format."""
        if isinstance(data, dict):
            data['medicine_id'] = data.get('item_id')  # Map for pharmacy
            if not data.get('medicine_name') and data.get('item_name'):
                data['medicine_name'] = data['item_name']
        return data
```

### 5. **Improved List Function**
Pharmacy list now fetches medicine names for display:

```python
def list_stock_adjustments(...) -> list:
    """List pharmacy stock adjustments with medicine names."""
    adjustments = db.query(StockAdjustment).filter(
        StockAdjustment.hospital_id == hospital_id,
        StockAdjustment.item_type == 'medicine'
    ).all()
    
    # Add medicine names
    result = []
    for adj in adjustments:
        med = db.query(Medicine).filter(Medicine.id == adj.item_id).first()
        result.append({
            ...adj_dict,
            'medicine_name': med.name if med else None
        })
    
    return result
```

### 6. **Enhanced Frontend Display**
Updated pharmacy UI to show medicine names with icons:

```tsx
<td className="px-4 py-3 font-medium text-slate-900">
  <div className="flex items-center gap-2">
    <span className="material-icons text-slate-400 text-sm">medication</span>
    {a.medicine_name || (
      <span className="text-slate-400 text-xs font-mono">
        {a.item_id?.substring(0, 8)}...
      </span>
    )}
  </div>
</td>
<td className="px-4 py-3 text-slate-600">
  <span className={a.quantity < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
    {a.quantity < 0 ? '-' : '+'}{Math.abs(a.quantity)}
  </span>
</td>
```

---

## 📁 Files Modified

### Backend (3 files):
1. **`backend/app/services/pharmacy_service.py`**
   - Fixed `create_stock_adjustment()` to use correct field names
   - Added quantity direction logic
   - Enhanced `list_stock_adjustments()` to include medicine names

2. **`backend/app/schemas/pharmacy.py`**
   - Updated `StockAdjustmentCreate` schema
   - Enhanced `StockAdjustmentResponse` with transformer
   - Added proper field mappings

### Frontend (1 file):
3. **`frontend/src/pages/pharmacy/StockAdjustments.tsx`**
   - Changed to use inventory types
   - Added medicine name display with icons
   - Enhanced quantity display with +/- indicators
   - Added more adjustment type colors

---

## 🎨 UI Improvements

### Before:
```
Date       | Medicine                      | Type      | Qty | Reason
-----------|-------------------------------|-----------|-----|--------
2026-03-17 | a1b2c3d4-e5f6-...             | damage    | 10  | Broken
```

### After:
```
Date       | Medicine                      | Type      | Qty  | Reason
-----------|-------------------------------|-----------|------|--------
2026-03-17 | 💊 Paracetamol 500mg          | damage    | -10  | Broken
2026-03-17 | 💊 Ibuprofen 400mg            | expired   | -5   | Past expiry
2026-03-17 | 💊 Cough Syrup                | return    | +20  | Customer return
```

**Enhanced Features:**
- ✅ Medicine name with icon (not UUID)
- ✅ Quantity direction (+/-) with color coding
- ✅ Red for negative (stock out)
- ✅ Green/Em erald for positive (stock in)
- ✅ Better visual hierarchy

---

## 🔒 Data Flow

### Pharmacy Stock Adjustment Flow:
```
1. Pharmacist creates adjustment
   ↓
2. Frontend sends: { medicine_id, batch_id, type: 'damage', quantity: 10 }
   ↓
3. Backend converts quantity: 10 → -10 (damage = stock out)
   ↓
4. Updates batch quantity: batch.quantity += -10
   ↓
5. Creates StockAdjustment record:
   - item_type: 'medicine'
   - item_id: medicine_id
   - adjustment_type: 'damage'
   - quantity: -10
   - status: 'approved' (auto)
   ↓
6. Returns adjustment with medicine_name for display
```

---

## ✅ Testing Checklist

### Backend:
- [x] `create_stock_adjustment()` uses correct field names
- [x] Quantity direction logic works (damage/expired = negative)
- [x] Batch quantity updates correctly
- [x] `list_stock_adjustments()` returns medicine names
- [x] Auto-approval works for pharmacy

### Frontend:
- [x] Medicine names display (not UUIDs)
- [x] Icons show for medicines
- [x] Quantity shows +/- with colors
- [x] All adjustment types color-coded
- [x] Form submission works

### Integration:
- [x] Pharmacy adjustments appear in inventory list
- [x] Both modules use same StockAdjustment model
- [x] Data consistent across modules

---

## 🔧 Migration Notes

### For Existing Data:
No database migration needed! The changes are in the application layer:
- Field names now match the database schema (`item_id` not `medicine_id`)
- Existing records will display correctly
- New records will be created with correct fields

### API Compatibility:
- **Breaking Change:** Pharmacy API now returns `item_id` instead of `medicine_id`
- **Backward Compatible:** Response transformer maps `item_id` → `medicine_id` for frontend
- **Frontend:** Updated to handle both field names

---

## 📊 Benefits

### Consistency:
- ✅ Single source of truth (inventory StockAdjustment model)
- ✅ Same field names across modules
- ✅ Consistent data structure

### User Experience:
- ✅ Medicine names instead of UUIDs
- ✅ Visual indicators (icons, colors)
- ✅ Clear quantity direction (+/-)

### Data Integrity:
- ✅ Proper quantity direction logic
- ✅ Prevents negative stock
- ✅ Audit trail maintained

### Maintainability:
- ✅ Less code duplication
- ✅ Shared model between modules
- ✅ Easier to add new adjustment types

---

## 🚀 How to Test

### Test 1: Create Pharmacy Adjustment
```bash
1. Go to /pharmacy/stock-adjustments
2. Click "New Adjustment"
3. Select medicine: Paracetamol 500mg
4. Select type: damage
5. Enter quantity: 10
6. Submit
7. ✅ Should show: "-10" in red with medicine name
```

### Test 2: View Adjustments
```bash
1. Go to /pharmacy/stock-adjustments
2. View list
3. ✅ Should see medicine names with icons
4. ✅ Should see +/- quantities with colors
5. ✅ Should see all adjustment types
```

### Test 3: Inventory Integration
```bash
1. Go to /inventory/adjustments
2. Find pharmacy adjustments (ADJ-PHARM-*)
3. ✅ Should see same adjustments
4. ✅ Should have status "approved"
5. ✅ Should show medicine name
```

---

## 📝 Related Documentation

- `NOTIFICATION_SYSTEM.md` - Notification system for stock alerts
- `project-plan/02_DATABASE_SCHEMA.md` - StockAdjustment table schema
- `backend/app/models/inventory.py` - StockAdjustment model definition

---

## 🎉 Summary

**Issue:** Inconsistent stock adjustment between inventory and pharmacy modules

**Root Cause:** Pharmacy was using inventory model but with wrong field names and inconsistent logic

**Solution:** 
- ✅ Unified field names (`item_id`, `approved_by`, `created_by`)
- ✅ Consistent quantity direction logic
- ✅ Auto-approval for pharmacy (business as usual)
- ✅ Enhanced display with medicine names
- ✅ Better UX with icons and colors

**Result:** Single, consistent stock adjustment system used by both modules!

---

**Status:** ✅ FIXED - Production Ready  
**Commit:** `fix: Unify stock adjustment between inventory and pharmacy modules`
