import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import invoiceService from '../../services/invoiceService';
import type { InvoiceListItem } from '../../types/billing';
import { formatDateOnly } from '../../utils/calendarDate';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '../../utils/paymentStatus';

const LIMIT = 5;

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

interface PatientBillingSectionProps {
  patientId: string;
}

/** BRD-001 "Patient Billing" — a compact invoice history for this patient,
 * mirroring PrescriptionHistoryGrid.tsx's pattern (5/page, race-condition-safe
 * fetch, hidden entirely when there's nothing to show). Backend endpoint
 * (GET /invoices/patient/{id}) and invoiceService.getByPatient() already
 * existed but were unused before this. */
const PatientBillingSection: React.FC<PatientBillingSectionProps> = ({ patientId }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { setPage(1); }, [patientId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoiceService.getByPatient(patientId, page, LIMIT)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotalPages(res.pages);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [patientId, page]);

  if (!loading && items.length === 0) return null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
        <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Billing History</h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
        </div>
      ) : (
        <>
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Invoice #</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Balance</th>
                  <th className="px-4 py-2.5">Payment Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/billing/invoices/${inv.id}`)}
                    className="cursor-pointer hover:bg-primary/5 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-primary font-semibold whitespace-nowrap">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateOnly(inv.invoice_date)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">₹{fmt(inv.total_amount)}</td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${inv.balance_amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ₹{fmt(inv.balance_amount)}
                    </td>
                    <td className="px-4 py-3">
                      {inv.payment_status && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${PAYMENT_STATUS_COLORS[inv.payment_status]}`}>
                          {PAYMENT_STATUS_LABELS[inv.payment_status]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-400">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors">
                  Previous
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors">
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PatientBillingSection;
