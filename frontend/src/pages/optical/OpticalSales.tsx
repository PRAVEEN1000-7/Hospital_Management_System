import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import type { OpticalSale } from '../../types/optical';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import DateRangeFilter from '../../components/common/DateRangeFilter';

const OpticalSales: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [sales, setSales] = useState<OpticalSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const canCreateSale = Boolean(user?.roles?.some((r) => ['super_admin', 'admin', 'optical_staff'].includes(r)));

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const res = await opticalService.getSales(page, 20, search, dateFrom, dateTo);
      setSales(res.data);
      setTotalPages(res.total_pages);
    } catch {
      toast.error('Failed to load sales');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, dateFrom, dateTo]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Optical Sales</h1>
        {canCreateSale ? (
          <button onClick={() => navigate('/optical/sales/new')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90">
            <span className="material-symbols-outlined text-lg">point_of_sale</span> New Sale
          </button>
        ) : (
          <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
            View only access
          </span>
        )}
      </div>

      <div className="relative w-full max-w-xl">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
        <input type="text" placeholder="Search by invoice number..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
      </div>

      <DateRangeFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : sales.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2 block">receipt_long</span>
            <p className="font-medium">No sales found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Invoice #</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Patient</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Items</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Total</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{s.invoice_number}</td>
                  <td className="px-4 py-3 text-slate-600">{format(new Date(s.created_at), 'dd MMM yyyy, hh:mm a')}</td>
                  <td className="px-4 py-3 text-slate-600">{s.patient_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{s.item_count ?? s.items?.length ?? 0}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">₹{Number(s.total_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 capitalize">
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                Previous
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OpticalSales;
