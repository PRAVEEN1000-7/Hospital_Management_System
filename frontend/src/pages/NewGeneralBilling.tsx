import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import invoiceService from '../services/invoiceService';
import paymentService from '../services/paymentService';
import patientService from '../services/patientService';
import type { Patient } from '../types/patient';
import type { PaymentMode } from '../types/billing';
import { useToast } from '../contexts/ToastContext';
import { useListKeyboardNav } from '../hooks/useListKeyboardNav';
import { htmlStringToPdf } from '../utils/pdf';

interface BillItem {
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
}

const emptyDraft: BillItem = { description: '', quantity: 1, unit_price: 0, discount_percent: 0 };

// General Billing — free-form billing for miscellaneous charges not tied to
// OPD/Pharmacy/Optical. Modeled on the Optical Sale screen
// (pages/optical/NewOpticalSale.tsx): same patient-search UX and
// notes/payment/summary panel, but with no product catalog — items are
// typed in directly — and no eye-prescription field, since neither applies
// here. Backed by the generic Invoice/InvoiceItem/Payment models
// (invoice_type="general", item_type="service"), not a dedicated table.
const NewGeneralBilling: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientId, setPatientId] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientFocused, setPatientFocused] = useState(false);
  const selectPatient = (p: Patient) => { setPatientId(p.id); setSelectedPatient(p); setPatientSearch(''); setPatientFocused(false); };
  const patientNav = useListKeyboardNav(patients, selectPatient);

  React.useEffect(() => {
    if (patientId || !patientFocused) { setPatients([]); return; }
    const timeoutId = window.setTimeout(() => {
      patientService.getPatients(1, 10, patientSearch.trim()).then(r => setPatients(r.data)).catch(() => setPatients([]));
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [patientSearch, patientId, patientFocused]);

  const [items, setItems] = useState<BillItem[]>([]);
  const [draft, setDraft] = useState<BillItem>(emptyDraft);

  const addItem = () => {
    if (!draft.description.trim() || draft.quantity <= 0 || draft.unit_price < 0) return;
    setItems(prev => [...prev, draft]);
    setDraft(emptyDraft);
  };
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const [discountAmount, setDiscountAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMode>('cash');
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [amountTendered, setAmountTendered] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [completedInvoice, setCompletedInvoice] = useState<{ id: string; invoice_number: string } | null>(null);

  const subtotal = items.reduce((s, it) => {
    const base = it.quantity * it.unit_price;
    const disc = base * (it.discount_percent || 0) / 100;
    return s + (base - disc);
  }, 0);
  const taxTotal = 0; // No tax configuration for General Billing — free-text items carry no tax rate.
  const grandTotal = subtotal + taxTotal - discountAmount;
  const remainingDue = grandTotal - advanceAmount - amountTendered;

  const resetForm = () => {
    setItems([]);
    setDraft(emptyDraft);
    setDiscountAmount(0);
    setPaymentMethod('cash');
    setAdvanceAmount(0);
    setAmountTendered(0);
    setNotes('');
    setPatientId('');
    setSelectedPatient(null);
    setPatientSearch('');
    setCompletedInvoice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) { toast.error('Select a patient'); return; }
    if (items.length === 0) { toast.error('Add at least one item'); return; }

    setSaving(true);
    try {
      const invoice = await invoiceService.create({
        patient_id: patientId,
        invoice_type: 'general',
        discount_amount: discountAmount,
        notes: notes || undefined,
        items: items.map(it => ({
          item_type: 'service',
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount_percent: it.discount_percent || undefined,
        })),
      });
      await invoiceService.issue(invoice.id);

      const collected = advanceAmount + amountTendered;
      if (collected > 0) {
        await paymentService.record({
          invoice_id: invoice.id,
          patient_id: patientId,
          amount: collected,
          payment_mode: paymentMethod,
        });
      }

      toast.success('Bill completed');
      setCompletedInvoice({ id: invoice.id, invoice_number: invoice.invoice_number });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to complete bill');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!completedInvoice) return;
    try {
      const html = await invoiceService.getInvoicePdfHtml(completedInvoice.id);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
      }
    } catch {
      toast.error('Failed to generate print view');
    }
  };

  const handleDownload = async () => {
    if (!completedInvoice) return;
    setDownloading(true);
    try {
      const html = await invoiceService.getInvoicePdfHtml(completedInvoice.id);
      await htmlStringToPdf(html, `Invoice_${completedInvoice.invoice_number}.pdf`);
    } catch {
      toast.error('Failed to download receipt');
    } finally {
      setDownloading(false);
    }
  };

  if (completedInvoice) {
    return (
      <div className="max-w-screen-md mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-4">
          <span className="material-symbols-outlined text-5xl text-emerald-500">check_circle</span>
          <h1 className="text-2xl font-bold text-slate-900">Bill Completed</h1>
          <p className="text-slate-500">Invoice <span className="font-semibold text-slate-700">{completedInvoice.invoice_number}</span> has been created.</p>
          <div className="flex justify-center gap-3 pt-4">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
              <span className="material-symbols-outlined text-[16px]">print</span> Print Receipt
            </button>
            <button onClick={handleDownload} disabled={downloading}
              className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <span className="material-symbols-outlined text-[16px]">download</span> {downloading ? 'Preparing...' : 'Download Receipt'}
            </button>
            <button onClick={resetForm}
              className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90">
              New Bill
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-2xl font-bold text-slate-900">General Billing</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Patient */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="relative sm:w-1/2">
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Patient *</label>
            <input
              value={selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : patientSearch}
              onChange={(e) => { setPatientSearch(e.target.value); setPatientId(''); setSelectedPatient(null); }}
              onKeyDown={patientNav.onKeyDown}
              onFocus={() => setPatientFocused(true)}
              onBlur={() => window.setTimeout(() => setPatientFocused(false), 150)}
              placeholder="Search, or click to browse recent patients"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
            />
            {patientFocused && !patientId && patients.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {!patientSearch.trim() && (
                  <p className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-100">Recent patients</p>
                )}
                {patients.map((p, idx) => (
                  <button key={p.id} type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectPatient(p)}
                    onMouseEnter={() => patientNav.setActiveIndex(idx)}
                    className={`w-full text-left px-3 py-2 text-sm ${idx === patientNav.activeIndex ? 'bg-primary/10' : 'hover:bg-slate-50'}`}>
                    {p.first_name} {p.last_name} <span className="text-slate-400 text-xs">({p.patient_reference_number})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Items</h2>

          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-5">
              <label className="block text-xs text-slate-500 mb-0.5">Description</label>
              <input type="text" value={draft.description}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="e.g. Ambulance fee, consumables, misc. service"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-0.5">Qty</label>
              <input type="number" min={1} value={draft.quantity}
                onChange={e => setDraft(d => ({ ...d, quantity: parseInt(e.target.value) || 0 }))}
                className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-0.5">Unit Price</label>
              <input type="number" min={0} step={0.01} value={draft.unit_price}
                onChange={e => setDraft(d => ({ ...d, unit_price: parseFloat(e.target.value) || 0 }))}
                className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-1">
              <label className="block text-xs text-slate-500 mb-0.5">Disc%</label>
              <input type="number" min={0} max={100} value={draft.discount_percent}
                onChange={e => setDraft(d => ({ ...d, discount_percent: parseFloat(e.target.value) || 0 }))}
                className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-2">
              <button type="button" onClick={addItem} disabled={!draft.description.trim()}
                className="w-full px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
                Add
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No items added yet</p>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => {
                const lineTotal = item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center p-3 bg-slate-50 rounded-lg">
                    <div className="col-span-5">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.description}</p>
                    </div>
                    <div className="col-span-2 text-sm text-slate-600">Qty: {item.quantity}</div>
                    <div className="col-span-2 text-sm text-slate-600">₹{item.unit_price.toFixed(2)}</div>
                    <div className="col-span-1 text-sm text-slate-600">{item.discount_percent || 0}%</div>
                    <div className="col-span-1 text-right text-sm font-medium text-slate-900">₹{lineTotal.toFixed(2)}</div>
                    <div className="col-span-1 text-right">
                      <button type="button" onClick={() => removeItem(idx)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded">
                        <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Payment Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMode)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="debit_card">Debit Card</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="insurance">Insurance</option>
                </select>
              </div>
            </div>
            <div className="space-y-2 text-right">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-700">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Tax</span>
                <span className="font-medium text-slate-700">₹{taxTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-slate-500">Discount</span>
                <input type="number" min={0} step={0.01} value={discountAmount}
                  onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200">
                <span>Grand Total</span>
                <span className="text-primary">₹{grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm items-center pt-2 border-t border-slate-200">
                <span className="text-slate-500">Advance Paid</span>
                <input type="number" min={0} step={0.01} value={advanceAmount}
                  onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-slate-500">Amount Received Now</span>
                <input type="number" min={0} step={0.01} value={amountTendered}
                  onChange={e => setAmountTendered(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span className={remainingDue > 0 ? 'text-red-500' : 'text-slate-500'}>{remainingDue > 0 ? 'Remaining Amount' : 'Change Due'}</span>
                <span className={remainingDue > 0 ? 'text-red-600' : 'text-emerald-600'}>₹{Math.abs(remainingDue).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving || items.length === 0}
            className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Processing...' : 'Complete Sale'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewGeneralBilling;
