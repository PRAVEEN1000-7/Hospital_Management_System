import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import pharmacyService from '../../services/pharmacyService';

interface DispensingItem {
  id: string;
  medicine_id: string;
  batch_id: string;
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

const DispensingBilling: React.FC = () => {
  const { dispensingId } = useParams<{ dispensingId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [dispensing, setDispensing] = useState<DispensingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

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

  const handlePaymentAndPrint = async () => {
    if (!dispensing) return;
    
    setProcessing(true);
    try {
      // TODO: When payment module is implemented, this will:
      // 1. Create payment record
      // 2. Update dispensing payment status
      // 3. Generate invoice PDF
      
      // For now, just show success and navigate
      showToast('success', 'Payment recorded successfully (Demo mode)');
      
      // Navigate to pending prescriptions with success state
      navigate('/pharmacy/pending-prescriptions', {
        state: { 
          billingComplete: true, 
          dispensingNumber: dispensing.dispensing_number,
          amount: dispensing.net_amount 
        },
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
      <div className="max-w-4xl mx-auto p-6">
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

  return (
    <div className="max-w-4xl mx-auto p-6">
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
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">print</span> Print
          </button>
          <button
            onClick={handlePaymentAndPrint}
            disabled={processing}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">payment</span>
            {processing ? 'Processing...' : 'Confirm Payment & Print'}
          </button>
        </div>
      </div>

      {/* Invoice Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-0">
        {/* Invoice Header */}
        <div className="bg-gradient-to-r from-primary to-primary/80 px-8 py-6 print:bg-white print:border-b-2 print:border-slate-900 print:p-0">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-white print:text-slate-900">
                Hospital Pharmacy
              </h2>
              <p className="text-emerald-100 text-sm mt-1 print:text-slate-600">
                Dispensing Invoice
              </p>
            </div>
            <div className="text-right">
              <div className="text-white/90 text-sm print:text-slate-600">Invoice Number</div>
              <div className="text-white font-bold text-lg print:text-slate-900">
                {dispensing.dispensing_number}
              </div>
              <div className="text-white/80 text-xs mt-1 print:text-slate-500">
                {new Date(dispensing.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Patient Info */}
        <div className="px-8 py-4 border-b border-slate-200 print:p-4 print:border-b-2 print:border-slate-900">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Bill To</div>
              <div className="font-semibold text-slate-900">{dispensing.patient_name || 'Walk-in Customer'}</div>
              {dispensing.patient_id && (
                <div className="text-sm text-slate-600 mt-1">Patient ID: {dispensing.patient_id}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Invoice Type</div>
              <div className="text-sm font-medium text-slate-900 capitalize">
                {dispensing.sale_type.replace('_', ' ')}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Status: <span className="font-medium text-emerald-600 capitalize">{dispensing.status}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="px-8 py-4 print:p-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 print:border-slate-900">
                <th className="text-left text-xs font-semibold text-slate-600 uppercase py-2 print:text-slate-900">
                  #
                </th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase py-2 print:text-slate-900">
                  Medicine
                </th>
                <th className="text-center text-xs font-semibold text-slate-600 uppercase py-2 print:text-slate-900">
                  Qty
                </th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase py-2 print:text-slate-900">
                  Unit Price
                </th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase py-2 print:text-slate-900">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {dispensing.items.map((item, index) => (
                <tr key={item.id} className="border-b border-slate-100 print:border-slate-200">
                  <td className="py-3 text-sm text-slate-600 print:text-slate-900">{index + 1}</td>
                  <td className="py-3">
                    <div className="text-sm font-medium text-slate-900 print:text-slate-900">
                      {item.medicine_name || 'Medicine'}
                    </div>
                  </td>
                  <td className="py-3 text-center text-sm text-slate-600 print:text-slate-900">
                    {item.quantity}
                  </td>
                  <td className="py-3 text-right text-sm text-slate-600 print:text-slate-900">
                    ₹{Number(item.unit_price).toFixed(2)}
                  </td>
                  <td className="py-3 text-right text-sm font-semibold text-slate-900 print:text-slate-900">
                    ₹{Number(item.total_price).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="px-8 py-4 bg-slate-50 print:p-4 print:bg-white">
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm text-slate-600 print:text-slate-700">
                <span>Subtotal:</span>
                <span className="font-medium">₹{Number(dispensing.total_amount).toFixed(2)}</span>
              </div>
              {dispensing.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-slate-600 print:text-slate-700">
                  <span>Discount:</span>
                  <span className="font-medium text-red-600">-₹{Number(dispensing.discount_amount).toFixed(2)}</span>
                </div>
              )}
              {dispensing.tax_amount > 0 && (
                <div className="flex justify-between text-sm text-slate-600 print:text-slate-700">
                  <span>Tax:</span>
                  <span className="font-medium">₹{Number(dispensing.tax_amount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200 print:border-slate-900">
                <span>Total:</span>
                <span>₹{Number(dispensing.net_amount).toFixed(2)}</span>
              </div>
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
              Generated on {new Date().toLocaleString()}
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

      {/* Payment Instructions - Hidden when printing */}
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 print:hidden">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-600 text-lg">info</span>
          <div>
            <div className="text-sm font-semibold text-amber-800">Payment Module - Demo Mode</div>
            <p className="text-sm text-amber-700 mt-1">
              This is a simplified billing view. When the payment module is implemented, clicking "Confirm Payment & Print" will:
            </p>
            <ul className="text-sm text-amber-700 mt-2 space-y-1 list-disc list-inside">
              <li>Create a payment record in the database</li>
              <li>Update the dispensing payment status</li>
              <li>Generate a PDF invoice</li>
              <li>Support multiple payment methods (cash, card, UPI, insurance)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DispensingBilling;
