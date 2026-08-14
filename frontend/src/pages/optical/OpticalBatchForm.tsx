import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import type { OpticalProduct, OpticalBatchCreateData } from '../../types/optical';
import { useToast } from '../../contexts/ToastContext';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';

// Only contact lenses meaningfully expire — frames/solutions/accessories don't.
const EXPIRING_CATEGORIES = ['contact_lens'];

// Renders a 0 amount field as an empty box with a "0" placeholder hint
// instead of a literal "0" value — so clicking in starts from blank rather
// than requiring the user to delete a leading zero first.
const zeroAsEmpty = (n: number | undefined): number | string => (!n ? '' : n);

const OpticalBatchForm: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const preselectedProduct = searchParams.get('product_id') || '';

  const [products, setProducts] = useState<OpticalProduct[]>([]);
  const [form, setForm] = useState<OpticalBatchCreateData>({
    product_id: preselectedProduct,
    batch_number: '',
    mfg_date: '',
    expiry_date: '',
    quantity: 0,
    purchase_price: 0,
    selling_price: 0,
    mrp: 0,
  });
  const [saving, setSaving] = useState(false);
  const [productLabel, setProductLabel] = useState('');

  useEffect(() => {
    opticalService.getProducts(1, 500).then(r => setProducts(r.data)).catch(() => {});
  }, []);

  // Pre-fill the product search label once its catalog entry loads, so a
  // ?product_id=... deep link (e.g. "Add Batch" from a product's page)
  // shows a readable name instead of a blank search box.
  useEffect(() => {
    if (!preselectedProduct || productLabel) return;
    const p = products.find(x => x.id === preselectedProduct);
    if (p) setProductLabel(`${p.name}${p.brand ? ` (${p.brand})` : ''}`);
  }, [products, preselectedProduct, productLabel]);

  const selectedProduct = products.find(p => p.id === form.product_id);
  const expiryRequired = selectedProduct ? EXPIRING_CATEGORIES.includes(selectedProduct.category) : false;

  const productSuggestions: SuggestionOption[] = products.map(p => ({
    id: p.id,
    label: `${p.name}${p.brand ? ` (${p.brand})` : ''}`,
    metadata: { id: p.id },
  }));
  const handleProductSelect = (value: string, metadata?: Record<string, unknown>) => {
    setProductLabel(value);
    setForm(prev => ({ ...prev, product_id: metadata?.id ? (metadata.id as string) : '' }));
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
    if (!form.product_id) { toast.error('Select a product'); return; }
    if (!form.batch_number.trim()) { toast.error('Batch number is required'); return; }
    if (expiryRequired && !form.expiry_date) { toast.error('Expiry date is required for contact lenses'); return; }
    if (form.quantity <= 0) { toast.error('Quantity must be positive'); return; }

    setSaving(true);
    try {
      await opticalService.createBatch({
        ...form,
        expiry_date: form.expiry_date || undefined,
      });
      toast.success('Batch created');
      if (preselectedProduct) {
        navigate(`/optical/products/${preselectedProduct}`);
      } else {
        navigate('/optical/products');
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
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Product *</label>
            <SearchableSelect
              value={productLabel}
              onChange={handleProductSelect}
              suggestions={productSuggestions}
              placeholder="Search product..."
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
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Expiry Date{expiryRequired ? ' *' : ' (optional)'}
            </label>
            <input type="date" name="expiry_date" value={form.expiry_date || ''} onChange={handleChange} required={expiryRequired}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            {!expiryRequired && (
              <p className="mt-1 text-xs text-slate-400">Leave blank — this product category doesn't expire.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Quantity *</label>
            <input type="number" name="quantity" min={1} value={zeroAsEmpty(form.quantity)} placeholder="0" onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Purchase Price</label>
            <input type="number" name="purchase_price" min={0} step={0.01} value={zeroAsEmpty(form.purchase_price)} placeholder="0.00" onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Selling Price</label>
            <input type="number" name="selling_price" min={0} step={0.01} value={zeroAsEmpty(form.selling_price)} placeholder="0.00" onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">MRP</label>
            <input type="number" name="mrp" min={0} step={0.01} value={zeroAsEmpty(form.mrp)} placeholder="0.00" onChange={handleChange}
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

export default OpticalBatchForm;
