import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import { useToast } from '../../contexts/ToastContext';
import type { MedicineCreateData } from '../../types/pharmacy';

const CATEGORIES = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Ointment', 'Drops', 'Inhaler', 'Powder', 'Other'];
const UNITS = ['Nos', 'Strip', 'Bottle', 'Box', 'Tube', 'Vial', 'Ampoule', 'Sachet', 'Pack'];
const SCHEDULES = ['OTC', 'H', 'H1', 'X'];

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

  useEffect(() => {
    if (id) {
      pharmacyService.getMedicine(id).then((med) => {
        setForm({
          name: med.name,
          generic_name: med.generic_name || '',
          brand: med.brand || '',
          category: med.category || '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Medicine name is required'); return; }
    setSaving(true);
    try {
      if (isEdit && id) {
        await pharmacyService.updateMedicine(id, form);
        toast.success('Medicine updated');
        navigate(`/pharmacy/medicines/${id}`);
      } else {
        const med = await pharmacyService.createMedicine(form);
        toast.success('Medicine created');
        navigate(`/pharmacy/medicines/${med.id}`);
      }
    } catch {
      toast.error(isEdit ? 'Failed to update medicine' : 'Failed to create medicine');
    } finally {
      setSaving(false);
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
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-2xl font-bold text-slate-900">{isEdit ? 'Edit Medicine' : 'Add Medicine'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        {/* Row 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Name *</label>
            <input name="name" value={form.name} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Generic Name</label>
            <input name="generic_name" value={form.generic_name} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Brand</label>
            <input name="brand" value={form.brand} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Category</label>
            <select name="category" value={form.category} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
              <option value="">Select</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Strength</label>
            <input name="strength" value={form.strength} onChange={handleChange} placeholder="e.g. 500mg"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Dosage Form</label>
            <input name="dosage_form" value={form.dosage_form} onChange={handleChange} placeholder="e.g. Tablet"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Manufacturer</label>
            <input name="manufacturer" value={form.manufacturer} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Unit</label>
            <select name="unit" value={form.unit} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Row 4 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">HSN Code</label>
            <input name="hsn_code" value={form.hsn_code} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">SKU</label>
            <input name="sku" value={form.sku} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Barcode</label>
            <input name="barcode" value={form.barcode} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Description</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary resize-none" />
        </div>

        {/* Row 5 — Schedule, Rack, Stock Levels */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Drug Schedule</label>
            <select name="schedule_type" value={form.schedule_type} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
              <option value="">Select</option>
              {SCHEDULES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Rack / Shelf Location</label>
            <input name="rack_location" value={form.rack_location} onChange={handleChange} placeholder="e.g. A-12"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Reorder Level</label>
            <input type="number" name="reorder_level" min={0} value={form.reorder_level ?? ''} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Max Stock Level</label>
            <input type="number" name="max_stock_level" min={0} value={form.max_stock_level ?? ''} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        {/* Row 6 — Storage & Warnings */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Storage Conditions</label>
          <input name="storage_conditions" value={form.storage_conditions} onChange={handleChange}
            placeholder="e.g. Store below 25°C, Keep away from light"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Drug Interaction Notes</label>
            <textarea name="drug_interaction_notes" value={form.drug_interaction_notes} onChange={handleChange} rows={2}
              placeholder="Known interaction warnings"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary resize-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Side Effects</label>
            <textarea name="side_effects" value={form.side_effects} onChange={handleChange} rows={2}
              placeholder="Common side effects"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary resize-none" />
          </div>
        </div>

        {/* Checkbox */}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="requires_prescription" checked={form.requires_prescription}
            onChange={handleChange} className="rounded border-slate-300 text-primary focus:ring-primary" />
          Requires Prescription
        </label>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update Medicine' : 'Create Medicine'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default MedicineForm;
