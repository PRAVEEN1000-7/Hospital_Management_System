import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import { useToast } from '../../contexts/ToastContext';
import type { MedicineCreateData } from '../../types/pharmacy';

interface OpeningBatchForm {
  batch_number: string;
  mfg_date: string;
  expiry_date: string;
  quantity: number;
  purchase_price: number;
  selling_price: number;
}

const CATEGORIES = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'syrup', label: 'Syrup' },
  { value: 'injection', label: 'Injection' },
  { value: 'cream', label: 'Cream' },
  { value: 'ointment', label: 'Ointment' },
  { value: 'drops', label: 'Drops' },
  { value: 'inhaler', label: 'Inhaler' },
  { value: 'powder', label: 'Powder' },
  { value: 'other', label: 'Other' },
];
const UNITS = ['Nos', 'Strip', 'Bottle', 'Box', 'Tube', 'Vial', 'Ampoule', 'Sachet', 'Pack'];
const SCHEDULES = ['OTC', 'H', 'H1', 'X'];

const sectionTitleClass = 'text-sm font-semibold text-slate-900';
const sectionHintClass = 'mt-1 text-xs text-slate-500';
const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

const MedicineForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<MedicineCreateData>({
    name: '', generic_name: '', brand: '', category: '', dosage_form: '',
    strength: '', manufacturer: '', hsn_code: '', sku: '', barcode: '',
    unit: 'Nos', description: '', requires_prescription: false,
    schedule_type: '', rack_location: '', reorder_level: 10,
    max_stock_level: undefined, storage_conditions: '', drug_interaction_notes: '', side_effects: '',
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

  useEffect(() => {
    if (id) {
      pharmacyService.getMedicine(id).then((med) => {
        setForm({
          name: med.name,
          generic_name: med.generic_name || '',
          brand: med.brand || '',
          category: (med.category || '').toLowerCase(),
          dosage_form: med.dosage_form || '',
          strength: med.strength || '',
          manufacturer: med.manufacturer || '',
          hsn_code: med.hsn_code || '',
          sku: med.sku || '',
          barcode: med.barcode || '',
          unit: med.unit || 'Nos',
          description: med.description || '',
          requires_prescription: med.requires_prescription,
          schedule_type: med.schedule_type || '',
          rack_location: med.rack_location || '',
          reorder_level: med.reorder_level ?? 10,
          max_stock_level: med.max_stock_level ?? undefined,
          storage_conditions: med.storage_conditions || '',
          drug_interaction_notes: med.drug_interaction_notes || '',
          side_effects: med.side_effects || '',
        });
      }).catch(() => navigate('/pharmacy/medicines'))
        .finally(() => setLoading(false));
    }
  }, [id, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Medicine name is required'); return; }
    if (!isEdit && addOpeningStock) {
      if (!openingBatch.batch_number.trim()) { toast.error('Opening stock batch number is required'); return; }
      if (!openingBatch.expiry_date) { toast.error('Opening stock expiry date is required'); return; }
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
      const payload: MedicineCreateData = {
        ...form,
        name: form.name.trim(),
        generic_name: form.generic_name?.trim(),
        brand: form.brand?.trim(),
        category: form.category?.trim().toLowerCase(),
        dosage_form: form.dosage_form?.trim(),
        strength: form.strength?.trim(),
        manufacturer: form.manufacturer?.trim(),
        hsn_code: form.hsn_code?.trim(),
        sku: form.sku?.trim(),
        barcode: form.barcode?.trim(),
        description: form.description?.trim(),
        schedule_type: form.schedule_type?.trim(),
        rack_location: form.rack_location?.trim(),
        storage_conditions: form.storage_conditions?.trim(),
        drug_interaction_notes: form.drug_interaction_notes?.trim(),
        side_effects: form.side_effects?.trim(),
      };

      if (isEdit && id) {
        await pharmacyService.updateMedicine(id, payload);
        toast.success('Medicine updated');
        navigate('/pharmacy/medicines');
      } else {
        const created = await pharmacyService.createMedicine(payload);

        if (addOpeningStock) {
          await pharmacyService.createBatch({
            medicine_id: created.id,
            batch_number: openingBatch.batch_number.trim(),
            mfg_date: openingBatch.mfg_date || undefined,
            expiry_date: openingBatch.expiry_date,
            quantity: openingBatch.quantity,
            purchase_price: openingBatch.purchase_price,
            selling_price: openingBatch.selling_price,
          });
          toast.success('Medicine created with opening stock batch');
        } else {
          toast.success('Medicine created');
        }
        navigate(`/pharmacy/medicines/${created.id}`);
      }
    } catch {
      toast.error(isEdit ? 'Failed to update medicine' : 'Failed to create medicine');
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
          <h1 className="text-2xl font-bold text-slate-900">{isEdit ? 'Edit Medicine' : 'Add Medicine'}</h1>
          <p className="mt-1 text-sm text-slate-500">Organize clinical details, inventory metadata, and storage notes in one place.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className={sectionTitleClass}>Identity</h2>
                <p className={sectionHintClass}>Core medicine naming and classification details used across the inventory.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Name *</label>
                  <input name="name" value={form.name} onChange={handleChange} required className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Generic Name</label>
                  <input name="generic_name" value={form.generic_name} onChange={handleChange} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Brand</label>
                  <input name="brand" value={form.brand} onChange={handleChange} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Manufacturer</label>
                  <input name="manufacturer" value={form.manufacturer} onChange={handleChange} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Category</label>
                  <select name="category" value={form.category} onChange={handleChange} className={fieldClass}>
                    <option value="">Select category</option>
                    {CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Dosage Form</label>
                  <input name="dosage_form" value={form.dosage_form} onChange={handleChange} placeholder="e.g. Tablet" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Strength</label>
                  <input name="strength" value={form.strength} onChange={handleChange} placeholder="e.g. 500mg" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Unit</label>
                  <select name="unit" value={form.unit} onChange={handleChange} className={fieldClass}>
                    {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className={sectionTitleClass}>Commercial Details</h2>
                <p className={sectionHintClass}>Keep identifiers and operational notes consistent for procurement and shelf control.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className={labelClass}>HSN Code</label>
                  <input name="hsn_code" value={form.hsn_code} onChange={handleChange} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>SKU</label>
                  <input name="sku" value={form.sku} onChange={handleChange} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Barcode</label>
                  <input name="barcode" value={form.barcode} onChange={handleChange} className={fieldClass} />
                </div>
              </div>

              <div className="mt-4">
                <label className={labelClass}>Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} rows={4} className={`${fieldClass} resize-none`} />
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className={sectionTitleClass}>Inventory Controls</h2>
                <p className={sectionHintClass}>Define shelf placement and stock thresholds used by pharmacy operations.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Drug Schedule</label>
                  <select name="schedule_type" value={form.schedule_type} onChange={handleChange} className={fieldClass}>
                    <option value="">Select schedule</option>
                    {SCHEDULES.map((schedule) => <option key={schedule} value={schedule}>{schedule}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Rack / Shelf Location</label>
                  <input name="rack_location" value={form.rack_location} onChange={handleChange} placeholder="e.g. A-12" className={fieldClass} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Reorder Level</label>
                    <input type="number" name="reorder_level" min={0} value={form.reorder_level ?? ''} onChange={handleChange} className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Max Stock Level</label>
                    <input type="number" name="max_stock_level" min={0} value={form.max_stock_level ?? ''} onChange={handleChange} className={fieldClass} />
                  </div>
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input type="checkbox" name="requires_prescription" checked={form.requires_prescription}
                    onChange={handleChange} className="mt-0.5 rounded border-slate-300 text-primary focus:ring-primary" />
                  <span>
                    <span className="block font-semibold text-slate-900">Requires Prescription</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Enable this when dispensing should be restricted to valid prescriptions.</span>
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className={sectionTitleClass}>Storage & Safety</h2>
                <p className={sectionHintClass}>Capture the handling notes that staff need when stocking or dispensing.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Storage Conditions</label>
                  <input name="storage_conditions" value={form.storage_conditions} onChange={handleChange}
                    placeholder="e.g. Store below 25°C, Keep away from light" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Drug Interaction Notes</label>
                  <textarea name="drug_interaction_notes" value={form.drug_interaction_notes} onChange={handleChange} rows={3}
                    placeholder="Known interaction warnings" className={`${fieldClass} resize-none`} />
                </div>
                <div>
                  <label className={labelClass}>Side Effects</label>
                  <textarea name="side_effects" value={form.side_effects} onChange={handleChange} rows={3}
                    placeholder="Common side effects" className={`${fieldClass} resize-none`} />
                </div>
              </div>
            </section>

            {!isEdit && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className={sectionTitleClass}>Opening Stock</h2>
                  <p className={sectionHintClass}>Optionally create the first stock batch when saving this medicine.</p>
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
                      <label className={labelClass}>Expiry Date *</label>
                      <input
                        type="date"
                        value={openingBatch.expiry_date}
                        onChange={(e) => setOpeningBatch((prev) => ({ ...prev, expiry_date: e.target.value }))}
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Manufactured Date</label>
                      <input
                        type="date"
                        value={openingBatch.mfg_date}
                        onChange={(e) => setOpeningBatch((prev) => ({ ...prev, mfg_date: e.target.value }))}
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
                      <label className={labelClass}>Purchase Price *</label>
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
                      <label className={labelClass}>Selling Price *</label>
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
              <h2 className="text-xl font-bold text-slate-900">Confirm Medicine Details</h2>
              <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 text-sm">
              <div><span className="text-slate-500 block mb-1">Name</span><p className="font-medium text-slate-900">{form.name}</p></div>
              <div><span className="text-slate-500 block mb-1">Category</span><p className="font-medium text-slate-900 capitalize">{form.category || 'N/A'}</p></div>
              <div><span className="text-slate-500 block mb-1">Generic Name / Composition</span><p className="font-medium text-slate-900">{form.generic_name || 'N/A'}</p></div>
              <div><span className="text-slate-500 block mb-1">Brand</span><p className="font-medium text-slate-900">{form.brand || 'N/A'}</p></div>
              <div><span className="text-slate-500 block mb-1">Manufacturer</span><p className="font-medium text-slate-900">{form.manufacturer || 'N/A'}</p></div>
              <div><span className="text-slate-500 block mb-1">Dosage & Strength</span><p className="font-medium text-slate-900">{form.dosage_form} {form.strength}</p></div>
              <div><span className="text-slate-500 block mb-1">Unit</span><p className="font-medium text-slate-900">{form.unit}</p></div>
              <div><span className="text-slate-500 block mb-1">SKU / Barcode</span><p className="font-medium text-slate-900">{form.sku || '-'} / {form.barcode || '-'}</p></div>
              <div><span className="text-slate-500 block mb-1">Inventory Limits</span><p className="font-medium text-slate-900">Reorder: {form.reorder_level} | Max: {form.max_stock_level || 'N/A'}</p></div>
              <div><span className="text-slate-500 block mb-1">Required Prescription</span><p className="font-medium text-slate-900">{form.requires_prescription ? 'Yes' : 'No'}</p></div>
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

export default MedicineForm;
