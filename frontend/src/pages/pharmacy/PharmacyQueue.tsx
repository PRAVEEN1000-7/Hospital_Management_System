import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import { useToast } from '../../contexts/ToastContext';
import type { PharmacyQueueEntry, PharmacyQueueStatus } from '../../types/pharmacy';
import { formatTimeOnly } from '../../utils/calendarDate';

const POLL_INTERVAL_MS = 15000;

const STATUS_LABELS: Record<PharmacyQueueStatus, string> = {
  waiting: 'Waiting',
  being_served: 'Being Served',
  collected: 'Collected',
};

const STATUS_COLORS: Record<PharmacyQueueStatus, string> = {
  waiting: 'bg-slate-100 text-slate-700',
  being_served: 'bg-blue-100 text-blue-700',
  collected: 'bg-emerald-100 text-emerald-700',
};

const NEXT_STATUS: Record<PharmacyQueueStatus, PharmacyQueueStatus | null> = {
  waiting: 'being_served',
  being_served: 'collected',
  collected: null,
};

const PharmacyQueue: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [entries, setEntries] = useState<PharmacyQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualPatientName, setManualPatientName] = useState('');
  const [manualDoctorName, setManualDoctorName] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      const data = await pharmacyService.getQueue();
      setEntries(data);
    } catch {
      toast.error('Failed to load pharmacy queue');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = window.setInterval(fetchQueue, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchQueue]);

  const handleAdvance = async (id: string, nextStatus: PharmacyQueueStatus) => {
    setAdvancing(id);
    try {
      await pharmacyService.updateQueueStatus(id, nextStatus);
      await fetchQueue();
    } catch {
      toast.error('Failed to update queue status');
    } finally {
      setAdvancing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this patient from the pharmacy queue?')) return;
    setDeleting(id);
    try {
      await pharmacyService.deleteQueueEntry(id);
      await fetchQueue();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to delete queue entry');
    } finally {
      setDeleting(null);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPatientName.trim()) {
      toast.error('Enter a patient name');
      return;
    }
    setSavingManual(true);
    try {
      await pharmacyService.addManualQueueEntry({
        patient_name: manualPatientName.trim(),
        doctor_name: manualDoctorName.trim() || undefined,
      });
      setShowManualAdd(false);
      setManualPatientName('');
      setManualDoctorName('');
      await fetchQueue();
    } catch {
      toast.error('Failed to add patient to queue');
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Pharmacy Queue</h1>
        <button
          onClick={() => setShowManualAdd(true)}
          className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90"
        >
          + Manual Add
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2 block">queue</span>
            <p className="font-medium">No patients in today's pharmacy queue</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600 text-center">Token</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Patient</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Doctor</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Prescription</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Time In</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map(entry => {
                const next = NEXT_STATUS[entry.status];
                return (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary font-bold">
                        {entry.queue_token ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{entry.patient_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.doctor_name || '—'}</td>
                    <td className="px-4 py-3">
                      {entry.prescription_id ? (
                        <button
                          onClick={() => navigate(`/pharmacy/dispense/${entry.prescription_id}?mode=view`)}
                          className="text-primary hover:underline font-medium"
                        >
                          {entry.prescription_number}
                        </button>
                      ) : (
                        <span className="text-slate-400">Walk-in</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatTimeOnly(entry.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[entry.status]}`}>
                        {STATUS_LABELS[entry.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-2">
                        {entry.prescription_id && entry.status !== 'collected' ? (
                          <button
                            onClick={() => navigate(`/pharmacy/dispense/${entry.prescription_id}`)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary/90"
                          >
                            Dispense & Bill
                          </button>
                        ) : next ? (
                          <button
                            onClick={() => handleAdvance(entry.id, next)}
                            disabled={advancing === entry.id}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                          >
                            {advancing === entry.id ? '...' : `Mark ${STATUS_LABELS[next]}`}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Done</span>
                        )}
                        {!entry.sale_id && (
                          <button
                            onClick={() => handleDelete(entry.id)}
                            disabled={deleting === entry.id}
                            title="Remove from queue"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-lg">
                              {deleting === entry.id ? 'progress_activity' : 'delete'}
                            </span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showManualAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Add Walk-in Patient</h2>
            <form onSubmit={handleManualAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Patient Name</label>
                <input
                  value={manualPatientName}
                  onChange={e => setManualPatientName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Doctor Name (optional)</label>
                <input
                  value={manualDoctorName}
                  onChange={e => setManualDoctorName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualAdd(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingManual ? 'Adding...' : 'Add to Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PharmacyQueue;
