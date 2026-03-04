import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
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
  const { user } = useAuth();
  const roles = user?.roles || [];
  const isDoctor = roles.includes('doctor');

  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Send to Doctor modal state
  const [sendModalEntry, setSendModalEntry] = useState<WaitlistEntry | null>(null);
  const [sendDoctorId, setSendDoctorId] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  // Filters (doctors don't use filters — backend auto-scopes to their patients)
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
      // Doctors: no extra filters needed — backend auto-scopes
      if (!isDoctor && filterDoctor) params.doctor_id = filterDoctor;
      if (!isDoctor && filterDate) params.date = filterDate;
      if (!isDoctor && filterStatus) params.status = filterStatus;

      const [wl, st] = await Promise.all([
        waitlistService.getWaitlist(params as any),
        waitlistService.getStats({
          doctor_id: (!isDoctor && filterDoctor) ? filterDoctor : undefined,
          date: (!isDoctor && filterDate) ? filterDate : undefined,
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
  }, [filterDoctor, filterDate, filterStatus, page, isDoctor]);

  useEffect(() => {
    // Always fetch doctors list for the Send to Doctor modal
    scheduleService.getDoctors().then(setDoctors).catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open the Send to Doctor modal — pre-select the entry's assigned doctor
  const openSendModal = (entry: WaitlistEntry) => {
    setSendModalEntry(entry);
    setSendDoctorId(entry.doctor_id || '');
  };

  const handleSendToDoctor = async () => {
    if (!sendModalEntry || !sendDoctorId) return;
    setSendLoading(true);
    try {
      const result = await waitlistService.bookFromWaitlist(
        sendModalEntry.id,
        sendDoctorId !== sendModalEntry.doctor_id ? sendDoctorId : undefined,
      );
      const selectedDoc = doctors.find(d => d.doctor_id === sendDoctorId);
      showToast(`Patient sent to ${selectedDoc?.name || 'doctor'} — Queue #${result.queue_number}`);
      setSendModalEntry(null);
      fetchData();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to send to doctor', 'error');
    } finally {
      setSendLoading(false);
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
          <h1 className="text-2xl font-bold text-slate-900">{isDoctor ? 'My Waitlist' : 'Waitlist Management'}</h1>
          <p className="text-slate-500 text-sm mt-1">{isDoctor ? 'Patients waiting for your appointment slots' : 'Patients waiting for doctor appointment slots'}</p>
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

      {/* Filters — hidden for doctors (backend auto-scopes) */}
      {!isDoctor && (
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
      )}

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
                          {entry.status === 'waiting' && !isDoctor && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openSendModal(entry)}
                                disabled={isActioning}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                title="Send patient to doctor"
                              >
                                {isActioning ? (
                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <span className="material-symbols-outlined text-sm">send</span>
                                )}
                                Send to Doctor
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
                          {entry.status === 'waiting' && isDoctor && (
                            <span className="text-xs text-blue-600 font-medium flex items-center justify-end gap-1">
                              <span className="material-symbols-outlined text-sm">hourglass_empty</span>
                              Waiting
                            </span>
                          )}
                          {entry.status === 'booked' && (
                            <span className="text-xs text-green-600 font-medium flex items-center justify-end gap-1">
                              <span className="material-symbols-outlined text-sm">check</span>
                              Sent
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

      {/* Send to Doctor Modal */}
      {sendModalEntry && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSendModalEntry(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-xl">send</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Send to Doctor</h3>
                <p className="text-[11px] text-slate-400">Assign patient to a doctor's queue</p>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Patient info card */}
              <div className="bg-slate-50 rounded-xl p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-primary text-lg">person</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{sendModalEntry.patient_name || 'Unknown Patient'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {sendModalEntry.patient_reference_number || ''}
                    {sendModalEntry.patient_phone ? ` · ${sendModalEntry.patient_phone}` : ''}
                  </p>
                  {sendModalEntry.chief_complaint && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">medical_information</span>
                      {sendModalEntry.chief_complaint}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      (priorityBadge[sendModalEntry.priority] || priorityBadge.normal).bg
                    } ${(priorityBadge[sendModalEntry.priority] || priorityBadge.normal).text}`}>
                      {(priorityBadge[sendModalEntry.priority] || priorityBadge.normal).label}
                    </span>
                    <span className="text-[10px] text-slate-400">Position #{sendModalEntry.position}</span>
                  </div>
                </div>
              </div>

              {/* Doctor selection */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Select Doctor <span className="text-red-400">*</span></label>
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {doctors.map(doc => {
                    const isOriginal = doc.doctor_id === sendModalEntry.doctor_id;
                    const isSelected = doc.doctor_id === sendDoctorId;
                    return (
                      <button
                        key={doc.doctor_id}
                        onClick={() => setSendDoctorId(doc.doctor_id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                          isSelected
                            ? 'bg-primary/5 border-primary ring-1 ring-primary/20'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'
                        }`}>
                          <span className="material-symbols-outlined text-base">
                            {isSelected ? 'check' : 'stethoscope'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-slate-700'}`}>
                              {doc.name}
                            </p>
                            {isOriginal && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-600 flex-shrink-0">
                                ASSIGNED
                              </span>
                            )}
                          </div>
                          {doc.specialization && (
                            <p className="text-xs text-slate-400 truncate">{doc.specialization}</p>
                          )}
                        </div>
                        {isSelected && (
                          <span className="material-symbols-outlined text-primary text-lg flex-shrink-0">radio_button_checked</span>
                        )}
                        {!isSelected && (
                          <span className="material-symbols-outlined text-slate-300 text-lg flex-shrink-0">radio_button_unchecked</span>
                        )}
                      </button>
                    );
                  })}
                  {doctors.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No doctors available</p>
                  )}
                </div>
              </div>

              {/* Reassignment notice */}
              {sendDoctorId && sendDoctorId !== sendModalEntry.doctor_id && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-lg mt-0.5">swap_horiz</span>
                  <div>
                    <p className="text-[11px] font-semibold text-amber-700">Doctor Reassignment</p>
                    <p className="text-[11px] text-amber-600 mt-0.5">
                      Patient will be sent to <strong>{doctors.find(d => d.doctor_id === sendDoctorId)?.name}</strong> instead of <strong>{sendModalEntry.doctor_name}</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setSendModalEntry(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSendToDoctor}
                disabled={!sendDoctorId || sendLoading}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-40"
              >
                {sendLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-base">send</span>
                )}
                Send to Doctor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaitlistManagement;
