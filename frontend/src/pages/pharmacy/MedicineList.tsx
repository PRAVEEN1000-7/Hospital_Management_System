import React, { useState, useEffect, useCallback, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { Medicine } from '../../types/pharmacy';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
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

const formatCategory = (value?: string | null) => {
  if (!value) return '—';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

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
  const deferredSearch = useDeferredValue(search);

  const fetchMedicines = useCallback(async () => {
    setLoading(true);
    try {
      const result = await pharmacyService.getMedicines(page, 20, deferredSearch, category);
      setMedicines(result.data);
      setTotalPages(result.total_pages);
      setTotal(result.total);
    } catch {
      setMedicines([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, deferredSearch, category]);

  useEffect(() => {
    fetchMedicines();
  }, [fetchMedicines]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      setSearch((current) => (current === nextSearch ? current : nextSearch));
      setPage(1);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategory('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(search || category);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Medicine Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">Browse, search, and narrow your inventory with live filters.</p>
        </div>
        <button
          onClick={() => navigate('/pharmacy/medicines/new')}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Add Medicine
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearch} className="flex-1 min-w-[220px]">
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                <span className="material-symbols-outlined text-lg">search</span>
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by medicine name, generic, SKU, or barcode"
                className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </form>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="min-w-[220px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Active:</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1">Search: {search || 'All'}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1">
            Category: {CATEGORY_OPTIONS.find((option) => option.value === category)?.label || 'All Categories'}
          </span>
        </div>
      </div>

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
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                  </td>
                </tr>
              ) : medicines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">No medicines found</td>
                </tr>
              ) : medicines.map((med) => (
                <tr key={med.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/pharmacy/medicines/${med.id}`)}>
                  <td className="px-4 py-3 font-medium text-slate-900">{med.name}</td>
                  <td className="px-4 py-3 text-slate-600">{med.generic_name || '—'}</td>
                  <td className="px-4 py-3">
                    {med.category ? (
                      <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {formatCategory(med.category)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{med.strength || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{med.unit || med.unit_of_measure || '—'}</td>
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
