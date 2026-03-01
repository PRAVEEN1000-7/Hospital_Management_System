import React, { useState, useEffect, useCallback } from 'react';
import waitlistService from '../services/waitlistService';
import scheduleService from '../services/scheduleService';
import type { WaitlistEntry, WaitlistStats, DoctorOption } from '../types/appointment';

const priorityBadge: Record<string, { bg: string; text: string; label: string }> = {
  emergency: { bg: 'bg-red-100', text: 'text-red-700', label: 'Emergency' },
  urgent:    { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Urgent' },
  normal:    { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Normal' },
};

const statusBadge: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  waiting:   { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Waiting',   icon: 'hourglass_empty' },
  notified:  { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Notified',  icon: 'notifications_active' },
  booked:    { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Booked',    icon: 'check_circle' },
  cancelled: { bg: 'bg-slate-100',  text: 'text-slate-500',  label: 'Cancelled', icon: 'cancel' },
  expired:   { bg: 'bg-red-100',    text: 'text-red-600',    label: 'Expired',   icon: 'timer_off' },
};

const WaitlistManagement: React.FC = () => {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState('waiting');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const params: Record<string, string | number> = { page, limit };
      if (filterDoctor) params.doctor_id = filterDoctor;
      if (filterDate) params.date = filterDate;
      if (filterStatus) params.status = filterStatus;

      const [wl, st] = await Promise.all([
        waitlistService.getWaitlist(params as any),
        waitlistService.getStats({
          doctor_id: filterDoctor || undefined,
          date: filterDate || undefined,
        }),
      ]);

      setEntries(wl.data);
      setTotal(wl.total);
      setStats(st);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load waitlist');
    } finally {
      setLoading(false);
    }
  }, [filterDoctor, filterDate, filterStatus, page]);

  useEffect(() => {
    scheduleService.getDoctors().then(setDoctors).catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBook = async (entry: WaitlistEntry) => {
    if (!confirm(`Book appointment for ${entry.patient_name || 'this patient'} with ${entry.doctor_name || 'doctor'}?`)) return;
    setActionLoading(entry.id);
    try {
      const result = await waitlistService.bookFromWaitlist(entry.id);
      showToast(`Appointment booked! Queue #${result.queue_number}`);
      fetchData();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to book', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (entry: WaitlistEntry) => {
    if (!confirm(`Remove ${entry.patient_name || 'this patient'} from the waitlist?`)) return;
    setActionLoading(entry.id);
    try {
      await waitlistService.cancelEntry(entry.id);
      showToast('Entry removed from waitlist');
      fetchData();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to cancel', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Waitlist Management</h1>
          <p className="text-slate-500 text-sm mt-1">Patients waiting for doctor appointment slots</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
          Refresh
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-fade-in ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <span className="material-symbols-outlined text-lg">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.msg}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <span className="material-symbols-outlined">hourglass_empty</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.total_waiting}</p>
                <p className="text-xs text-slate-500">Waiting</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                <span className="material-symbols-outlined">check_circle</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.total_booked}</p>
                <p className="text-xs text-slate-500">Booked</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                <span className="material-symbols-outlined">cancel</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.total_cancelled}</p>
                <p className="text-xs text-slate-500">Cancelled</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                <span className="material-symbols-outlined">bar_chart</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-xs text-slate-500">Total</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Doctor</label>
            <select
              value={filterDoctor}
              onChange={e => { setFilterDoctor(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            >
              <option value="">All Doctors</option>
              {doctors.map(d => (
                <option key={d.doctor_id} value={d.doctor_id}>
                  {d.name}{d.specialization ? ` — ${d.specialization}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
            <input
              type="date"
              value={filterDate}
              onChange={e => { setFilterDate(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            >
              <option value="">All</option>
              <option value="waiting">Waiting</option>
              <option value="booked">Booked</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined">error</span>
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-20 text-slate-400">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Loading waitlist...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <span className="material-symbols-outlined text-5xl mb-3 block">playlist_remove</span>
            <p className="text-sm font-medium">No waitlist entries found</p>
            <p className="text-xs mt-1 text-slate-400">
              Patients are automatically added when all doctor slots are full during walk-in registration.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Patient</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Doctor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Complaint</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entries.map((entry, idx) => {
                    const pBadge = priorityBadge[entry.priority] || priorityBadge.normal;
                    const sBadge = statusBadge[entry.status] || statusBadge.waiting;
                    const isActioning = actionLoading === entry.id;

                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {entry.position}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{entry.patient_name || '—'}</p>
                            <p className="text-xs text-slate-400">
                              {entry.patient_reference_number || ''}
                              {entry.patient_phone ? ` · ${entry.patient_phone}` : ''}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-700">{entry.doctor_name || '—'}</p>
                            {entry.doctor_specialization && (
                              <p className="text-xs text-slate-400">{entry.doctor_specialization}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {entry.preferred_date}
                          {entry.preferred_time && (
                            <span className="text-xs text-slate-400 ml-1">
                              {entry.preferred_time}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${pBadge.bg} ${pBadge.text}`}>
                            {pBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sBadge.bg} ${sBadge.text}`}>
                            <span className="material-symbols-outlined text-sm">{sBadge.icon}</span>
                            {sBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate" title={entry.chief_complaint || ''}>
                          {entry.chief_complaint || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.status === 'waiting' && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleBook(entry)}
                                disabled={isActioning}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                title="Book appointment from waitlist"
                              >
                                {isActioning ? (
                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <span className="material-symbols-outlined text-sm">event_available</span>
                                )}
                                Book
                              </button>
                              <button
                                onClick={() => handleCancel(entry)}
                                disabled={isActioning}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg text-xs font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors"
                                title="Remove from waitlist"
                              >
                                <span className="material-symbols-outlined text-sm">close</span>
                                Remove
                              </button>
                            </div>
                          )}
                          {entry.status === 'booked' && (
                            <span className="text-xs text-green-600 font-medium flex items-center justify-end gap-1">
                              <span className="material-symbols-outlined text-sm">check</span>
                              Booked
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                </p>
                <div className="flex gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WaitlistManagement;
