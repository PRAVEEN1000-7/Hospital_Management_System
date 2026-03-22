# Intelligent Typeahead for Purchase Order Creation

**Date:** 22 March 2026  
**Feature:** Intelligent typeahead search with auto-population for PO items

---

## Overview

When creating a Purchase Order, users can now search for products using an **intelligent typeahead** feature. As they type, the system fetches matching products from the Product table and displays autocomplete suggestions. When a product is selected, all related details (name, price, category, etc.) are automatically populated.

---

## Features

### ✅ **Intelligent Search**
- Searches across multiple fields:
  - Product name
  - Generic name
  - SKU
  - Barcode
  - Manufacturer
- Minimum 2 characters to trigger search
- 300ms debouncing to prevent excessive API calls
- Category-aware filtering

### ✅ **Auto-Population**
When a product is selected from suggestions:
- ✅ Item name auto-filled
- ✅ Unit price auto-filled
- ✅ Item type auto-selected
- ✅ Product ID stored for reference

### ✅ **Combined Suggestions**
The typeahead combines suggestions from:
1. **Previously ordered items** (most recent first)
2. **Medicines catalog** (for medicine type)
3. **Product search results** (intelligent typeahead)

### ✅ **Visual Feedback**
- Loading spinner while fetching suggestions
- Highlighted matches
- Clear sublabels with price and SKU info
- Manual entry option if product not found

---

## User Flow

```
1. User navigates to: Inventory → Purchase Orders → New PO
2. User selects supplier
3. User starts typing in "Item / Medicine" field
   ↓
4. After 2 characters:
   ├─ System waits 300ms (debounce)
   ├─ Calls /api/v1/inventory/products/search
   ├─ Receives matching products
   └─ Displays suggestions dropdown
   ↓
5. User sees suggestions with:
   ├─ Product name (bold)
   ├─ Generic name
   ├─ Manufacturer
   ├─ SKU
   └─ Price
   ↓
6. User clicks a suggestion
   ↓
7. System auto-fills:
   ├─ Item name
   ├─ Unit price
   ├─ Item type
   └─ Product ID
   ↓
8. User enters quantity
9. User adds more items or submits PO
```

---

## Implementation Details

### Backend: New Search Endpoint

**File:** `backend/app/routers/products.py` (Line 94-113)

```python
@products_router.get("/search", response_model=list)
async def search_products(
    q: str = Query(..., min_length=2, description="Search query"),
    category: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(inventory_view_roles),
):
    """Intelligent typeahead search for products."""
    results = svc.search_products_for_typeahead(
        db, 
        current_user.hospital_id, 
        query=q, 
        category=category, 
        limit=limit
    )
    return results
```

---

### Backend: Search Service Function

**File:** `backend/app/services/products_service.py` (Line 287-365)

```python
def search_products_for_typeahead(
    db: Session,
    hospital_id: uuid.UUID,
    query: str,
    category: Optional[str] = None,
    limit: int = 20,
) -> list:
    """
    Intelligent typeahead search for products.
    Searches by: product name, generic name, SKU, barcode, manufacturer
    """
    search_term = f"%{query.strip()}%"
    
    q = db.query(Product).filter(
        Product.hospital_id == hospital_id,
        Product.is_active == True,
        Product.is_deleted == False,
    )
    
    # Search across multiple fields
    q = q.filter(or_(
        Product.product_name.ilike(search_term),
        Product.generic_name.ilike(search_term),
        Product.sku.ilike(search_term),
        Product.barcode.ilike(search_term),
        Product.manufacturer.ilike(search_term),
    ))
    
    # Filter by category if specified
    if category:
        q = q.filter(Product.category == category)
    
    # Order by relevance
    q = q.order_by(
        Product.product_name.ilike(f"{query.strip()}%").desc(),
        Product.product_name,
    )
    
    products = q.limit(limit).all()
    
    # Format results for typeahead
    results = []
    for p in products:
        results.append({
            "id": str(p.id),
            "label": f"{p.product_name} ({p.generic_name or 'N/A'})",
            "sublabel": f"{p.manufacturer or ''} | SKU: {p.sku or 'N/A'} | ₹{float(p.selling_price or 0):.2f}",
            "metadata": {
                "id": str(p.id),
                "name": p.product_name,
                "generic_name": p.generic_name,
                "category": p.category,
                "subcategory": p.subcategory,
                "sku": p.sku,
                "barcode": p.barcode,
                "manufacturer": p.manufacturer,
                "purchase_price": float(p.purchase_price or 0),
                "selling_price": float(p.selling_price or 0),
                "mrp": float(p.mrp or 0),
                "unit_type": p.unit_type,
                "pack_size": p.pack_size or 1,
                "requires_prescription": p.requires_prescription,
            }
        })
    
    return results
```

---

### Frontend: Product Search Service

**File:** `frontend/src/services/productsService.ts` (Line 42-91)

```typescript
async searchProducts(
  query: string,
  options?: { category?: string; limit?: number },
): Promise<Array<{
  id: string;
  label: string;
  sublabel?: string;
  metadata: {
    id: string;
    name: string;
    generic_name?: string;
    category: string;
    subcategory?: string;
    sku?: string;
    barcode?: string;
    manufacturer?: string;
    purchase_price: number;
    selling_price: number;
    mrp: number;
    unit_type: string;
    pack_size: number;
    requires_prescription: boolean;
  };
}>> {
  const params: Record<string, string | number> = { q: query };
  if (options?.category) params.category = options.category;
  if (options?.limit) params.limit = options.limit;
  const res = await api.get('/inventory/products/search', { params });
  return res.data;
}
```

---

### Frontend: Typeahead Logic in PO Page

**File:** `frontend/src/pages/inventory/NewPurchaseOrderPage.tsx`

#### State Management (Line 47-50)
```typescript
const [productSuggestions, setProductSuggestions] = useState<Record<string, SuggestionOption[]>>({});
const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
const [loadingSuggestions, setLoadingSuggestions] = useState<Record<number, boolean>>({});
```

#### Fetch Suggestions (Line 168-201)
```typescript
const fetchProductSuggestions = useCallback(async (itemIndex: number, query: string, itemType: string) => {
  if (!query || query.length < 2) {
    setProductSuggestions(prev => ({ ...prev, [`${itemIndex}-${itemType}`]: [] }));
    return;
  }

  setLoadingSuggestions(prev => ({ ...prev, [itemIndex]: true }));

  try {
    const category = itemType === 'optical_product' ? 'optical' : itemType;
    
    const suggestions = await productsService.searchProducts(query, {
      category: category === 'medicine' || category === 'optical' ? category : undefined,
      limit: 20,
    });

    const formattedSuggestions: SuggestionOption[] = suggestions.map(s => ({
      id: s.metadata.id,
      label: s.label,
      sublabel: s.sublabel,
      metadata: s.metadata,
    }));

    setProductSuggestions(prev => ({ ...prev, [`${itemIndex}-${itemType}`]: formattedSuggestions }));
  } catch (error) {
    console.error('Failed to fetch product suggestions:', error);
  } finally {
    setLoadingSuggestions(prev => ({ ...prev, [itemIndex]: false }));
  }
}, []);
```

#### Debounced Search (Line 203-214)
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    Object.entries(searchQueries).forEach(([itemIdxStr, query]) => {
      const itemIdx = parseInt(itemIdxStr);
      const item = items[itemIdx];
      if (item && query && query.length >= 2) {
        fetchProductSuggestions(itemIdx, query, item.item_type);
      }
    });
  }, 300); // 300ms debounce

  return () => clearTimeout(timer);
}, [searchQueries, items, fetchProductSuggestions]);
```

#### Handle Selection (Line 141-165)
```typescript
const handleItemSelect = useCallback((idx: number, value: string, metadata?: Record<string, unknown>) => {
  const updated = [...items];
  const item = updated[idx];

  if (metadata && metadata.name) {
    // Selected from suggestions - auto-fill all details
    item.item_id = metadata.id as string || value;
    item.item_name = metadata.name as string;
    item.unit_price = (metadata.price as number) || (metadata.selling_price as number) || 0;
    item.item_type = (metadata.type as string) || (metadata.category as string) || 'medicine';
    
    // Additional auto-fill from product metadata
    if (metadata.purchase_price) item.unit_price = metadata.purchase_price as number;
  } else if (value.trim()) {
    // Manual entry
    item.item_name = value.trim();
    item.item_id = '';
    item.unit_price = 0;
  } else {
    // Cleared
    item.item_name = '';
    item.item_id = '';
    item.unit_price = 0;
  }

  setItems(updated);
}, [items]);
```

---

### Frontend: Enhanced SearchableSelect Component

**File:** `frontend/src/components/common/SearchableSelect.tsx`

#### New Props (Line 18-19)
```typescript
interface SearchableSelectProps {
  // ... existing props
  onSearchChange?: (query: string) => void;  // NEW: Notify parent of search changes
  loading?: boolean;                          // NEW: Loading state
}
```

#### Search Change Notification (Line 51-58)
```typescript
useEffect(() => {
  if (onSearchChange) {
    const timer = setTimeout(() => {
      onSearchChange(searchTerm);
    }, 100);
    return () => clearTimeout(timer);
  }
}, [searchTerm, onSearchChange]);
```

#### Loading Indicator (Line 165-171)
```typescript
<span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
  {loading ? (
    <span className="animate-spin">⟳</span>
  ) : (
    isOpen ? '▲' : '▼'
  )}
</span>
```

---

## API Request/Response

### Request
```http
GET /api/v1/inventory/products/search?q=paracetamol&category=medicine&limit=20
Authorization: Bearer {token}
```

### Response
```json
[
  {
    "id": "prod-uuid",
    "label": "Paracetamol 500mg (Paracetamol)",
    "sublabel": "PharmaCorp | SKU: PAR-500 | ₹5.00",
    "metadata": {
      "id": "prod-uuid",
      "name": "Paracetamol 500mg",
      "generic_name": "Paracetamol",
      "category": "medicine",
      "subcategory": "tablet",
      "sku": "PAR-500",
      "barcode": "1234567890123",
      "manufacturer": "PharmaCorp",
      "purchase_price": 3.50,
      "selling_price": 5.00,
      "mrp": 5.00,
      "unit_type": "strip",
      "pack_size": 10,
      "requires_prescription": false
    }
  },
  {
    "id": "prod-uuid-2",
    "label": "Paracetamol 650mg (Paracetamol)",
    "sublabel": "PharmaCorp | SKU: PAR-650 | ₹7.50",
    "metadata": { ... }
  }
]
```

---

## Search Algorithm

### Field Priority
1. **Product name** (starts with query) - Highest priority
2. **Product name** (contains query)
3. **Generic name** (contains query)
4. **SKU** (contains query)
5. **Barcode** (contains query)
6. **Manufacturer** (contains query)

### Ordering
```sql
ORDER BY 
  product_name ILIKE 'query%' DESC,  -- Starts with query first
  product_name ASC                    -- Then alphabetical
```

### Filtering
- Only active products (`is_active = TRUE`)
- Only non-deleted products (`is_deleted = FALSE`)
- Hospital-specific products only
- Category filter (if specified)

---

## Performance Optimizations

### 1. **Debouncing**
- 300ms delay before triggering search
- Prevents excessive API calls while typing
- Only searches when user pauses

### 2. **Minimum Characters**
- Requires at least 2 characters
- Reduces irrelevant results
- Improves search accuracy

### 3. **Result Limiting**
- Maximum 20 results per search
- Maximum 50 total suggestions displayed
- Prevents dropdown overflow

### 4. **Caching**
- Results cached by item index and type
- Previous suggestions retained
- No re-fetching for same query

### 5. **Database Indexes**
```sql
CREATE INDEX idx_products_name ON products(product_name);
CREATE INDEX idx_products_generic ON products(generic_name);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_hospital ON products(hospital_id);
CREATE INDEX idx_products_active ON products(is_active);
```

---

## Testing Checklist

### Manual Testing

1. **Basic Search**
   ```
   Inventory → Purchase Orders → New PO
   Select supplier
   Type "par" in Item field
   ```
   **Expected:**
   - ✅ After 300ms, suggestions appear
   - ✅ Shows products matching "par"
   - ✅ Loading spinner visible during search

2. **Category Filtering**
   ```
   Select item type: "Optical Product"
   Type "len"
   ```
   **Expected:**
   - ✅ Only optical products shown
   - ✅ No medicines in results

3. **Auto-Population**
   ```
   Click on a suggestion
   ```
   **Expected:**
   - ✅ Item name filled
   - ✅ Unit price filled
   - ✅ Item type correct

4. **Manual Entry**
   ```
   Type "Custom Item XYZ"
   Select "Use: Custom Item XYZ"
   ```
   **Expected:**
   - ✅ Item name set
   - ✅ Price = 0 (manual entry)
   - ✅ Item ID empty

5. **Keyboard Navigation**
   ```
   Type search term
   Press Arrow Down
   Press Enter
   ```
   **Expected:**
   - ✅ Highlights suggestions
   - ✅ Selects on Enter

6. **Clear Search**
   ```
   Select item
   Clear the field
   ```
   **Expected:**
   - ✅ All fields reset
   - ✅ Price cleared

---

### Backend Verification

```sql
-- Check search is working
SELECT 
    product_name,
    generic_name,
    category,
    sku,
    selling_price
FROM products
WHERE hospital_id = 'hospital-uuid'
  AND is_active = TRUE
  AND product_name ILIKE '%paracetamol%'
ORDER BY product_name
LIMIT 20;
```

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/app/routers/products.py` | Added `/search` endpoint |
| `backend/app/services/products_service.py` | Added `search_products_for_typeahead()` function |
| `frontend/src/services/productsService.ts` | Added `searchProducts()` method |
| `frontend/src/pages/inventory/NewPurchaseOrderPage.tsx` | Added typeahead logic, state management, debouncing |
| `frontend/src/components/common/SearchableSelect.tsx` | Added `onSearchChange` and `loading` props |

---

## Benefits

| Benefit | Impact |
|---------|--------|
| **Faster PO Creation** | Users find products quickly |
| **Reduced Errors** | Auto-fill prevents typos |
| **Better UX** | Intelligent suggestions |
| **Consistent Data** | Products from central catalog |
| **Price Accuracy** | Auto-filled from product data |
| **Category Awareness** | Filters by selected type |

---

## Related Features

This feature integrates with:
- ✅ Product catalog management
- ✅ Medicine auto-sync to products
- ✅ Supplier category filtering
- ✅ Previous order history
- ✅ Bulk upload/export

---

## Future Enhancements

Potential improvements:
- [ ] Fuzzy search (typo tolerance)
- [ ] Search by synonyms
- [ ] Recently viewed products
- [ ] Favorite products
- [ ] Bulk add from search results
- [ ] Image thumbnails in suggestions
- [ ] Stock level display in suggestions

---

**Status:** ✅ **IMPLEMENTED** — Intelligent typeahead search with auto-population
