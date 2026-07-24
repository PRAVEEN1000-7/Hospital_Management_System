import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import prescriptionService from '../../services/prescriptionService';
import type { PrescriptionListItem } from '../../types/prescription';
import PrescriptionHistoryDialog from './PrescriptionHistoryDialog';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-700',
  finalized: 'bg-blue-100 text-blue-700',
  dispensed: 'bg-green-100 text-green-700',
  partially_dispensed: 'bg-orange-100 text-orange-700',
};

const LIMIT = 5;

interface PrescriptionHistoryGridProps {
  patientId: string;
  /** 'section' (default) — a bare padded block, for embedding inside an
   * already-bordered parent card (e.g. PatientDetail.tsx's divide-y sections).
   * 'card' — adds its own white/bordered/shadowed card chrome, for standalone
   * placement among sibling cards (e.g. PrescriptionBuilder.tsx). */
  variant?: 'section' | 'card';
}

const PrescriptionHistoryGrid: React.FC<PrescriptionHistoryGridProps> = ({ patientId, variant = 'section' }) => {
  const [items, setItems] = useState<PrescriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [patientId]);

  // Guard against a slow response for a patient the doctor has since
  // navigated away from landing after a newer request and overwriting the
  // table with the wrong patient's history — patientId/page can both change
  // in quick succession (e.g. switching patients in the consultation screen).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    prescriptionService.getPatientPrescriptions(patientId, page, LIMIT)
      .then((res) => {
        if (cancelled) return;
        setItems(res.data);
        setTotalPages(res.total_pages);
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
    <div className={variant === 'card' ? 'bg-white rounded-xl border border-slate-200 shadow-sm p-6' : 'p-6'}>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
        <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Prescription History</h2>
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
                  <th className="px-4 py-2.5">Rx #</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Doctor</th>
                  <th className="px-4 py-2.5">Diagnosis</th>
                  <th className="px-4 py-2.5">Medicines</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((rx) => {
                  const shownMedicines = (rx.medicine_names || []).slice(0, 2);
                  const remaining = Math.max(0, (rx.item_count || 0) - shownMedicines.length);
                  return (
                    <tr
                      key={rx.id}
                      onClick={() => setSelectedId(rx.id)}
                      className="cursor-pointer hover:bg-primary/5 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{rx.prescription_number}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {(() => { try { return format(new Date(rx.created_at), 'dd MMM yyyy'); } catch { return ''; } })()}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{rx.doctor_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-800 max-w-[220px] truncate">{rx.diagnosis || 'No diagnosis recorded'}</td>
                      <td className="px-4 py-3">
                        {shownMedicines.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">None</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {shownMedicines.map((name, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] rounded-full">
                                {name}
                              </span>
                            ))}
                            {remaining > 0 && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[11px] rounded-full">
                                +{remaining}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${STATUS_COLORS[rx.status] || 'bg-slate-100 text-slate-600'}`}>
                          {rx.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
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

      {selectedId && (
        <PrescriptionHistoryDialog prescriptionId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
};

export default PrescriptionHistoryGrid;
