import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import type { OpticalSale } from '../../types/optical';
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
  const canReceivePayment = canCreateSale;

  const [viewingSale, setViewingSale] = useState<OpticalSale | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [payingSale, setPayingSale] = useState<OpticalSale | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('cash');
  const [paySaving, setPaySaving] = useState(false);

  const openView = async (sale: OpticalSale) => {
    setViewingSale(sale);
    setViewLoading(true);
    try {
      const full = await opticalService.getSale(sale.id);
      setViewingSale(full);
    } catch {
      toast.error('Failed to load sale details');
    } finally {
      setViewLoading(false);
    }
  };

  const openReceivePayment = (sale: OpticalSale) => {
    setPayingSale(sale);
    setPayAmount(Number(sale.balance_amount) || 0);
    setPayMethod(sale.payment_method || 'cash');
  };

  const handleReceivePayment = async () => {
    if (!payingSale || payAmount <= 0) return;
    setPaySaving(true);
    try {
      // record_optical_sale_payment adds payAmount to whatever's already
      // paid (e.g. an advance from creation) — pass the increment, not a
      // pre-summed total.
      await opticalService.recordSalePayment(payingSale.id, payAmount, payMethod);
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
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Invoice #</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Sale Date</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Patient</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Item Count</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Total Amount</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Amount Collected</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Payment Status</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Order Status</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Actions</th>
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
                  <td className="px-4 py-3 text-slate-600">₹{Number(s.paid_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${PAYMENT_STATUS_COLORS[s.payment_status] || 'bg-slate-100 text-slate-600'}`}>
                      {PAYMENT_STATUS_LABELS[s.payment_status] || s.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 capitalize">
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openView(s)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                        title="View payment breakdown">
                        <span className="material-symbols-outlined text-sm">visibility</span> View
                      </button>
                      {canReceivePayment && s.payment_status !== 'paid' && (
                        <button onClick={() => openReceivePayment(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100">
                          <span className="material-symbols-outlined text-sm">payments</span> Receive Payment
                        </button>
                      )}
                    </div>
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

      {/* View Sale Modal */}
      {viewingSale && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewingSale(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{viewingSale.invoice_number}</h3>
                <p className="text-xs text-slate-500">{viewingSale.patient_name || '—'} · {format(new Date(viewingSale.created_at), 'dd MMM yyyy, hh:mm a')}</p>
              </div>
              <button onClick={() => setViewingSale(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {viewLoading ? (
              <div className="flex items-center justify-center h-32">
                <span className="material-symbols-outlined animate-spin text-2xl text-primary">progress_activity</span>
              </div>
            ) : (
              <>
                <div className="space-y-1 mb-4">
                  {viewingSale.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                      <div>
                        <span className="font-medium text-slate-700">{item.product_name || 'Item'}</span>
                        {item.batch_number && <span className="text-xs text-slate-400 ml-1.5">Batch {item.batch_number}</span>}
                      </div>
                      <span className="text-slate-600">{item.quantity} × ₹{Number(item.unit_price).toFixed(2)} = ₹{Number(item.total_price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-slate-50 rounded-xl p-4 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>₹{Number(viewingSale.subtotal).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>-₹{Number(viewingSale.discount_amount).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>₹{Number(viewingSale.tax_amount).toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1.5"><span>Total</span><span>₹{Number(viewingSale.total_amount).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Advance Paid</span><span>₹{Number(viewingSale.advance_amount).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Collected</span><span>₹{Number(viewingSale.paid_amount).toFixed(2)}</span></div>
                  <div className="flex justify-between font-semibold text-slate-900"><span>Balance Due</span><span>₹{Number(viewingSale.balance_amount).toFixed(2)}</span></div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-500">Payment Status</span>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${PAYMENT_STATUS_COLORS[viewingSale.payment_status] || 'bg-slate-100 text-slate-600'}`}>
                      {PAYMENT_STATUS_LABELS[viewingSale.payment_status] || viewingSale.payment_status}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
                  onChange={(e) => {
                    // The `max` attribute above is a visual hint only — a
                    // browser number input never actually blocks typing past
                    // it, so this has to be enforced here or a user can key
                    // in more than is owed and submit it.
                    const typed = parseFloat(e.target.value) || 0;
                    const cap = Number(payingSale.balance_amount) || 0;
                    setPayAmount(Math.min(typed, cap));
                  }}
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

export default OpticalSales;
