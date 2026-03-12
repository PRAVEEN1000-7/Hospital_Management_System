import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import invoiceService from '../services/invoiceService';
import paymentService from '../services/paymentService';
import { patientService } from '../services/patientService';
import hospitalService from '../services/hospitalService';
import type { HospitalDetails } from '../services/hospitalService';
import type { Patient } from '../types/patient';
import type { Invoice, PaymentListItem, PaymentMode, InvoiceStatus } from '../types/billing';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  issued: 'bg-blue-100 text-blue-700',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
  void: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft', issued: 'Issued', partially_paid: 'Partially Paid',
  paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled', void: 'Void',
};

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'card', label: 'Card (Other)' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'online', label: 'Online' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'insurance', label: 'Insurance' },
];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const InvoiceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hospital, setHospital] = useState<HospitalDetails | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMode, setPayMode] = useState<PaymentMode>('cash');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [cashReceived, setCashReceived] = useState(0);
  const [paySaving, setPaySaving] = useState(false);

  // Void confirm
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  const role = user?.roles?.[0];
  const canMutate = ['super_admin', 'admin', 'cashier', 'pharmacist'].includes(role || '');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [inv, payRes] = await Promise.all([
        invoiceService.getById(id),
        paymentService.getByInvoice(id),
      ]);
      setInvoice(inv);
      setPayments(payRes.items);
      setPayAmount(inv.balance_amount);
      // Fetch hospital + patient in parallel
      const [h, pat] = await Promise.all([
        hospitalService.getHospitalDetails().catch(() => null),
        patientService.getPatient(inv.patient_id).catch(() => null),
      ]);
      setHospital(h);
      setPatient(pat);
    } catch {
      showToast('error', 'Failed to load invoice');
      navigate('/billing/invoices');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleIssue = async () => {
    if (!invoice) return;
    try {
      const updated = await invoiceService.issue(invoice.id);
      setInvoice(updated);
      showToast('success', 'Invoice issued successfully');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', msg || 'Failed to issue invoice');
    }
  };

  const handleVoid = async () => {
    if (!invoice) return;
    try {
      const updated = await invoiceService.void(invoice.id);
      setInvoice(updated);
      setShowVoidConfirm(false);
      showToast('success', 'Invoice voided');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', msg || 'Failed to void invoice');
      setShowVoidConfirm(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!invoice) return;
    if (payAmount <= 0) { showToast('error', 'Payment amount must be positive'); return; }
    if (payAmount > invoice.balance_amount) { showToast('error', `Payment amount cannot exceed the outstanding balance (₹${fmt(invoice.balance_amount)})`); return; }
    setPaySaving(true);
    try {
      const cashNote = payMode === 'cash' && cashReceived > 0
        ? `Cash received: ₹${fmt(cashReceived)}, Change: ₹${fmt(Math.max(0, cashReceived - payAmount))}${payNotes ? '. ' + payNotes : ''}`
        : payNotes || undefined;
      await paymentService.record({
        invoice_id: invoice.id,
        patient_id: invoice.patient_id,
        amount: payAmount,
        payment_mode: payMode,
        payment_reference: payRef || undefined,
        payment_date: payDate,
        notes: cashNote,
      });
      showToast('success', 'Payment recorded successfully');
      setShowPayModal(false);
      setPayRef('');
      setPayNotes('');
      setCashReceived(0);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', msg || 'Failed to record payment');
    } finally {
      setPaySaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-primary text-[36px]">progress_activity</span>
      </div>
    );
  }

  if (!invoice) return null;

  const isActionable = !['void', 'cancelled', 'paid'].includes(invoice.status);

  return (
    <>
      {/* ── Print Styles ── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
          #invoice-print-area { position: absolute; inset: 0; padding: 24px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="p-6 max-w-5xl mx-auto">
        {/* ── Top Bar ── */}
        <div className="flex items-center justify-between mb-6 no-print">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/billing/invoices')}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Invoice #{invoice.invoice_number}</h1>
              <p className="text-sm text-slate-500">
                {new Date(invoice.invoice_date).toLocaleDateString('en-IN', { dateStyle: 'long' })}
              </p>
            </div>
            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[invoice.status]}`}>
              {STATUS_LABELS[invoice.status]}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              Print
            </button>
            {canMutate && invoice.status === 'draft' && (
              <button
                onClick={handleIssue}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
              >
                <span className="material-symbols-outlined text-[16px]">send</span>
                Issue
              </button>
            )}
            {canMutate && ['issued', 'partially_paid', 'overdue'].includes(invoice.status) && (
              <>
                <button
                  onClick={() => { setPayAmount(invoice.balance_amount); setShowPayModal(true); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
                >
                  <span className="material-symbols-outlined text-[16px]">payments</span>
                  Record Payment
                </button>
              </>
            )}
            {canMutate && ['partially_paid', 'paid'].includes(invoice.status) && (
              <button
                onClick={() => navigate(`/billing/refunds?invoice_id=${invoice.id}`)}
                className="flex items-center gap-1.5 px-3 py-2 border border-amber-300 text-amber-700 bg-amber-50 rounded-lg text-sm font-medium hover:bg-amber-100"
              >
                <span className="material-symbols-outlined text-[16px]">currency_exchange</span>
                Refund
              </button>
            )}
            {canMutate && isActionable && invoice.status !== 'draft' && (
              <button
                onClick={() => setShowVoidConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 bg-red-50 rounded-lg text-sm font-medium hover:bg-red-100"
              >
                <span className="material-symbols-outlined text-[16px]">block</span>
                Void
              </button>
            )}
          </div>
        </div>

        {/* ── Printable Invoice Area ── */}
        <div id="invoice-print-area" ref={printRef}>

          {/* Invoice Header */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-4">
            {/* Hospital Letterhead */}
            {hospital && (
              <div className="flex justify-between items-start mb-5 pb-4 border-b-2 border-slate-200">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{hospital.name}</h1>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {[hospital.address_line_1, hospital.city, hospital.state_province, hospital.postal_code]
                      .filter(Boolean).join(', ')}
                  </p>
                  <div className="flex flex-wrap gap-4 mt-1 text-xs text-slate-500">
                    {hospital.phone && <span>📞 {hospital.phone}</span>}
                    {hospital.email && <span>✉ {hospital.email}</span>}
                    {hospital.registration_number && <span>Reg: {hospital.registration_number}</span>}
                    {hospital.tax_id && <span>GSTIN: {hospital.tax_id}</span>}
                  </div>
                </div>
                <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[28px]">local_hospital</span>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <div>
                <p className="text-2xl font-bold text-primary">INVOICE</p>
                <p className="text-slate-500 font-mono text-sm mt-1">#{invoice.invoice_number}</p>
                <p className="text-slate-500 text-sm mt-0.5 capitalize">{invoice.invoice_type} billing</p>
              </div>
              <div className="text-right text-sm text-slate-600">
                <p><span className="font-semibold">Date:</span> {new Date(invoice.invoice_date).toLocaleDateString('en-IN')}</p>
                {invoice.due_date && <p><span className="font-semibold">Due:</span> {new Date(invoice.due_date).toLocaleDateString('en-IN')}</p>}
                <span className={`inline-flex mt-2 px-2.5 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[invoice.status]}`}>
                  {STATUS_LABELS[invoice.status]}
                </span>
              </div>
            </div>

            {/* Patient Info */}
            <div className="mt-5 p-4 bg-slate-50 rounded-lg">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Bill To</p>
              <p className="font-bold text-slate-900 text-lg">{invoice.patient_name}</p>
              {patient && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                  {patient.patient_reference_number && (
                    <span>PRN: <span className="font-medium text-slate-700">{patient.patient_reference_number}</span></span>
                  )}
                  {patient.phone_number && (
                    <span>📞 {patient.phone_number}</span>
                  )}
                  {patient.gender && (
                    <span className="capitalize">{patient.gender}</span>
                  )}
                  {patient.date_of_birth && (
                    <span>DOB: {new Date(patient.date_of_birth).toLocaleDateString('en-IN')}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-700">Items</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Description</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Batch #</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Qty</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Unit Price</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Disc</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">GST%</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Tax</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.items.map((item, i) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{item.description}</p>
                      <p className="text-[11px] text-slate-400 capitalize">{item.item_type.replace('_', ' ')}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.batch_number || '—'}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-600">₹{fmt(item.unit_price)}</td>
                    <td className="px-4 py-3 text-right text-green-600">
                      {item.discount_amount > 0 ? `−₹${fmt(item.discount_amount)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">
                      {item.tax_amount > 0
                        ? `${Number(((item.tax_amount / (item.unit_price * item.quantity - item.discount_amount)) * 100).toFixed(1))}%`
                        : '0%'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {item.tax_amount > 0 ? `₹${fmt(item.tax_amount)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">₹{fmt(item.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="p-5 bg-slate-50 border-t border-slate-200">
              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>₹{fmt(invoice.subtotal)}</span>
                  </div>
                  {invoice.discount_amount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount {invoice.discount_reason && <span className="text-xs text-slate-400">({invoice.discount_reason})</span>}</span>
                      <span>−₹{fmt(invoice.discount_amount)}</span>
                    </div>
                  )}
                  {invoice.tax_amount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Tax</span>
                      <span>₹{fmt(invoice.tax_amount)}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-base text-slate-900">
                    <span>Total</span>
                    <span>₹{fmt(invoice.total_amount)}</span>
                  </div>
                  {invoice.paid_amount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Paid</span>
                      <span>₹{fmt(invoice.paid_amount)}</span>
                    </div>
                  )}
                  {invoice.balance_amount > 0 && (
                    <div className="flex justify-between text-red-600 font-semibold">
                      <span>Balance Due</span>
                      <span>₹{fmt(invoice.balance_amount)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">Notes</p>
              <p>{invoice.notes}</p>
            </div>
          )}

          {/* Payment History */}
          {payments.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700">Payment History</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Payment #</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Mode</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Reference</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-mono text-xs text-primary">{p.payment_number}</td>
                      <td className="px-4 py-3 text-slate-600">{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3 capitalize text-slate-600">{p.payment_mode.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{p.payment_reference || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">₹{fmt(p.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'completed' ? 'bg-green-100 text-green-700' : p.status === 'reversed' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
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
      </div>

      {/* ── Record Payment Modal ── */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">Record Payment</h3>
              <button onClick={() => setShowPayModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Invoice Total</span>
                  <span className="font-semibold">₹{fmt(invoice.total_amount)}</span>
                </div>
                <div className="flex justify-between text-slate-600 mt-1">
                  <span>Paid</span>
                  <span className="font-semibold text-green-600">₹{fmt(invoice.paid_amount)}</span>
                </div>
                <div className="flex justify-between font-bold text-red-600 mt-1 pt-1 border-t border-slate-200">
                  <span>Balance Due</span>
                  <span>₹{fmt(invoice.balance_amount)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Amount *</label>
                <input
                  type="number" min={0.01} step="0.01" max={invoice.balance_amount}
                  value={payAmount}
                  onChange={e => setPayAmount(Math.min(parseFloat(e.target.value) || 0, invoice.balance_amount))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Payment Mode *</label>
                <select
                  value={payMode}
                  onChange={e => { setPayMode(e.target.value as PaymentMode); setCashReceived(0); }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              {payMode === 'cash' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Cash Received (₹)</label>
                    <input
                      type="number" min={0} step="0.01"
                      value={cashReceived || ''}
                      onChange={e => setCashReceived(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  {cashReceived > 0 && (
                    <div className="flex justify-between text-sm font-semibold rounded-lg px-3 py-2 bg-green-50 border border-green-200 text-green-800">
                      <span>Balance to Patient</span>
                      <span>₹{fmt(Math.max(0, cashReceived - payAmount))}</span>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Payment Date *</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Transaction Reference</label>
                <input
                  type="text" placeholder="UPI ID, cheque #, transaction ID…"
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleRecordPayment}
                disabled={paySaving}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 disabled:opacity-60"
              >
                {paySaving ? 'Recording…' : 'Record Payment'}
              </button>
              <button
                onClick={() => setShowPayModal(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Void Confirm Modal ── */}
      {showVoidConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-red-500 text-[28px]">warning</span>
              <h3 className="text-lg font-bold text-slate-900">Void Invoice?</h3>
            </div>
            <p className="text-slate-600 text-sm mb-6">
              This will void invoice <strong>{invoice.invoice_number}</strong>. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleVoid}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-semibold text-sm hover:bg-red-700"
              >
                Yes, Void Invoice
              </button>
              <button
                onClick={() => setShowVoidConfirm(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InvoiceDetail;
