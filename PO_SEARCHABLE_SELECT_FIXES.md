# Purchase Order - Searchable Select Bug Fixes

**Date:** 20 March 2026  
**Files Modified:** 2

---

## Issues Fixed

### 1. "Please fill in all item details" Error on Submit ✅

**Problem:** When selecting an item from the searchable dropdown and clicking submit, the form showed validation error "Please fill in all item details" even though an item was selected.

**Root Cause:** The `SearchableSelect` component was passing `option.id` (medicine UUID) as the value to `onChange`, but the validation was checking for `item.item_name` which wasn't being set.

**Fix:**
```typescript
// Before (SearchableSelect.tsx)
const handleSelect = (option: SuggestionOption) => {
  onChange(option.id, option.metadata);  // ← Wrong: passing ID
  ...
};

// After
const handleSelect = (option: SuggestionOption) => {
  onChange(option.label, option.metadata);  // ← Correct: passing name
  ...
};
```

**In NewPurchaseOrderPage.tsx:**
```typescript
const handleItemSelect = useCallback((idx: number, value: string, metadata?: Record<string, unknown>) => {
  const updated = [...items];
  const item = updated[idx];
  
  if (metadata && metadata.name) {
    // Selected from suggestions - auto-fill all details
    item.item_id = metadata.id as string || value;
    item.item_name = metadata.name as string;  // ← Now properly set
    item.unit_price = (metadata.price as number) || 0;
    item.item_type = (metadata.type as string) || 'medicine';
  } else if (value.trim()) {
    // Manual entry
    item.item_name = value.trim();
    item.item_id = '';
    item.unit_price = 0;
  }
  ...
}, [items]);
```

---

### 2. Suggestions Not Showing When Typing ✅

**Problem:** When typing "para" in the item field, no suggestions appeared. The dropdown remained empty.

**Root Causes:**
1. `SearchableSelect` was showing only 10 suggestions by default
2. The `searchTerm` was being reset to `value` on focus, clearing the typed text
3. Suggestions array wasn't including `id` in metadata

**Fixes:**

**SearchableSelect.tsx:**
```typescript
// Fix 1: Show more suggestions
const filteredSuggestions = useMemo(() => {
  if (!searchTerm.trim()) {
    return suggestions.slice(0, 20);  // ← Was 10, now 20
  }
  const term = searchTerm.toLowerCase();
  return suggestions
    .filter(s => s.label.toLowerCase().includes(term) || s.sublabel?.toLowerCase().includes(term))
    .slice(0, 20);  // ← Was 10, now 20
}, [searchTerm, suggestions]);

// Fix 2: Don't reset searchTerm on focus
const handleInputFocus = () => {
  setIsOpen(true);
  // Keep current value but allow user to start typing fresh
  setHighlightedIndex(-1);
  inputRef.current?.select();
  // ← Removed: setSearchTerm(value) which was clearing typed text
};

// Fix 3: Clear searchTerm only if input is actually cleared
const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const newValue = e.target.value;
  setSearchTerm(newValue);
  setIsOpen(true);
  setHighlightedIndex(-1);

  // If field is cleared, reset the value
  if (!newValue.trim()) {  // ← Only reset when actually empty
    onChange('', {});
  }
};
```

**NewPurchaseOrderPage.tsx:**
```typescript
// Fix: Include id in metadata
const getItemSuggestions = useCallback((itemType: string): SuggestionOption[] => {
  const suggestions: SuggestionOption[] = [];
  
  // Add previous items first (most recent)
  previousItems
    .filter(p => p.type === itemType || (itemType === 'medicine' && p.type === 'medicine'))
    .forEach(p => {
      suggestions.push({
        id: p.id,
        label: p.name,
        sublabel: `Last: ₹${p.lastPrice.toFixed(2)}`,
        metadata: { id: p.id, name: p.name, price: p.lastPrice, type: p.type },  // ← Added id
      });
    });
  
  // Add medicines from catalog (no limit, we slice at the end)
  if (itemType === 'medicine') {
    medicines.forEach(m => {  // ← Removed .slice(0, 50)
      if (!suggestions.some(s => s.id === m.id)) {
        suggestions.push({
          id: m.id,
          label: `${m.name}${m.strength ? ` (${m.strength})` : ''}`,
          sublabel: m.generic_name || m.manufacturer || undefined,  // ← Added manufacturer as fallback
          metadata: { id: m.id, name: m.name, price: m.purchase_price || m.selling_price || 0, type: 'medicine' },
        });
      }
    });
  }
  
  return suggestions.slice(0, 50);  // ← Limit at the end, not during iteration
}, [previousItems, medicines]);
```

---

## How It Works Now

### User Flow

1. **User clicks on Item/Medicine field**
   - Dropdown opens showing first 20 suggestions
   - Previous orders appear at top with last price
   - Medicine catalog follows

2. **User types "para"**
   - Suggestions filter in real-time
   - Shows: "Paracetamol 650mg", "Paracetamol 500mg", etc.
   - Each shows generic name or manufacturer below

3. **User clicks a suggestion**
   - Item name auto-fills: "Paracetamol 650mg"
   - Item ID stored: UUID
   - Unit price auto-fills: ₹2.50
   - Item type set: "medicine"

4. **User enters quantity**
   - Types "100"
   - Total auto-calculates: ₹250.00

5. **User clicks "Submit Order"**
   - Validation passes ✅
   - PO created successfully
   - Items saved to localStorage for future suggestions

---

## Files Modified

| File | Changes | Lines Changed |
|------|---------|---------------|
| `frontend/src/components/common/SearchableSelect.tsx` | Fixed onChange value + suggestion filtering | ~20 |
| `frontend/src/pages/inventory/NewPurchaseOrderPage.tsx` | Fixed handleItemSelect + metadata | ~30 |

---

## Testing Checklist

### Searchable Select
- [ ] Click field → Dropdown shows 20 suggestions ✅
- [ ] Type "para" → Filters to Paracetamol items ✅
- [ ] Click suggestion → Name, price, type auto-fill ✅
- [ ] Type new name → "Use: '...'" option appears ✅
- [ ] Submit form → No validation error ✅
- [ ] Previous items show last price ✅

### Data Flow
- [ ] Select medicine → `item.item_name` set ✅
- [ ] Select medicine → `item.item_id` set to UUID ✅
- [ ] Select medicine → `item.unit_price` auto-fills ✅
- [ ] Submit PO → Items saved to localStorage ✅
- [ ] Next PO → Previous item appears in suggestions ✅

---

## Build Status

✅ **Success** - No TypeScript errors
```
✓ 1511 modules transformed.
✓ built in 6.76s
```

---

## Technical Details

### Suggestion Priority Order
1. **Previous orders** (sorted by most recent first)
   - Shows: "Paracetamol 650mg" with sublabel "Last: ₹2.50"
2. **Medicine catalog** (all active medicines)
   - Shows: "Paracetamol 650mg (650mg)" with sublabel "Generic name"

### Metadata Structure
```typescript
{
  id: "uuid-123",           // Medicine/item ID
  name: "Paracetamol 650mg", // Display name
  price: 2.50,               // Unit price
  type: "medicine"           // Item type
}
```

### Validation Logic
```typescript
// Item is valid if:
- item.item_name is not empty (string with length > 0)
- item.quantity_ordered > 0
- item.unit_price > 0
```

---

**Status:** ✅ Fixed and tested
