import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import prescriptionService from '../../services/prescriptionService';
import type { Prescription } from '../../types/prescription';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-700',
  finalized: 'bg-blue-100 text-blue-700',
  dispensed: 'bg-green-100 text-green-700',
  partially_dispensed: 'bg-orange-100 text-orange-700',
};

interface PrescriptionHistoryDialogProps {
  prescriptionId: string;
  onClose: () => void;
}

const fmtDate = (d: string | null | undefined, withTime = false) => {
  if (!d) return '—';
  try { return format(new Date(d), withTime ? 'dd MMM yyyy, hh:mm a' : 'dd MMM yyyy'); } catch { return '—'; }
};

const PrescriptionHistoryDialog: React.FC<PrescriptionHistoryDialogProps> = ({ prescriptionId, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEyeHospital = user?.hospital_specialty === 'eye_hospital' || user?.hospital_specialty === 'multi_specialty';

  const [rx, setRx] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    prescriptionService.getPrescription(prescriptionId)
      .then((data) => { if (!cancelled) setRx(data); })
      .catch(() => { if (!cancelled) setRx(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [prescriptionId]);

  const vitals = rx ? [
    { label: 'BP', value: rx.vitals_bp, unit: 'mmHg' },
    { label: 'Pulse', value: rx.vitals_pulse, unit: 'bpm' },
    { label: 'Temp', value: rx.vitals_temp, unit: '°F' },
    { label: 'Weight', value: rx.vitals_weight, unit: 'kg' },
    { label: 'SpO2', value: rx.vitals_spo2, unit: '%' },
  ].filter((v) => v.value) : [];

  const eyeFormat = isEyeHospital && rx?.items?.some((item) => item.eye_side);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-xl">description</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {rx ? rx.prescription_number : 'Prescription'}
              </h3>
              <p className="text-[11px] text-slate-400">Full prescription details</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
            </div>
          ) : !rx ? (
            <p className="text-sm text-slate-500 text-center py-10">Failed to load prescription.</p>
          ) : (
            <>
              {/* Header info */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-3">
                <div className="text-sm">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize mr-2 ${STATUS_COLORS[rx.status] || 'bg-slate-100 text-slate-600'}`}>
                    {rx.status.replace('_', ' ')}
                  </span>
                  <span className="text-slate-500">{fmtDate(rx.created_at, true)}</span>
                </div>
                <div className="text-sm text-slate-700">
                  {rx.doctor_name && <span className="font-medium">{rx.doctor_name}</span>}
                  {rx.appointment_number && <span className="text-slate-400"> · Appt {rx.appointment_number}</span>}
                </div>
              </div>

              {/* Vitals */}
              {vitals.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Vitals</h4>
                  <div className="grid grid-cols-5 gap-2">
                    {vitals.map((v) => (
                      <div key={v.label} className="text-center p-2.5 bg-slate-50 rounded-lg">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">{v.label}</p>
                        <p className="text-sm font-bold text-slate-800 mt-1">{v.value}</p>
                        <p className="text-[10px] text-slate-400">{v.unit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diagnosis / notes / advice */}
              {rx.diagnosis && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Diagnosis</h4>
                  <p className="text-sm text-slate-700">{rx.diagnosis}</p>
                </div>
              )}
              {rx.clinical_notes && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Clinical Notes</h4>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{rx.clinical_notes}</p>
                </div>
              )}
              {rx.is_opthal && rx.opthal_notes && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Ophthalmology Examination</h4>
                  <p className="text-sm text-amber-900 whitespace-pre-wrap">{rx.opthal_notes}</p>
                </div>
              )}
              {rx.advice && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Advice</h4>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{rx.advice}</p>
                </div>
              )}
              {rx.follow_up_date && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Follow-up Date</h4>
                  <p className="text-sm text-slate-700">{fmtDate(rx.follow_up_date)}</p>
                </div>
              )}

              {/* Medicines */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Medicines ({rx.items?.length || 0})
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
                  {eyeFormat ? (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100">
                        <tr className="text-left text-slate-500 uppercase text-[10px]">
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Medicine</th>
                          <th className="px-3 py-2 text-center">LE</th>
                          <th className="px-3 py-2 text-center">RE</th>
                          <th className="px-3 py-2">Dosage</th>
                          <th className="px-3 py-2">Frequency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rx.items?.map((item, idx) => {
                          const reOn = item.eye_side === 'RE' || item.eye_side === 'Both';
                          const leOn = item.eye_side === 'LE' || item.eye_side === 'Both';
                          return (
                            <tr key={item.id || idx}>
                              <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                              <td className="px-3 py-2">
                                <p className="font-medium text-slate-900">{item.medicine_name}</p>
                                {item.generic_name && <p className="text-[10px] text-slate-400">{item.generic_name}</p>}
                              </td>
                              <td className="px-3 py-2 text-center">{leOn ? '✓' : '—'}</td>
                              <td className="px-3 py-2 text-center">{reOn ? '✓' : '—'}</td>
                              <td className="px-3 py-2 text-slate-700">{item.dosage}</td>
                              <td className="px-3 py-2 text-slate-700">{item.frequency || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100">
                        <tr className="text-left text-slate-500 uppercase text-[10px]">
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Medicine</th>
                          <th className="px-3 py-2">Dosage</th>
                          <th className="px-3 py-2">Frequency</th>
                          <th className="px-3 py-2">Duration</th>
                          <th className="px-3 py-2">Route</th>
                          <th className="px-3 py-2">Instructions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rx.items?.map((item, idx) => (
                          <tr key={item.id || idx}>
                            <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <p className="font-medium text-slate-900">{item.medicine_name}</p>
                              {item.generic_name && <p className="text-[10px] text-slate-400">{item.generic_name}</p>}
                            </td>
                            <td className="px-3 py-2 text-slate-700">{item.dosage}</td>
                            <td className="px-3 py-2 text-slate-700">{item.frequency}</td>
                            <td className="px-3 py-2 text-slate-700">
                              {item.duration_value ? `${item.duration_value} ${item.duration_unit || 'days'}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-700">{item.route || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{item.instructions || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">
            Close
          </button>
          {rx && (
            <button
              onClick={() => navigate(`/prescriptions/${rx.id}`)}
              className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span>
              View Full Prescription
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrescriptionHistoryDialog;
