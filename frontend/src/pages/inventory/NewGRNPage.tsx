import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { PurchaseOrder, Supplier, GRNCreate } from '../../types/inventory';

interface ItemRow {
  po_item_id?: string;
  item_type: 'medicine' | 'optical_product';
  item_id: string;
  item_name: string;
  quantity_received: number;
  batch_number: string;
  expiry_date: string;
  unit_price: number;
}

const NewGRNPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedPOId, setSelectedPOId] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [standaloneSupplierId, setStandaloneSupplierId] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    inventoryService.getPurchaseOrders(1, 100, { status: 'approved' })
      .then(r => setPurchaseOrders(r.data))
      .catch(() => {});
    inventoryService.getSuppliers(1, 100, '', true)
      .then(r => setSuppliers(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedPOId) { setSelectedPO(null); setItems([]); return; }
    inventoryService.getPurchaseOrder(selectedPOId).then(po => {
      setSelectedPO(po);
      setItems(po.items.map(it => ({
        po_item_id: it.id,
        item_type: (it.item_type as 'medicine' | 'optical_product') || 'medicine',
        item_id: it.item_id,
        item_name: it.item_name || it.item_id,
        quantity_received: it.quantity_ordered - it.quantity_received,
        batch_number: '',
        expiry_date: '',
        unit_price: it.unit_price || 0,
      })));
    }).catch(() => toast.error('Failed to load PO details'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPOId]);

  const addManualItem = () => setItems([...items, {
    item_type: 'medicine', item_id: '', item_name: '', quantity_received: 1, batch_number: '', expiry_date: '', unit_price: 0,
  }]);

  const removeItem = (idx: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); };

  const updateItem = (idx: number, field: keyof ItemRow, value: string | number) => {
    const updated = [...items];
    (updated[idx] as unknown as Record<string, string | number>)[field] = value;
    setItems(updated);
  };

  const handleSubmit = async () => {
    if (items.length === 0 || items.some(it => !it.item_name || it.quantity_received <= 0)) {
      toast.error('Please fill in all item details'); return;
    }
    setSaving(true);
    try {
      const supplierId = selectedPO?.supplier_id || standaloneSupplierId;
      if (!supplierId) {
        toast.error('Please select a supplier'); return;
      }
      const payload: GRNCreate = {
        purchase_order_id: selectedPOId || undefined,
        supplier_id: supplierId,
        receipt_date: receivedDate,
        invoice_number: invoiceNumber || undefined,
        notes: notes || undefined,
        items: items.map(it => ({
          item_type: it.item_type,
          item_id: it.item_id || '00000000-0000-0000-0000-000000000000',
          item_name: it.item_name,
          quantity_received: it.quantity_received,
          batch_number: it.batch_number || undefined,
          expiry_date: it.expiry_date || undefined,
          unit_price: it.unit_price,
          total_price: it.quantity_received * it.unit_price,
        })),
      };
      await inventoryService.createGRN(payload);
      toast.success('GRN created successfully');
      navigate('/inventory/grns');
    } catch {
      toast.error('Failed to create GRN');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="flex items-center gap-4">
        <button onClick={() => navigate('/inventory/grns')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <span className="material-symbols-outlined text-slate-500">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Goods Receipt Note</h1>
          <p className="text-sm text-slate-500 mt-1">Record incoming goods against a purchase order or standalone</p>
        </div>
      </header>

      {/* GRN Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-bold text-slate-700 mb-4">Receipt Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Purchase Order</label>
            <select value={selectedPOId} onChange={e => setSelectedPOId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
              <option value="">No PO (standalone receipt)</option>
              {purchaseOrders.map(po => (
                <option key={po.id} value={po.id}>{po.po_number} — {po.supplier_name}</option>
              ))}
            </select>
          </div>
          {!selectedPOId && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Supplier *</label>
              <select value={standaloneSupplierId} onChange={e => setStandaloneSupplierId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                <option value="">Select supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Received Date *</label>
            <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Invoice Number</label>
            <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" placeholder="INV-001" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" placeholder="Delivery notes, discrepancies..." />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-700">Received Items</h2>
          {!selectedPOId && (
            <button onClick={addManualItem} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
              <span className="material-symbols-outlined text-base">add</span>Add Item
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">
            {selectedPOId ? 'Loading PO items...' : 'Select a PO to auto-populate items, or add items manually'}
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item, idx) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500">Item #{idx + 1}</span>
                  {!selectedPOId && (
                    <button onClick={() => removeItem(idx)} disabled={items.length === 1} className="p-1 hover:bg-red-50 rounded-lg disabled:opacity-30">
                      <span className="material-symbols-outlined text-lg text-red-400">delete</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div>
                    <label className="text-xs text-slate-400">Item Name</label>
                    <input type="text" value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)}
                      disabled={!!selectedPOId} className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1 disabled:bg-slate-100 disabled:text-slate-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Qty Received *</label>
                    <input type="number" min="1" value={item.quantity_received} onChange={e => updateItem(idx, 'quantity_received', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Batch Number</label>
                    <input type="text" value={item.batch_number} onChange={e => updateItem(idx, 'batch_number', e.target.value)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1" placeholder="BATCH-001" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Expiry Date</label>
                    <input type="date" value={item.expiry_date} onChange={e => updateItem(idx, 'expiry_date', e.target.value)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Unit Price *</label>
                    <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1" />
                  </div>
                  <div className="flex items-end">
                    <div>
                      <label className="text-xs text-slate-400">Total</label>
                      <p className="px-2 py-2 text-sm font-semibold text-slate-900 mt-1">
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(item.quantity_received * item.unit_price)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row justify-end gap-3">
        <button onClick={() => navigate('/inventory/grns')} className="px-6 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving || items.length === 0} className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? 'Creating...' : 'Create GRN'}
        </button>
      </div>
    </div>
  );
};

export default NewGRNPage;
