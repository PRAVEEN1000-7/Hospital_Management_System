import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { GRNItemCreate, GoodsReceiptNote, PurchaseOrder } from '../../types/inventory';

const GRNReceiptForm: React.FC = () => {
  const navigate = useNavigate();
  const { grnId } = useParams<{ grnId: string }>();
  const toast = useToast();
  const isEditMode = !!grnId;

  const [po, setPO] = useState<PurchaseOrder | null>(null);
  const [supplier, setSupplier] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [notes, setNotes] = useState('');
  const [poId, setPOId] = useState('');
  const [items, setItems] = useState<GRNItemCreate[]>([
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
          inventoryService.getPurchaseOrders(1, 100, { status: 'approved' }),
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

  // Update PO when selected
  const handleSelectPO = async (selectedPOId: string) => {
    setPOId(selectedPOId);
    const selectedPO = purchaseOrders.find(p => p.id === selectedPOId);
    if (selectedPO) {
      setSupplier(selectedPO.supplier_id);
      // Pre-fill GRN items from PO
      const newItems = selectedPO.items.map(poi => ({
        item_type: poi.item_type || 'medicine',
        item_id: poi.item_id,
        item_name: poi.item_name,
        batch_number: '',
        manufactured_date: '',
        expiry_date: '',
        quantity_received: poi.quantity_ordered,
        quantity_accepted: poi.quantity_ordered,
        quantity_rejected: 0,
        unit_price: poi.unit_price,
        total_price: poi.total_price,
      } as GRNItemCreate));
      setItems(newItems);
    }
  };

  // Update item field
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    const item = newItems[index];
    (item as any)[field] = value;

    // Auto-calculate quantities
    if (field === 'quantity_received') {
      item.quantity_accepted = value; // Default: accept all received
      item.quantity_rejected = 0;
    }

    // Auto-calculate total
    if (field === 'quantity_accepted' || field === 'unit_price') {
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
      // Check that item has either item_id (catalog item) or item_name (manual entry)
      if (!item.item_id && !item.item_name) {
        toast.error('All items must have a medicine/item selected');
        return false;
      }
      if (!item.batch_number) {
        toast.error('Batch number is required for all items');
        return false;
      }
      if (!item.expiry_date) {
        toast.error('Expiry date is required for all items');
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
          <h1 className="text-2xl font-bold text-slate-900">{isEditMode ? 'View GRN' : 'Create Goods Receipt Note'}</h1>
          <p className="text-sm text-slate-500 mt-1">Record incoming stock delivery and create medicine batches</p>
        </div>
        <button
          onClick={() => navigate('/inventory/grns')}
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
            {/* Purchase Order */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Purchase Order (Optional)</label>
              <select
                value={poId}
                onChange={(e) => handleSelectPO(e.target.value)}
                disabled={isEditMode}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
              >
                <option value="">-- Select PO (auto-fill items) --</option>
                {purchaseOrders.map(po => (
                  <option key={po.id} value={po.id}>{po.po_number} - {po.supplier_name}</option>
                ))}
              </select>
            </div>

            {/* Supplier */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Supplier *</label>
              <select
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                disabled={isEditMode}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
              >
                <option value="">-- Select Supplier --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
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
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Medicine</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Batch #</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Mfg Date</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Expiry Date</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-600">Received</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-600">Accepted</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Unit Price</th>
                  {!isEditMode && <th className="px-3 py-2 text-center font-semibold text-slate-600">Action</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={item.item_name || ''}
                        placeholder="Medicine name"
                        disabled
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={item.batch_number}
                        onChange={(e) => updateItem(idx, 'batch_number', e.target.value)}
                        placeholder="Batch #"
                        disabled={isEditMode}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="date"
                        value={item.manufactured_date}
                        onChange={(e) => updateItem(idx, 'manufactured_date', e.target.value)}
                        disabled={isEditMode}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="date"
                        value={item.expiry_date}
                        onChange={(e) => updateItem(idx, 'expiry_date', e.target.value)}
                        disabled={isEditMode}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="number"
                        value={item.quantity_received}
                        onChange={(e) => updateItem(idx, 'quantity_received', parseInt(e.target.value))}
                        disabled={isEditMode}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="number"
                        value={item.quantity_accepted || 0}
                        onChange={(e) => updateItem(idx, 'quantity_accepted', parseInt(e.target.value))}
                        disabled={isEditMode}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-900">
                      ₹{(item.unit_price || 0).toFixed(2)}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button
            onClick={() => navigate('/inventory/grns')}
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
