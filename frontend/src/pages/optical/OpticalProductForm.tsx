import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import { useToast } from '../../contexts/ToastContext';
import type { OpticalProductCreateData } from '../../types/optical';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';

interface OpeningBatchForm {
  batch_number: string;
  mfg_date: string;
  expiry_date: string;
  quantity: number;
  purchase_price: number;
  selling_price: number;
}

const CATEGORIES = [
  { value: 'frame', label: 'Frame' },
  { value: 'lens', label: 'Lens' },
  { value: 'contact_lens', label: 'Contact Lens' },
  { value: 'solution', label: 'Solution' },
  { value: 'accessory', label: 'Accessory' },
];
const GENDERS = ['unisex', 'male', 'female', 'kids'];
// Only contact lenses meaningfully expire — frames/solutions/accessories don't.
const EXPIRING_CATEGORIES = ['contact_lens'];

const sectionTitleClass = 'text-sm font-semibold text-slate-900';
const sectionHintClass = 'mt-1 text-xs text-slate-500';
const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

const OpticalProductForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<OpticalProductCreateData>({
    name: '', category: 'frame', brand: '', model_number: '', color: '', material: '',
    size: '', gender: '', sku: '', barcode: '', selling_price: 0, purchase_price: undefined,
    reorder_level: 5, lens_type: '', lens_index: '', lens_coating: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [showPreview, setShowPreview] = useState(false);
  const [addOpeningStock, setAddOpeningStock] = useState(false);
  const [openingBatch, setOpeningBatch] = useState<OpeningBatchForm>({
    batch_number: '',
    mfg_date: '',
    expiry_date: '',
    quantity: 0,
    purchase_price: 0,
    selling_price: 0,
  });

  const expiryRequired = EXPIRING_CATEGORIES.includes(form.category);

  // Brand suggestions drawn from brands already used in the catalog, so
  // admins match an existing brand instead of free-typing near-duplicates
  // (e.g. "Ray Ban" vs "Ray-Ban") — manual entry still allowed for a brand
  // that's genuinely new to the catalog.
  const [brandSuggestions, setBrandSuggestions] = useState<SuggestionOption[]>([]);
  useEffect(() => {
    opticalService.getProducts(1, 200, '', '', false).then((res) => {
      const brands = Array.from(new Set(res.data.map((p) => p.brand).filter((b): b is string => !!b)));
      setBrandSuggestions(brands.sort().map((b) => ({ id: b, label: b })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (id) {
      opticalService.getProduct(id).then((product) => {
        setForm({
          name: product.name,
          category: product.category,
          brand: product.brand || '',
          model_number: product.model_number || '',
          color: product.color || '',
          material: product.material || '',
          size: product.size || '',
          gender: product.gender || '',
          sku: product.sku || '',
          barcode: product.barcode || '',
          selling_price: product.selling_price ?? 0,
          purchase_price: product.purchase_price ?? undefined,
          reorder_level: product.reorder_level ?? 5,
          lens_type: product.lens_type || '',
          lens_index: product.lens_index || '',
          lens_coating: product.lens_coating || '',
        });
      }).catch(() => navigate('/optical/products'))
        .finally(() => setLoading(false));
    }
  }, [id, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? undefined : Number(value)) : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Product name is required'); return; }
    if (!form.category) { toast.error('Category is required'); return; }
    if (!isEdit && addOpeningStock) {
      if (!openingBatch.batch_number.trim()) { toast.error('Opening stock batch number is required'); return; }
      if (expiryRequired && !openingBatch.expiry_date) {
        toast.error('Opening stock expiry date is required for contact lenses');
        return;
      }
      if (openingBatch.quantity <= 0) { toast.error('Opening stock quantity must be greater than 0'); return; }
      if (openingBatch.purchase_price < 0 || openingBatch.selling_price < 0) {
        toast.error('Opening stock prices cannot be negative');
        return;
      }
    }
    setShowPreview(true);
  };

  const handleConfirmSave = async () => {
    setSaving(true);
    try {
      const payload: OpticalProductCreateData = {
        ...form,
        name: form.name.trim(),
        category: form.category.trim().toLowerCase(),
        brand: form.brand?.trim(),
        model_number: form.model_number?.trim(),
        color: form.color?.trim(),
        material: form.material?.trim(),
        size: form.size?.trim(),
        gender: form.gender?.trim(),
        sku: form.sku?.trim(),
        barcode: form.barcode?.trim(),
        lens_type: form.lens_type?.trim(),
        lens_index: form.lens_index?.trim(),
        lens_coating: form.lens_coating?.trim(),
      };

      if (isEdit && id) {
        await opticalService.updateProduct(id, payload);
        toast.success('Optical product updated');
        navigate('/optical/products');
      } else {
        const created = await opticalService.createProduct(payload);

        if (addOpeningStock) {
          await opticalService.createBatch({
            product_id: created.id,
            batch_number: openingBatch.batch_number.trim(),
            mfg_date: openingBatch.mfg_date || undefined,
            expiry_date: openingBatch.expiry_date || undefined,
            quantity: openingBatch.quantity,
            purchase_price: openingBatch.purchase_price,
            selling_price: openingBatch.selling_price,
          });
          toast.success('Product created with opening stock batch');
        } else {
          toast.success('Optical product created');
        }
        navigate(`/optical/products/${created.id}`);
      }
    } catch {
      toast.error(isEdit ? 'Failed to update product' : 'Failed to create product');
    } finally {
      setSaving(false);
      setShowPreview(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isEdit ? 'Edit Optical Product' : 'Add Optical Product'}</h1>
          <p className="mt-1 text-sm text-slate-500">Frames, lenses, contact lenses, solutions, and accessories.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className={sectionTitleClass}>Identity</h2>
                <p className={sectionHintClass}>Core product naming and classification details.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Name *</label>
                  <input name="name" value={form.name} onChange={handleChange} required className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Category *</label>
                  <select name="category" value={form.category} onChange={handleChange} required className={fieldClass}>
                    {CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Brand</label>
                  <SearchableSelect
                    value={form.brand || ''}
                    onChange={(val) => setForm((prev) => ({ ...prev, brand: val }))}
                    suggestions={brandSuggestions}
                    placeholder="e.g. Ray-Ban"
                  />
                </div>
                <div>
                  <label className={labelClass}>Model Number</label>
                  <input name="model_number" value={form.model_number} onChange={handleChange} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Color</label>
                  <input name="color" value={form.color} onChange={handleChange} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Material</label>
                  <input name="material" value={form.material} onChange={handleChange} placeholder="e.g. Acetate, Titanium" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Size</label>
                  <input name="size" value={form.size} onChange={handleChange} placeholder="e.g. 52mm" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Gender</label>
                  <select name="gender" value={form.gender} onChange={handleChange} className={fieldClass}>
                    <option value="">Select gender</option>
                    {GENDERS.map((g) => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {(form.category === 'lens' || form.category === 'contact_lens') && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className={sectionTitleClass}>Lens Details</h2>
                  <p className={sectionHintClass}>Specifications relevant to lenses and contact lenses.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className={labelClass}>Lens Type</label>
                    <input name="lens_type" value={form.lens_type} onChange={handleChange} placeholder="e.g. single_vision, progressive" className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Lens Index</label>
                    <input name="lens_index" value={form.lens_index} onChange={handleChange} placeholder="e.g. 1.56" className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Lens Coating</label>
                    <input name="lens_coating" value={form.lens_coating} onChange={handleChange} placeholder="e.g. Anti-Reflective" className={fieldClass} />
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className={sectionTitleClass}>Commercial Details</h2>
                <p className={sectionHintClass}>Identifiers used for procurement and billing.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className={labelClass}>SKU</label>
                  <input name="sku" value={form.sku} onChange={handleChange} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Barcode</label>
                  <input name="barcode" value={form.barcode} onChange={handleChange} className={fieldClass} />
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className={sectionTitleClass}>Pricing & Inventory Controls</h2>
                <p className={sectionHintClass}>Catalog pricing and stock thresholds.</p>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Selling Price</label>
                    <input type="number" step="0.01" min={0} name="selling_price" value={form.selling_price ?? ''} onChange={handleChange} className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Purchase Price</label>
                    <input type="number" step="0.01" min={0} name="purchase_price" value={form.purchase_price ?? ''} onChange={handleChange} className={fieldClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Reorder Level</label>
                  <input type="number" min={0} name="reorder_level" value={form.reorder_level ?? ''} onChange={handleChange} className={fieldClass} />
                </div>
              </div>
            </section>

            {!isEdit && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className={sectionTitleClass}>Opening Stock</h2>
                  <p className={sectionHintClass}>Optionally create the first stock batch when saving this product.</p>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={addOpeningStock}
                    onChange={(e) => setAddOpeningStock(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span>
                    <span className="block font-semibold text-slate-900">Add Opening Stock Batch</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Enable this to set initial quantity, batch, and pricing now.</span>
                  </span>
                </label>

                {addOpeningStock && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={labelClass}>Batch Number *</label>
                      <input
                        value={openingBatch.batch_number}
                        onChange={(e) => setOpeningBatch((prev) => ({ ...prev, batch_number: e.target.value }))}
                        className={fieldClass}
                        placeholder="e.g. BATCH-001"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Expiry Date{expiryRequired ? ' *' : ' (optional)'}</label>
                      <input
                        type="date"
                        value={openingBatch.expiry_date}
                        onChange={(e) => setOpeningBatch((prev) => ({ ...prev, expiry_date: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                        className={fieldClass}
                      />
                      {!expiryRequired && (
                        <p className="mt-1 text-xs text-slate-400">Leave blank — this category doesn't expire.</p>
                      )}
                    </div>
                    <div>
                      <label className={labelClass}>Manufactured Date</label>
                      <input
                        type="date"
                        value={openingBatch.mfg_date}
                        onChange={(e) => setOpeningBatch((prev) => ({ ...prev, mfg_date: e.target.value }))}
                        max={new Date().toISOString().split('T')[0]}
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Quantity *</label>
                      <input
                        type="number"
                        min={1}
                        value={openingBatch.quantity || ''}
                        onChange={(e) => setOpeningBatch((prev) => ({ ...prev, quantity: Math.max(0, Number(e.target.value) || 0) }))}
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Purchase Price</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={openingBatch.purchase_price || ''}
                        onChange={(e) => setOpeningBatch((prev) => ({ ...prev, purchase_price: Math.max(0, Number(e.target.value) || 0) }))}
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Selling Price</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={openingBatch.selling_price || ''}
                        onChange={(e) => setOpeningBatch((prev) => ({ ...prev, selling_price: Math.max(0, Number(e.target.value) || 0) }))}
                        className={fieldClass}
                      />
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        <div className="sticky bottom-4 z-10 rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Required fields should be completed before saving.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => navigate(-1)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
                {isEdit ? 'Review Updates' : 'Preview & Save'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-900">Confirm Product Details</h2>
              <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 text-sm">
              <div><span className="text-slate-500 block mb-1">Name</span><p className="font-medium text-slate-900">{form.name}</p></div>
              <div><span className="text-slate-500 block mb-1">Category</span><p className="font-medium text-slate-900 capitalize">{form.category}</p></div>
              <div><span className="text-slate-500 block mb-1">Brand</span><p className="font-medium text-slate-900">{form.brand || 'N/A'}</p></div>
              <div><span className="text-slate-500 block mb-1">Model Number</span><p className="font-medium text-slate-900">{form.model_number || 'N/A'}</p></div>
              <div><span className="text-slate-500 block mb-1">Color / Size</span><p className="font-medium text-slate-900">{[form.color, form.size].filter(Boolean).join(' / ') || 'N/A'}</p></div>
              <div><span className="text-slate-500 block mb-1">SKU / Barcode</span><p className="font-medium text-slate-900">{form.sku || '-'} / {form.barcode || '-'}</p></div>
              <div><span className="text-slate-500 block mb-1">Pricing</span><p className="font-medium text-slate-900">₹{form.selling_price ?? 0} (cost ₹{form.purchase_price ?? 0})</p></div>
              <div><span className="text-slate-500 block mb-1">Reorder Level</span><p className="font-medium text-slate-900">{form.reorder_level}</p></div>
            </div>

            <div className="mt-8 flex justify-end gap-3 border-t border-slate-100 pt-5">
              <button
                onClick={() => setShowPreview(false)}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Back to Edit
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
                {saving && <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
                {saving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpticalProductForm;
