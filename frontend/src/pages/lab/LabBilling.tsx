import React, { useState, useEffect, useCallback } from 'react';
import labService from '../../services/labService';
import type { LabBillingItem } from '../../types/lab';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import DateRangeFilter from '../../components/common/DateRangeFilter';
import LabCollectPaymentModal from '../../components/lab/LabCollectPaymentModal';
import LabOrderDetail from './LabOrderDetail';
import { useConfirm } from '../../contexts/ConfirmContext';

const STAFF_ROLES = ['super_admin', 'admin', 'lab_technician'];

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  partial: 'bg-blue-100 text-blue-700',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  pending: 'Pending',
  partial: 'Partial',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const LabBilling: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<LabBillingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const canReceivePayment = Boolean(user?.roles?.some((r) => STAFF_ROLES.includes(r)));
  const confirm = useConfirm();

  // View — the exact same LabOrderDetail content (order info, items,
  // results, Finalize, its own Print Report/Download PDF buttons already at
  // the top right) embedded in a dialog instead of navigated to as a
  // separate page, via LabOrderDetail's optional orderIdProp/onClose props.
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await labService.getBilling(page, 20, search, paymentStatus, dateFrom, dateTo);
      setOrders(res.data);
      setTotalPages(res.total_pages);
    } catch {
      toast.error('Failed to load lab billing worklist');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, paymentStatus, dateFrom, dateTo]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleDelete = async (id: string, orderNumber: string) => {
    const ok = await confirm({
      title: 'Delete Lab Order?',
      message: `Delete lab order ${orderNumber}? This cannot be undone.`,
      confirmLabel: 'Delete Order',
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      await labService.deleteOrder(id);
      toast.success('Lab order deleted');
      fetchOrders();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to delete lab order');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lab Billing</h1>
          <p className="text-sm text-slate-500 mt-0.5">Collect payment for lab orders — full or partial/advance.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative w-full max-w-xl">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <input type="text" placeholder="Search by order number or patient..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
        </div>
        <select value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
          <option value="">All Payment Statuses</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
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
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2 block">receipt_long</span>
            <p className="font-medium">No lab orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Order #</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Order Date</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Patient</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Total Amount</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Amount Collected</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Balance</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Payment Status</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Report Status</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{o.order_number}</td>
                  <td className="px-4 py-3 text-slate-600">{format(new Date(o.created_at), 'dd MMM yyyy, hh:mm a')}</td>
                  <td className="px-4 py-3 text-slate-600">{o.patient_name || '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">₹{fmt(o.total_amount)}</td>
                  <td className="px-4 py-3 text-slate-600">₹{fmt(o.paid_amount)}</td>
                  <td className="px-4 py-3 text-slate-600">₹{fmt(o.balance_amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${PAYMENT_STATUS_COLORS[o.payment_status] || 'bg-slate-100 text-slate-600'}`}>
                      {PAYMENT_STATUS_LABELS[o.payment_status] || o.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 capitalize">
                      {o.report_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setViewingOrderId(o.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                        title="View lab order">
                        <span className="material-symbols-outlined text-sm">visibility</span> View
                      </button>
                      {canReceivePayment && o.payment_status !== 'paid' && (
                        <button onClick={() => setPayingOrderId(o.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100">
                          <span className="material-symbols-outlined text-sm">payments</span> Receive Payment
                        </button>
                      )}
                      {canReceivePayment && !o.has_sale && (
                        <button onClick={() => handleDelete(o.id, o.order_number)}
                          disabled={deletingId === o.id}
                          title="Delete this lab order"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-600 bg-white border border-slate-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
                          <span className="material-symbols-outlined text-sm">delete</span> Delete
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

      {payingOrderId && (
        <LabCollectPaymentModal
          orderId={payingOrderId}
          onClose={() => setPayingOrderId(null)}
          onPaid={fetchOrders}
        />
      )}

      {viewingOrderId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewingOrderId(null)}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <LabOrderDetail
              orderIdProp={viewingOrderId}
              onClose={() => { setViewingOrderId(null); fetchOrders(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LabBilling;
