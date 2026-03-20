import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import paymentService from '../services/paymentService';
import type { PaymentListItem, PaymentMode } from '../types/billing';

const MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  debit_card: 'Debit Card',
  credit_card: 'Credit Card',
};
const MODE_COLORS: Record<string, string> = {
  cash: 'bg-green-100 text-green-700',
  upi: 'bg-purple-100 text-purple-700',
  debit_card: 'bg-blue-100 text-blue-700',
  credit_card: 'bg-violet-100 text-violet-700',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const getRefundedAmount = (p: PaymentListItem): number => {
  if (typeof p.refunded_amount === 'number') return Number(p.refunded_amount);
  return p.status === 'reversed' ? Number(p.amount) : 0;
};

const getNetAmount = (p: PaymentListItem): number => {
  if (typeof p.net_amount === 'number') return Number(p.net_amount);
  return p.status === 'reversed' ? 0 : Number(p.amount);
};

const PaymentList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const today = new Date().toISOString().split('T')[0];

  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [modeFilter, setModeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [dateRange, setDateRange] = useState('');

  const applyDateRange = (range: string) => {
    setDateRange(range);
    setPage(1);
    setDateFrom(today);
    setDateTo(today);
  };

  // Pre-filter from invoice detail
  const invoiceId = searchParams.get('invoice_id');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let res;
      if (invoiceId) {
        const paged = await paymentService.getByInvoice(invoiceId);
        setPayments(paged.items);
        setTotal(paged.total);
        setTotalPages(1);
      } else {
        res = await paymentService.list(page, 15, {
          payment_mode: modeFilter || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          date_range: dateRange || undefined,
        });
        setPayments(res.items);
        setTotal(res.total);
        setTotalPages(res.pages);
      }
    } catch {
      showToast('error', 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [page, modeFilter, dateFrom, dateTo, dateRange, invoiceId, showToast]);

  useEffect(() => { load(); }, [load]);

  // Summary stats
  const grossCollected = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalRefunded = payments.reduce((s, p) => s + getRefundedAmount(p), 0);
  const netCollected = payments.reduce((s, p) => s + getNetAmount(p), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {invoiceId ? 'Payments for Invoice' : 'All Payments'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} record{total !== 1 ? 's' : ''}</p>
        </div>
        {invoiceId && (
          <button
            onClick={() => navigate(`/billing/invoices/${invoiceId}`)}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to Invoice
          </button>
        )}
      </div>

      {/* Stats Card */}
      {!invoiceId && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Net Collected</p>
            <p className="text-2xl font-bold text-green-600 mt-1">₹{fmt(netCollected)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Gross Payments</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">₹{fmt(grossCollected)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Refunded</p>
            <p className="text-2xl font-bold text-red-600 mt-1">₹{fmt(totalRefunded)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:col-span-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Transactions</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{total}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      {!invoiceId && (
        <div className="flex flex-wrap gap-3 mb-5">
          {/* Quick date range */}
          <select
            value={dateRange}
            onChange={e => applyDateRange(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Time</option>
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="1y">Last Year</option>
          </select>
          <select
            value={modeFilter}
            onChange={e => { setModeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Modes</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="debit_card">Debit Card</option>
            <option value="credit_card">Credit Card</option>
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">From</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDateRange(''); setPage(1); }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">To</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDateRange(''); setPage(1); }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          {(dateFrom !== today || dateTo !== today || dateRange || modeFilter) && (
            <button
              onClick={() => { setDateFrom(today); setDateTo(today); setDateRange(''); setModeFilter(''); setPage(1); }}
              className="px-3 py-2 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span>
          </div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <span className="material-symbols-outlined text-[48px] mb-3">payments</span>
            <p className="font-medium">No payments found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Payment #</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Invoice #</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Patient</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Date</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Mode</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Amount</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Refunded</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Net</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                    onClick={() => navigate(`/billing/invoices/${p.invoice_id}`)}>
                    <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{p.payment_number}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.invoice_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{p.patient_name}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${MODE_COLORS[p.payment_mode] ?? 'bg-slate-100 text-slate-600'}`}>
                        {MODE_LABELS[p.payment_mode] ?? p.payment_mode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-700">₹{fmt(Number(p.amount))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">₹{fmt(getRefundedAmount(p))}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">₹{fmt(getNetAmount(p))}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${p.status === 'completed' ? 'bg-green-100 text-green-700' : p.status === 'reversed' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-40 hover:bg-slate-50">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-40 hover:bg-slate-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentList;
