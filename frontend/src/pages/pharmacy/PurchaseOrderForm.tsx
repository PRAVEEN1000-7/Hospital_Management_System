import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { Supplier, Medicine, PurchaseOrderItemCreate, PurchaseOrder } from '../../types/pharmacy';
import { useToast } from '../../contexts/ToastContext';

interface FormItem extends PurchaseOrderItemCreate {
  id?: string; // For existing items during edit
  _temporary_id?: string; // For new items
}

const PurchaseOrderForm: React.FC = () => {
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId: string }>();
  const toast = useToast();
  const isEditMode = !!orderId;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loadingMedicines, setLoadingMedicines] = useState(true);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [loadingOrder, setLoadingOrder] = useState(isEditMode);
  const [supplierId, setSupplierId] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<FormItem[]>([
    { medicine_id: '', quantity_ordered: 1, unit_price: 0, batch_number: '', expiry_date: '', _temporary_id: '1' },
  ]);
  const [saving, setSaving] = useState(false);
  const [medicineSearch, setMedicineSearch] = useState('');

  // Load suppliers and medicines on mount
  useEffect(() => {
    const loadData = async () => {
      // Load suppliers
      setLoadingSuppliers(true);
      pharmacyService.getSuppliers()
        .then(s => {
          setSuppliers(s);
          console.log('Suppliers loaded:', s.length);
        })
        .catch(err => {
          console.error('Failed to load suppliers:', err);
          toast.error('Failed to load suppliers');
        })
        .finally(() => setLoadingSuppliers(false));

      // Load medicines
      setLoadingMedicines(true);
      pharmacyService.getMedicines(1, 100)
        .then(r => {
          setMedicines(r.data);
          console.log('Medicines loaded:', r.data.length);
        })
        .catch(err => {
          console.error('Failed to load medicines:', err);
          toast.error('Failed to load medicines');
        })
        .finally(() => setLoadingMedicines(false));
    };

    loadData();
  }, [toast]);

  // Load existing order if in edit mode
  useEffect(() => {
    if (!isEditMode) return;

    const loadOrder = async () => {
      setLoadingOrder(true);
      try {
        const order = await pharmacyService.getPurchaseOrder(orderId!);
        setSupplierId(order.supplier_id);
        setExpectedDelivery(order.expected_delivery ? order.expected_delivery.split('T')[0] : '');
        setNotes(order.notes || '');
        
        if (order.items && order.items.length > 0) {
          setItems(order.items.map((item, idx) => ({
            id: item.id,
            medicine_id: item.medicine_id,
            quantity_ordered: item.quantity_ordered,
            unit_price: item.unit_price,
            batch_number: item.batch_number || '',
            expiry_date: item.expiry_date ? item.expiry_date.split('T')[0] : '',
            _temporary_id: `existing-${idx}`,
          })));
        }
      } catch (err: any) {
        console.error('Failed to load order:', err);
        toast.error(err?.response?.data?.detail || 'Failed to load purchase order');
        navigate('/pharmacy/purchase-orders');
      } finally {
        setLoadingOrder(false);
      }
    };

    loadOrder();
  }, [isEditMode, orderId, toast, navigate]);

  const updateItem = (idx: number, field: string, value: string | number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const addItem = () => {
    setItems(prev => [...prev, { 
      medicine_id: '', 
      quantity_ordered: 1, 
      unit_price: 0, 
      batch_number: '', 
      expiry_date: '',
      _temporary_id: `new-${Date.now()}`
    }]);
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) {
      toast.info('At least one item is required');
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const total = items.reduce((s, it) => s + it.quantity_ordered * it.unit_price, 0);

  const getFilteredMedicines = () => {
    if (!medicineSearch) return medicines;
    const search = medicineSearch.toLowerCase();
    return medicines.filter(m => 
      m.name.toLowerCase().includes(search) ||
      m.generic_name?.toLowerCase().includes(search) ||
      m.strength?.toLowerCase().includes(search)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!supplierId) {
      toast.error('Please select a supplier');
      return;
    }
    
    const validItems = items.filter(it => it.medicine_id && it.quantity_ordered > 0);
    if (validItems.length === 0) {
      toast.error('Add at least one item with valid medicine and quantity');
      return;
    }

    // Validate items
    for (const item of validItems) {
      if (item.unit_price < 0) {
        toast.error('Unit price cannot be negative');
        return;
      }
      if (item.quantity_ordered <= 0) {
        toast.error('Quantity must be greater than 0');
        return;
      }
    }

    setSaving(true);
    try {
      const orderData = {
        supplier_id: supplierId,
        expected_delivery: expectedDelivery || undefined,
        notes: notes || undefined,
        items: validItems.map(({ medicine_id, quantity_ordered, unit_price, batch_number, expiry_date }) => ({
          medicine_id,
          quantity_ordered,
          unit_price,
          batch_number,
          expiry_date,
        })),
      };

      if (isEditMode) {
        await pharmacyService.updatePurchaseOrder(orderId!, orderData);
        toast.success('Purchase order updated successfully');
      } else {
        await pharmacyService.createPurchaseOrder(orderData);
        toast.success('Purchase order created successfully');
      }
      navigate('/pharmacy/purchase-orders');
    } catch (err: any) {
      console.error('Failed to save purchase order:', err);
      toast.error(err?.response?.data?.detail || 'Failed to save purchase order');
    } finally {
      setSaving(false);
    }
  };

  if (loadingOrder) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
          <p className="text-sm text-slate-500 mt-3">Loading purchase order...</p>
        </div>
      </div>
    );
  }

  const filteredMedicines = getFilteredMedicines();

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button 
          onClick={() => navigate(isEditMode ? `/pharmacy/purchase-orders/${orderId}/details` : '/pharmacy/purchase-orders')} 
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          title="Go back"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isEditMode ? 'Edit Purchase Order' : 'New Purchase Order'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isEditMode ? 'Update order details and items' : 'Create a new purchase order for medicines'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Header Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-primary">info</span>
            Order Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                Supplier <span className="text-red-500">*</span>
              </label>
              {loadingSuppliers ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  Loading...
                </div>
              ) : (
                <select 
                  value={supplierId} 
                  onChange={e => setSupplierId(e.target.value)} 
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-shadow"
                >
                  <option value="">Select supplier</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                Expected Delivery
              </label>
              <input 
                type="date" 
                value={expectedDelivery} 
                onChange={e => setExpectedDelivery(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-shadow" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                Notes
              </label>
              <input 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                placeholder="Optional notes..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-shadow" 
              />
            </div>
          </div>
        </div>

        {/* Items Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">inventory_2</span>
              Order Items
            </h2>
            <button 
              type="button" 
              onClick={addItem}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">add</span> 
              Add Item
            </button>
          </div>

          {/* Medicine Search (for quick filtering) */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <span className="material-symbols-outlined text-lg">search</span>
            </span>
            <input
              type="text"
              placeholder="Search medicines to filter dropdown..."
              value={medicineSearch}
              onChange={(e) => setMedicineSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div 
                key={item._temporary_id || item.id || idx} 
                className={`grid grid-cols-12 gap-2 items-end p-4 rounded-lg transition-colors ${
                  item.medicine_id ? 'bg-white border border-slate-200' : 'bg-slate-50'
                }`}
              >
                <div className="col-span-1 text-slate-400 text-sm font-medium pt-2">
                  #{idx + 1}
                </div>
                <div className="col-span-4">
                  <label className="block text-xs text-slate-500 mb-1">Medicine *</label>
                  {loadingMedicines ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      Loading...
                    </div>
                  ) : medicines.length === 0 ? (
                    <div className="text-sm text-red-500 bg-red-50 p-2 rounded border border-red-200 flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">warning</span>
                      No medicines found. Add medicines first.
                    </div>
                  ) : (
                    <select 
                      value={item.medicine_id} 
                      onChange={e => updateItem(idx, 'medicine_id', e.target.value)}
                      className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">Select medicine</option>
                      {filteredMedicines.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.strength ? `(${m.strength})` : ''} 
                          {m.generic_name ? `- ${m.generic_name}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-slate-500 mb-1">Qty *</label>
                  <input 
                    type="number" 
                    min={1} 
                    value={item.quantity_ordered}
                    onChange={e => updateItem(idx, 'quantity_ordered', parseInt(e.target.value) || 0)}
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Unit Price (₹) *</label>
                  <input 
                    type="number" 
                    min={0} 
                    step={0.01} 
                    value={item.unit_price}
                    onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Batch #</label>
                  <input 
                    value={item.batch_number} 
                    onChange={e => updateItem(idx, 'batch_number', e.target.value)}
                    placeholder="Optional"
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-slate-500 mb-1">Expiry</label>
                  <input 
                    type="date" 
                    value={item.expiry_date} 
                    onChange={e => updateItem(idx, 'expiry_date', e.target.value)}
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                  />
                </div>
                <div className="col-span-1 text-right">
                  {items.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => removeItem(idx)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove item"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div className="text-sm text-slate-500">
              <span className="font-medium">{items.filter(i => i.medicine_id).length}</span> of{' '}
              <span className="font-medium">{items.length}</span> items filled
            </div>
            <div className="text-right">
              <span className="text-sm text-slate-500">Estimated Total: </span>
              <span className="text-2xl font-bold text-primary">₹{total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        {isEditMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-600 text-xl">info</span>
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">Editing Purchase Order</p>
              <p>You can modify the supplier, items, and quantities. Changes will be saved immediately.</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button 
            type="button" 
            onClick={() => navigate('/pharmacy/purchase-orders')}
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={saving || loadingMedicines || loadingSuppliers}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                {isEditMode ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">{isEditMode ? 'update' : 'check'}</span>
                {isEditMode ? 'Update Order' : 'Create Order'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PurchaseOrderForm;
