import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { Supplier, SupplierCreate, SupplierUpdate } from '../../types/inventory';

const PAYMENT_TERMS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90', 'COD', 'Advance'];

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
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || '',
    tax_id: supplier?.tax_id || '',
    payment_terms: supplier?.payment_terms || '',
    lead_time_days: supplier?.lead_time_days?.toString() || '',
    rating: supplier?.rating?.toString() || '',
  });

  const set = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Name and Code are required');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const payload: SupplierUpdate = {
          name: form.name,
          contact_person: form.contact_person || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          tax_id: form.tax_id || undefined,
          payment_terms: form.payment_terms || undefined,
          lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : undefined,
          rating: form.rating ? parseFloat(form.rating) : undefined,
        };
        await inventoryService.updateSupplier(supplier!.id, payload);
        toast.success('Supplier updated');
      } else {
        const payload: SupplierCreate = {
          name: form.name,
          code: form.code,
          contact_person: form.contact_person || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          tax_id: form.tax_id || undefined,
          payment_terms: form.payment_terms || undefined,
          lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : undefined,
          rating: form.rating ? parseFloat(form.rating) : undefined,
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
              <input className={inputClass} value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="SUP-001" disabled={isEdit} />
            </div>
            <div>
              <label className={labelClass}>Contact Person</label>
              <input className={inputClass} value={form.contact_person} onChange={e => set('contact_person', e.target.value)} placeholder="John Doe" />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input className={inputClass} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 9876543210" type="tel" />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input className={inputClass} value={form.email} onChange={e => set('email', e.target.value)} placeholder="supplier@example.com" type="email" />
            </div>
            <div>
              <label className={labelClass}>Tax ID / GST</label>
              <input className={inputClass} value={form.tax_id} onChange={e => set('tax_id', e.target.value)} placeholder="22AAAAA0000A1Z5" />
            </div>
            <div>
              <label className={labelClass}>Payment Terms</label>
              <select className={inputClass + ' cursor-pointer'} value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)}>
                <option value="">Select terms</option>
                {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Lead Time (days)</label>
              <input className={inputClass} value={form.lead_time_days} onChange={e => set('lead_time_days', e.target.value.replace(/\D/g, ''))} placeholder="7" type="number" min="0" />
            </div>
            <div>
              <label className={labelClass}>Rating (0–5)</label>
              <input className={inputClass} value={form.rating} onChange={e => set('rating', e.target.value)} placeholder="4.5" type="number" min="0" max="5" step="0.1" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Address</label>
            <textarea className={inputClass + ' resize-none'} rows={2} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full address" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-semibold text-sm transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {isEdit ? 'Update Supplier' : 'Create Supplier'}
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getSuppliers(page, 10, search, activeFilter);
      setSuppliers(res.data);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, activeFilter]);

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
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your vendors and suppliers ({total} total)</p>
        </div>
        <button onClick={handleCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-lg">add</span>
          Add Supplier
        </button>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Search & Filter */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
            <input
              type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name, code, or contact..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
          </div>
          <select
            value={activeFilter === undefined ? '' : activeFilter ? 'active' : 'inactive'}
            onChange={e => { setActiveFilter(e.target.value === '' ? undefined : e.target.value === 'active'); setPage(1); }}
            className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">local_shipping</span>
            <p className="text-slate-500 mt-3 text-sm">No suppliers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Supplier</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden md:table-cell">Contact</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden lg:table-cell">Payment Terms</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden lg:table-cell">Lead Time</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.code}</p>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-sm text-slate-700">{s.contact_person || '—'}</p>
                      <p className="text-xs text-slate-400">{s.phone || s.email || '—'}</p>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell text-sm text-slate-600">{s.payment_terms || '—'}</td>
                    <td className="px-4 py-4 hidden lg:table-cell text-sm text-slate-600">{s.lead_time_days ? `${s.lead_time_days} days` : '—'}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEdit(s)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="Edit">
                          <span className="material-symbols-outlined text-lg text-slate-500">edit</span>
                        </button>
                        <button onClick={() => handleToggleActive(s)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title={s.is_active ? 'Deactivate' : 'Activate'}>
                          <span className={`material-symbols-outlined text-lg ${s.is_active ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {s.is_active ? 'block' : 'check_circle'}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
            <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors">
                Previous
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
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
