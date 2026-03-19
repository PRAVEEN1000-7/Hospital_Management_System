import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { Supplier, SupplierCreate, SupplierUpdate } from '../../types/inventory';
import { COUNTRIES_BY_PHONE_CODE } from '../../utils/constants';

const PAYMENT_TERMS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90', 'COD', 'Advance'];

const PRODUCT_TYPE_OPTIONS = [
  { value: 'medicine', label: 'Medicine / Pharmaceuticals' },
  { value: 'optical', label: 'Optical Products' },
  { value: 'equipment', label: 'Medical Equipment' },
  { value: 'consumables', label: 'Medical Consumables' },
  { value: 'laboratory', label: 'Laboratory Supplies' },
  { value: 'surgical', label: 'Surgical Instruments' },
  { value: 'other', label: 'Other (specify manually)' },
];

/* ─── Modal ─────────────────────────────────────────────────────────────── */

interface ModalProps {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}

const SupplierModal: React.FC<ModalProps> = ({ supplier, onClose, onSaved }) => {
  const toast = useToast();
  const isEdit = !!supplier;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: supplier?.name || '',
    code: supplier?.code || '',
    contact_person: supplier?.contact_person || '',
    phone_country_code: supplier?.phone_country_code || '+1',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || '',
    tax_id: supplier?.tax_id || '',
    payment_terms: supplier?.payment_terms || '',
    lead_time_days: supplier?.lead_time_days?.toString() || '',
    rating: supplier?.rating?.toString() || '',
    product_type: supplier?.product_type || 'medicine',
    custom_product_type: '',
    use_custom_product_type: !supplier?.product_type || supplier.product_type === 'other',
  });

  const set = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));

  const handleProductTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setForm(prev => ({
      ...prev,
      product_type: value,
      use_custom_product_type: value === 'other',
      custom_product_type: value === 'other' ? prev.custom_product_type : '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Name and Code are required');
      return;
    }
    setSaving(true);
    try {
      const finalProductType = form.use_custom_product_type && form.custom_product_type.trim()
        ? form.custom_product_type.trim()
        : (form.product_type || 'medicine');

      if (isEdit) {
        const payload: SupplierUpdate = {
          name: form.name,
          contact_person: form.contact_person || undefined,
          phone_country_code: form.phone_country_code || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          tax_id: form.tax_id || undefined,
          payment_terms: form.payment_terms || undefined,
          lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : undefined,
          rating: form.rating ? parseFloat(form.rating) : undefined,
          product_type: finalProductType,
        };
        await inventoryService.updateSupplier(supplier!.id, payload);
        toast.success('Supplier updated');
      } else {
        const payload: SupplierCreate = {
          name: form.name,
          code: form.code,
          contact_person: form.contact_person || undefined,
          phone_country_code: form.phone_country_code || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          tax_id: form.tax_id || undefined,
          payment_terms: form.payment_terms || undefined,
          lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : undefined,
          rating: form.rating ? parseFloat(form.rating) : undefined,
          product_type: finalProductType,
        };
        await inventoryService.createSupplier(payload);
        toast.success('Supplier created');
      }
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to save supplier';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all';
  const labelClass = 'text-sm font-medium text-slate-700 mb-1.5 block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Supplier' : 'Add Supplier'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-slate-500">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Supplier Name <span className="text-red-500">*</span></label>
              <input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} placeholder="ABC Pharmaceuticals" />
            </div>
            <div>
              <label className={labelClass}>Supplier Code <span className="text-red-500">*</span></label>
              <input className={inputClass} value={form.code} onChange={e => set('code', e.target.value)} placeholder="SUP-001" />
            </div>
            <div>
              <label className={labelClass}>Product Type <span className="text-red-500">*</span></label>
              <select 
                className={inputClass} 
                value={form.use_custom_product_type ? 'other' : form.product_type} 
                onChange={handleProductTypeChange}
              >
                {PRODUCT_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {form.use_custom_product_type && (
                <input 
                  className={`${inputClass} mt-2`} 
                  value={form.custom_product_type}
                  onChange={(e) => set('custom_product_type', e.target.value)}
                  placeholder="Enter product type manually..."
                  autoFocus
                />
              )}
            </div>
            <div>
              <label className={labelClass}>Contact Person</label>
              <input className={inputClass} value={form.contact_person} onChange={e => set('contact_person', e.target.value)} placeholder="John Doe" />
            </div>
            <div>
              <label className={labelClass}>Phone Country Code</label>
              <select className={inputClass} value={form.phone_country_code} onChange={e => set('phone_country_code', e.target.value)}>
                {COUNTRIES_BY_PHONE_CODE.map(c => (
                  <option key={c.code} value={c.phoneCode}>{c.phoneCode} ({c.name})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input className={inputClass} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 234 567 8900" />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input className={inputClass} value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@supplier.com" type="email" />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Address</label>
              <input className={inputClass} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full address..." />
            </div>
            <div>
              <label className={labelClass}>Tax ID</label>
              <input className={inputClass} value={form.tax_id} onChange={e => set('tax_id', e.target.value)} placeholder="TAX-123456" />
            </div>
            <div>
              <label className={labelClass}>Payment Terms</label>
              <select className={inputClass} value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)}>
                <option value="">Select...</option>
                {PAYMENT_TERMS.map(term => (
                  <option key={term} value={term}>{term}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Lead Time (Days)</label>
              <input className={inputClass} value={form.lead_time_days} onChange={e => set('lead_time_days', e.target.value)} placeholder="7" type="number" min="0" />
            </div>
            <div>
              <label className={labelClass}>Rating (0-5)</label>
              <input className={inputClass} value={form.rating} onChange={e => set('rating', e.target.value)} placeholder="4.5" type="number" min="0" max="5" step="0.1" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? 'Saving...' : isEdit ? 'Update Supplier' : 'Create Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Suppliers Page ────────────────────────────────────────────────────── */

const SuppliersPage: React.FC = () => {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getSuppliers(page, 10, search, activeFilter);
      setSuppliers(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [page, search, activeFilter, toast]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const handleCreate = () => { setEditSupplier(null); setModalOpen(true); };
  const handleEdit = (s: Supplier) => { setEditSupplier(s); setModalOpen(true); };
  const handleToggleActive = async (s: Supplier) => {
    try {
      await inventoryService.updateSupplier(s.id, { is_active: !s.is_active });
      toast.success(`Supplier ${s.is_active ? 'deactivated' : 'activated'}`);
      fetchSuppliers();
    } catch {
      toast.error('Failed to update supplier');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your vendors and suppliers ({total} total)</p>
        </div>
        <button onClick={handleCreate} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add Supplier
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search by name, code, or contact..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <select
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={activeFilter === undefined ? '' : activeFilter ? '1' : '0'}
            onChange={(e) => {
              const val = e.target.value;
              setActiveFilter(val === '' ? undefined : val === '1');
              setPage(1);
            }}
          >
            <option value="">All Suppliers</option>
            <option value="1">Active Only</option>
            <option value="0">Inactive Only</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="material-symbols-outlined animate-spin text-4xl text-blue-600">progress_activity</span>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-20 text-center">
          <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">local_shipping</span>
          <p className="text-slate-500 mt-3 text-sm">No suppliers found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Supplier</th>
                <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden md:table-cell">Product Type</th>
                <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden lg:table-cell">Contact</th>
                <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden lg:table-cell">Payment Terms</th>
                <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {suppliers.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                      <div className="text-xs text-slate-500">{s.code}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      {s.product_type || 'medicine'}
                    </span>
                  </td>
                  <td className="px-4 py-4 hidden lg:table-cell">
                    {s.contact_person ? (
                      <div>
                        <div className="text-sm text-slate-900">{s.contact_person}</div>
                        {s.phone && <div className="text-xs text-slate-500">{s.phone}</div>}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 hidden lg:table-cell">
                    <span className="text-sm text-slate-700">{s.payment_terms || '—'}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(s)} className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                        <span className="material-symbols-outlined text-[18px] text-blue-600">edit</span>
                      </button>
                      <button onClick={() => handleToggleActive(s)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title={s.is_active ? 'Deactivate' : 'Activate'}>
                        <span className="material-symbols-outlined text-[18px] text-slate-600">{s.is_active ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 10 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-slate-600">Showing page {page} of {Math.ceil(total / 10)}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Previous
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 10)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Next
            </button>
          </div>
        </div>
      )}

      {modalOpen && (
        <SupplierModal
          supplier={editSupplier}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchSuppliers(); }}
        />
      )}
    </div>
  );
};

export default SuppliersPage;
