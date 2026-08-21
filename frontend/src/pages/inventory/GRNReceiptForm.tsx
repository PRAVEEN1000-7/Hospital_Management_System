import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import pharmacyService from '../../services/pharmacyService';
import opticalService from '../../services/opticalService';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';
import type { GRNItemCreate, GoodsReceiptNote, PurchaseOrder } from '../../types/inventory';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  verified: 'bg-blue-50 text-blue-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
};

// Renders a 0 amount/percent field as an empty box with a "0" placeholder
// hint instead of a literal "0" value — so clicking in starts from blank
// rather than requiring the user to delete a leading zero first.
const zeroAsEmpty = (n: number): number | string => (n === 0 ? '' : n);

interface CatalogItem {
  id: string;
  name: string;
  strength?: string | null;
  generic_name?: string | null;
  brand?: string | null;
  purchase_price?: number | null;
}

// Carries the backend GRNItem id when editing an existing GRN, so batch
// corrections can be saved back to the right row.
type GRNFormItem = GRNItemCreate & { id?: string };

const GRNReceiptForm: React.FC = () => {
  const navigate = useNavigate();
  const { grnId } = useParams<{ grnId: string }>();
  const toast = useToast();
  const isEditMode = !!grnId;

  const [supplier, setSupplier] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [notes, setNotes] = useState('');
  const [poId, setPOId] = useState('');
  const [items, setItems] = useState<GRNFormItem[]>([
    {
      item_type: 'medicine',
      item_id: '',
      batch_number: '',
      manufactured_date: '',
      expiry_date: '',
      quantity_received: 0,
      quantity_accepted: 0,
      unit_price: 0,
      total_price: 0,
    },
  ]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [existingGRN, setExistingGRN] = useState<GoodsReceiptNote | null>(null);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<CatalogItem[]>([]);
  const [opticalProducts, setOpticalProducts] = useState<CatalogItem[]>([]);

  useEffect(() => {
    pharmacyService.getMedicines(1, 500).then(r => setMedicines(r.data)).catch(() => {});
    opticalService.getProducts(1, 500).then(r => setOpticalProducts(r.data)).catch(() => {});
  }, []);

  const getItemSuggestions = (itemType: string): SuggestionOption[] =>
    (itemType === 'medicine' ? medicines : opticalProducts).map(item => ({
      id: item.id,
      label: item.strength !== undefined ? `${item.name}${item.strength ? ` (${item.strength})` : ''}` : item.name,
      sublabel: item.generic_name || item.brand || undefined,
      metadata: { id: item.id, name: item.name, price: item.purchase_price || 0 },
    }));

  // Standalone (no-PO) rows: selecting a catalog item fills the real id; typing a
  // name with no match leaves item_id empty so the backend auto-creates the item
  // (mirrors NewPurchaseOrderPage.tsx's item resolution — the only difference is
  // this form additionally lets the item type change per row).
  const handleItemSelect = (idx: number, value: string, metadata?: Record<string, unknown>) => {
    const newItems = [...items];
    const item = newItems[idx];
    if (metadata && metadata.id) {
      item.item_id = metadata.id as string;
      item.item_name = metadata.name as string;
      item.unit_price = (metadata.price as number) || item.unit_price;
    } else {
      item.item_id = '';
      item.item_name = value.trim();
    }
    setItems(newItems);
  };

  // Fetch existing GRN if editing
  useEffect(() => {
    if (!isEditMode) return;
    const loadGRN = async () => {
      try {
        const grn = await inventoryService.getGRN(grnId!);
        setExistingGRN(grn);
        setSupplier(grn.supplier_id);
        setReceiptDate(grn.receipt_date);
        setInvoiceNumber(grn.invoice_number || '');
        setInvoiceDate(grn.invoice_date || '');
        setNotes(grn.notes || '');
        setPOId(grn.purchase_order_id || '');
        setItems(grn.items.map(i => ({
          id: i.id,
          item_type: i.item_type,
          item_id: i.item_id,
          item_name: i.item_name || undefined,
          batch_number: i.batch_number || '',
          manufactured_date: i.manufactured_date || '',
          expiry_date: i.expiry_date || '',
          quantity_received: i.quantity_received,
          quantity_accepted: i.quantity_accepted || i.quantity_received,
          quantity_rejected: i.quantity_rejected || 0,
          unit_price: i.unit_price,
          total_price: i.total_price,
          rejection_reason: i.rejection_reason || '',
          discrepancy_notes: i.discrepancy_notes || '',
        })));
      } catch (err: any) {
        console.error(err);
        toast.error('Failed to load GRN');
      } finally {
        setLoading(false);
      }
    };
    loadGRN();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, grnId]);

  // Fetch purchase orders and suppliers
  useEffect(() => {
    const loadData = async () => {
      try {
        const [pos, sups] = await Promise.all([
          // Include partially_received POs (BUG-31): a PO that got only part
          // of its order must stay selectable so a second GRN can receive
          // the balance quantity.
          inventoryService.getPurchaseOrders(1, 100, { status: 'approved,partially_received' }),
          inventoryService.getSuppliers(1, 100, '', true),
        ]);
        setPurchaseOrders(pos.data);
        setSuppliers(sups.data);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load data');
      }
    };
    if (!isEditMode) loadData();
  }, [isEditMode, toast]);

  // Suggestions for the PO reference and supplier searchable selects (browse +
  // type-to-search in one field each). Once a supplier is chosen, the PO list
  // is scoped down to that supplier's own purchase orders — previously this
  // showed every hospital's approved/partially-received PO mixed together
  // regardless of supplier, so picking a supplier first and then searching
  // the PO field surfaced nothing that visibly connected back to it.
  const poSuggestions: SuggestionOption[] = purchaseOrders
    .filter(p => !supplier || p.supplier_id === supplier)
    .map(p => ({
      id: p.id,
      label: `${p.po_number} - ${p.supplier_name}${p.status === 'partially_received' ? ' (balance pending)' : ''}`,
      metadata: { id: p.id },
    }));

  const selectedPO = purchaseOrders.find(p => p.id === poId);

  const handlePOSelect = (_value: string, metadata?: Record<string, unknown>) => {
    handleSelectPO((metadata && metadata.id) ? (metadata.id as string) : '');
  };

  const supplierSuggestions: SuggestionOption[] = suppliers.map(s => ({
    id: s.id,
    label: s.name,
    metadata: { id: s.id },
  }));

  const selectedSupplierObj = suppliers.find((s: any) => s.id === supplier);

  const handleSupplierSelect = (_value: string, metadata?: Record<string, unknown>) => {
    const newSupplierId = (metadata && metadata.id) ? (metadata.id as string) : '';
    // Switching to a different supplier than the one the currently-selected
    // PO belongs to leaves a stale, mismatched PO reference behind — clear
    // it so the item rows it auto-filled don't linger under the wrong
    // supplier (the user can re-pick the right PO from the now-scoped list).
    if (poId && selectedPO && selectedPO.supplier_id !== newSupplierId) {
      setPOId('');
    }
    setSupplier(newSupplierId);
  };

  // Update PO when selected
  const handleSelectPO = async (selectedPOId: string) => {
    setPOId(selectedPOId);
    const selectedPO = purchaseOrders.find(p => p.id === selectedPOId);
    if (selectedPO) {
      setSupplier(selectedPO.supplier_id);
      // Pre-fill with the BALANCE still to receive, not the full ordered
      // quantity (BUG-31) — earlier GRNs against this PO have already
      // received part of it. Fully-received lines are dropped entirely.
      const newItems = selectedPO.items
        .filter(poi => poi.quantity_ordered - (poi.quantity_received || 0) > 0)
        .map(poi => {
          const balance = poi.quantity_ordered - (poi.quantity_received || 0);
          return {
            item_type: poi.item_type || 'medicine',
            item_id: poi.item_id,
            item_name: poi.item_name,
            batch_number: '',
            manufactured_date: '',
            expiry_date: '',
            quantity_received: balance,
            quantity_accepted: balance,
            quantity_rejected: 0,
            unit_price: poi.unit_price,
            total_price: balance * poi.unit_price,
          } as GRNItemCreate;
        });
      if (newItems.length === 0) {
        toast.error('All items on this PO have already been fully received');
      }
      setItems(newItems.length > 0 ? newItems : items);
    }
  };

  // Update item field
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    const item = newItems[index];
    (item as any)[field] = value;

    // Medicine and optical product catalogs are disjoint — switching type
    // invalidates whatever was previously selected.
    if (field === 'item_type') {
      item.item_id = '';
      item.item_name = '';
    }

    // Auto-calculate quantities
    if (field === 'quantity_received') {
      item.quantity_accepted = value; // Default: accept all received
      item.quantity_rejected = 0;
    }

    // Auto-calculate total — also on 'quantity_received' since that field
    // above just silently changed quantity_accepted too; without it here,
    // editing quantity_received left total_price stale (still the old
    // quantity's total) until unit_price/quantity_accepted was separately
    // touched.
    if (field === 'quantity_received' || field === 'quantity_accepted' || field === 'unit_price') {
      item.total_price = (item.quantity_accepted || 0) * (item.unit_price || 0);
    }

    setItems(newItems);
  };

  // Add new item row
  const addItem = () => {
    setItems([...items, {
      item_type: 'medicine',
      item_id: '',
      batch_number: '',
      manufactured_date: '',
      expiry_date: '',
      quantity_received: 0,
      quantity_accepted: 0,
      unit_price: 0,
      total_price: 0,
    }]);
  };

  // Remove item row
  const removeItem = (index: number) => {
    if (items.length === 1) {
      toast.error('At least one item is required');
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  // Batch details (batch_number / mfg date / expiry date / quantity received /
  // discrepancy notes) can be corrected regardless of GRN status. If the GRN
  // has already been accepted (stock posted), the backend reconciles the
  // already-created MedicineBatch/OpticalBatch + stock ledger against the
  // correction automatically (see update_grn_item_batch in
  // inventory_service.py) — it will reject the edit (400) only if the
  // correction would take a batch's stock negative (e.g. some of it has
  // already been dispensed/sold).
  const [savingBatchIdx, setSavingBatchIdx] = useState<number | null>(null);

  const handleSaveBatchDetails = async (index: number) => {
    const item = items[index];
    if (!item.id) return;
    setSavingBatchIdx(index);
    try {
      await inventoryService.updateGRNItemBatch(grnId!, item.id, {
        batch_number: item.batch_number || undefined,
        manufactured_date: item.manufactured_date || undefined,
        expiry_date: item.expiry_date || undefined,
        quantity_received: item.quantity_received,
        discrepancy_notes: item.discrepancy_notes || undefined,
      });
      toast.success('Batch details updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update batch details');
    } finally {
      setSavingBatchIdx(null);
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!supplier) {
      toast.error('Please select a supplier');
      return false;
    }
    if (!receiptDate) {
      toast.error('Please enter receipt date');
      return false;
    }
    if (items.length === 0) {
      toast.error('At least one item is required');
      return false;
    }

    for (const item of items) {
      // item_id may be blank for a manually-typed new item — the backend resolves
      // by name or auto-creates it (see NewPurchaseOrderPage.tsx for the same
      // pattern). Requiring a pre-resolved id here would block adding any item
      // that isn't already in the catalog.
      if (!item.item_name) {
        toast.error('All items must have a name or be selected from the list');
        return false;
      }
      if (!item.batch_number) {
        toast.error('Batch number is required for all items');
        return false;
      }
      // Optical frames/solutions/accessories legitimately have no expiry —
      // only medicines require one.
      if (item.item_type === 'medicine' && !item.expiry_date) {
        toast.error('Expiry date is required for all medicine items');
        return false;
      }
      if (item.quantity_received <= 0) {
        toast.error('Received quantity must be greater than 0');
        return false;
      }
    }
    return true;
  };

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const payload = {
        supplier_id: supplier,
        purchase_order_id: poId || undefined,
        receipt_date: receiptDate,
        invoice_number: invoiceNumber || undefined,
        invoice_date: invoiceDate || undefined,
        notes: notes || undefined,
        items,
      };

      if (isEditMode) {
        await inventoryService.updateGRN(grnId!, { status: 'accepted', notes });
      } else {
        await inventoryService.createGRN(payload);
      }

      toast.success(isEditMode ? 'GRN updated successfully' : 'GRN created successfully');
      navigate('/inventory/grns');
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to save GRN');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{isEditMode ? 'Edit GRN' : 'Create Goods Receipt Note'}</h1>
            {isEditMode && existingGRN && (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[existingGRN.status] || 'bg-slate-100 text-slate-600'}`}>
                {existingGRN.status}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isEditMode
              ? 'Batch #, quantity received, dates, and discrepancy notes can be corrected below — including after acceptance.'
              : 'Record incoming stock delivery and create medicine batches'}
          </p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="text-slate-600 hover:text-slate-900"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
        {/* Section 1: Basic Info */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 pb-4 border-b border-slate-200">Receipt Information</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Supplier — placed first since picking a supplier scopes the
                Purchase Order field below to just that supplier's own POs. */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Supplier *</label>
              <SearchableSelect
                value={selectedSupplierObj ? (selectedSupplierObj as any).name : ''}
                onChange={handleSupplierSelect}
                suggestions={supplierSuggestions}
                placeholder="Search supplier..."
                disabled={isEditMode}
                allowManualEntry={false}
              />
            </div>

            {/* Purchase Order */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Purchase Order (Optional)</label>
              <SearchableSelect
                value={selectedPO ? `${selectedPO.po_number} - ${selectedPO.supplier_name}${selectedPO.status === 'partially_received' ? ' (balance pending)' : ''}` : ''}
                onChange={handlePOSelect}
                suggestions={poSuggestions}
                placeholder={supplier ? "Search this supplier's PO (auto-fill items)..." : "Search PO (auto-fill items)..."}
                disabled={isEditMode}
                allowManualEntry={false}
              />
              {poId && purchaseOrders.find(p => p.id === poId)?.status === 'partially_received' && (
                <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  This PO was partially received earlier — items below are pre-filled with the remaining balance only.
                </p>
              )}
              {/* Explains an empty PO list instead of leaving it silent — a PO
                  only appears here once approved (see Purchase Orders → Approve),
                  and once a supplier is chosen the list is scoped to just that
                  supplier's own POs (see poSuggestions above). */}
              {!poId && supplier && poSuggestions.length === 0 && (
                <p className="mt-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                  No approved purchase orders found for this supplier — a PO must be Approved (Inventory → Purchase Orders) before it can be received here. You can still add items manually below.
                </p>
              )}
            </div>

            {/* Receipt Date */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Receipt Date *</label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                disabled={isEditMode}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
              />
            </div>

            {/* Invoice Number */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Invoice Number</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Invoice #"
                disabled={isEditMode}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
              />
            </div>

            {/* Invoice Date */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                disabled={isEditMode}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this delivery..."
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 pb-4 border-b border-slate-200 flex-1">Received Items</h2>
            {!isEditMode && (
              <button
                onClick={addItem}
                className="px-3 py-1.5 text-sm font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
              >
                + Add Item
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Item</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Batch #</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Mfg Date</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Expiry Date</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-600">Received</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-600">Accepted</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Unit Price</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Total</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Discrepancy Notes</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <select
                        value={item.item_type}
                        onChange={(e) => updateItem(idx, 'item_type', e.target.value)}
                        disabled={isEditMode || !!poId}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white disabled:bg-slate-50"
                      >
                        <option value="medicine">Medicine</option>
                        <option value="optical_product">Optical</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 min-w-[160px]">
                      {isEditMode || poId ? (
                        <input
                          type="text"
                          value={item.item_name || ''}
                          placeholder="Item name"
                          disabled
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-slate-50"
                        />
                      ) : (
                        <SearchableSelect
                          value={item.item_name || ''}
                          onChange={(val, meta) => handleItemSelect(idx, val, meta)}
                          suggestions={getItemSuggestions(item.item_type)}
                          placeholder={item.item_type === 'medicine' ? 'Search medicine...' : 'Search optical product...'}
                          allowManualEntry={true}
                          className="text-xs"
                        />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={item.batch_number}
                        onChange={(e) => updateItem(idx, 'batch_number', e.target.value)}
                        placeholder="Batch #"
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="date"
                        value={item.manufactured_date}
                        onChange={(e) => updateItem(idx, 'manufactured_date', e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="date"
                        value={item.expiry_date}
                        onChange={(e) => updateItem(idx, 'expiry_date', e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="number"
                        value={zeroAsEmpty(item.quantity_received)} placeholder="0"
                        onChange={(e) => updateItem(idx, 'quantity_received', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="number"
                        value={zeroAsEmpty(item.quantity_accepted || 0)} placeholder="0"
                        onChange={(e) => updateItem(idx, 'quantity_accepted', parseInt(e.target.value) || 0)}
                        disabled={isEditMode}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3">
                      {/* Editable only at create time — the edit-mode "Save"
                          below (handleSaveBatchDetails) hits
                          update_grn_item_batch, which deliberately only
                          covers batch_number/dates/quantity_received/
                          discrepancy_notes (see GRNItemBatchUpdate), not
                          rate — once items are posted to inventory, changing
                          the rate here would silently do nothing rather
                          than reconcile stock valuation, so it's disabled
                          rather than offered and dropped. */}
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={zeroAsEmpty(item.unit_price || 0)} placeholder="0.00"
                        onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                        disabled={isEditMode}
                        title={isEditMode ? 'Rate can only be set when the GRN is first created' : undefined}
                        className="w-24 px-2 py-1 border border-slate-200 rounded text-xs text-right focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-slate-900">
                      ₹{(item.total_price || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-3 min-w-[160px]">
                      <input
                        type="text"
                        value={item.discrepancy_notes || ''}
                        onChange={(e) => updateItem(idx, 'discrepancy_notes', e.target.value)}
                        placeholder={isEditMode ? undefined : 'Optional'}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    {!isEditMode && (
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                    {isEditMode && (
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => handleSaveBatchDetails(idx)}
                          disabled={savingBatchIdx === idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
                          title="Save the batch #/dates for this row"
                        >
                          {savingBatchIdx === idx ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end pt-3">
            <div className="text-sm font-bold text-slate-900">
              Grand Total: <span className="text-primary">₹{items.reduce((sum, i) => sum + (i.total_price || 0), 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button
            onClick={() => navigate(-1)}
            className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          {!isEditMode && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating...' : 'Create GRN'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GRNReceiptForm;
