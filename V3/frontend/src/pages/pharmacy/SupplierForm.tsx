import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import { useToast } from '../../contexts/ToastContext';
import type { SupplierCreateData } from '../../types/pharmacy';

const SupplierForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<SupplierCreateData>({
    name: '', contact_person: '', phone: '', email: '',
    gst_number: '', drug_license_number: '', address: '',
    payment_terms: '', credit_limit: undefined, lead_time_days: undefined,
    website: '', pan_number: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (id) {
      pharmacyService.getSupplier(id)
        .then(s => setForm({
          name: s.name, contact_person: s.contact_person || '',
          phone: s.phone || '', email: s.email || '',
          gst_number: s.gst_number || '', drug_license_number: s.drug_license_number || '',
          address: s.address || '',
          payment_terms: s.payment_terms || '', credit_limit: s.credit_limit ?? undefined,
          lead_time_days: s.lead_time_days ?? undefined, website: s.website || '',
          pan_number: s.pan_number || '',
        }))
        .catch(() => navigate('/pharmacy/suppliers'))
        .finally(() => setLoading(false));
    }
  }, [id, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'number' ? (value === '' ? undefined : parseFloat(value)) : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Supplier name is required'); return; }
    setSaving(true);
    try {
      if (isEdit && id) {
        await pharmacyService.updateSupplier(id, form);
        toast.success('Supplier updated');
      } else {
        await pharmacyService.createSupplier(form);
        toast.success('Supplier created');
      }
      navigate('/pharmacy/suppliers');
    } catch {
      toast.error(isEdit ? 'Failed to update supplier' : 'Failed to create supplier');
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
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-2xl font-bold text-slate-900">{isEdit ? 'Edit Supplier' : 'Add Supplier'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Supplier Name *</label>
            <input name="name" value={form.name} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Contact Person</label>
            <input name="contact_person" value={form.contact_person} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Phone</label>
            <input name="phone" value={form.phone} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Email</label>
            <input name="email" type="email" value={form.email} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">GST Number</label>
            <input name="gst_number" value={form.gst_number} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Drug License Number</label>
            <input name="drug_license_number" value={form.drug_license_number} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Address</label>
          <textarea name="address" value={form.address} onChange={handleChange} rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary resize-none" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Payment Terms</label>
            <input name="payment_terms" value={form.payment_terms} onChange={handleChange} placeholder="e.g. Net 30, COD"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Credit Limit (₹)</label>
            <input type="number" name="credit_limit" min={0} step={0.01} value={form.credit_limit ?? ''} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Lead Time (Days)</label>
            <input type="number" name="lead_time_days" min={0} value={form.lead_time_days ?? ''} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Website</label>
            <input name="website" value={form.website} onChange={handleChange} placeholder="https://..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">PAN Number</label>
            <input name="pan_number" value={form.pan_number} onChange={handleChange}
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
            {saving ? 'Saving...' : isEdit ? 'Update Supplier' : 'Create Supplier'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SupplierForm;
