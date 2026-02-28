import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import appointmentService from '../services/appointmentService';
import scheduleService from '../services/scheduleService';
import AppointmentStatusBadge from '../components/appointments/AppointmentStatusBadge';
import type { Appointment, AppointmentStatus, TimeSlot, DoctorOption } from '../types/appointment';

const MyAppointments: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Reschedule state
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlot[]>([]);
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  // Expanded appointment for details
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await appointmentService.getMyAppointments(1, 100);
      setAppointments(data.data);
    } catch {
      toast.error('Failed to load appointments');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  const now = new Date();
  const upcoming = appointments.filter(a => new Date(a.appointment_date + 'T' + (a.start_time || '23:59')) >= now && !['cancelled', 'completed', 'no-show'].includes(a.status));
  const past = appointments.filter(a => new Date(a.appointment_date + 'T' + (a.start_time || '23:59')) < now || ['completed', 'no-show', 'cancelled'].includes(a.status));

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

  const openReschedule = (appt: Appointment) => {
    setRescheduleId(appt.id);
    setRescheduleDate('');
    setRescheduleTime('');
    setRescheduleSlots([]);
    setRescheduleDoctorId(appt.doctor_id || null);
  };

  useEffect(() => {
    if (!rescheduleDate || !rescheduleDoctorId) { setRescheduleSlots([]); return; }
    setRescheduleLoading(true);
    scheduleService.getAvailableSlots(rescheduleDoctorId, rescheduleDate)
      .then(setRescheduleSlots)
      .catch(() => setRescheduleSlots([]))
      .finally(() => setRescheduleLoading(false));
  }, [rescheduleDate, rescheduleDoctorId]);

  const handleReschedule = async () => {
    if (!rescheduleId || !rescheduleDate || !rescheduleTime) return;
    try {
      await appointmentService.rescheduleAppointment(rescheduleId, rescheduleDate, rescheduleTime);
      toast.success('Appointment rescheduled');
      setRescheduleId(null);
      fetchAppointments();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to reschedule');
    }
  };

  const handleDownloadPdf = async (id: number) => {
    try {
      const html = await appointmentService.getAppointmentPdfUrl(id);
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); }
    } catch {
      toast.error('Failed to generate document');
    }
  };

  const displayList = activeTab === 'upcoming' ? upcoming : past;

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { day_of_week: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (t?: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">My Appointments</h1>
        <p className="text-slate-500 text-sm mt-1">View and manage your appointments</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-6">
        {(['upcoming', 'past'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors capitalize ${activeTab === tab ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {tab} ({tab === 'upcoming' ? upcoming.length : past.length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : displayList.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
          <span className="material-symbols-outlined text-5xl mb-3 block">event_busy</span>
          <p className="text-sm font-medium">No {activeTab} appointments</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayList.map(appt => (
            <div key={appt.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Date Block */}
                <div className="flex-shrink-0 w-16 h-16 bg-primary/5 rounded-xl flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-primary uppercase">{new Date(appt.appointment_date).toLocaleDateString('en-US', { month: 'short' })}</span>
                  <span className="text-xl font-bold text-primary">{new Date(appt.appointment_date).getDate()}</span>
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-900">{appt.appointment_id}</span>
                    <AppointmentStatusBadge status={appt.status} />
                    {appt.appointment_type === 'walk-in' && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full">Walk-in</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">
                    <span className="material-symbols-outlined text-sm align-text-bottom mr-1">person</span>
                    Dr. {appt.doctor_name || 'TBA'}
                    <span className="mx-2 text-slate-300">|</span>
                    <span className="material-symbols-outlined text-sm align-text-bottom mr-1">schedule</span>
                    {formatTime(appt.start_time || undefined)}
                  </p>
                  {appt.chief_complaint && <p className="text-xs text-slate-400 mt-1 truncate">{appt.chief_complaint}</p>}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* PDF Download - always available */}
                  <button onClick={() => handleDownloadPdf(appt.id)}
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors" title="Print / Download">
                    <span className="material-symbols-outlined text-lg">print</span>
                  </button>
                  {/* Expand details */}
                  <button onClick={() => setExpandedId(expandedId === appt.id ? null : appt.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors" title="Details">
                    <span className="material-symbols-outlined text-lg">{expandedId === appt.id ? 'expand_less' : 'expand_more'}</span>
                  </button>
                  {activeTab === 'upcoming' && appt.status !== 'cancelled' && (
                    <>
                      <button onClick={() => openReschedule(appt)}
                        className="px-3 py-1.5 text-xs font-semibold text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors">
                        Reschedule
                      </button>
                      <button onClick={() => { setCancelId(appt.id); setCancelReason(''); }}
                        className="px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
              {/* Expanded Details */}
              {expandedId === appt.id && (
                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {appt.doctor_notes && (
                    <div className="bg-blue-50/50 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Doctor Notes</p>
                      <p className="text-xs text-slate-700">{appt.doctor_notes}</p>
                    </div>
                  )}
                  {appt.diagnosis && (
                    <div className="bg-emerald-50/50 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">Diagnosis</p>
                      <p className="text-xs text-slate-700">{appt.diagnosis}</p>
                    </div>
                  )}
                  {appt.prescription && (
                    <div className="bg-purple-50/50 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">Prescription</p>
                      <p className="text-xs text-slate-700">{appt.prescription}</p>
                    </div>
                  )}
                  {!appt.doctor_notes && !appt.diagnosis && !appt.prescription && (
                    <p className="text-xs text-slate-400 italic col-span-3">No clinical notes available</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setRescheduleId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Reschedule Appointment</h3>
            <p className="text-sm text-slate-500 mb-4">Pick a new date and time.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">New Date</label>
                <input type="date" value={rescheduleDate} min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => { setRescheduleDate(e.target.value); setRescheduleTime(''); }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              {rescheduleDate && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Available Slots</label>
                  {rescheduleLoading ? (
                    <p className="text-xs text-slate-400">Loading slots...</p>
                  ) : rescheduleSlots.length === 0 ? (
                    <p className="text-xs text-slate-400">No slots available on this date</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                      {rescheduleSlots.filter(s => s.is_available).map(s => (
                        <button key={s.start_time} onClick={() => setRescheduleTime(s.start_time)}
                          className={`px-2 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            rescheduleTime === s.start_time ? 'bg-primary text-white border-primary' : 'border-slate-200 text-slate-600 hover:border-primary'
                          }`}>
                          {(() => { const [h, m] = s.start_time.split(':').map(Number); return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; })()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setRescheduleId(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleReschedule} disabled={!rescheduleDate || !rescheduleTime}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm disabled:opacity-50">Reschedule</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCancelId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Cancel Appointment</h3>
            <p className="text-sm text-slate-500 mb-4">Are you sure you want to cancel this appointment?</p>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} placeholder="Reason (optional)"
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

export default MyAppointments;
