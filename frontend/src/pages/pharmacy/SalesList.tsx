import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { Sale } from '../../types/pharmacy';
import { useToast } from '../../contexts/ToastContext';
import { format, subDays } from 'date-fns';

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  partial: 'bg-blue-100 text-blue-700',
};

type DatePreset = 'all' | 'today' | '7d' | '30d';

const resolveDateRange = (preset: DatePreset): { dateFrom?: string; dateTo?: string } => {
  const today = new Date();
  const end = format(today, 'yyyy-MM-dd');

  if (preset === 'today') {
    return { dateFrom: end, dateTo: end };
  }
  if (preset === '7d') {
    return { dateFrom: format(subDays(today, 6), 'yyyy-MM-dd'), dateTo: end };
  }
  if (preset === '30d') {
    return { dateFrom: format(subDays(today, 29), 'yyyy-MM-dd'), dateTo: end };
  }
  return {};
};

const SalesList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const { dateFrom, dateTo } = resolveDateRange(datePreset);
      const res = await pharmacyService.getSales(page, 20, search || '', dateFrom || '', dateTo || '');
      setSales(res.data);
      setTotalPages(res.total_pages);
    } catch {
      toast.error('Failed to load sales');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, datePreset]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
        <button onClick={() => navigate('/pharmacy/sales/new')}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90">
          <span className="material-symbols-outlined text-lg">point_of_sale</span> New Sale
        </button>
      </div>

      {/* Search */}
      <div className="relative w-full max-w-xl">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
        <input type="text" placeholder="Search by invoice or patient..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</span>
        <button
          onClick={() => { setDatePreset('all'); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${datePreset === 'all' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        >
          All
        </button>
        <button
          onClick={() => { setDatePreset('today'); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${datePreset === 'today' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        >
          Today
        </button>
        <button
          onClick={() => { setDatePreset('7d'); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${datePreset === '7d' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        >
          Last 7 days
        </button>
        <button
          onClick={() => { setDatePreset('30d'); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${datePreset === '30d' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        >
          Last 30 days
        </button>
      </div>

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
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Invoice #</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Patient</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Items</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Total</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Payment</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{s.invoice_number}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {format(new Date(s.sale_date), 'dd MMM yyyy, hh:mm a')}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.patient_name || 'Walk-in'}</td>
                  <td className="px-4 py-3 text-slate-600">{s.items?.length || 0}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">₹{Number(s.total_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{s.payment_method || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${PAYMENT_STATUS_COLORS[s.payment_status] || 'bg-slate-100 text-slate-600'}`}>
                      {s.payment_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
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

export default SalesList;
