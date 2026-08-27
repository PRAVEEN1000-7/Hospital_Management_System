import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import invoiceService from '../services/invoiceService';
import paymentService from '../services/paymentService';
import refundService from '../services/refundService';
import { patientService } from '../services/patientService';
import type { Patient } from '../types/patient';
import type { Invoice, InvoiceListItem, PaymentListItem, RefundReasonCode } from '../types/billing';
import { useListKeyboardNav } from '../hooks/useListKeyboardNav';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Standalone "New Refund" entry point — mirrors pharmacy/NewSale.tsx's own
// pattern (a dedicated page reachable from the list's "+ New X" button,
// starting from a patient search) instead of requiring the user to already
// be on a specific invoice's detail page to find the "Request Refund"
// action buried there. Once an invoice is picked, this reuses the exact
// same fields/validation as InvoiceDetail.tsx's refund modal and posts
// through the same refundService.request() call.
const NewRefund: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  // ── Patient search ──────────────────────────────────────────────
  const [patientName, setPatientName] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientDrop, setShowPatientDrop] = useState(false);

  const searchPatients = useCallback(async (q: string) => {
    if (q.length < 2) { setPatientResults([]); return; }
    try {
      const res = await patientService.getPatients(1, 6, q);
      setPatientResults(res.data);
    } catch { setPatientResults([]); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchPatients(patientName), 250);
    return () => clearTimeout(t);
  }, [patientName, searchPatients]);

  const selectPatient = (p: Patient) => {
    setSelectedPatient(p);
    setPatientName(`${p.first_name} ${p.last_name}`.trim());
    setShowPatientDrop(false);
    setPatientResults([]);
  };
  const clearSelectedPatient = () => {
    setSelectedPatient(null);
    setPatientName('');
    setPatientInvoices([]);
    setSelectedInvoiceId('');
    setInvoice(null);
    setPayments([]);
  };
  const patientNav = useListKeyboardNav(patientResults, selectPatient);

  // ── Patient's invoices (only ones with something actually paid are
  // worth showing here — an unpaid/draft invoice has nothing to refund). ──
  const [patientInvoices, setPatientInvoices] = useState<InvoiceListItem[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  useEffect(() => {
    if (!selectedPatient) return;
    setInvoicesLoading(true);
    invoiceService.getByPatient(selectedPatient.id, 1, 50)
      .then(res => setPatientInvoices(res.items.filter(inv => Number(inv.paid_amount) > 0)))
      .catch(() => toast.error('Failed to load this patient\'s invoices'))
      .finally(() => setInvoicesLoading(false));
  }, [selectedPatient, toast]);

  // ── Selected invoice's full detail + payments (for the payment/medicine pickers) ──
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  useEffect(() => {
    if (!selectedInvoiceId) { setInvoice(null); setPayments([]); return; }
    setInvoiceLoading(true);
    Promise.all([
      invoiceService.getById(selectedInvoiceId),
      paymentService.getByInvoice(selectedInvoiceId),
    ])
      .then(([inv, payRes]) => {
        setInvoice(inv);
        setPayments(payRes.items);
      })
      .catch(() => toast.error('Failed to load invoice details'))
      .finally(() => setInvoiceLoading(false));
  }, [selectedInvoiceId, toast]);

  const refundablePayments = payments.filter(
    p => p.status === 'completed' && Number(p.net_amount ?? p.amount) > 0
  );

  // ── Refund fields (same shape as InvoiceDetail.tsx's Request Refund modal) ──
  const [refundPaymentId, setRefundPaymentId] = useState('');
  const [refundAmount, setRefundAmount] = useState<number | ''>('');
  const [refundReasonCode, setRefundReasonCode] = useState<RefundReasonCode>('billing_error');
  const [refundReasonDetail, setRefundReasonDetail] = useState('');
  const [refundInvoiceItemId, setRefundInvoiceItemId] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedPaymentRefundable = refundPaymentId
    ? Number(refundablePayments.find(p => p.id === refundPaymentId)?.net_amount ?? 0)
    : 0;

  const handleSubmit = async () => {
    if (!selectedPatient) { toast.error('Select a patient first'); return; }
    if (!invoice) { toast.error('Select an invoice to refund against'); return; }
    if (!refundPaymentId) { toast.error('Select the payment to refund'); return; }
    if (!refundAmount || Number(refundAmount) <= 0) { toast.error('Refund amount must be greater than zero'); return; }
    if (Number(refundAmount) > selectedPaymentRefundable) {
      toast.error(`Refund amount cannot exceed refundable amount (₹${fmt(selectedPaymentRefundable)})`);
      return;
    }
    setSaving(true);
    try {
      const refund = await refundService.request({
        invoice_id: invoice.id,
        payment_id: refundPaymentId,
        patient_id: selectedPatient.id,
        amount: Number(refundAmount),
        reason_code: refundReasonCode,
        reason_detail: refundReasonDetail || undefined,
        invoice_item_id: refundInvoiceItemId || undefined,
      });
      toast.success('Refund request submitted — awaiting admin approval');
      navigate(`/billing/refunds?invoice_id=${refund.invoice_id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Failed to submit refund request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/billing/refunds')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Refund</h1>
          <p className="text-sm text-slate-500 mt-0.5">Find the patient and invoice to refund, then submit for approval.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        {/* Patient search */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Patient *</label>
          {selectedPatient ? (
            <div className="flex items-center justify-between px-3 py-2 border border-primary/30 bg-primary/5 rounded-lg">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {selectedPatient.first_name} {selectedPatient.last_name}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {selectedPatient.patient_reference_number} · {selectedPatient.phone_number}
                </p>
              </div>
              <button type="button" onClick={clearSelectedPatient}
                className="text-xs text-slate-400 hover:text-red-500 font-medium ml-2 shrink-0">
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input value={patientName}
                onChange={e => { setPatientName(e.target.value); setShowPatientDrop(true); }}
                onFocus={() => setShowPatientDrop(true)}
                onBlur={() => setTimeout(() => setShowPatientDrop(false), 150)}
                onKeyDown={patientNav.onKeyDown}
                placeholder="Search by name, PRN, or phone…"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              {showPatientDrop && patientResults.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {patientResults.map((p, idx) => (
                    <button key={p.id} type="button" onMouseDown={() => selectPatient(p)}
                      onMouseEnter={() => patientNav.setActiveIndex(idx)}
                      className={`w-full text-left px-3 py-2 text-sm ${idx === patientNav.activeIndex ? 'bg-primary/10' : 'hover:bg-slate-50'}`}>
                      <span className="font-medium">{p.first_name} {p.last_name}</span>
                      <span className="ml-2 text-slate-400 text-xs">{p.patient_reference_number} · {p.phone_number}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Invoice picker — only once a patient is selected */}
        {selectedPatient && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Invoice *</label>
            {invoicesLoading ? (
              <p className="text-sm text-slate-400">Loading invoices…</p>
            ) : patientInvoices.length === 0 ? (
              <p className="text-sm text-red-500">This patient has no paid invoices to refund.</p>
            ) : (
              <select
                value={selectedInvoiceId}
                onChange={e => { setSelectedInvoiceId(e.target.value); setRefundPaymentId(''); setRefundInvoiceItemId(''); setRefundAmount(''); }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select invoice…</option>
                {patientInvoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} — {inv.invoice_type.toUpperCase()} — Paid ₹{fmt(Number(inv.paid_amount))} · {new Date(inv.invoice_date).toLocaleDateString('en-IN')}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Refund fields — only once an invoice is selected and loaded */}
        {selectedInvoiceId && (
          invoiceLoading ? (
            <p className="text-sm text-slate-400">Loading invoice details…</p>
          ) : invoice ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Payment to Refund *</label>
                {refundablePayments.length === 0 ? (
                  <p className="text-sm text-red-500">No refundable payments found for this invoice — completed payments here are either fully refunded already or have a refund already pending/approved.</p>
                ) : (
                  <select
                    value={refundPaymentId}
                    onChange={e => setRefundPaymentId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Select payment…</option>
                    {refundablePayments.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.payment_number} — {p.payment_mode.replace('_', ' ')} — Paid ₹{fmt(p.amount)} · Refundable ₹{fmt(Number(p.net_amount ?? p.amount))}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {invoice.items.some(i => i.item_type === 'medicine') && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Medicine Being Returned <span className="text-slate-400 font-normal">(optional — restores stock)</span>
                  </label>
                  <select
                    value={refundInvoiceItemId}
                    onChange={e => {
                      const itemId = e.target.value;
                      setRefundInvoiceItemId(itemId);
                      const item = invoice.items.find(i => i.id === itemId);
                      if (item) setRefundAmount(Number(item.total_price));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Not a medicine return — general refund</option>
                    {invoice.items.filter(i => i.item_type === 'medicine').map(i => (
                      <option key={i.id} value={i.id}>
                        {i.description} — Qty {i.quantity} — ₹{fmt(Number(i.total_price))}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Refund Amount (₹) *
                  {refundPaymentId && (
                    <span className="ml-2 text-[11px] text-slate-500">
                      Max refundable: ₹{fmt(selectedPaymentRefundable)}
                    </span>
                  )}
                </label>
                <input
                  type="number" min={0.01} step="0.01" max={refundPaymentId ? selectedPaymentRefundable : undefined}
                  value={refundAmount}
                  onChange={e => setRefundAmount(parseFloat(e.target.value) || '')}
                  placeholder="Enter amount"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason *</label>
                <select
                  value={refundReasonCode}
                  onChange={e => setRefundReasonCode(e.target.value as RefundReasonCode)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="billing_error">Billing Error</option>
                  <option value="service_not_provided">Service Not Provided</option>
                  <option value="patient_request">Patient Request</option>
                  <option value="duplicate">Duplicate</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Additional Details</label>
                <textarea
                  rows={2}
                  value={refundReasonDetail}
                  onChange={e => setRefundReasonDetail(e.target.value)}
                  placeholder="Describe the reason for refund…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
            </>
          ) : null
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSubmit}
            disabled={saving || !invoice || refundablePayments.length === 0}
            className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg font-semibold text-sm hover:bg-amber-600 disabled:opacity-60"
          >
            {saving ? 'Submitting…' : 'Submit Refund Request'}
          </button>
          <button
            onClick={() => navigate('/billing/refunds')}
            className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewRefund;
