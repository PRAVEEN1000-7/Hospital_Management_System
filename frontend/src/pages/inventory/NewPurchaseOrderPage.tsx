import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import pharmacyService from '../../services/pharmacyService';
import hospitalService, { type HospitalDetails } from '../../services/hospitalService';
import taxService from '../../services/taxService';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';
import type { Supplier, PurchaseOrderCreate } from '../../types/inventory';
import type { Medicine } from '../../types/pharmacy';
import type { TaxConfig } from '../../types/billing';
import { computeLineItemTax, determinePlaceOfSupply, aggregateDocumentTotals, PLACE_OF_SUPPLY_LABELS } from '../../utils/gst';

interface ItemRow {
  item_type: string;
  item_id: string;
  item_name: string;
  quantity_ordered: number;
  unit_price: number;
  discount_percent: number;
  /** Must match one of the hospital's configured tax slabs — 0 = no tax. */
  gst_rate: number;
}

// Storage key for previously ordered items
const PREVIOUS_ITEMS_KEY = 'po_previous_items';

// Handoff key for prefilling this form from another page (e.g. Low Stock
// Alerts' "Create PO" action) — every PO-creation entry point in the app
// routes here instead of maintaining its own PO form, so GST/discount
// handling only ever exists in one place. The other page writes the
// selected items here, navigates to this page, and this page consumes +
// clears the key on load.
export const PO_PREFILL_KEY = 'po_prefill_items';

export interface PoPrefillItem {
  item_type: string;
  item_id: string;
  item_name: string;
  quantity_ordered: number;
  unit_price: number;
}

interface PreviousItem {
  id: string;
  name: string;
  type: string;
  lastPrice: number;
  usedAt: number;
}

// Standard non-zero Indian GST slabs — mirrors backend gst_service.py's
// STANDARD_GST_RATES. 0% is handled separately as its own hardcoded "No
// Tax" option in the dropdown below, so it isn't repeated here.
const STANDARD_GST_RATES = [5, 12, 18, 28];

// Items without a catalog id (manually typed) fall back to a name+type key —
// two catalog-backed entries always key on id, two manual entries with the
// same name always collide on purpose (they're the same "previous item").
const previousItemKey = (p: { id: string; name: string; type: string }): string =>
  p.id ? p.id : `${p.type}:${p.name.toLowerCase()}`;

// Collapse duplicate keys, keeping the most recently used entry for each —
// guards against the suggestion list ever rendering two entries sharing a
// React key (which duplicates/drops rows unpredictably).
const dedupePreviousItems = (items: PreviousItem[]): PreviousItem[] => {
  const byKey = new Map<string, PreviousItem>();
  for (const it of items) {
    const k = previousItemKey(it);
    const existing = byKey.get(k);
    if (!existing || it.usedAt > existing.usedAt) byKey.set(k, it);
  }
  return Array.from(byKey.values());
};

const NewPurchaseOrderPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledRef = useRef(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [previousItems, setPreviousItems] = useState<PreviousItem[]>([]);
  const [items, setItems] = useState<ItemRow[]>([{ item_type: 'medicine', item_id: '', item_name: '', quantity_ordered: 0, unit_price: 0, discount_percent: 0, gst_rate: 0 }]);
  const [saving, setSaving] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [hospital, setHospital] = useState<HospitalDetails | null>(null);
  const [taxSlabs, setTaxSlabs] = useState<TaxConfig[]>([]);

  // GST-rate dropdown options: the standard statutory Indian GST slabs are
  // hardcoded here — always available, no per-hospital setup required, so
  // the dropdown can never come up empty (this was the actual bug: it used
  // to depend entirely on the hospital's tax_configurations rows in the DB,
  // so a hospital with none configured — e.g. a fresh production DB that
  // was never seeded — saw nothing but "0% (No Tax)"). Any EXTRA custom
  // rates a hospital has configured via Settings -> Tax Configuration are
  // merged in on top, for hospitals that genuinely need a non-standard rate.
  const gstRateOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const rate of STANDARD_GST_RATES) seen.set(rate, `GST ${rate}%`);
    for (const t of taxSlabs) {
      const rate = Number(t.rate_percentage);
      if (!seen.has(rate)) seen.set(rate, t.name);
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rate, name]) => ({ rate, name }));
  }, [taxSlabs]);

  useEffect(() => {
    inventoryService.getSuppliers(1, 100, '', true).then(r => setSuppliers(r.data)).catch(() => {});
    pharmacyService.getMedicines(1, 500).then(r => setMedicines(r.data)).catch(() => {});
    hospitalService.getHospitalDetails().then(setHospital).catch(() => {});
    taxService.list(1, 100, true).then(r => setTaxSlabs(r.items)).catch(() => {});

    // Load previously ordered items from localStorage
    try {
      const stored = localStorage.getItem(PREVIOUS_ITEMS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PreviousItem[];
        // Dedupe (self-heals any duplicate entries written by a past bug),
        // sort by most recent first, and keep the last 50.
        const sorted = dedupePreviousItems(parsed).sort((a, b) => b.usedAt - a.usedAt).slice(0, 50);
        setPreviousItems(sorted);
        localStorage.setItem(PREVIOUS_ITEMS_KEY, JSON.stringify(sorted));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Prefill from another page's "Create PO" action, e.g. Low Stock Alerts —
  // it writes the selected items (with its own suggested/edited quantities)
  // here rather than duplicating this form, so every PO-creation entry
  // point in the app produces the exact same GST-aware PO. Runs once, on
  // mount, and consumes (clears) the handoff key either way.
  useEffect(() => {
    if (prefilledRef.current) return;
    try {
      const stored = sessionStorage.getItem(PO_PREFILL_KEY);
      if (!stored) return;
      sessionStorage.removeItem(PO_PREFILL_KEY);
      const parsed = JSON.parse(stored) as PoPrefillItem[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      prefilledRef.current = true;
      setItems(parsed.map(p => ({
        item_type: p.item_type || 'medicine',
        item_id: p.item_id || '',
        item_name: p.item_name || '',
        quantity_ordered: p.quantity_ordered || 0,
        unit_price: p.unit_price || 0,
        discount_percent: 0,
        gst_rate: 0,
      })));
      toast.success(`Prefilled ${parsed.length} item${parsed.length === 1 ? '' : 's'} — set discount/GST and confirm the supplier below`);
    } catch {
      // Ignore malformed/missing handoff data — form just starts empty
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single-item prefill via query params, e.g. Pharmacy Dashboard's
  // "Reorder" quick action (?medicine_id=...&quantity=...). Waits for the
  // medicine catalog to load so name/price can be resolved; skipped if the
  // sessionStorage handoff above already prefilled the form.
  useEffect(() => {
    if (prefilledRef.current) return;
    const medicineId = searchParams.get('medicine_id');
    if (!medicineId || medicines.length === 0) return;
    const med = medicines.find(m => m.id === medicineId);
    if (!med) return;
    prefilledRef.current = true;
    const quantity = Math.max(1, parseInt(searchParams.get('quantity') || '1', 10) || 1);
    setItems([{
      item_type: 'medicine',
      item_id: med.id,
      item_name: med.name,
      quantity_ordered: quantity,
      unit_price: med.purchase_price || med.selling_price || 0,
      discount_percent: 0,
      gst_rate: 0,
    }]);
    const supplierIdParam = searchParams.get('supplier_id');
    if (supplierIdParam) setSupplierId(supplierIdParam);
  }, [medicines, searchParams]);

  // Save previous items to localStorage when items change
  const savePreviousItems = useCallback((newItems: ItemRow[]) => {
    try {
      // A single PO can legitimately list the same product on two line items
      // (e.g. two batches at different prices) — dedupe the current batch
      // itself first, or both would land in previousItems sharing a key.
      const updated = dedupePreviousItems(
        newItems
          .filter(it => it.item_name && it.unit_price > 0)
          .map(it => ({
            id: it.item_id,
            name: it.item_name,
            type: it.item_type,
            lastPrice: it.unit_price,
            usedAt: Date.now(),
          }))
      );

      if (updated.length === 0) return;

      setPreviousItems(prev => {
        const merged = dedupePreviousItems([...updated, ...prev])
          .sort((a, b) => b.usedAt - a.usedAt)
          .slice(0, 50);
        localStorage.setItem(PREVIOUS_ITEMS_KEY, JSON.stringify(merged));
        return merged;
      });
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Get selected supplier's product categories for item type dropdown
  const selectedSupplier = useMemo(() => suppliers.find(s => s.id === supplierId), [suppliers, supplierId]);

  // Suggestions for the supplier searchable select (browse + type-to-search in one field)
  const supplierSuggestions: SuggestionOption[] = useMemo(() => suppliers.map(s => ({
    id: s.id,
    label: `${s.name} (${s.code})`,
    metadata: { id: s.id },
  })), [suppliers]);

  const handleSupplierSelect = (_value: string, metadata?: Record<string, unknown>) => {
    setSupplierId((metadata && metadata.id) ? (metadata.id as string) : '');
  };

  // Live GST preview — mirrors backend gst_service.py exactly (see
  // utils/gst.ts), purely for on-screen feedback; the backend recomputes
  // everything authoritatively on save.
  const placeOfSupplyType = determinePlaceOfSupply(
    hospital?.state_province, hospital?.country,
    selectedSupplier?.state, selectedSupplier?.country,
  );

  const availableItemTypes = useMemo(() => {
    const categories = selectedSupplier?.product_categories || [];
    // Only "medicine" and "optical_product" are real purchasable item
    // catalogs in this system — every other supplier category (surgical,
    // equipment, laboratory, disposable, other) is an informational tag with
    // no matching catalog to order against. This used to push those raw
    // category strings straight into the Item Type dropdown (e.g.
    // "Surgical"), which looked selectable but always failed on save since
    // the backend's item_type validation only accepts medicine|optical_product.
    const types: string[] = [];
    if (categories.length === 0 || categories.includes('medicine')) types.push('medicine');
    if (categories.length === 0 || categories.includes('optical')) types.push('optical_product');
    // Supplier has categories set, but none of them are medicine/optical
    // (e.g. "surgical" only) — fall back to offering both rather than an
    // empty, unusable dropdown.
    return types.length > 0 ? types : ['medicine', 'optical_product'];
  }, [selectedSupplier]);

  // Get minimum date for expected delivery (today or order date, whichever is later)
  const minExpectedDate = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return orderDate > today ? orderDate : today;
  }, [orderDate]);

  const addItem = () => setItems([...items, { item_type: 'medicine', item_id: '', item_name: '', quantity_ordered: 0, unit_price: 0, discount_percent: 0, gst_rate: 0 }]);

  const removeItem = (idx: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); };

  const updateItem = useCallback((idx: number, field: keyof ItemRow, value: string | number) => {
    const updated = [...items];
    (updated[idx] as unknown as Record<string, string | number>)[field] = value;
    setItems(updated);
  }, [items]);

  // Handle item selection from searchable dropdown
  const handleItemSelect = useCallback((idx: number, value: string, metadata?: Record<string, unknown>) => {
    const updated = [...items];
    const item = updated[idx];

    if (metadata && metadata.name) {
      // Selected from suggestions - auto-fill all details
      item.item_id = metadata.id as string || value;
      item.item_name = metadata.name as string;
      item.unit_price = (metadata.price as number) || 0;
      item.item_type = (metadata.type as string) || 'medicine';
    } else if (value.trim()) {
      // Manual entry or typing - user typed a custom name
      item.item_name = value.trim();
      item.item_id = ''; // Clear item_id for manual entries (backend will resolve by name)
      item.unit_price = 0;
    } else {
      // Cleared
      item.item_name = '';
      item.item_id = '';
      item.unit_price = 0;
    }

    setItems(updated);
  }, [items]);

  // Build suggestions for searchable select
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
          metadata: { id: p.id, name: p.name, price: p.lastPrice, type: p.type },
        });
      });

    // Add medicines from catalog (only for medicine type)
    if (itemType === 'medicine') {
      medicines.forEach(m => {
        if (!suggestions.some(s => s.id === m.id)) {
          suggestions.push({
            id: m.id,
            label: `${m.name}${m.strength ? ` (${m.strength})` : ''}`,
            sublabel: m.generic_name || m.manufacturer || undefined,
            metadata: { id: m.id, name: m.name, price: m.purchase_price || m.selling_price || 0, type: 'medicine' },
          });
        }
      });
    }

    // Limit to 50 suggestions for performance
    return suggestions.slice(0, 50);
  }, [previousItems, medicines]);

  const handleDownloadTemplate = () => {
    // Example rows covering the two main item types
    const exampleRows = [
      { item_type: 'medicine',         item_id: '', item_name: 'Paracetamol 650mg',              quantity_ordered: 50,  unit_price: 2.50,  discount_percent: 0, gst_rate: 12 },
      { item_type: 'medicine',         item_id: '', item_name: 'Amoxicillin 500mg Capsule',       quantity_ordered: 100, unit_price: 5.00,  discount_percent: 5, gst_rate: 12 },
      { item_type: 'medicine',         item_id: '', item_name: 'Azithromycin 250mg Tablet',       quantity_ordered: 60,  unit_price: 8.50,  discount_percent: 0, gst_rate: 18 },
      { item_type: 'optical_product',  item_id: '', item_name: 'Anti-Reflective Lens 1.67 Index', quantity_ordered: 10,  unit_price: 250.00, discount_percent: 0, gst_rate: 18 },
      { item_type: 'optical_product',  item_id: '', item_name: 'Photochromic Lens 1.56 Index',    quantity_ordered: 8,   unit_price: 320.00, discount_percent: 10, gst_rate: 18 },
    ];

    const ws = XLSX.utils.json_to_sheet(exampleRows);
    ws['!cols'] = [
      { wch: 18 }, // item_type
      { wch: 38 }, // item_id
      { wch: 42 }, // item_name
      { wch: 18 }, // quantity_ordered
      { wch: 14 }, // unit_price
      { wch: 16 }, // discount_percent
      { wch: 12 }, // gst_rate
    ];

    const instrRows = [
      { Column: 'item_type',        Required: 'Yes', Valid_Values: 'medicine  |  optical_product',  Notes: 'Determines how the item is looked up in the system' },
      { Column: 'item_id',          Required: 'No',  Valid_Values: 'UUID from the system',           Notes: 'Leave blank — the system matches by item_name automatically' },
      { Column: 'item_name',        Required: 'Yes', Valid_Values: 'Exact name from the system',     Notes: 'Must match the medicine/product name in HMS exactly (case-insensitive)' },
      { Column: 'quantity_ordered', Required: 'Yes', Valid_Values: 'Whole number > 0',               Notes: 'Number of units to order' },
      { Column: 'unit_price',       Required: 'Yes', Valid_Values: 'Number > 0',                     Notes: 'Purchase price per unit in ₹' },
      { Column: 'discount_percent', Required: 'No',  Valid_Values: 'Number 0–100',                   Notes: 'Line discount %, applied before GST. Defaults to 0 if left blank.' },
      { Column: 'gst_rate',         Required: 'No',  Valid_Values: 'Must match a configured tax slab', Notes: 'GST % for this line (e.g. 0, 5, 12, 18, 28). Defaults to 0 (no tax) if left blank — see Settings → Tax Configuration for the allowed rates.' },
    ];
    const instrWs = XLSX.utils.json_to_sheet(instrRows);
    instrWs['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 36 }, { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PO Items');
    XLSX.utils.book_append_sheet(wb, instrWs, 'Instructions');
    XLSX.writeFile(wb, 'inventory_po_bulk_template.xlsx');
  };

  const handleBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      // Always read from the first sheet (ignore Instructions sheet)
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (!rawRows.length) {
        toast.error('Uploaded file is empty or has no data rows.');
        return;
      }

      const medicineById  = new Map(medicines.map((m) => [m.id, m]));
      const medicineByName = new Map(medicines.map((m) => [m.name.toLowerCase().trim(), m]));
      const parsed: ItemRow[] = [];
      const skipReasons: string[] = [];
      const autoCreateNotes: string[] = [];

      rawRows.forEach((rawRow, idx) => {
        // Normalise column keys: trim whitespace, lowercase, collapse spaces → underscores
        const row: Record<string, unknown> = {};
        Object.keys(rawRow).forEach(k => {
          row[k.trim().toLowerCase().replace(/\s+/g, '_')] = rawRow[k];
        });

        const rowLabel = `Row ${idx + 2}`; // +2: row 1 = header, display is 1-indexed

        const itemTypeRaw = String(row.item_type || row.type || 'medicine').trim().toLowerCase();
        const itemType: string =
          itemTypeRaw === 'optical_product' || itemTypeRaw === 'optical' ? 'optical_product' : 'medicine';

        const itemIdCell   = String(row.item_id   || row.id            || '').trim();
        const itemNameCell = String(row.item_name  || row.medicine_name || row.product_name || row.name || '').trim();
        const qty          = Number(row.quantity_ordered || row.quantity || row.qty   || 0);
        const unitPrice    = Number(row.unit_price        || row.price    || row.purchase_price || 0);
        const discountPct  = Math.min(100, Math.max(0, Number(row.discount_percent || row.discount || 0) || 0));
        const gstRate      = Math.max(0, Number(row.gst_rate || row.gst || row.tax_rate || 0) || 0);

        if (!itemNameCell) {
          skipReasons.push(`${rowLabel}: item_name is empty`);
          return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          skipReasons.push(`${rowLabel} "${itemNameCell}": quantity_ordered must be > 0`);
          return;
        }
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          skipReasons.push(`${rowLabel} "${itemNameCell}": unit_price must be > 0`);
          return;
        }

        let itemId   = itemIdCell;
        let itemName = itemNameCell;

        if (itemType === 'medicine') {
          const med = medicineById.get(itemIdCell) || medicineByName.get(itemNameCell.toLowerCase());
          if (med) {
            itemId   = med.id;
            itemName = med.name;
          } else {
            // Not in local catalog — backend will auto-create it
            itemId = '';
            autoCreateNotes.push(`"${itemNameCell}" (medicine) — will be added to catalog`);
          }
        }
        // optical_product: always pass name-only; backend resolves or auto-creates

        parsed.push({
          item_type: itemType,
          item_id: itemId,
          item_name: itemName,
          quantity_ordered: Math.round(qty),
          unit_price: unitPrice,
          discount_percent: discountPct,
          gst_rate: gstRate,
        });
      });

      if (!parsed.length) {
        const hint = skipReasons.slice(0, 5).join('\n');
        toast.error(`No valid rows found.\n${hint}${skipReasons.length > 5 ? `\n…and ${skipReasons.length - 5} more issues` : ''}`);
        if (skipReasons.length) console.warn('PO bulk upload — skipped rows:', skipReasons);
        return;
      }

      setItems(parsed);

      if (skipReasons.length && autoCreateNotes.length) {
        toast.warning(`Imported ${parsed.length} item(s). ${skipReasons.length} row(s) skipped, ${autoCreateNotes.length} new item(s) will be auto-created.`, 6000);
        console.warn('PO bulk upload — skipped rows:', skipReasons);
        console.info('PO bulk upload — new items to auto-create:', autoCreateNotes);
      } else if (skipReasons.length) {
        toast.warning(`Imported ${parsed.length} item(s). ${skipReasons.length} row(s) skipped — see browser console.`, 6000);
        console.warn('PO bulk upload — skipped rows:', skipReasons);
      } else if (autoCreateNotes.length) {
        toast.success(`Imported ${parsed.length} item(s). ${autoCreateNotes.length} new item(s) will be auto-created in the catalog.`);
        console.info('PO bulk upload — new items to auto-create:', autoCreateNotes);
      } else {
        toast.success(`Imported ${parsed.length} item(s) successfully`);
      }
    } catch (err) {
      console.error('Bulk upload failed:', err);
      toast.error('Failed to read file. Upload a valid .xlsx or .csv file using the provided template.');
    } finally {
      setBulkUploading(false);
      event.target.value = '';
    }
  };

  // Live GST preview for every line — the backend recomputes this
  // authoritatively on save, this is purely for on-screen feedback (see
  // utils/gst.ts's header comment).
  const lineTaxResults = items.map(it => computeLineItemTax(
    it.unit_price, it.quantity_ordered, it.discount_percent || 0, it.gst_rate || 0, placeOfSupplyType,
  ));
  const docTotals = aggregateDocumentTotals(lineTaxResults);
  const totalAmount = docTotals.total_price;

  const handleSubmit = async (asDraft: boolean) => {
    if (!supplierId) { toast.error('Please select a supplier'); return; }
    if (items.some(it => !it.item_name || it.quantity_ordered <= 0 || it.unit_price <= 0)) {
      toast.error('Please fill in all item details'); return;
    }
    // Validate expected delivery date
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
    setSaving(true);
    try {
      const payload: PurchaseOrderCreate = {
        supplier_id: supplierId,
        order_date: orderDate,
        expected_delivery_date: expectedDate || undefined,
        status: asDraft ? 'draft' : 'submitted',
        notes: notes || undefined,
        items: items.map(it => ({
          item_type: it.item_type,
          item_id: it.item_id || '', // Send empty string for manual entries (backend will resolve by name)
          item_name: it.item_name,
          quantity_ordered: it.quantity_ordered,
          unit_price: it.unit_price,
          discount_percent: it.discount_percent || 0,
          gst_rate: it.gst_rate || 0,
        })),
      };
      await inventoryService.createPurchaseOrder(payload);
      toast.success(`Purchase order ${asDraft ? 'saved as draft' : 'submitted'}`);

      // Save items for future suggestions
      savePreviousItems(items);

      navigate('/inventory/purchase-orders');
    } catch {
      toast.error('Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <button onClick={() => navigate('/inventory/purchase-orders')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <span className="material-symbols-outlined text-slate-500">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Purchase Order</h1>
          <p className="text-sm text-slate-500 mt-1">Create a new purchase order with item details</p>
        </div>
      </header>

      {/* PO Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-bold text-slate-700 mb-4">Order Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Supplier *</label>
            <SearchableSelect
              value={selectedSupplier ? `${selectedSupplier.name} (${selectedSupplier.code})` : ''}
              onChange={handleSupplierSelect}
              suggestions={supplierSuggestions}
              placeholder="Search supplier..."
              allowManualEntry={false}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Order Date *</label>
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Expected Delivery</label>
            <input type="date" value={expectedDate} min={minExpectedDate} onChange={e => setExpectedDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            <p className="text-xs text-slate-400 mt-1">Must be today or later</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" placeholder="Additional notes..." />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-700">Order Items</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadTemplate} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
              <span className="material-symbols-outlined text-base">download</span>Template
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-base">upload_file</span>{bulkUploading ? 'Uploading...' : 'Bulk Upload'}
              <input
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                className="hidden"
                onChange={handleBulkUpload}
                disabled={bulkUploading}
              />
            </label>
            <button onClick={addItem} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
              <span className="material-symbols-outlined text-base">add</span>Add Item
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-1">
          Start typing to search medicines. Select from suggestions to auto-fill price, or type manually for new items.
        </p>
        {supplierId && (
          <p className="text-xs text-slate-500 mb-3">
            Place of supply: <span className="font-semibold text-slate-700">{PLACE_OF_SUPPLY_LABELS[placeOfSupplyType]}</span>
            {!selectedSupplier?.state && ' — supplier has no state on file, defaulting to Inter-State (IGST). Add it under Suppliers for an accurate CGST/SGST split.'}
          </p>
        )}

        {/* One card per line item — each carries its own item picker,
            quantity/price/discount/GST inputs, and a computed tax breakdown,
            mirroring the per-item card layout used elsewhere in this app
            (e.g. the pharmacy dispensing screen). */}
        <div className="space-y-4">
          {items.map((item, idx) => {
            const calc = lineTaxResults[idx];
            const hasAmount = item.quantity_ordered > 0 && item.unit_price > 0;
            return (
              <div key={idx} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/40">
                <div className="flex items-start gap-3">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Type</label>
                      <select value={item.item_type} onChange={e => updateItem(idx, 'item_type', e.target.value)}
                        className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white" disabled={!supplierId}>
                        {!supplierId ? (
                          <option value="">Select supplier first...</option>
                        ) : (
                          availableItemTypes.map(type => (
                            <option key={type} value={type}>
                              {type === 'medicine' ? 'Medicine' : type === 'optical_product' ? 'Optical Product' : type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Item / Medicine *</label>
                      <SearchableSelect
                        value={item.item_name}
                        onChange={(val, meta) => handleItemSelect(idx, val, meta)}
                        suggestions={getItemSuggestions(item.item_type)}
                        placeholder={item.item_type === 'medicine' ? 'Search medicine...' : 'Type item name...'}
                        disabled={!supplierId}
                        allowManualEntry={true}
                      />
                    </div>
                  </div>
                  <button onClick={() => removeItem(idx)} disabled={items.length === 1}
                    className="mt-6 p-1.5 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 shrink-0" title="Remove item">
                    <span className="material-symbols-outlined text-lg text-red-400">delete</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Qty</label>
                    <input
                      type="number" min="0"
                      value={item.quantity_ordered === 0 ? '' : item.quantity_ordered}
                      onChange={e => updateItem(idx, 'quantity_ordered', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm text-right bg-white"
                      placeholder="0" disabled={!supplierId}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Unit Price</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={item.unit_price === 0 ? '' : item.unit_price}
                      onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm text-right bg-white"
                      placeholder="0.00" disabled={!supplierId}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Discount %</label>
                    <input
                      type="number" min="0" max="100" step="0.01"
                      value={item.discount_percent === 0 ? '' : item.discount_percent}
                      onChange={e => updateItem(idx, 'discount_percent', Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm text-right bg-white"
                      placeholder="0" disabled={!supplierId}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">GST %</label>
                    <select
                      value={item.gst_rate}
                      onChange={e => updateItem(idx, 'gst_rate', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                      disabled={!supplierId}
                      title="GST rate — must be one of the hospital's configured tax slabs"
                    >
                      <option value={0}>0% (No Tax)</option>
                      {gstRateOptions.map(({ rate, name }) => (
                        <option key={rate} value={rate}>{name} ({rate}%)</option>
                      ))}
                      {item.gst_rate > 0 && !gstRateOptions.some(o => o.rate === item.gst_rate) && (
                        <option value={item.gst_rate}>{item.gst_rate}% (not a configured slab)</option>
                      )}
                    </select>
                  </div>
                </div>

                {hasAmount && (
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-2 border-t border-slate-200 text-xs text-slate-500">
                    <span>Taxable: <span className="font-semibold text-slate-700">{formatCurrency(calc.taxable_amount)}</span></span>
                    <span>GST ({item.gst_rate || 0}%): <span className="font-semibold text-slate-700">{formatCurrency(calc.gst_amount)}</span></span>
                    <span className="font-bold text-slate-900 text-sm ml-auto">Total: {formatCurrency(calc.total_price)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* GST Summary */}
        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
          <div className="w-full sm:w-80 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(docTotals.base_amount)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Discount</span><span>-{formatCurrency(docTotals.discount_amount)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Taxable Amount</span><span>{formatCurrency(docTotals.taxable_amount)}</span></div>
            {docTotals.cgst_amount > 0 && (
              <>
                <div className="flex justify-between text-slate-500"><span>CGST</span><span>{formatCurrency(docTotals.cgst_amount)}</span></div>
                <div className="flex justify-between text-slate-500">
                  <span>{placeOfSupplyType === 'union_territory' ? 'UGST' : 'SGST'}</span>
                  <span>{formatCurrency(placeOfSupplyType === 'union_territory' ? docTotals.ugst_amount : docTotals.sgst_amount)}</span>
                </div>
              </>
            )}
            {docTotals.igst_amount > 0 && (
              <div className="flex justify-between text-slate-500"><span>IGST</span><span>{formatCurrency(docTotals.igst_amount)}</span></div>
            )}
            {placeOfSupplyType === 'export' && (
              <div className="flex justify-between text-slate-500"><span>GST</span><span>Zero-Rated (Export)</span></div>
            )}
            <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Grand Total</span><span>{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row justify-end gap-3">
        <button onClick={() => navigate('/inventory/purchase-orders')} className="px-6 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
        <button onClick={() => handleSubmit(true)} disabled={saving} className="px-6 py-2.5 bg-slate-600 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50">
          Save as Draft
        </button>
        <button onClick={() => handleSubmit(false)} disabled={saving} className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
          Submit Order
        </button>
      </div>
    </div>
  );
};

export default NewPurchaseOrderPage;
