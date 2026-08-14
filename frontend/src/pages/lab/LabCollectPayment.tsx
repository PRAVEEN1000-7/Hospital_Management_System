import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import labService from '../../services/labService';
import type { LabOrder, LabSale, LabTest } from '../../types/lab';
import type { PaymentMode } from '../../types/billing';
import { useToast } from '../../contexts/ToastContext';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

// Full-page fee-collection screen for a lab order, matching the layout of
// optical/NewOpticalSale.tsx's checkout (cards, right-aligned summary panel,
// bottom action bar) instead of a small popup modal. Unlike a new optical
// sale, a lab order's items/total are already fixed at order time, so there's
// no item cart to build here — Subtotal/Tax/Discount/Already Paid are shown
// as the sale's existing figures rather than editable inputs, and only the
// amount being collected right now is editable.
const LabCollectPayment: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [order, setOrder] = useState<LabOrder | null>(null);
  const [sale, setSale] = useState<LabSale | null>(null);
  const [loading, setLoading] = useState(true);
  const [payMethod, setPayMethod] = useState<PaymentMode>('cash');
  const [payReference, setPayReference] = useState('');
  const [payAmount, setPayAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── Item test picker — lets staff correct which catalog test a line was
  // ordered against, right on this screen, before payment is collected.
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemSaving, setItemSaving] = useState(false);

  useEffect(() => {
    labService.getTests(1, 500).then((res) => setLabTests(res.data)).catch(() => { /* catalog picker just won't populate */ });
  }, []);

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      setLoading(true);
      try {
        const [o, s] = await Promise.all([
          labService.getOrder(orderId),
          labService.getOrCreateSale(orderId),
        ]);
        setOrder(o);
        setSale(s);
        setPayAmount(Number(s.balance_amount) || 0);
      } catch {
        toast.error('Failed to load order');
        navigate('/lab/billing');
      } finally {
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [orderId]);

  const remainingAfterPayment = sale
    ? Math.max(0, (Number(sale.balance_amount) || 0) - payAmount)
    : 0;

  // Mirrors the backend's edit-boundary rule exactly (see
  // lab_service.update_lab_order_item_test) so the edit affordance never
  // shows for a case the API would reject anyway.
  const itemEditLockReason = !order
    ? null
    : order.report_status === 'finalized'
      ? 'Report is finalized — items are locked'
      : sale && (Number(sale.paid_amount) || 0) > 0
        ? 'Payment has been collected — items are locked'
        : null;
  const canEditItems = !itemEditLockReason;

  const handleItemTestChange = async (itemId: string, labTestId: string) => {
    if (!orderId || !labTestId) return;
    setItemSaving(true);
    try {
      await labService.updateItemTest(orderId, itemId, labTestId);
      // Re-fetch both the order and the sale (same pair the initial load
      // effect fetches) so the Items list AND the Subtotal/Grand
      // Total/Balance summary stay consistent with each other.
      const [o, s] = await Promise.all([
        labService.getOrder(orderId),
        labService.getOrCreateSale(orderId),
      ]);
      setOrder(o);
      setSale(s);
      // Re-clamp the amount-received-now field to the (possibly changed)
      // balance — same Math.min pattern the input's onChange uses below, so
      // it never disagrees with the refreshed summary panel.
      setPayAmount((prev) => Math.min(prev, Number(s.balance_amount) || 0));
      toast.success('Item updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update item');
    } finally {
      setItemSaving(false);
      setEditingItemId(null);
    }
  };

  const handleSubmit = async () => {
    if (!orderId || payAmount <= 0) return;
    setSaving(true);
    try {
      await labService.markSalePaid(orderId, payAmount, payMethod, payReference.trim() || undefined);
      toast.success('Payment recorded');
      navigate('/lab/billing');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
      </div>
    );
  }
  if (!order || !sale) return null;

  return (
    <div className="max-w-screen-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/lab/billing')} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Collect Lab Payment</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Patient</label>
            <p className="text-sm font-medium text-slate-900">{order.patient_name || '—'}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Order Number</label>
            <p className="text-sm font-medium text-slate-900">{order.order_number}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-3">Items</h2>
        {order.items.length === 0 ? (
          <p className="text-sm text-slate-400">No items on this order</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {order.items.map((item) => (
              <div key={item.id} className="py-2 text-sm">
                {editingItemId === item.id ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <SearchableSelect
                        value={item.test_name}
                        onChange={(_value, metadata) => {
                          const id = metadata?.id ? (metadata.id as string) : '';
                          if (id) handleItemTestChange(item.id, id);
                        }}
                        suggestions={labTests.map((t): SuggestionOption => ({
                          id: t.id,
                          label: t.name,
                          sublabel: `${t.code}${t.price ? ` · ₹${Number(t.price).toFixed(2)}` : ''}`,
                          metadata: { id: t.id },
                        }))}
                        placeholder="Search test to switch to..."
                        allowManualEntry={false}
                        disabled={itemSaving}
                      />
                    </div>
                    <button type="button" onClick={() => setEditingItemId(null)} disabled={itemSaving}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-700 flex items-center gap-1.5">
                      {item.test_name}
                      <button
                        type="button"
                        onClick={() => canEditItems && setEditingItemId(item.id)}
                        disabled={!canEditItems}
                        title={itemEditLockReason || 'Change test'}
                        className={canEditItems
                          ? 'text-slate-300 hover:text-primary'
                          : 'text-slate-200 cursor-not-allowed'}
                      >
                        <span className="material-symbols-outlined text-base align-middle">edit</span>
                      </button>
                    </span>
                    <span className="font-medium text-slate-900">₹{fmt(item.price)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Payment Method</label>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMode)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
                <option value="cash">Cash</option>
                <option value="debit_card">Debit Card</option>
                <option value="credit_card">Credit Card</option>
                <option value="upi">UPI</option>
                <option value="insurance">Insurance</option>
              </select>
            </div>
            {payMethod !== 'cash' && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Reference Number</label>
                <input type="text" value={payReference} onChange={(e) => setPayReference(e.target.value)}
                  placeholder={payMethod === 'upi' ? 'UPI transaction ID' : 'Card / reference number'}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-700">₹{fmt(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Tax</span>
              <span className="font-medium text-slate-700">₹{fmt(sale.tax_amount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Discount</span>
              <span className="font-medium text-slate-700">₹{fmt(sale.discount_amount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200">
              <span>Grand Total</span>
              <span className="text-primary">₹{fmt(sale.total_amount)}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
              <span className="text-slate-500">Already Paid</span>
              <span className="font-medium text-slate-700">₹{fmt(sale.paid_amount)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-slate-500">Amount Received Now</span>
              <input type="number" min={0.01} max={Number(sale.balance_amount) || undefined} step={0.01}
                value={payAmount || ''} placeholder="0.00"
                onChange={(e) => {
                  // The `max` attribute above is a visual hint only — a
                  // browser number input never actually blocks typing past
                  // it, so this has to be enforced here or a user can key in
                  // more than is owed and submit it. Clamp to the balance
                  // due (== the grand total when nothing's been paid yet).
                  const typed = parseFloat(e.target.value) || 0;
                  const cap = Number(sale.balance_amount) || 0;
                  setPayAmount(Math.min(typed, cap));
                }}
                className="w-28 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span className={remainingAfterPayment > 0 ? 'text-red-500' : 'text-slate-500'}>Remaining Amount</span>
              <span className={remainingAfterPayment > 0 ? 'text-red-600' : 'text-emerald-600'}>₹{fmt(remainingAfterPayment)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => navigate('/lab/billing')}
          className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving || payAmount <= 0}
          className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm disabled:opacity-50">
          {saving ? 'Recording…' : 'Record Payment'}
        </button>
      </div>
    </div>
  );
};

export default LabCollectPayment;
