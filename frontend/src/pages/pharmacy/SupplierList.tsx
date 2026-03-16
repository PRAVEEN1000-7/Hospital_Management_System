import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { Supplier } from '../../types/pharmacy';
import { useToast } from '../../contexts/ToastContext';

const SupplierList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await pharmacyService.getSuppliers(search || undefined);
      setSuppliers(data);
    } catch {
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Delete this supplier?')) return;
    try {
      await pharmacyService.deleteSupplier(id);
      toast.success('Supplier deleted');
      fetchSuppliers();
    } catch {
      toast.error('Failed to delete supplier');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Supplier Directory</h1>
          <p className="mt-1 text-sm text-slate-500">Manage medicine vendors, procurement contacts, and tax compliance details.</p>
        </div>
        <button onClick={() => navigate('/pharmacy/suppliers/new')}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-base">add</span>
          Add Supplier
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative max-w-md">
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
            <span className="material-symbols-outlined text-lg">search</span>
          </span>
          <input type="text" placeholder="Search by supplier name, contact, or email" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name & Contact</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone / Email</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">GST No.</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Terms</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 mb-3">
                      <span className="material-symbols-outlined text-2xl text-slate-400">local_shipping</span>
                    </div>
                    <p className="text-slate-500 font-medium">No suppliers found</p>
                  </td>
                </tr>
              ) : (
                suppliers.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => navigate(`/pharmacy/suppliers/${s.id}/edit`)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.name}</p>
                      {s.contact_person && <p className="text-xs text-slate-500">{s.contact_person}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-700">{s.phone || '—'}</span>
                        {s.email && <span className="text-xs text-slate-500">{s.email}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{s.gst_number || '—'}</td>
                    <td className="px-4 py-3">
                      {s.payment_terms ? (
                        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {s.payment_terms}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => navigate(`/pharmacy/suppliers/${s.id}/edit`)}
                          title="Edit Supplier"
                          className="p-1.5 text-slate-400 hover:text-primary rounded-lg hover:bg-slate-100 transition-colors">
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button onClick={(e) => handleDelete(s.id, e)}
                          title="Delete Supplier"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SupplierList;
