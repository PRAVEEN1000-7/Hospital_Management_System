import React, { useState } from 'react';
import { format } from 'date-fns';
import type { PatientLabResult } from '../../types/lab';
import LabOrderDetail from '../../pages/lab/LabOrderDetail';

const LAB_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  finalized: 'bg-emerald-100 text-emerald-700',
};

interface LabTestHistoryCardProps {
  labResults: PatientLabResult[];
}

// Standalone "Laboratory Test History" card — same collapsible-card chrome
// and row-click-opens-a-dialog pattern as PrescriptionHistoryGrid's own Lab
// Reports sub-section (which stays too, further up the page, alongside
// Prescription History), but placed directly above the Laboratory Tests
// ordering card so a doctor about to order tests sees this patient's past
// lab history right there instead of scrolling back up. Reuses the same
// `pastLabResults` fetch already done for that other section — no extra API
// call.
const LabTestHistoryCard: React.FC<LabTestHistoryCardProps> = ({ labResults }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLabOrderId, setSelectedLabOrderId] = useState<string | null>(null);

  if (labResults.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div
        className={`flex items-center gap-2 ${isOpen ? 'mb-4' : ''} cursor-pointer select-none`}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="material-symbols-outlined text-primary text-sm">biotech</span>
        <h2 className="text-sm font-bold text-primary uppercase tracking-wider flex-1">Laboratory Test History</h2>
        <span className="material-symbols-outlined text-primary text-lg transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          expand_more
        </span>
      </div>

      {isOpen && (
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-2.5">Order #</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Doctor</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {labResults.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setSelectedLabOrderId(order.id)}
                  className="cursor-pointer hover:bg-primary/5 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{order.order_number}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {(() => { try { return format(new Date(order.created_at), 'dd MMM yyyy'); } catch { return ''; } })()}
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{order.doctor_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${LAB_STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-600'}`}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedLabOrderId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedLabOrderId(null)}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <LabOrderDetail orderIdProp={selectedLabOrderId} onClose={() => setSelectedLabOrderId(null)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default LabTestHistoryCard;
