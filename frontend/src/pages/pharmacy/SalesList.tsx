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
  partially_paid: 'bg-blue-100 text-blue-700',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  pending: 'Pending',
  partially_paid: 'Partial',
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
  const canReceivePayment = Boolean(user?.roles?.some((r) => ['super_admin', 'admin', 'cashier', 'pharmacist'].includes(r)));

  const [payingSale, setPayingSale] = useState<Sale | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('cash');
  const [paySaving, setPaySaving] = useState(false);

  const openReceivePayment = (sale: Sale) => {
    setPayingSale(sale);
    setPayAmount(Number(sale.balance_amount) || 0);
    setPayMethod(sale.payment_method || 'cash');
  };

  const handleReceivePayment = async () => {
    if (!payingSale || payAmount <= 0) return;
    setPaySaving(true);
    try {
      const newPaidTotal = Number(payingSale.paid_amount || 0) + payAmount;
      await pharmacyService.markDispensingPaid(payingSale.id, newPaidTotal, payMethod);
      toast.success('Payment recorded');
      setPayingSale(null);
      fetchSales();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to record payment');
    } finally {
      setPaySaving(false);
    }
  };

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
                setDateFrom('');
                setDateTo('');
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
          <div className="overflow-x-auto">
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
                <th className="px-4 py-3 font-semibold text-slate-600">Actions</th>
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
                      {PAYMENT_STATUS_LABELS[s.payment_status] || s.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {canReceivePayment && s.payment_status !== 'paid' ? (
                      <button
                        onClick={() => openReceivePayment(s)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                      >
                        <span className="material-symbols-outlined text-sm">payments</span>
                        Receive Payment
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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

      {/* Receive Payment Modal */}
      {payingSale && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPayingSale(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Receive Payment</h3>
            <p className="text-sm text-slate-500 mb-4">{payingSale.invoice_number} — balance due ₹{Number(payingSale.balance_amount || 0).toFixed(2)}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Payment Method</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="insurance">Insurance</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Amount Received</label>
                <input type="number" min={0.01} max={Number(payingSale.balance_amount) || undefined} step={0.01}
                  value={payAmount || ''}
                  onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setPayingSale(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleReceivePayment} disabled={paySaving || payAmount <= 0}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm disabled:opacity-50">
                {paySaving ? 'Recording…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesList;
