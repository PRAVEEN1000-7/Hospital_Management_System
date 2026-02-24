import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import appointmentService from '../services/appointmentService';
import scheduleService from '../services/scheduleService';
import AppointmentStatusBadge from '../components/appointments/AppointmentStatusBadge';
import type { Appointment, DoctorOption, AppointmentStatus } from '../types/appointment';

const AppointmentManagement: React.FC = () => {
  const toast = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterDoctor, setFilterDoctor] = useState<number | ''>('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const limit = 15;

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await appointmentService.getAppointments(page, limit, {
        ...(search && { search }),
        ...(filterDoctor && { doctor_id: Number(filterDoctor) }),
        ...(filterDate && { date_from: filterDate, date_to: filterDate }),
        ...(filterStatus && { status: filterStatus }),
        ...(filterType && { appointment_type: filterType }),
      });
      setAppointments(data.data);
      setTotalPages(data.total_pages);
    } catch {
      toast.error('Failed to load appointments');
    }
    setLoading(false);
  }, [page, search, filterDoctor, filterDate, filterStatus, filterType]);

  useEffect(() => { scheduleService.getDoctors().then(setDoctors).catch(() => {}); }, []);
  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  const handleSearch = () => { setPage(1); setSearch(searchInput); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await appointmentService.updateStatus(id, status);
      toast.success(`Status updated`);
      fetchAppointments();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update');
    }
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    try {
      await appointmentService.cancelAppointment(cancelId, cancelReason || undefined);
      toast.success('Appointment cancelled');
      setCancelId(null);
      setCancelReason('');
      fetchAppointments();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to cancel');
    }
  };

  const formatTime = (t?: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  const statuses: AppointmentStatus[] = ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show', 'rescheduled'];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Appointment Management</h1>
        <p className="text-slate-500 text-sm mt-1">View and manage all appointments</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Search patient or appointment #..." className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
          </div>
          <select value={filterDoctor} onChange={(e) => { setFilterDoctor(e.target.value as any); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
            <option value="">All Doctors</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
            <option value="">All Statuses</option>
            {statuses.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
        </div>
        <div className="flex gap-2 mt-3">
          <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
            <option value="">All Types</option>
            <option value="scheduled">Scheduled</option>
            <option value="walk-in">Walk-in</option>
          </select>
          <button onClick={handleSearch} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 shadow-sm">Search</button>
          <button onClick={() => { setSearchInput(''); setSearch(''); setFilterDoctor(''); setFilterDate(''); setFilterStatus(''); setFilterType(''); setPage(1); }}
            className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Clear</button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
          <span className="material-symbols-outlined text-5xl mb-3 block">event_busy</span>
          <p className="text-sm font-medium">No appointments found</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Appointment #', 'Patient', 'Doctor', 'Date & Time', 'Type', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appointments.map(appt => (
                    <tr key={appt.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-primary">{appt.appointment_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{appt.patient_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{appt.doctor_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(appt.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        <span className="text-slate-300 mx-1">·</span>
                        {formatTime(appt.appointment_time || undefined)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${appt.appointment_type === 'walk-in' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                          {appt.appointment_type}
                        </span>
                      </td>
                      <td className="px-4 py-3"><AppointmentStatusBadge status={appt.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDetailAppt(appt)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg" title="View">
                            <span className="material-symbols-outlined text-lg">visibility</span>
                          </button>
                          {appt.status !== 'cancelled' && appt.status !== 'completed' && (
                            <>
                              {appt.status !== 'in-progress' && (
                                <button onClick={() => handleStatusChange(appt.id, 'confirmed')} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Confirm">
                                  <span className="material-symbols-outlined text-lg">check_circle</span>
                                </button>
                              )}
                              <button onClick={() => { setCancelId(appt.id); setCancelReason(''); }} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancel">
                                <span className="material-symbols-outlined text-lg">cancel</span>
                              </button>
                            </>
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

      {/* Detail Modal */}
      {detailAppt && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetailAppt(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Appointment Details</h3>
              <button onClick={() => setDetailAppt(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="space-y-3 text-sm">
              {[
                ['Appointment #', detailAppt.appointment_number],
                ['Patient', detailAppt.patient_name || '—'],
                ['Doctor', detailAppt.doctor_name || '—'],
                ['Date', new Date(detailAppt.appointment_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })],
                ['Time', `${formatTime(detailAppt.appointment_time || undefined)}`],
                ['Type', detailAppt.appointment_type],
                ['Consultation', detailAppt.consultation_type || '—'],
                ['Urgency', detailAppt.urgency_level || 'routine'],
                ['Reason', detailAppt.reason_for_visit || '—'],
                ['Notes', detailAppt.doctor_notes || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <span className="text-slate-400 font-medium whitespace-nowrap">{label}</span>
                  <span className="text-slate-900 text-right">{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Status</span>
                <AppointmentStatusBadge status={detailAppt.status} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCancelId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Cancel Appointment</h3>
            <p className="text-sm text-slate-500 mb-4">This action cannot be undone.</p>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              rows={3} placeholder="Reason for cancellation..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setCancelId(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Keep</button>
              <button onClick={handleCancel} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 shadow-sm">Cancel Appointment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentManagement;
