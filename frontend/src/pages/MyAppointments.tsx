import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import appointmentService from '../services/appointmentService';
import AppointmentStatusBadge from '../components/appointments/AppointmentStatusBadge';
import type { Appointment, AppointmentStatus } from '../types/appointment';

const MyAppointments: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');

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
  const upcoming = appointments.filter(a => new Date(a.appointment_date + 'T' + (a.appointment_time || '23:59')) >= now && !['cancelled', 'completed', 'no-show'].includes(a.status));
  const past = appointments.filter(a => new Date(a.appointment_date + 'T' + (a.appointment_time || '23:59')) < now || ['completed', 'no-show', 'cancelled'].includes(a.status));

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

  const displayList = activeTab === 'upcoming' ? upcoming : past;

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
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
                    <span className="font-bold text-slate-900">{appt.appointment_number}</span>
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
                    {formatTime(appt.appointment_time || undefined)}
                  </p>
                  {appt.reason_for_visit && <p className="text-xs text-slate-400 mt-1 truncate">{appt.reason_for_visit}</p>}
                </div>
                {/* Actions */}
                {activeTab === 'upcoming' && appt.status !== 'cancelled' && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setCancelId(appt.id); setCancelReason(''); }}
                      className="px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
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
