import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import appointmentService from '../services/appointmentService';
import AppointmentStatusBadge from '../components/appointments/AppointmentStatusBadge';
import type { Appointment } from '../types/appointment';

const DoctorAppointments: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [notesModal, setNotesModal] = useState<{ id: string; notes: string } | null>(null);

  const fetchAppointments = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await appointmentService.getDoctorToday(user.id);
      setAppointments(data);
    } catch {
      toast.error('Failed to load appointments');
    }
    setLoading(false);
  }, [user?.id, selectedDate]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  const filtered = statusFilter
    ? appointments.filter(a => a.status === statusFilter)
    : appointments;

  const stats = {
    total: appointments.length,
    pending: appointments.filter(a => a.status === 'pending' || a.status === 'confirmed').length,
    inProgress: appointments.filter(a => a.status === 'in-progress').length,
    completed: appointments.filter(a => a.status === 'completed').length,
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await appointmentService.updateStatus(id, status);
      toast.success(`Status updated to ${status}`);
      fetchAppointments();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update');
    }
  };

  const handleSaveNotes = async () => {
    if (!notesModal) return;
    try {
      await appointmentService.updateAppointment(notesModal.id, { doctor_notes: notesModal.notes });
      toast.success('Notes saved');
      setNotesModal(null);
      fetchAppointments();
    } catch {
      toast.error('Failed to save notes');
    }
  };

  const formatTime = (t?: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Schedule</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your daily appointments</p>
        </div>
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: stats.total, icon: 'calendar_month', color: 'text-slate-500' },
          { label: 'Pending', value: stats.pending, icon: 'pending_actions', color: 'text-amber-500' },
          { label: 'In Progress', value: stats.inProgress, icon: 'clinical_notes', color: 'text-purple-500' },
          { label: 'Completed', value: stats.completed, icon: 'task_alt', color: 'text-emerald-500' },
        ].map(s => (
          <div key={s.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</span>
              <span className={`material-symbols-outlined ${s.color}`}>{s.icon}</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'pending', 'confirmed', 'in-progress', 'completed', 'no-show'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors capitalize ${statusFilter === s ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Appointments List */}
      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
          <span className="material-symbols-outlined text-5xl mb-3 block">event_available</span>
          <p className="text-sm font-medium">No appointments for {new Date(selectedDate).toLocaleDateString('en-US', { day_of_week: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(appt => (
            <div key={appt.id} className={`bg-white rounded-xl border p-5 transition-shadow hover:shadow-sm ${appt.status === 'in-progress' ? 'border-purple-200 ring-1 ring-purple-100' : 'border-slate-200'}`}>
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Time Block */}
                <div className="flex-shrink-0 w-24">
                  <p className="text-lg font-bold text-slate-900">{formatTime(appt.start_time || undefined)}</p>
                  <p className="text-xs text-slate-400">{appt.visit_type}</p>
                </div>
                {/* Patient Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-900">{appt.patient_name || 'Unknown Patient'}</span>
                    <AppointmentStatusBadge status={appt.status} />
                    {appt.appointment_type === 'walk-in' && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full">Walk-in</span>
                    )}
                    {appt.priority && appt.priority !== 'routine' && (
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${appt.priority === 'emergency' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{appt.priority}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{appt.appointment_id} · {appt.visit_type || 'General'}</p>
                  {appt.chief_complaint && <p className="text-xs text-slate-400 mt-1">{appt.chief_complaint}</p>}
                  {appt.doctor_notes && <p className="text-xs text-blue-500 mt-1 italic"><span className="material-symbols-outlined text-xs align-text-bottom mr-0.5">note</span>{appt.doctor_notes}</p>}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setNotesModal({ id: appt.id, notes: appt.doctor_notes || '' })}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors" title="Add Notes">
                    <span className="material-symbols-outlined text-lg">edit_note</span>
                  </button>
                  {(appt.status === 'pending' || appt.status === 'confirmed') && (
                    <button onClick={() => handleStatusChange(appt.id, 'in-progress')}
                      className="px-3 py-1.5 text-xs font-semibold text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                      Start
                    </button>
                  )}
                  {appt.status === 'in-progress' && (
                    <button onClick={() => handleStatusChange(appt.id, 'completed')}
                      className="px-3 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
                      Complete
                    </button>
                  )}
                  {appt.status !== 'completed' && appt.status !== 'cancelled' && appt.status !== 'no-show' && (
                    <button onClick={() => handleStatusChange(appt.id, 'no-show')}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-500 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      No Show
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notes Modal */}
      {notesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setNotesModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Appointment Notes</h3>
            <textarea value={notesModal.notes} onChange={(e) => setNotesModal({ ...notesModal, notes: e.target.value })}
              rows={5} placeholder="Enter clinical notes, observations..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setNotesModal(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSaveNotes} className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm">Save Notes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorAppointments;
