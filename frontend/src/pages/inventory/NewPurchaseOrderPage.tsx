import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import pharmacyService from '../../services/pharmacyService';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';
import type { Supplier, PurchaseOrderCreate } from '../../types/inventory';
import type { Medicine } from '../../types/pharmacy';
import { VALID_PRODUCT_CATEGORIES } from '../../types/inventory';

interface ItemRow {
  item_type: string;
  item_id: string;
  item_name: string;
  quantity_ordered: number;
  unit_price: number;
}

// Storage key for previously ordered items
const PREVIOUS_ITEMS_KEY = 'po_previous_items';

interface PreviousItem {
  id: string;
  name: string;
  type: string;
  lastPrice: number;
  usedAt: number;
}

const NewPurchaseOrderPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [previousItems, setPreviousItems] = useState<PreviousItem[]>([]);
  const [items, setItems] = useState<ItemRow[]>([{ item_type: 'medicine', item_id: '', item_name: '', quantity_ordered: 0, unit_price: 0 }]);
  const [saving, setSaving] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [searchInputId, setSearchInputId] = useState<string | null>(null);

  useEffect(() => {
    inventoryService.getSuppliers(1, 100, '', true).then(r => setSuppliers(r.data)).catch(() => {});
    pharmacyService.getMedicines(1, 500).then(r => setMedicines(r.data)).catch(() => {});

    // Load previously ordered items from localStorage
    try {
      const stored = localStorage.getItem(PREVIOUS_ITEMS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PreviousItem[];
        // Sort by most recent first and keep last 50
        const sorted = parsed.sort((a, b) => b.usedAt - a.usedAt).slice(0, 50);
        setPreviousItems(sorted);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save previous items to localStorage when items change
  const savePreviousItems = useCallback((newItems: ItemRow[]) => {
    try {
      const updated = newItems
        .filter(it => it.item_id && it.item_name && it.unit_price > 0)
        .map(it => ({
          id: it.item_id,
          name: it.item_name,
          type: it.item_type,
          lastPrice: it.unit_price,
          usedAt: Date.now(),
        }));
      
      if (updated.length === 0) return;
      
      setPreviousItems(prev => {
        // Merge with existing, avoiding duplicates
        const existingIds = new Set(prev.map(p => p.id));
        const newItemsToAdd = updated.filter(it => !existingIds.has(it.id));
        const merged = [...newItemsToAdd, ...prev].sort((a, b) => b.usedAt - a.usedAt).slice(0, 50);
        localStorage.setItem(PREVIOUS_ITEMS_KEY, JSON.stringify(merged));
        return merged;
      });
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Get selected supplier's product categories for item type dropdown
  const selectedSupplier = useMemo(() => suppliers.find(s => s.id === supplierId), [suppliers, supplierId]);
  
  const availableItemTypes = useMemo(() => {
    if (!selectedSupplier?.product_categories || selectedSupplier.product_categories.length === 0) {
      // Default to medicine and optical if supplier has no categories set
      return ['medicine', 'optical_product'];
    }
    // Map supplier categories to item types
    const types: string[] = [];
    if (selectedSupplier.product_categories.includes('medicine')) {
      types.push('medicine');
    }
    if (selectedSupplier.product_categories.includes('optical')) {
      types.push('optical_product');
    }
    // Add other categories as generic item types
    selectedSupplier.product_categories.forEach(cat => {
      if (cat !== 'medicine' && cat !== 'optical' && !types.includes(cat)) {
        types.push(cat);
      }
    });
    return types.length > 0 ? types : ['medicine', 'optical_product'];
  }, [selectedSupplier]);

  // Get minimum date for expected delivery (today or order date, whichever is later)
  const minExpectedDate = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return orderDate > today ? orderDate : today;
  }, [orderDate]);

  const addItem = () => setItems([...items, { item_type: 'medicine', item_id: '', item_name: '', quantity_ordered: 0, unit_price: 0 }]);

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

  const handleMedicineSelect = (idx: number, medicineId: string) => {
    const selected = medicines.find((m) => m.id === medicineId);
    const updated = [...items];
    updated[idx] = {
      ...updated[idx],
      item_type: 'medicine',
      item_id: medicineId,
      item_name: selected?.name || '',
    };
    setItems(updated);
  };

  const handleDownloadTemplate = () => {
    const templateRows = [
      {
        item_type: 'medicine',
        item_id: '',
        item_name: 'Paracetamol 650mg',
        quantity_ordered: 50,
        unit_price: 2.5,
      },
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'PO Items');
    XLSX.writeFile(workbook, 'inventory_po_bulk_template.xlsx');
  };

  const handleExportCurrentItems = () => {
    if (items.length === 0 || (items.length === 1 && !items[0].item_name)) {
      toast.error('No items to export');
      return;
    }
    // Export in format that matches bulk upload template expectations
    const exportRows = items.map((it, idx) => ({
      item_type: it.item_type,
      item_id: it.item_id || '',
      item_name: it.item_name,
      quantity_ordered: it.quantity_ordered,
      unit_price: it.unit_price,
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'PO Items');
    const fileName = `PO_Items_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success(`Exported ${items.length} item(s) to Excel`);
  };

  const handleBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (!rows.length) {
        toast.error('Uploaded file is empty');
        return;
      }

      const medicineById = new Map(medicines.map((m) => [m.id, m]));
      const medicineByName = new Map(medicines.map((m) => [m.name.toLowerCase().trim(), m]));
      const parsed: ItemRow[] = [];
      let skipped = 0;
      let manualEntries = 0;

      rows.forEach((row) => {
        const itemTypeRaw = String(row.item_type || 'medicine').trim().toLowerCase();
        // Determine item type based on supplier categories or default
        let itemType: string = 'medicine';
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
          itemType = itemTypeRaw === 'optical_product' || itemTypeRaw.includes('optical') ? 'optical_product' : 'medicine';
        }
        const itemIdCell = String(row.item_id || '').trim();
        const itemNameCell = String(row.item_name || row.medicine_name || '').trim();
        const qty = Number(row.quantity_ordered || row.quantity || 0);
        const unitPrice = Number(row.unit_price || row.price || 0);

        let itemId = itemIdCell;
        let itemName = itemNameCell;

        if (itemType === 'medicine') {
          // Try to find medicine in catalog by ID first
          if (itemIdCell) {
            const med = medicineById.get(itemIdCell);
            if (med) {
              itemId = med.id;
              itemName = med.name;
            }
          }
          // If not found by ID, try by name
          if (!itemId && itemNameCell) {
            const med = medicineByName.get(itemNameCell.toLowerCase());
            if (med) {
              itemId = med.id;
              itemName = med.name;
            }
          }
          // If still not found, treat as manual entry (allow it)
          if (!itemId && !itemNameCell) {
            skipped += 1;
            return;
          }
          if (!itemId && itemNameCell) {
            // Manual entry - keep the name, leave itemId empty
            manualEntries += 1;
          }
        }

        if (!itemName || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
          skipped += 1;
          return;
        }

        parsed.push({
          item_type: itemType,
          item_id: itemId,
          item_name: itemName,
          quantity_ordered: Math.round(qty),
          unit_price: unitPrice,
        });
      });

      if (!parsed.length) {
        toast.error('No valid rows found. Use the template and valid medicine names/ids.');
        return;
      }

      setItems(parsed);
      toast.success(`Imported ${parsed.length} item(s)${skipped ? `, skipped ${skipped}` : ''}${manualEntries ? ` (${manualEntries} manual entries)` : ''}`);
    } catch (err) {
      console.error('Bulk upload failed:', err);
      toast.error('Failed to parse file. Upload CSV/XLSX template format.');
    } finally {
      setBulkUploading(false);
      event.target.value = '';
    }
  };

  const totalAmount = items.reduce((sum, it) => sum + it.quantity_ordered * it.unit_price, 0);

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
          total_price: it.quantity_ordered * it.unit_price,
        })),
      };
      console.log('Creating PO with payload:', JSON.stringify(payload, null, 2));
      await inventoryService.createPurchaseOrder(payload);
      toast.success(`Purchase order ${asDraft ? 'saved as draft' : 'submitted'}`);

      // Save items for future suggestions
      savePreviousItems(items);

      navigate('/inventory/purchase-orders');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to create purchase order:', error);
      toast.error(`Failed to create purchase order: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
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
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
              <option value="">Select supplier...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </select>
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
            <button onClick={handleExportCurrentItems} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-200 transition-colors">
              <span className="material-symbols-outlined text-base">file_download</span>Export Items
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
        <p className="text-xs text-slate-500 mb-3">
          Start typing to search medicines. Select from suggestions to auto-fill price, or type manually for new items.
        </p>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-visible">
          <table className="w-full table-fixed overflow-visible">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600 w-24">Type</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600">Item / Medicine *</th>
                <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600 w-24">Qty</th>
                <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600 w-32">Unit Price</th>
                <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600 w-32">Total</th>
                <th className="px-3 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 overflow-visible">
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
                  </td>
                  <td className="px-3 py-2 overflow-visible">
                    <SearchableSelect
                      value={item.item_name}
                      onChange={(val, meta) => handleItemSelect(idx, val, meta)}
                      suggestions={getItemSuggestions(item.item_type)}
                      placeholder={item.item_type === 'medicine' ? 'Search medicine...' : 'Type item name...'}
                      disabled={!supplierId}
                      allowManualEntry={true}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      value={item.quantity_ordered === 0 ? '' : item.quantity_ordered}
                      onChange={e => updateItem(idx, 'quantity_ordered', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm text-right"
                      placeholder="0"
                      disabled={!supplierId}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price === 0 ? '' : item.unit_price}
                      onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm text-right"
                      placeholder="0.00"
                      disabled={!supplierId}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900">
                    {item.quantity_ordered > 0 && item.unit_price > 0 ? formatCurrency(item.quantity_ordered * item.unit_price) : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeItem(idx)} disabled={items.length === 1} className="p-1 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30">
                      <span className="material-symbols-outlined text-lg text-red-400">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-4">
          {items.map((item, idx) => (
            <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Item #{idx + 1}</span>
                <button onClick={() => removeItem(idx)} disabled={items.length === 1} className="p-1 hover:bg-red-50 rounded-lg disabled:opacity-30">
                  <span className="material-symbols-outlined text-lg text-red-400">delete</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Type</label>
                  <select value={item.item_type} onChange={e => updateItem(idx, 'item_type', e.target.value)} className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white mt-1" disabled={!supplierId}>
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
                <div className="col-span-2">
                  <label className="text-xs text-slate-400">Item Name</label>
                  <SearchableSelect
                    value={item.item_name}
                    onChange={(val, meta) => handleItemSelect(idx, val, meta)}
                    suggestions={getItemSuggestions(item.item_type)}
                    placeholder={item.item_type === 'medicine' ? 'Search medicine...' : 'Type item name...'}
                    disabled={!supplierId}
                    allowManualEntry={true}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={item.quantity_ordered === 0 ? '' : item.quantity_ordered}
                    onChange={e => updateItem(idx, 'quantity_ordered', parseInt(e.target.value) || 0)}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                    placeholder="0"
                    disabled={!supplierId}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Unit Price</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price === 0 ? '' : item.unit_price}
                    onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                    placeholder="0.00"
                    disabled={!supplierId}
                  />
                </div>
              </div>
              <div className="text-right text-sm font-semibold text-slate-900">
                Line Total: {item.quantity_ordered > 0 && item.unit_price > 0 ? formatCurrency(item.quantity_ordered * item.unit_price) : '-'}
              </div>
            </div>
          ))}
        </div>

        {/* Grand Total */}
        <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end">
          <div className="text-right">
            <p className="text-xs text-slate-400 mb-1">Grand Total</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(totalAmount)}</p>
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
