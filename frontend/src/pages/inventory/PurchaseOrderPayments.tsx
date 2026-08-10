import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { PurchaseOrder, PaymentMode, PurchaseOrderPaymentSummary } from '../../types/inventory';
import { formatDateOnly } from '../../utils/calendarDate';

const PurchaseOrderPayments: React.FC = () => {
  const { poId } = useParams<{ poId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [summary, setSummary] = useState<PurchaseOrderPaymentSummary | null>(null);
  const [modes, setModes] = useState<PaymentMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [addingMode, setAddingMode] = useState(false);
  const [newModeName, setNewModeName] = useState('');

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [modeId, setModeId] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNote, setReferenceNote] = useState('');

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(v);

  const load = useCallback(async () => {
    if (!poId) return;
    setLoading(true);
    try {
      const [poRes, summaryRes, modesRes] = await Promise.all([
        inventoryService.getPurchaseOrder(poId),
        inventoryService.getPoPayments(poId),
        inventoryService.getPaymentModes(),
      ]);
      setPo(poRes);
      setSummary(summaryRes);
      setModes(modesRes);
      if (modesRes.length > 0) setModeId(prev => prev || modesRes[0].id);
    } catch {
      toast.error('Failed to load purchase order payments');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  useEffect(() => { load(); }, [load]);

  const handleAddMode = async () => {
    if (!newModeName.trim()) return;
    try {
      const mode = await inventoryService.createPaymentMode(newModeName.trim());
      setModes(prev => [...prev, mode]);
      setModeId(mode.id);
      setNewModeName('');
      setAddingMode(false);
      toast.success(`Added "${mode.name}" to the transfer-mode directory`);
    } catch {
      toast.error('Failed to add payment mode');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poId || !modeId || !amount || Number(amount) <= 0) {
      toast.error('Enter a valid amount and select a mode of transfer');
      return;
    }
    setSubmitting(true);
    try {
      await inventoryService.createPoPayment(poId, {
        invoice_number: invoiceNumber || undefined,
        amount: Number(amount),
        payment_mode_id: modeId,
        payment_date: paymentDate || undefined,
        reference_note: referenceNote || undefined,
      });
      toast.success('Payment recorded');
      setInvoiceNumber(''); setAmount(''); setReferenceNote('');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!po || !summary) {
    return <p className="text-sm text-slate-500">Purchase order not found.</p>;
  }

  const balance = summary.balance;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate('/inventory/purchase-orders')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <span className="material-symbols-outlined text-slate-500">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments — {po.po_number}</h1>
          <p className="text-sm text-slate-500 mt-1">Supplier: {po.supplier_name || '—'}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">PO Total</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(summary.po_total)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Paid So Far</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(summary.total_paid)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Balance</p>
          <p className={`text-xl font-bold mt-1 ${balance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{formatCurrency(balance)}</p>
        </div>
      </div>

      {/* Add Payment form */}
      {balance > 0 ? (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-700">Record a Payment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Supplier Name</label>
              <input type="text" value={po.supplier_name || ''} disabled
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Invoice Number</label>
              <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="Supplier invoice #"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Amount</label>
              <input type="number" min="0.01" step="0.01" max={balance} value={amount}
                onChange={e => {
                  // The `max` attribute above is a visual hint only — a
                  // browser number input never actually blocks typing past
                  // it, so this has to be enforced here or a user can key in
                  // more than is owed and submit it.
                  const raw = e.target.value;
                  if (raw === '') { setAmount(''); return; }
                  const typed = parseFloat(raw) || 0;
                  setAmount(String(Math.min(typed, balance)));
                }}
                placeholder={`Up to ${formatCurrency(balance)}`}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Mode of Transfer</label>
              {!addingMode ? (
                <div className="flex gap-1.5">
                  <select value={modeId} onChange={e => setModeId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white cursor-pointer">
                    {modes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setAddingMode(true)} title="Add a new transfer mode to the directory"
                    className="px-2.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">
                    <span className="material-symbols-outlined text-[18px]">add</span>
                  </button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <input type="text" value={newModeName} onChange={e => setNewModeName(e.target.value)}
                    placeholder="New mode name" autoFocus
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  <button type="button" onClick={handleAddMode} className="px-2.5 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90">Add</button>
                  <button type="button" onClick={() => { setAddingMode(false); setNewModeName(''); }} className="px-2.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">✕</button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Payment Date</label>
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Reference / Notes</label>
            <input type="text" value={referenceNote} onChange={e => setReferenceNote(e.target.value)}
              placeholder="Cheque number, UTR, etc."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              <span className="material-symbols-outlined text-lg">payments</span>
              {submitting ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          This purchase order is fully paid.
        </div>
      )}

      {/* Payments table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-700">Payment History</h2>
        </div>
        {summary.payments.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-4xl text-slate-300">receipt_long</span>
            <p className="text-slate-500 mt-2 text-sm">No payments recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Supplier Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Invoice Number</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Mode of Transfer</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.payments.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm text-slate-700">{p.supplier_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{p.invoice_number || '—'}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-slate-900">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{p.mode_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDateOnly(p.payment_date)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{p.recorded_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PurchaseOrderPayments;
