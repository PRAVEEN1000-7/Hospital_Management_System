import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import labService from '../../services/labService';
import invoiceService from '../../services/invoiceService';
import type { LabOrder, LabOrderItem, LabSale } from '../../types/lab';
import type { PaymentMode } from '../../types/billing';
import { useToast } from '../../contexts/ToastContext';
import { htmlStringToPdf } from '../../utils/pdf';

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

  // Bill view — shown automatically the moment payment succeeds (Print/
  // Download top-right, matching pharmacy/SalesList.tsx's pattern), kept
  // separate from the clinical report (LabOrderDetail.tsx's own Print
  // Report/Download PDF, a different document entirely).
  const [paidInvoiceId, setPaidInvoiceId] = useState<string | null>(null);
  const [billHtml, setBillHtml] = useState<string | null>(null);
  const [billLoading, setBillLoading] = useState(false);
  const [downloadingBill, setDownloadingBill] = useState(false);
  const billIframeRef = useRef<HTMLIFrameElement>(null);

  // ── Billing amount/name — the catalog carries no price at all, so every
  // item starts at ₹0 and staff enters the real amount (and, optionally, a
  // billing-only display name) here before payment can be collected.
  const [editingBillingItemId, setEditingBillingItemId] = useState<string | null>(null);
  const [billingNameDraft, setBillingNameDraft] = useState('');
  const [billingPriceDraft, setBillingPriceDraft] = useState(0);
  const [billingSaving, setBillingSaving] = useState(false);

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
  // lab_service.update_lab_order_item_billing) so the edit affordance never
  // shows for a case the API would reject anyway.
  const itemEditLockReason = !order
    ? null
    : order.report_status === 'finalized'
      ? 'Report is finalized — items are locked'
      : sale && (Number(sale.paid_amount) || 0) > 0
        ? 'Payment has been collected — items are locked'
        : null;
  const canEditItems = !itemEditLockReason;

  const startEditBilling = (item: LabOrderItem) => {
    setEditingBillingItemId(item.id);
    setBillingNameDraft(item.billed_name || '');
    setBillingPriceDraft(Number(item.price) || 0);
  };

  const cancelEditBilling = () => setEditingBillingItemId(null);

  const saveBilling = async (itemId: string) => {
    if (!orderId) return;
    if (billingPriceDraft < 0) {
      toast.error('Amount cannot be negative');
      return;
    }
    setBillingSaving(true);
    try {
      await labService.updateItemBilling(orderId, itemId, billingPriceDraft, billingNameDraft.trim() || undefined);
      const [o, s] = await Promise.all([
        labService.getOrder(orderId),
        labService.getOrCreateSale(orderId),
      ]);
      setOrder(o);
      setSale(s);
      setPayAmount((prev) => Math.min(prev, Number(s.balance_amount) || 0));
      toast.success('Billing amount updated');
      setEditingBillingItemId(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update billing amount');
    } finally {
      setBillingSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!orderId || payAmount <= 0) return;
    setSaving(true);
    try {
      const updatedSale = await labService.markSalePaid(orderId, payAmount, payMethod, payReference.trim() || undefined);
      toast.success('Payment recorded');
      // get_or_create_lab_invoice always runs before a payment is recorded
      // (see lab_service.collect_lab_sale_payment), so invoice_id is
      // guaranteed to be set here — show the bill immediately instead of
      // navigating straight away; navigation happens once the user closes
      // the bill view.
      if (updatedSale.invoice_id) {
        setPaidInvoiceId(updatedSale.invoice_id);
        setBillLoading(true);
        try {
          const html = await invoiceService.getInvoicePdfHtml(updatedSale.invoice_id);
          setBillHtml(html);
        } catch {
          toast.error('Payment recorded, but failed to load the bill for printing');
        } finally {
          setBillLoading(false);
        }
      } else {
        navigate('/lab/billing');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const closeBillView = () => {
    setPaidInvoiceId(null);
    setBillHtml(null);
    navigate('/lab/billing');
  };

  const handlePrintBill = () => {
    billIframeRef.current?.contentWindow?.print();
  };

  const handleDownloadBill = async () => {
    if (!billHtml) return;
    setDownloadingBill(true);
    try {
      await htmlStringToPdf(billHtml, `Lab_Bill_${order?.order_number || orderId}.pdf`);
    } catch {
      toast.error('Failed to download bill');
    } finally {
      setDownloadingBill(false);
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
              <div key={item.id} className="py-3 text-sm">
                {editingBillingItemId === item.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={billingNameDraft}
                      onChange={(e) => setBillingNameDraft(e.target.value)}
                      placeholder={item.test_name}
                      disabled={billingSaving}
                      autoFocus
                      className="flex-1 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={billingPriceDraft || ''}
                      placeholder="0.00"
                      disabled={billingSaving}
                      onChange={(e) => setBillingPriceDraft(parseFloat(e.target.value) || 0)}
                      className="w-28 px-2.5 py-1.5 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
                    />
                    <button type="button" onClick={() => saveBilling(item.id)} disabled={billingSaving} title="Save"
                      className="text-emerald-500 hover:text-emerald-600 disabled:opacity-50">
                      <span className="material-symbols-outlined text-lg">check</span>
                    </button>
                    <button type="button" onClick={cancelEditBilling} disabled={billingSaving} title="Cancel"
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-700 flex items-center gap-1.5">
                      {item.billed_name || item.test_name}
                      <button
                        type="button"
                        onClick={() => canEditItems && startEditBilling(item)}
                        disabled={!canEditItems}
                        title={itemEditLockReason || 'Edit name / amount'}
                        className={canEditItems
                          ? 'text-slate-300 hover:text-primary'
                          : 'text-slate-200 cursor-not-allowed'}
                      >
                        <span className="material-symbols-outlined text-base align-middle">edit</span>
                      </button>
                    </span>
                    <span className={`font-medium ${Number(item.price) > 0 ? 'text-slate-900' : 'text-amber-600'}`}>
                      {Number(item.price) > 0 ? `₹${fmt(item.price)}` : 'Amount not set'}
                    </span>
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

      {/* Bill — shown automatically right after payment succeeds. Print/
          Download at the top-right, matching pharmacy/SalesList.tsx's
          pattern. This is the BILLING invoice only — the clinical report
          is a separate document, printed separately from
          LabOrderDetail.tsx's own Print Report/Download PDF. */}
      {paidInvoiceId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeBillView}>
          <div className="flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Bill</h3>
                <p className="text-sm text-slate-500">{order?.order_number}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintBill}
                  disabled={!billHtml}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">print</span> Print
                </button>
                <button
                  onClick={handleDownloadBill}
                  disabled={!billHtml || downloadingBill}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/5 border border-primary/20 rounded-lg hover:bg-primary/10 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  {downloadingBill ? 'Preparing…' : 'Download'}
                </button>
                <button onClick={closeBillView} className="ml-1 text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-slate-100">
              {billLoading ? (
                <div className="flex h-full items-center justify-center">
                  <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                </div>
              ) : billHtml ? (
                <iframe
                  ref={billIframeRef}
                  srcDoc={billHtml}
                  title={`Bill ${order?.order_number || ''}`}
                  className="h-full w-full border-0 bg-white"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabCollectPayment;
