import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import walkInService from '../services/walkInService';
import scheduleService from '../services/scheduleService';
import AppointmentStatusBadge from '../components/appointments/AppointmentStatusBadge';
import QueueStatusBadge from '../components/appointments/QueueStatusBadge';
import appointmentService from '../services/appointmentService';
import type { QueueStatus as QueueStatusType, DoctorOption } from '../types/appointment';

const WalkInQueue: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isDoctor = user?.role === 'doctor';

  const [queueData, setQueueData] = useState<QueueStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [filterDoctor, setFilterDoctor] = useState<number | ''>('');
  const [assignModalId, setAssignModalId] = useState<number | null>(null);
  const [assignDoctorId, setAssignDoctorId] = useState<number | ''>('');

  const fetchQueue = useCallback(async () => {
    try {
      const docId = isDoctor ? user?.id : (filterDoctor || undefined);
      const data = await walkInService.getQueueStatus(docId);
      setQueueData(data);
    } catch {
      toast.error('Failed to load queue');
    }
    setLoading(false);
  }, [filterDoctor, isDoctor, user?.id]);

  useEffect(() => {
    if (isAdmin) { scheduleService.getDoctors().then(setDoctors).catch(() => {}); }
  }, [isAdmin]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(fetchQueue, 30000);
    return () => clearInterval(timer);
  }, [fetchQueue]);

  const handleAssign = async () => {
    if (!assignModalId || !assignDoctorId) return;
    try {
      await walkInService.assignDoctor(assignModalId, Number(assignDoctorId));
      toast.success('Doctor assigned');
      setAssignModalId(null);
      setAssignDoctorId('');
      fetchQueue();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to assign');
    }
  };

  const handleCallNext = async (id: number) => {
    try {
      await appointmentService.updateStatus(id, 'in-progress');
      toast.success('Patient called');
      fetchQueue();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleComplete = async (id: number) => {
    try {
      await appointmentService.updateStatus(id, 'completed');
      toast.success('Consultation completed');
      fetchQueue();
    } catch {
      toast.error('Failed to complete');
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Walk-in Queue</h1>
          <p className="text-slate-500 text-sm mt-1">Real-time walk-in patient queue (auto-refreshes every 30s)</p>
        </div>
        <button onClick={() => { setLoading(true); fetchQueue(); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
          <span className="material-symbols-outlined text-lg">refresh</span> Refresh
        </button>
      </div>

      {/* Stats */}
      {queueData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Waiting', value: queueData.total_waiting, icon: 'hourglass_top', color: 'text-amber-500' },
            { label: 'In Progress', value: queueData.total_in_progress, icon: 'pending', color: 'text-purple-500' },
            { label: 'Completed Today', value: queueData.total_completed_today, icon: 'task_alt', color: 'text-emerald-500' },
            { label: 'Avg Wait', value: `${queueData.average_wait_time} min`, icon: 'timer', color: 'text-blue-500' },
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
      )}

      {/* Doctor Filter (admin) */}
      {isAdmin && (
        <div className="mb-4">
          <select value={filterDoctor} onChange={(e) => setFilterDoctor(e.target.value as any)}
            className="w-full sm:w-72 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
            <option value="">All Doctors</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
        </div>
      )}

      {/* Queue Table */}
      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : !queueData || queueData.queue.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
          <span className="material-symbols-outlined text-5xl mb-3 block">groups</span>
          <p className="text-sm font-medium">No patients in queue</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Queue #</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patient</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Doctor</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Urgency</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Wait</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queueData.queue.map((appt) => (
                  <tr key={appt.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <span className="font-bold text-primary">{appt.queue_number}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{appt.patient_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{appt.doctor_name || <span className="text-amber-500 italic text-xs">Unassigned</span>}</td>
                    <td className="px-4 py-3">
                      <QueueStatusBadge urgency={appt.urgency_level} estimatedWait={appt.estimated_wait_time} />
                    </td>
                    <td className="px-4 py-3"><AppointmentStatusBadge status={appt.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{appt.estimated_wait_time ? `~${appt.estimated_wait_time} min` : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && !appt.doctor_id && (
                          <button onClick={() => { setAssignModalId(appt.id); setAssignDoctorId(''); }}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Assign Doctor">
                            <span className="material-symbols-outlined text-lg">person_add</span>
                          </button>
                        )}
                        {(isDoctor || isAdmin) && appt.status !== 'in-progress' && (
                          <button onClick={() => handleCallNext(appt.id)}
                            className="p-1.5 text-purple-500 hover:bg-purple-50 rounded-lg transition-colors" title="Call Patient">
                            <span className="material-symbols-outlined text-lg">campaign</span>
                          </button>
                        )}
                        {(isDoctor || isAdmin) && appt.status === 'in-progress' && (
                          <button onClick={() => handleComplete(appt.id)}
                            className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors" title="Mark Complete">
                            <span className="material-symbols-outlined text-lg">task_alt</span>
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
      )}

      {/* Assign Doctor Modal */}
      {assignModalId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setAssignModalId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Assign Doctor</h3>
            <select value={assignDoctorId} onChange={(e) => setAssignDoctorId(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
              <option value="">Select doctor...</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setAssignModalId(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleAssign} disabled={!assignDoctorId}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 shadow-sm">Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalkInQueue;
