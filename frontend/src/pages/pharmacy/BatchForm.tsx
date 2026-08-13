import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import inventoryService from '../../services/inventoryService';
import type { Medicine, BatchCreateData } from '../../types/pharmacy';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';

const BatchForm: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { isModuleEnabled } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedMedicine = searchParams.get('medicine_id') || '';

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<BatchCreateData>({
    medicine_id: preselectedMedicine,
    batch_number: '',
    mfg_date: '',
    expiry_date: '',
    quantity: 0,
    purchase_price: 0,
    selling_price: 0,
    mrp: 0,
    tax_percent: 0,
    discount_percent: 0,
    location: '',
    supplier_id: undefined,
  });
  const [saving, setSaving] = useState(false);
  const [medicineLabel, setMedicineLabel] = useState('');
  const [supplierLabel, setSupplierLabel] = useState('');

  useEffect(() => {
    pharmacyService.getMedicines(1, 500).then(r => setMedicines(r.data)).catch(() => {});
    if (isModuleEnabled('inventory')) {
      inventoryService.getSuppliers(1, 100, '', true).then(r => setSuppliers(r.data)).catch(() => {});
    }
  }, [isModuleEnabled]);

  // Pre-fill the medicine search label once its catalog entry loads, so a
  // ?medicine_id=... deep link (e.g. "Add Batch" from a medicine's page)
  // shows a readable name instead of a blank search box.
  useEffect(() => {
    if (!preselectedMedicine || medicineLabel) return;
    const m = medicines.find(x => x.id === preselectedMedicine);
    if (m) setMedicineLabel(`${m.name}${m.strength ? ` (${m.strength})` : ''}`);
  }, [medicines, preselectedMedicine, medicineLabel]);

  const medicineSuggestions: SuggestionOption[] = medicines.map(m => ({
    id: m.id,
    label: `${m.name}${m.strength ? ` (${m.strength})` : ''}`,
    sublabel: m.generic_name || undefined,
    metadata: { id: m.id },
  }));
  const handleMedicineSelect = (value: string, metadata?: Record<string, unknown>) => {
    setMedicineLabel(value);
    setForm(prev => ({ ...prev, medicine_id: metadata?.id ? (metadata.id as string) : '' }));
  };

  const supplierSuggestions: SuggestionOption[] = suppliers.map(s => ({
    id: s.id,
    label: s.name,
    metadata: { id: s.id },
  }));
  const handleSupplierSelect = (value: string, metadata?: Record<string, unknown>) => {
    setSupplierLabel(value);
    setForm(prev => ({ ...prev, supplier_id: metadata?.id ? (metadata.id as string) : undefined }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.medicine_id) { toast.error('Select a medicine'); return; }
    if (!form.batch_number.trim()) { toast.error('Batch number is required'); return; }
    if (!form.expiry_date) { toast.error('Expiry date is required'); return; }
    if (form.quantity <= 0) { toast.error('Quantity must be positive'); return; }

    setSaving(true);
    try {
      await pharmacyService.createBatch({
        ...form,
        supplier_id: form.supplier_id || undefined,
      });
      toast.success('Batch created');
      if (preselectedMedicine) {
        navigate(`/pharmacy/medicines/${preselectedMedicine}`);
      } else {
        navigate('/pharmacy/medicines');
      }
    } catch {
      toast.error('Failed to create batch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Add Batch</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Medicine *</label>
            <SearchableSelect
              value={medicineLabel}
              onChange={handleMedicineSelect}
              suggestions={medicineSuggestions}
              placeholder="Search medicine..."
              allowManualEntry={false}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Batch Number *</label>
            <input name="batch_number" value={form.batch_number} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Mfg Date</label>
            <input type="date" name="mfg_date" value={form.mfg_date || ''} onChange={handleChange}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Expiry Date *</label>
            <input type="date" name="expiry_date" value={form.expiry_date} onChange={handleChange} required
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Quantity *</label>
            <input type="number" name="quantity" min={1} value={form.quantity} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Purchase Price *</label>
            <input type="number" name="purchase_price" min={0} step={0.01} value={form.purchase_price} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Selling Price *</label>
            <input type="number" name="selling_price" min={0} step={0.01} value={form.selling_price} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">MRP</label>
            <input type="number" name="mrp" min={0} step={0.01} value={form.mrp} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tax %</label>
            <input type="number" name="tax_percent" min={0} max={100} step={0.01} value={form.tax_percent} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Discount %</label>
            <input type="number" name="discount_percent" min={0} max={100} step={0.01} value={form.discount_percent} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Supplier</label>
            <SearchableSelect
              value={supplierLabel}
              onChange={handleSupplierSelect}
              suggestions={supplierSuggestions}
              placeholder="Search supplier..."
              allowManualEntry={false}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Batch Location</label>
            <input name="location" value={form.location || ''} onChange={handleChange} placeholder="e.g. Shelf B-3"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Batch'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BatchForm;
