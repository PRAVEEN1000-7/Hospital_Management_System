import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import waitlistService from '../services/waitlistService';
import scheduleService from '../services/scheduleService';
import type { WaitlistEntry, DoctorOption } from '../types/appointment';

const WaitlistManagement: React.FC = () => {
  const toast = useToast();

  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterDoctor, setFilterDoctor] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState<string>('waiting');
  const limit = 15;

  const fetchWaitlist = useCallback(async () => {
    setLoading(true);
    try {
      const data = await waitlistService.getWaitlist(
        page, limit,
        filterDoctor ? Number(filterDoctor) : undefined,
        undefined,
        filterStatus || undefined,
      );
      setEntries(data.data);
      setTotalPages(data.total_pages);
    } catch {
      toast.error('Failed to load waitlist');
    }
    setLoading(false);
  }, [page, filterDoctor, filterStatus]);

  useEffect(() => { scheduleService.getDoctors().then(setDoctors).catch(() => {}); }, []);
  useEffect(() => { fetchWaitlist(); }, [fetchWaitlist]);

  const handleConfirm = async (id: number) => {
    try {
      await waitlistService.confirmEntry(id);
      toast.success('Patient confirmed and moved to appointments');
      fetchWaitlist();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to confirm');
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await waitlistService.removeEntry(id);
      toast.success('Removed from waitlist');
      fetchWaitlist();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to remove');
    }
  };

  const statusColors: Record<string, string> = {
    waiting: 'bg-amber-50 text-amber-600',
    notified: 'bg-blue-50 text-blue-600',
    confirmed: 'bg-emerald-50 text-emerald-600',
    cancelled: 'bg-red-50 text-red-600',
    expired: 'bg-slate-100 text-slate-500',
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Waitlist Management</h1>
        <p className="text-slate-500 text-sm mt-1">Manage patients waiting for appointment slots</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select value={filterDoctor} onChange={(e) => { setFilterDoctor(e.target.value as any); setPage(1); }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
          <option value="">All Doctors</option>
          {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </select>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {['', 'waiting', 'notified', 'confirmed', 'cancelled'].map(s => (
            <button key={s} onClick={() => { setFilterStatus(s); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize ${filterStatus === s ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
          <span className="material-symbols-outlined text-5xl mb-3 block">playlist_add</span>
          <p className="text-sm font-medium">No waitlist entries found</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['#', 'Patient', 'Doctor', 'Preferred Date', 'Priority', 'Status', 'Added On', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, idx) => (
                    <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{(page - 1) * limit + idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{entry.patient_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.doctor_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.preferred_date ? formatDate(entry.preferred_date) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${(entry.priority || 0) >= 8 ? 'bg-red-50 text-red-600' : (entry.priority || 0) >= 5 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                          {entry.priority || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusColors[entry.status] || 'bg-slate-100 text-slate-500'}`}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{entry.created_at ? formatDate(entry.created_at) : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {entry.status === 'waiting' && (
                            <>
                              <button onClick={() => handleConfirm(entry.id)}
                                className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors" title="Confirm & Create Appointment">
                                <span className="material-symbols-outlined text-lg">check_circle</span>
                              </button>
                              <button onClick={() => handleRemove(entry.id)}
                                className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors" title="Remove">
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            </>
                          )}
                          {entry.status === 'notified' && (
                            <button onClick={() => handleConfirm(entry.id)}
                              className="px-3 py-1 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
                              Confirm
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50">Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WaitlistManagement;
