import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import pharmacyService from '../../services/pharmacyService';
import invoiceService from '../../services/invoiceService';
import paymentService from '../../services/paymentService';
import hospitalService from '../../services/hospitalService';
import type { HospitalDetails } from '../../services/hospitalService';
import type { PaymentMode } from '../../types/billing';
import { patientService } from '../../services/patientService';
import HospitalLogo from '../../components/common/HospitalLogo';
import { formatDateTime, formatDateOnly } from '../../utils/calendarDate';

interface DispensingItem {
  id: string;
  medicine_id: string;
  batch_id: string;
  batch_number?: string;
  expiry_date?: string;
  pack?: number;
  medicine_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface DispensingRecord {
  id: string;
  dispensing_number: string;
  patient_id: string;
  patient_name?: string;
  patient_reference_number?: string;
  prescription_id?: string | null;
  consultation_fee_collected?: boolean;
  consultation_fee_amount?: number;
  consultation_appointment_id?: string | null;
  consultation_doctor_name?: string | null;
  sale_type: string;
  status: string;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  net_amount: number;
  notes?: string;
  dispensed_at?: string;
  created_at: string;
  items: DispensingItem[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const DispensingBilling: React.FC = () => {
  const { dispensingId } = useParams<{ dispensingId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [dispensing, setDispensing] = useState<DispensingRecord | null>(null);
  const [hospital, setHospital] = useState<HospitalDetails | null>(null);
  const [patientPrn, setPatientPrn] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [cashReceived, setCashReceived] = useState<number | ''>('');

  // Get dispensing details from location state or fetch from API
  useEffect(() => {
    if (!dispensingId) {
      showToast('error', 'No dispensing record found');
      navigate('/pharmacy/pending-prescriptions');
      return;
    }

    const loadDispensing = async () => {
      try {
        // Try to get from location state first (passed from dispensing screen)
        const stateData = location.state as { dispensingData?: DispensingRecord } | null;

        if (stateData?.dispensingData) {
          setDispensing(stateData.dispensingData);
          setLoading(false);
        } else {
          // Fetch from API
          const data = await pharmacyService.getDispensingRecord(dispensingId);
          setDispensing(data);
          setLoading(false);
        }
      } catch (err: any) {
        showToast('error', err?.response?.data?.detail || 'Failed to load billing details');
        navigate('/pharmacy/pending-prescriptions');
      }
    };

    loadDispensing();
  }, [dispensingId, location.state, showToast, navigate]);

  useEffect(() => {
    hospitalService.getHospitalDetails().then(setHospital).catch(() => {});
  }, []);

  useEffect(() => {
    const loadPatientPrn = async () => {
      if (!dispensing?.patient_id) {
        setPatientPrn('');
        return;
      }

      try {
        const patient = await patientService.getPatient(dispensing.patient_id);
        setPatientPrn(patient?.patient_reference_number || '');
      } catch {
        setPatientPrn('');
      }
    };

    loadPatientPrn();
  }, [dispensing?.patient_id]);

  const handlePaymentAndPrint = async () => {
    if (!dispensing) return;

    // How much the customer is actually handing over right now. For cash, a
    // "Cash Received" amount below the total is a genuine partial payment;
    // anything at or above the total is a full payment (the surplus is change,
    // not extra money owed to us). Card/UPI are always collected in full.
    // Previously we always recorded the full grandTotal here, so a short cash
    // payment still flipped the invoice and the Sales list to "Paid".
    const isCash = paymentMode === 'cash';
    const amountCollected = isCash && cashReceived !== ''
      ? Math.min(Number(cashReceived), grandTotal)
      : grandTotal;
    if (amountCollected <= 0) {
      showToast('error', 'Enter the amount received before confirming payment');
      return;
    }

    setProcessing(true);
    try {
      if (!dispensing.patient_id) {
        // Walk-in without patient record — print the dispensing slip and exit
        window.print();
        showToast('success', 'Dispensing bill printed');
        navigate('/pharmacy/pending-prescriptions', {
          state: { billingComplete: true, dispensingNumber: dispensing.dispensing_number, amount: dispensing.net_amount },
        });
        return;
      }

      // Outstanding consultation fee gets billed as the first line item of
      // this same invoice instead of a separate reception trip. Prescription
      // finalization already auto-creates a standalone "opd" consultation
      // invoice for the appointment (see get_or_create_consultation_invoice_
      // for_appointment) — void that one now so the fee isn't billed twice.
      const hasConsultationFee = consultationFeeDue > 0 && !!dispensing.consultation_appointment_id;
      if (hasConsultationFee) {
        try {
          const staleConsultInvoice = await invoiceService.getOrCreateConsultationInvoice(dispensing.consultation_appointment_id!);
          if (staleConsultInvoice.status !== 'paid' && staleConsultInvoice.status !== 'void') {
            await invoiceService.void(staleConsultInvoice.id);
          }
        } catch {
          // Non-fatal — worst case a stray unpaid consultation invoice is left
          // behind; the combined invoice below still bills the fee correctly.
        }
      }

      // Step 1: Create invoice with line items — consultation fee first (if
      // outstanding), then medicines. "combined" is the invoice_type that
      // allows mixing consultation + medicine line items on one invoice.
      const invoiceItems = [
        ...(hasConsultationFee ? [{
          item_type: 'consultation' as const,
          description: dispensing.consultation_doctor_name
            ? `Consultation Fee - Dr. ${dispensing.consultation_doctor_name}`
            : 'Consultation Fee',
          quantity: 1,
          unit_price: consultationFeeDue,
          display_order: 0,
        }] : []),
        ...dispensing.items.map((item, idx) => ({
          item_type: 'medicine' as const,
          reference_id: item.medicine_id,
          description: item.medicine_name || 'Medicine',
          quantity: item.quantity,
          unit_price: item.unit_price,
          batch_number: item.batch_number,
          display_order: hasConsultationFee ? idx + 1 : idx,
        })),
      ];
      const invoice = await invoiceService.create({
        patient_id: dispensing.patient_id,
        invoice_type: hasConsultationFee ? 'combined' : 'pharmacy',
        discount_amount: dispensing.discount_amount || undefined,
        notes: dispensing.notes || undefined,
        items: invoiceItems,
      });

      // Step 2: Issue the invoice so it can accept payments
      await invoiceService.issue(invoice.id);

      // Step 3: Record the payment for what was actually collected. When it's
      // short of grandTotal the backend flips the invoice to "partially_paid"
      // and leaves the balance outstanding instead of marking it fully paid.
      await paymentService.record({
        invoice_id: invoice.id,
        patient_id: dispensing.patient_id,
        amount: amountCollected,
        payment_mode: paymentMode,
        payment_reference: paymentRef.trim() || undefined,
      });

      // Step 4: Sync the dispensing record's own payment_status — the invoice
      // created above has no link back to it, so without this the Sales list
      // keeps showing this sale as "pending" even though it's now paid.
      // (Only the medicines portion — the consultation fee isn't part of the
      // PharmacySale record. The invoice bills the consultation fee first, so a
      // partial payment covers it before any medicines: the medicines-paid
      // amount is whatever's left after the fee, capped at the medicines total.)
      const medicinesPaid = Math.max(
        0,
        Math.min(amountCollected - consultationFeeDue, Number(dispensing.net_amount)),
      );
      try {
        await pharmacyService.markDispensingPaid(dispensing.id, medicinesPaid, paymentMode);
      } catch {
        // Non-fatal — the invoice/payment already succeeded; don't block the receipt.
      }

      const balanceDue = grandTotal - amountCollected;
      showToast(
        'success',
        balanceDue > 0
          ? `Partial payment of ₹${fmt(amountCollected)} recorded — ₹${fmt(balanceDue)} balance due`
          : 'Payment recorded successfully',
      );
      window.print();
      navigate('/pharmacy/pending-prescriptions', {
        state: { billingComplete: true, dispensingNumber: dispensing.dispensing_number, amount: grandTotal },
      });
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to process payment');
    } finally {
      setProcessing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300 animate-spin">
            progress_activity
          </span>
          <p className="text-slate-500 mt-4">Loading billing details...</p>
        </div>
      </div>
    );
  }

  if (!dispensing) {
    return null;
  }

  const billTimestamp = dispensing.dispensed_at || dispensing.created_at;
  const resolvedPrn = patientPrn || dispensing.patient_reference_number || '';
  // Outstanding consultation fee gets folded into this same bill (as its own
  // line item) instead of requiring a separate trip to reception — so the
  // amount actually due, and therefore change/balance, must include it too.
  const consultationFeeDue = dispensing.prescription_id && dispensing.consultation_fee_collected === false
    ? Number(dispensing.consultation_fee_amount || 0)
    : 0;
  const grandTotal = Number(dispensing.net_amount) + consultationFeeDue;
  const balance = cashReceived !== '' ? Number(cashReceived) - grandTotal : null;

  const fmtExpiry = (d?: string) => formatDateOnly(d, 'MM/yy');

  return (
    <>
      {/* ── Print Styles ──
          Tailwind's print:hidden/print:block alone aren't enough — the global
          print stylesheet (index.css) hides the entire body by default and
          only reveals a designated print-area container (same pattern as
          InvoiceDetail.tsx). Without this override the printed invoice came
          out completely blank. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #dispensing-print-area, #dispensing-print-area * { visibility: visible !important; }
          #dispensing-print-area { position: absolute; inset: 0; padding: 24px; }
        }
      `}</style>
    <div className="max-w-6xl mx-auto p-6">
      {/* Header - Hidden when printing */}
      <div className="flex justify-between items-center mb-6 print:hidden">
        <div>
          <nav className="flex text-sm text-slate-400 mb-1">
            <button onClick={() => navigate('/pharmacy/pending-prescriptions')} className="hover:text-primary">
              Pending Prescriptions
            </button>
            <span className="mx-2">/</span>
            <span className="text-slate-600">Billing</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900">Dispensing Invoice</h1>
        </div>
      </div>

      {/* Invoice Card */}
      <div id="dispensing-print-area" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-0">
        {/* Invoice Header — same centered letterhead treatment as the prescription PDF
            (logo + hospital name in primary blue, address/contact below, blue rule) */}
        <div className="px-8 py-6 text-center border-b-[3px] border-primary print:p-4">
          {hospital?.logo_url && (
            <div className="flex justify-center mb-2">
              <HospitalLogo logoUrl={hospital.logo_url} name={hospital.name} className="w-14 h-14 rounded-xl" />
            </div>
          )}
          <h2 className="text-2xl font-bold text-primary">{hospital?.name || 'Hospital Pharmacy'}</h2>
          {hospital && (
            <p className="text-slate-500 text-sm mt-1">
              {[hospital.address_line_1, hospital.city, hospital.state_province, hospital.postal_code]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
          <p className="text-slate-500 text-xs mt-1">Pharmacy Dispensing Bill</p>
        </div>

        {/* Bill info row — mirrors the prescription's PRN/Date-left, Status-right layout */}
        <div className="px-8 py-3 flex justify-between text-sm print:px-4">
          <div className="text-slate-700">
            <strong>Dispensing No:</strong> {dispensing.dispensing_number}<br />
            <strong>Date:</strong> {formatDateTime(billTimestamp)}
          </div>
          <div className="text-right text-slate-700">
            <strong>Status:</strong> <span className="capitalize">{dispensing.status}</span>
          </div>
        </div>

        {/* Patient Info — same light-gray rounded box as the prescription's patient-box */}
        <div className="px-8 py-4 print:px-4">
          <div className="bg-slate-100 rounded-lg px-4 py-3.5">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Bill To</div>
                <div className="font-semibold text-slate-900">{dispensing.patient_name || 'Walk-in Customer'}</div>
                {(dispensing.patient_id || resolvedPrn) && (
                  <div className="text-sm text-slate-600 mt-1">
                    PRN: {resolvedPrn || 'N/A'}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Invoice Type</div>
                <div className="text-sm font-medium text-slate-900 capitalize">
                  Pharmacy Bill ({dispensing.sale_type.replace('_', ' ')})
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Items Table — BRD §5.5 column order: S.No | Medicine | Qty | Pack | Batch | Expiry Date | Amount */}
        <div className="px-8 py-4 print:p-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-100">
                <th className="text-left text-xs font-semibold text-slate-600 uppercase py-2.5 px-2 rounded-l-lg">#</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase py-2.5 px-2">Product Name</th>
                <th className="text-center text-xs font-semibold text-slate-600 uppercase py-2.5 px-2">Qty</th>
                <th className="text-center text-xs font-semibold text-slate-600 uppercase py-2.5 px-2">Pack</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase py-2.5 px-2">Batch</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase py-2.5 px-2">Expiry</th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase py-2.5 px-2 rounded-r-lg">Amount</th>
              </tr>
            </thead>
            <tbody>
              {consultationFeeDue > 0 && (
                <tr className="border-b border-slate-100 print:border-slate-200 bg-blue-50/50 print:bg-transparent">
                  <td className="py-3 px-2 text-sm text-slate-600 print:text-slate-900">1</td>
                  <td className="py-3 px-2">
                    <div className="text-sm font-medium text-slate-900">
                      Consultation Fee{dispensing.consultation_doctor_name ? ` — Dr. ${dispensing.consultation_doctor_name}` : ''}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center text-sm text-slate-600 print:text-slate-900">1</td>
                  <td className="py-3 px-2 text-center text-sm text-slate-600 print:text-slate-900">—</td>
                  <td className="py-3 px-2 text-sm text-slate-600 print:text-slate-900">—</td>
                  <td className="py-3 px-2 text-sm text-slate-600 print:text-slate-900">—</td>
                  <td className="py-3 px-2 text-right text-sm font-semibold text-slate-900">
                    ₹{fmt(consultationFeeDue)}
                  </td>
                </tr>
              )}
              {dispensing.items.map((item, index) => (
                <tr key={item.id} className="border-b border-slate-100 print:border-slate-200">
                  <td className="py-3 px-2 text-sm text-slate-600 print:text-slate-900">{consultationFeeDue > 0 ? index + 2 : index + 1}</td>
                  <td className="py-3 px-2">
                    <div className="text-sm font-medium text-slate-900">{item.medicine_name || 'Medicine'}</div>
                  </td>
                  <td className="py-3 px-2 text-center text-sm text-slate-600 print:text-slate-900">{item.quantity}</td>
                  <td className="py-3 px-2 text-center text-sm text-slate-600 print:text-slate-900">
                    {item.pack ? item.pack : '—'}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-600 print:text-slate-900">
                    {item.batch_number || '—'}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-600 print:text-slate-900">
                    {fmtExpiry(item.expiry_date)}
                  </td>
                  <td className="py-3 px-2 text-right text-sm font-semibold text-slate-900">
                    ₹{fmt(Number(item.total_price))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals — BRD §5.5: includes Cash Received + Balance/Change */}
        <div className="px-8 py-4 bg-slate-50 print:p-4 print:bg-white">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal:</span>
                <span className="font-medium">₹{fmt(Number(dispensing.total_amount))}</span>
              </div>
              {dispensing.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Discount:</span>
                  <span className="font-medium text-red-600">-₹{fmt(Number(dispensing.discount_amount))}</span>
                </div>
              )}
              {dispensing.tax_amount > 0 && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Tax:</span>
                  <span className="font-medium">₹{fmt(Number(dispensing.tax_amount))}</span>
                </div>
              )}
              {consultationFeeDue > 0 && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Consultation Fee:</span>
                  <span className="font-medium">₹{fmt(consultationFeeDue)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200 print:border-slate-900">
                <span>Total:</span>
                <span>₹{fmt(grandTotal)}</span>
              </div>
              {/* Cash Received — visible in screen UI (print:hidden) and printed only when filled */}
              <div className="flex justify-between items-center text-sm text-slate-600 pt-1 print:hidden">
                <span>Cash Received (₹):</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={cashReceived}
                  onChange={e => setCashReceived(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder={fmt(grandTotal)}
                  className="w-32 px-2 py-1 border border-slate-300 rounded text-sm text-right bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              {cashReceived !== '' && balance !== null && (
                <>
                  {/* Shown on screen */}
                  <div className="flex justify-between text-sm font-semibold print:hidden">
                    <span className={balance >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                      {balance >= 0 ? 'Balance / Change:' : 'Balance Due:'}
                    </span>
                    <span className={balance >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                      ₹{fmt(Math.abs(balance))}
                    </span>
                  </div>
                  {/* Shown on print */}
                  <div className="hidden print:flex justify-between text-sm text-slate-700">
                    <span>Cash Received:</span>
                    <span className="font-medium">₹{fmt(Number(cashReceived))}</span>
                  </div>
                  <div className="hidden print:flex justify-between text-sm font-semibold border-t border-slate-300 pt-1">
                    <span className={balance >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                      {balance >= 0 ? 'Balance / Change:' : 'Balance Due:'}
                    </span>
                    <span className={balance >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                      ₹{fmt(Math.abs(balance))}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        {dispensing.notes && (
          <div className="px-8 py-4 border-t border-slate-200 print:p-4 print:border-t-2 print:border-slate-900">
            <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Notes</div>
            <p className="text-sm text-slate-700 print:text-slate-900">{dispensing.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 print:hidden">
          <div className="flex justify-between items-center text-xs text-slate-500">
            <div>
              Generated on {formatDateTime(billTimestamp)}
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">verified</span>
              This is a computer-generated document
            </div>
          </div>
        </div>

        {/* Print Footer */}
        <div className="hidden px-8 py-4 border-t-2 border-slate-900 print:block">
          <div className="flex justify-between text-xs text-slate-600">
            <div>
              <div className="font-semibold text-slate-900">Payment Status</div>
              <div className="mt-4 border-t border-slate-300 pt-2">
                _________________________<br />
                Authorized Signature
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-slate-900">Customer Acknowledgment</div>
              <div className="mt-4 border-t border-slate-300 pt-2">
                _________________________<br />
                Received Medicines
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Outstanding consultation fee — folded into this same bill (see the
          Consultation Fee line item + Total above) instead of sending the
          patient to reception separately. */}
      {consultationFeeDue > 0 && (
        <div className="mt-6 flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl print:hidden">
          <span className="material-symbols-outlined text-blue-600 mt-0.5 flex-shrink-0">info</span>
          <div>
            <p className="text-sm font-semibold text-blue-800">Consultation Fee Included</p>
            <p className="text-sm text-blue-700 mt-0.5">
              This patient's ₹{fmt(consultationFeeDue)} consultation fee hasn't been collected yet — it's been added to this bill so it can be collected together with the medicines.
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2 print:hidden">
        <button
          onClick={handlePrint}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">print</span> Print
        </button>
        <button
          onClick={handlePaymentAndPrint}
          disabled={processing}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">payment</span>
          {processing ? 'Processing...' : 'Confirm Payment & Print'}
        </button>
      </div>

      {/* Payment Method — Hidden when printing */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5 print:hidden">
        <div className="text-sm font-semibold text-slate-700 mb-3">Payment Method</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {(['cash', 'upi', 'debit_card', 'credit_card'] as PaymentMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPaymentMode(mode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                paymentMode === mode
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-primary/40'
              }`}
            >
              {mode === 'cash' ? 'Cash' : mode === 'upi' ? 'UPI' : mode === 'debit_card' ? 'Debit Card' : 'Credit Card'}
            </button>
          ))}
        </div>
        {paymentMode === 'cash' ? (
          <div className="flex items-center gap-3 text-sm text-slate-700">
            <label className="font-medium whitespace-nowrap">Cash Received (₹):</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cashReceived}
              onChange={e => setCashReceived(e.target.value === '' ? '' : parseFloat(e.target.value))}
              placeholder={fmt(grandTotal)}
              className="w-40 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-right"
            />
            {cashReceived !== '' && balance !== null && (
              <span className={`font-semibold ${balance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {balance >= 0 ? `Change: ₹${fmt(balance)}` : `Due: ₹${fmt(Math.abs(balance))}`}
              </span>
            )}
          </div>
        ) : (
          <input
            type="text"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder={paymentMode === 'upi' ? 'UPI transaction ID' : 'Card / reference number'}
            className="w-full max-w-xs px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        )}
      </div>
    </div>
    </>
  );
};

export default DispensingBilling;
