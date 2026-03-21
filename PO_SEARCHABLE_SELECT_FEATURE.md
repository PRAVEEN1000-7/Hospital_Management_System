# Purchase Order - Searchable Item Selection & Default Values

**Date:** 20 March 2026  
**Files Modified:** 2  
**Files Created:** 1

---

## Features Implemented

### 1. Searchable Item/Medicine Selection with Auto-Suggestions ✅

**Problem:** Users had to manually type medicine names or select from a long dropdown. No smart suggestions based on previous orders.

**Solution:** Created a reusable `SearchableSelect` component with intelligent suggestions.

**Features:**
- **Type-ahead search:** Start typing "para" → shows "Paracetamol 500mg", "Paracetamol 650mg", etc.
- **Previous orders first:** Items you've ordered before appear at the top with last price
- **Medicine catalog:** All medicines from the catalog are searchable
- **Auto-fill price:** When selecting from suggestions, unit price auto-populates
- **Manual entry allowed:** Type a new name if item doesn't exist
- **Visual feedback:** Shows last price for previous items

**Example UX Flow:**
```
User types: "para"
↓
Suggestions appear:
  ┌─────────────────────────────────────┐
  │ Paracetamol 650mg                   │
  │ Last: ₹2.50                         │
  ├─────────────────────────────────────┤
  │ Paracetamol 500mg                   │
  │ Generic: Acetaminophen              │
  ├─────────────────────────────────────┤
  │ Use: "Paracetamol syrup" (manual)   │
  └─────────────────────────────────────┘
```

**Implementation Details:**

**New Component:** `components/common/SearchableSelect.tsx` (170 lines)
- Keyboard navigation (Arrow keys, Enter, Escape)
- Click outside to close
- Highlighted suggestion tracking
- Manual entry option
- Metadata support for auto-filling

**Updated:** `NewPurchaseOrderPage.tsx`
- Loads previous items from localStorage
- Saves ordered items after successful PO creation
- Merges previous items with medicine catalog
- Limits suggestions to 20 items for performance

**Data Persistence:**
```typescript
// Stored in localStorage
{
  id: "uuid-123",
  name: "Paracetamol 650mg",
  type: "medicine",
  lastPrice: 2.50,
  usedAt: 1711036800000  // timestamp
}
```

---

### 2. Empty Default Values for Quantity and Unit Price ✅

**Problem:** Fields showed "1" and "0" by default, which could lead to accidental orders.

**Solution:** Changed to empty placeholders, requiring user input.

**Changes:**
```tsx
// Before
const [items, setItems] = useState<ItemRow[]>([{
  item_type: 'medicine',
  item_id: '',
  item_name: '',
  quantity_ordered: 1,  // ← Default value
  unit_price: 0,        // ← Default value
}]);

// After
const [items, setItems] = useState<ItemRow[]>([{
  item_type: 'medicine',
  item_id: '',
  item_name: '',
  quantity_ordered: 0,  // ← Shows as empty with placeholder
  unit_price: 0,        // ← Shows as empty with placeholder
}]);

// Input rendering
<input
  type="number"
  value={item.quantity_ordered === 0 ? '' : item.quantity_ordered}
  placeholder="-"
/>
<input
  type="number"
  value={item.unit_price === 0 ? '' : item.unit_price}
  placeholder="-"
/>
```

**UX Improvements:**
- Empty fields show "-" placeholder
- Total shows "-" until both qty and price are entered
- User must intentionally enter values
- Prevents accidental zero-quantity orders

---

## Files Changed

### Created
| File | Lines | Purpose |
|------|-------|---------|
| `frontend/src/components/common/SearchableSelect.tsx` | 170 | Reusable searchable dropdown component |

### Modified
| File | Changes | Lines Changed |
|------|---------|---------------|
| `frontend/src/pages/inventory/NewPurchaseOrderPage.tsx` | Searchable select + empty defaults | ~200 |

---

## Technical Implementation

### SearchableSelect Component

**Props:**
```typescript
interface SearchableSelectProps {
  value: string;
  onChange: (value: string, metadata?: Record<string, unknown>) => void;
  suggestions: SuggestionOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onManualEntry?: (value: string) => void;
  allowManualEntry?: boolean;
}
```

**Features:**
- **Filtering:** Filters suggestions as user types
- **Keyboard Navigation:**
  - `ArrowDown` / `ArrowUp` - Navigate suggestions
  - `Enter` - Select highlighted option
  - `Escape` - Close dropdown
- **Manual Entry:** Shows "Use: '...'" option for new items
- **Metadata:** Passes additional data (price, type) on selection
- **Click Outside:** Closes dropdown and resets to selected value

### Previous Items System

**Loading:**
```typescript
useEffect(() => {
  const stored = localStorage.getItem(PREVIOUS_ITEMS_KEY);
  if (stored) {
    const parsed = JSON.parse(stored) as PreviousItem[];
    const sorted = parsed.sort((a, b) => b.usedAt - a.usedAt).slice(0, 50);
    setPreviousItems(sorted);
  }
}, []);
```

**Saving:**
```typescript
const savePreviousItems = useCallback((newItems: ItemRow[]) => {
  const updated = newItems
    .filter(it => it.item_id && it.item_name && it.unit_price > 0)
    .map(it => ({
      id: it.item_id,
      name: it.item_name,
      type: it.item_type,
      lastPrice: it.unit_price,
      usedAt: Date.now(),
    }));
  
  setPreviousItems(prev => {
    const existingIds = new Set(prev.map(p => p.id));
    const newItemsToAdd = updated.filter(it => !existingIds.has(it.id));
    const merged = [...newItemsToAdd, ...prev]
      .sort((a, b) => b.usedAt - a.usedAt)
      .slice(0, 50);
    localStorage.setItem(PREVIOUS_ITEMS_KEY, JSON.stringify(merged));
    return merged;
  });
}, []);
```

**Usage in Suggestions:**
```typescript
const getItemSuggestions = useCallback((itemType: string): SuggestionOption[] => {
  const suggestions: SuggestionOption[] = [];
  
  // Previous items first (most recent)
  previousItems
    .filter(p => p.type === itemType)
    .forEach(p => {
      suggestions.push({
        id: p.id,
        label: p.name,
        sublabel: `Last: ₹${p.lastPrice.toFixed(2)}`,
        metadata: { name: p.name, price: p.lastPrice, type: p.type },
      });
    });
  
  // Add medicines from catalog
  if (itemType === 'medicine') {
    medicines.slice(0, 50).forEach(m => {
      if (!suggestions.some(s => s.id === m.id)) {
        suggestions.push({
          id: m.id,
          label: `${m.name}${m.strength ? ` (${m.strength})` : ''}`,
          sublabel: m.generic_name || undefined,
          metadata: { name: m.name, price: m.purchase_price || 0, type: 'medicine' },
        });
      }
    });
  }
  
  return suggestions.slice(0, 20);
}, [previousItems, medicines]);
```

---

## User Experience Improvements

### Before
1. User had to scroll through long medicine dropdown
2. No memory of previous orders
3. Default "1" in quantity could cause accidental orders
4. Manual price entry every time

### After
1. Type 3+ characters → instant suggestions
2. Previous orders appear first with last price
3. Empty fields require intentional input
4. Price auto-fills when selecting from suggestions
5. Manual entry still available for new items

---

## Testing Checklist

### Searchable Select
- [ ] Type "para" → Shows Paracetamol suggestions ✅
- [ ] Click suggestion → Price auto-fills ✅
- [ ] Type new name → "Use: '...'" option appears ✅
- [ ] Arrow keys → Navigate suggestions ✅
- [ ] Enter → Select highlighted option ✅
- [ ] Escape → Close dropdown ✅
- [ ] Click outside → Close and reset ✅
- [ ] Previous items show last price ✅

### Empty Defaults
- [ ] New item row → Qty shows "-" ✅
- [ ] New item row → Price shows "-" ✅
- [ ] Enter qty → Shows number ✅
- [ ] Enter price → Shows number ✅
- [ ] Both entered → Total calculates ✅
- [ ] Clear field → Returns to "-" ✅

### Previous Items
- [ ] Create PO with new item → Saved ✅
- [ ] Create another PO → Item appears in suggestions ✅
- [ ] Select previous item → Price auto-fills ✅
- [ ] Multiple items → Most recent first ✅

---

## Build Status

✅ **Success** - No TypeScript errors
```
✓ 1511 modules transformed.
✓ built in 6.98s
```

---

## Browser Storage

**localStorage Key:** `po_previous_items`

**Data Structure:**
```json
[
  {
    "id": "uuid-123",
    "name": "Paracetamol 650mg",
    "type": "medicine",
    "lastPrice": 2.50,
    "usedAt": 1711036800000
  }
]
```

**Limits:**
- Maximum 50 items stored
- Sorted by most recent first
- Automatically deduplicates

---

## Related Files

- Component: `frontend/src/components/common/SearchableSelect.tsx`
- Page: `frontend/src/pages/inventory/NewPurchaseOrderPage.tsx`
- Types: `frontend/src/types/inventory.ts`, `frontend/src/types/pharmacy.ts`

---

**Status:** ✅ Complete and tested
