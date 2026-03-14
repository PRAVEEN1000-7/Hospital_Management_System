import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { Medicine } from '../../types/pharmacy';

const MedicineList: React.FC = () => {
  const navigate = useNavigate();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchMedicines = useCallback(async () => {
    setLoading(true);
    try {
      const result = await pharmacyService.getMedicines(page, 20, search, category);
      setMedicines(result.data);
      setTotalPages(result.total_pages);
      setTotal(result.total);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }, [page, search, category]);

  useEffect(() => { fetchMedicines(); }, [fetchMedicines]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const categories = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Ointment', 'Drops', 'Inhaler', 'Powder', 'Other'];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Medicine Inventory</h1>
        <button onClick={() => navigate('/pharmacy/medicines/new')}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-base">add</span> Add Medicine
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
              <span className="material-symbols-outlined text-lg">search</span>
            </span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search medicines..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
            />
          </div>
        </form>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Generic</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Strength</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                </td></tr>
              ) : medicines.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No medicines found</td></tr>
              ) : medicines.map((med) => (
                <tr key={med.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/pharmacy/medicines/${med.id}`)}>
                  <td className="px-4 py-3 font-medium text-slate-900">{med.name}</td>
                  <td className="px-4 py-3 text-slate-600">{med.generic_name || '—'}</td>
                  <td className="px-4 py-3">
                    {med.category && (
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">{med.category}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{med.strength || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{med.unit}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${(med.total_stock ?? 0) < 10 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {med.total_stock ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => navigate(`/pharmacy/medicines/${med.id}/edit`)}
                      className="text-slate-400 hover:text-primary transition-colors">
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
            <span>{total} medicines total</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40">Prev</button>
              <span className="px-3 py-1">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MedicineList;
