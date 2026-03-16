import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { Supplier, PurchaseOrderCreate } from '../../types/inventory';

interface ItemRow {
  item_type: 'medicine' | 'optical_product';
  item_id: string;
  item_name: string;
  quantity_ordered: number;
  unit_price: number;
}

const NewPurchaseOrderPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([{ item_type: 'medicine', item_id: '', item_name: '', quantity_ordered: 1, unit_price: 0 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    inventoryService.getSuppliers(1, 100, '', true).then(r => setSuppliers(r.data)).catch(() => {});
  }, []);

  const addItem = () => setItems([...items, { item_type: 'medicine', item_id: '', item_name: '', quantity_ordered: 1, unit_price: 0 }]);

  const removeItem = (idx: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); };

  const updateItem = (idx: number, field: keyof ItemRow, value: string | number) => {
    const updated = [...items];
    (updated[idx] as unknown as Record<string, string | number>)[field] = value;
    setItems(updated);
  };

  const totalAmount = items.reduce((sum, it) => sum + it.quantity_ordered * it.unit_price, 0);

  const handleSubmit = async (asDraft: boolean) => {
    if (!supplierId) { toast.error('Please select a supplier'); return; }
    if (items.some(it => !it.item_name || it.quantity_ordered <= 0 || it.unit_price <= 0)) {
      toast.error('Please fill in all item details'); return;
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
          item_id: it.item_id || '00000000-0000-0000-0000-000000000000',
          item_name: it.item_name,
          quantity_ordered: it.quantity_ordered,
          unit_price: it.unit_price,
          total_price: it.quantity_ordered * it.unit_price,
        })),
      };
      await inventoryService.createPurchaseOrder(payload);
      toast.success(`Purchase order ${asDraft ? 'saved as draft' : 'submitted'}`);
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
            <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
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
          <button onClick={addItem} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
            <span className="material-symbols-outlined text-base">add</span>Add Item
          </button>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600 w-28">Type</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600">Item Name *</th>
                <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600 w-28">Qty *</th>
                <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600 w-36">Unit Price *</th>
                <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600 w-36">Total</th>
                <th className="px-3 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2">
                    <select value={item.item_type} onChange={e => updateItem(idx, 'item_type', e.target.value)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                      <option value="medicine">Medicine</option>
                      <option value="optical_product">Optical Product</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Item name" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="1" value={item.quantity_ordered} onChange={e => updateItem(idx, 'quantity_ordered', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm text-right" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm text-right" />
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900">{formatCurrency(item.quantity_ordered * item.unit_price)}</td>
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
                  <select value={item.item_type} onChange={e => updateItem(idx, 'item_type', e.target.value)} className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white mt-1">
                    <option value="medicine">Medicine</option>
                    <option value="optical_product">Optical Product</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Item Name</label>
                  <input type="text" value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)} className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1" placeholder="Name" />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Quantity</label>
                  <input type="number" min="1" value={item.quantity_ordered} onChange={e => updateItem(idx, 'quantity_ordered', parseInt(e.target.value) || 0)} className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Unit Price</label>
                  <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1" />
                </div>
              </div>
              <div className="text-right text-sm font-semibold text-slate-900">Line Total: {formatCurrency(item.quantity_ordered * item.unit_price)}</div>
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
