import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { Supplier, Medicine, PurchaseOrderItemCreate } from '../../types/pharmacy';
import { useToast } from '../../contexts/ToastContext';

const PurchaseOrderForm: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseOrderItemCreate[]>([
    { medicine_id: '', quantity_ordered: 1, unit_price: 0, batch_number: '', expiry_date: '' },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    pharmacyService.getSuppliers().then(s => setSuppliers(s)).catch(() => {});
    pharmacyService.getMedicines(1, 500).then(r => setMedicines(r.data)).catch(() => {});
  }, []);

  const updateItem = (idx: number, field: string, value: string | number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const addItem = () => {
    setItems(prev => [...prev, { medicine_id: '', quantity_ordered: 1, unit_price: 0, batch_number: '', expiry_date: '' }]);
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const total = items.reduce((s, it) => s + it.quantity_ordered * it.unit_price, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) { toast.error('Please select a supplier'); return; }
    const validItems = items.filter(it => it.medicine_id && it.quantity_ordered > 0);
    if (validItems.length === 0) { toast.error('Add at least one item'); return; }

    setSaving(true);
    try {
      await pharmacyService.createPurchaseOrder({
        supplier_id: supplierId,
        expected_delivery: expectedDelivery || undefined,
        notes: notes || undefined,
        items: validItems,
      });
      toast.success('Purchase order created');
      navigate('/pharmacy/purchase-orders');
    } catch {
      toast.error('Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-2xl font-bold text-slate-900">New Purchase Order</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Supplier *</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
                <option value="">Select supplier</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Expected Delivery</label>
              <input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Order Items</h2>
            <button type="button" onClick={addItem}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80">
              <span className="material-symbols-outlined text-lg">add_circle</span> Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 bg-slate-50 rounded-lg">
                <div className="col-span-4">
                  <label className="block text-xs text-slate-500 mb-0.5">Medicine</label>
                  <select value={item.medicine_id} onChange={e => updateItem(idx, 'medicine_id', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
                    <option value="">Select</option>
                    {medicines.map(m => <option key={m.id} value={m.id}>{m.name} {m.strength ? `(${m.strength})` : ''}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-slate-500 mb-0.5">Qty</label>
                  <input type="number" min={1} value={item.quantity_ordered}
                    onChange={e => updateItem(idx, 'quantity_ordered', parseInt(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-0.5">Unit Price</label>
                  <input type="number" min={0} step={0.01} value={item.unit_price}
                    onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-0.5">Batch #</label>
                  <input value={item.batch_number} onChange={e => updateItem(idx, 'batch_number', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-0.5">Expiry</label>
                  <input type="date" value={item.expiry_date} onChange={e => updateItem(idx, 'expiry_date', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                </div>
                <div className="col-span-1 text-right">
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded">
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="text-right pt-3 border-t border-slate-100">
            <span className="text-sm text-slate-500">Total: </span>
            <span className="text-lg font-bold text-slate-900">₹{total.toFixed(2)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PurchaseOrderForm;
