import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import labService from '../../services/labService';
import invoiceService from '../../services/invoiceService';
import paymentService from '../../services/paymentService';
import type { LabOrder, LabOrderItem, LabResultFlag, LabQueueStatus } from '../../types/lab';
import type { PaymentMode } from '../../types/billing';
import { useToast } from '../../contexts/ToastContext';
import { formatDateTime } from '../../utils/calendarDate';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const flagBadge: Record<string, string> = {
  normal: 'bg-emerald-50 text-emerald-700',
  high: 'bg-red-50 text-red-600',
  low: 'bg-amber-50 text-amber-700',
  abnormal: 'bg-orange-50 text-orange-700',
};

interface ResultDraft {
  result_value: string;
  result_unit: string;
  reference_range: string;
  result_flag: LabResultFlag | '';
  result_notes: string;
}

const draftFrom = (item: LabOrderItem): ResultDraft => ({
  result_value: item.result_value || '',
  result_unit: item.result_unit || '',
  reference_range: item.reference_range || '',
  result_flag: (item.result_flag as LabResultFlag) || '',
  result_notes: item.result_notes || '',
});

const LabOrderDetail: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [order, setOrder] = useState<LabOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ResultDraft>>({});
  const [savingItem, setSavingItem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const data = await labService.getOrder(orderId);
      setOrder(data);
      setDrafts(Object.fromEntries(data.items.map((i) => [i.id, draftFrom(i)])));
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to load order');
      navigate('/lab/queue');
    } finally {
      setLoading(false);
    }
  }, [orderId, showToast, navigate]);

  useEffect(() => { load(); }, [load]);

  const isPaid = order?.payment_status === 'paid';
  const total = Number(order?.total_amount || 0);

  const handleCollectPayment = async () => {
    if (!order || !orderId) return;
    setProcessing(true);
    try {
      // Same generic billing path as DispensingBilling.tsx: create → issue →
      // record payment, then sync the lab sale's denormalized status.
      const invoice = await invoiceService.create({
        patient_id: order.patient_id,
        invoice_type: 'lab',
        notes: `Lab order ${order.order_number}`,
        items: order.items.map((item, idx) => ({
          item_type: 'lab_test' as const,
          reference_id: item.lab_test_id,
          description: item.test_name,
          quantity: 1,
          unit_price: Number(item.price),
          display_order: idx,
        })),
      });
      await invoiceService.issue(invoice.id);
      await paymentService.record({
        invoice_id: invoice.id,
        patient_id: order.patient_id,
        amount: total,
        payment_mode: paymentMode,
        payment_reference: paymentRef.trim() || undefined,
      });
      try {
        await labService.markSalePaid(orderId, total, paymentMode);
      } catch {
        // Non-fatal — invoice/payment already succeeded.
      }
      showToast('success', 'Payment recorded');
      await load();
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to process payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleAdvanceQueue = async (status: LabQueueStatus) => {
    if (!orderId) return;
    try {
      await labService.updateQueueStatus(orderId, status);
      showToast('success', 'Queue status updated');
      await load();
    } catch {
      showToast('error', 'Failed to update queue status');
    }
  };

  const handleSaveResult = async (item: LabOrderItem) => {
    if (!orderId) return;
    const d = drafts[item.id];
    if (!d || !d.result_value.trim()) {
      showToast('error', 'Result value is required');
      return;
    }
    setSavingItem(item.id);
    try {
      const updated = await labService.recordResult(orderId, item.id, {
        result_value: d.result_value.trim(),
        result_unit: d.result_unit.trim() || undefined,
        reference_range: d.reference_range.trim() || undefined,
        result_flag: d.result_flag || undefined,
        result_notes: d.result_notes.trim() || undefined,
      });
      setOrder(updated);
      setDrafts(Object.fromEntries(updated.items.map((i) => [i.id, draftFrom(i)])));
      showToast('success', 'Result saved');
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to save result');
    } finally {
      setSavingItem(null);
    }
  };

  const setDraft = (id: string, patch: Partial<ResultDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }
  if (!order) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <nav className="flex text-sm text-slate-400 mb-1">
          <button onClick={() => navigate('/lab/queue')} className="hover:text-primary">Lab Queue</button>
          <span className="mx-2">/</span>
          <span className="text-slate-600">{order.order_number}</span>
        </nav>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Lab Order {order.order_number}</h1>
          <div className="flex gap-2">
            {order.queue_status === 'waiting' && (
              <button onClick={() => handleAdvanceQueue('being_served')}
                className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100">
                Mark Being Served
              </button>
            )}
            {order.queue_status === 'being_served' && (
              <button onClick={() => handleAdvanceQueue('collected')}
                className="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100">
                Mark Sample Collected
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Patient / meta */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Patient</div>
            <div className="font-medium text-slate-900">{order.patient_name || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Doctor</div>
            <div className="font-medium text-slate-900">{order.doctor_name || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Token</div>
            <div className="font-medium text-slate-900">{order.queue_token ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Ordered</div>
            <div className="font-medium text-slate-900">{formatDateTime(order.created_at)}</div>
          </div>
        </div>
        {order.notes && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Notes</div>
            <p className="text-sm text-slate-700">{order.notes}</p>
          </div>
        )}
      </div>

      {/* Billing */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Billing</h2>
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
            isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
          }`}>
            {order.payment_status || 'pending'}
          </span>
        </div>

        <table className="w-full mb-4">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100">
              <th className="py-2">Test</th>
              <th className="py-2 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id} className="border-b border-slate-50">
                <td className="py-2 text-sm text-slate-900">{i.test_name}</td>
                <td className="py-2 text-sm text-slate-900 text-right">₹{fmt(Number(i.price))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="py-2 text-sm font-bold text-slate-900">Total</td>
              <td className="py-2 text-sm font-bold text-slate-900 text-right">₹{fmt(total)}</td>
            </tr>
          </tfoot>
        </table>

        {isPaid ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-4 py-3">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            Payment collected — results can now be entered below.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {(['cash', 'upi', 'debit_card', 'credit_card'] as PaymentMode[]).map((mode) => (
                <button key={mode} type="button" onClick={() => setPaymentMode(mode)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    paymentMode === mode ? 'bg-primary text-white border-primary'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-primary/40'
                  }`}>
                  {mode === 'cash' ? 'Cash' : mode === 'upi' ? 'UPI' : mode === 'debit_card' ? 'Debit Card' : 'Credit Card'}
                </button>
              ))}
            </div>
            {paymentMode !== 'cash' && (
              <input type="text" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)}
                placeholder={paymentMode === 'upi' ? 'UPI transaction ID' : 'Card / reference number'}
                className="w-full max-w-xs mb-3 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            )}
            <button onClick={handleCollectPayment} disabled={processing || total <= 0}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">payment</span>
              {processing ? 'Processing...' : `Collect ₹${fmt(total)}`}
            </button>
          </>
        )}
      </div>

      {/* Results */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Results</h2>
        {!isPaid && (
          <p className="text-sm text-slate-500 mb-4">Collect payment above to unlock result entry.</p>
        )}
        <div className="space-y-4">
          {order.items.map((item) => {
            const d = drafts[item.id] || draftFrom(item);
            const done = item.status === 'completed';
            return (
              <div key={item.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium text-slate-900">{item.test_name}</div>
                  {done && item.result_flag && (
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${flagBadge[item.result_flag] || 'bg-slate-100 text-slate-600'}`}>
                      {item.result_flag}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Value</label>
                    <input value={d.result_value} disabled={!isPaid}
                      onChange={(e) => setDraft(item.id, { result_value: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Unit</label>
                    <input value={d.result_unit} disabled={!isPaid}
                      onChange={(e) => setDraft(item.id, { result_unit: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Reference Range</label>
                    <input value={d.reference_range} disabled={!isPaid}
                      onChange={(e) => setDraft(item.id, { reference_range: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Flag</label>
                    <select value={d.result_flag} disabled={!isPaid}
                      onChange={(e) => setDraft(item.id, { result_flag: e.target.value as LabResultFlag | '' })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50">
                      <option value="">—</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="low">Low</option>
                      <option value="abnormal">Abnormal</option>
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                    <input value={d.result_notes} disabled={!isPaid}
                      onChange={(e) => setDraft(item.id, { result_notes: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50" />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="text-xs text-slate-400">
                    {done && item.resulted_at ? `Resulted ${formatDateTime(item.resulted_at)}` : ''}
                  </div>
                  <button onClick={() => handleSaveResult(item)} disabled={!isPaid || savingItem === item.id}
                    className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                    {savingItem === item.id ? 'Saving...' : done ? 'Update Result' : 'Save Result'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LabOrderDetail;
