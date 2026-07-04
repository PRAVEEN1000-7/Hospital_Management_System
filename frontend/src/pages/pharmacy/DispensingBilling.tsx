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

      // Step 1: Create pharmacy invoice with line items
      const invoice = await invoiceService.create({
        patient_id: dispensing.patient_id,
        invoice_type: 'pharmacy',
        discount_amount: dispensing.discount_amount || undefined,
        notes: dispensing.notes || undefined,
        items: dispensing.items.map((item, idx) => ({
          item_type: 'medicine' as const,
          reference_id: item.medicine_id,
          description: item.medicine_name || 'Medicine',
          quantity: item.quantity,
          unit_price: item.unit_price,
          batch_number: item.batch_number,
          display_order: idx + 1,
        })),
      });

      // Step 2: Issue the invoice so it can accept payments
      await invoiceService.issue(invoice.id);

      // Step 3: Record payment
      await paymentService.record({
        invoice_id: invoice.id,
        patient_id: dispensing.patient_id,
        amount: dispensing.net_amount,
        payment_mode: paymentMode,
        payment_reference: paymentRef.trim() || undefined,
      });

      showToast('success', 'Payment recorded successfully');
      window.print();
      navigate('/pharmacy/pending-prescriptions', {
        state: { billingComplete: true, dispensingNumber: dispensing.dispensing_number, amount: dispensing.net_amount },
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
  const balance = cashReceived !== '' ? Number(cashReceived) - Number(dispensing.net_amount) : null;

  const fmtExpiry = (d?: string) => {
    if (!d) return '—';
    const dt = new Date(d);
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getFullYear()).slice(-2)}`;
  };

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
            <strong>Date:</strong> {new Date(billTimestamp).toLocaleString()}
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
        <div className="px-8 py-4 print:p-4">
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
              {dispensing.items.map((item, index) => (
                <tr key={item.id} className="border-b border-slate-100 print:border-slate-200">
                  <td className="py-3 px-2 text-sm text-slate-600 print:text-slate-900">{index + 1}</td>
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
              <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200 print:border-slate-900">
                <span>Total:</span>
                <span>₹{fmt(Number(dispensing.net_amount))}</span>
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
                  placeholder={fmt(Number(dispensing.net_amount))}
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
              Generated on {new Date(billTimestamp).toLocaleString()}
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

      {/* Consultation fee gate — only shown when fee hasn't been collected for a prescription-linked sale */}
      {dispensing.prescription_id && dispensing.consultation_fee_collected === false && (
        <div className="mt-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl print:hidden">
          <span className="material-symbols-outlined text-amber-600 mt-0.5 flex-shrink-0">warning</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Consultation Fee Not Collected</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Please collect the doctor's consultation fee at the reception counter before processing medicine payment.
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
          disabled={processing || (!!dispensing.prescription_id && dispensing.consultation_fee_collected === false)}
          title={dispensing.prescription_id && dispensing.consultation_fee_collected === false ? 'Collect consultation fee first' : undefined}
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
              placeholder={fmt(Number(dispensing.net_amount))}
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
