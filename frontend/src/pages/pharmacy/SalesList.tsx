import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { Sale } from '../../types/pharmacy';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import DateRangeFilter from '../../components/common/DateRangeFilter';

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  partial: 'bg-blue-100 text-blue-700',
};

type PatientTypeFilter = 'all' | 'walk_in' | 'registered';
type SortBy = 'sale_date' | 'total_amount' | 'invoice_number' | 'created_at';
type SortOrder = 'asc' | 'desc';

const formatSaleDateTime = (sale: Sale): string => {
  const candidate = sale.sale_date || sale.created_at;
  if (!candidate) return '-';

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  // Guard against epoch-like placeholder dates.
  if (parsed.getUTCFullYear() <= 1971 && sale.created_at) {
    const fallback = new Date(sale.created_at);
    if (!Number.isNaN(fallback.getTime())) {
      return format(fallback, 'dd MMM yyyy, hh:mm a');
    }
  }

  return format(parsed, 'dd MMM yyyy, hh:mm a');
};

const SalesList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [saleStatus, setSaleStatus] = useState<string>('all');
  const [patientType, setPatientType] = useState<PatientTypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('sale_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const canCreateSale = Boolean(user?.roles?.some((r) => ['super_admin', 'admin', 'pharmacist', 'cashier'].includes(r)));

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pharmacyService.getSales(
        page,
        20,
        search || '',
        dateFrom || '',
        dateTo || '',
        saleStatus === 'all' ? '' : saleStatus,
        patientType === 'all' ? '' : patientType,
        sortBy,
        sortOrder,
      );
      setSales(res.data);
      setTotalPages(res.total_pages);
    } catch {
      toast.error('Failed to load sales');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, dateFrom, dateTo, saleStatus, patientType, sortBy, sortOrder]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
        {canCreateSale ? (
          <button onClick={() => navigate('/pharmacy/sales/new')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90">
            <span className="material-symbols-outlined text-lg">point_of_sale</span> New Sale
          </button>
        ) : (
          <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
            View only access
          </span>
        )}
      </div>

      {/* Search */}
      <div className="relative w-full max-w-xl">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
        <input type="text" placeholder="Search by invoice or patient..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
      </div>

      <DateRangeFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sale Status</label>
          <select
            value={saleStatus}
            onChange={(e) => { setSaleStatus(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
          >
            <option value="all">All</option>
            <option value="dispensed">Dispensed</option>
            <option value="cancelled">Cancelled</option>
            <option value="returned">Returned</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient Type</label>
          <select
            value={patientType}
            onChange={(e) => { setPatientType(e.target.value as PatientTypeFilter); setPage(1); }}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
          >
            <option value="all">All</option>
            <option value="registered">Registered</option>
            <option value="walk_in">Walk-in</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sort By</label>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as SortBy); setPage(1); }}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
          >
            <option value="sale_date">Sale Date</option>
            <option value="total_amount">Total Amount</option>
            <option value="invoice_number">Invoice Number</option>
            <option value="created_at">Created Time</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Order</label>
          <div className="flex items-center gap-2">
            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value as SortOrder); setPage(1); }}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setDatePreset('all');
                setSaleStatus('all');
                setPatientType('all');
                setSortBy('sale_date');
                setSortOrder('desc');
                setSearch('');
                setPage(1);
              }}
              className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              Reset
            </button>
          </div>
        </div>
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
                    {formatSaleDateTime(s)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.patient_name || 'Walk-in'}</td>
                  <td className="px-4 py-3 text-slate-600">{s.item_count ?? s.items?.length ?? 0}</td>
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
