import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import { useToast } from '../../contexts/ToastContext';
import type { SupplierCreateData } from '../../types/pharmacy';

const sectionTitleClass = 'text-sm font-semibold text-slate-900';
const sectionHintClass = 'mt-1 text-xs text-slate-500';
const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

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
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600 transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isEdit ? 'Edit Supplier' : 'Add Supplier'}</h1>
          <p className="mt-1 text-sm text-slate-500">Manage vendor contact details, tax compliance, and procurement terms.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className={sectionTitleClass}>Basic Information</h2>
                <p className={sectionHintClass}>Core identity and location details for this vendor.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Supplier / Company Name *</label>
                  <input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Apollo Pharma Distributors" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Website</label>
                  <input name="website" value={form.website} onChange={handleChange} placeholder="https://..." className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Address</label>
                  <textarea name="address" value={form.address} onChange={handleChange} rows={3} placeholder="Full operational address..." className={`${fieldClass} resize-none`} />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className={sectionTitleClass}>Point of Contact</h2>
                <p className={sectionHintClass}>Direct representative details for quick communication.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Contact Person</label>
                  <input name="contact_person" value={form.contact_person} onChange={handleChange} placeholder="e.g. Rahul Sharma" className={fieldClass} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input name="phone" value={form.phone} onChange={handleChange} placeholder="+91 XXXXX XXXXX" className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Email Address</label>
                    <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="contact@supplier.com" className={fieldClass} />
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className={sectionTitleClass}>Compliance & Tax</h2>
                <p className={sectionHintClass}>Registration identifiers required for billing and legal checks.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>GST Number</label>
                  <input name="gst_number" value={form.gst_number} onChange={handleChange} placeholder="Supplier GSTIN" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Drug License Number</label>
                  <input name="drug_license_number" value={form.drug_license_number} onChange={handleChange} placeholder="E.g. DL-12345678" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>PAN Number</label>
                  <input name="pan_number" value={form.pan_number} onChange={handleChange} placeholder="Alphanumeric PAN" className={fieldClass} />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className={sectionTitleClass}>Business Terms</h2>
                <p className={sectionHintClass}>Preferences for payments and ordering speed.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Payment Terms</label>
                  <input name="payment_terms" value={form.payment_terms} onChange={handleChange} placeholder="e.g. Net 30, COD, Upfront" className={fieldClass} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Credit Limit (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">₹</span>
                      <input type="number" name="credit_limit" min={0} step={0.01} value={form.credit_limit ?? ''} onChange={handleChange} className={`${fieldClass} pl-8`} placeholder="0.00" />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Lead Time (Days)</label>
                    <input type="number" name="lead_time_days" min={0} value={form.lead_time_days ?? ''} onChange={handleChange} placeholder="e.g. 3" className={fieldClass} />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-4 z-10 rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Double check compliance details before saving.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => navigate(-1)}
                className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving && <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
                {saving ? 'Saving...' : isEdit ? 'Update Supplier' : 'Save Supplier'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default SupplierForm;
