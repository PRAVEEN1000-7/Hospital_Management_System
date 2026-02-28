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
  const isAdmin = user?.roles?.includes('admin') || user?.roles?.includes('super_admin');
  const isDoctor = user?.roles?.includes('doctor');

  const [queueData, setQueueData] = useState<QueueStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [filterDoctor, setFilterDoctor] = useState<string>('');
  const [assignModalId, setAssignModalId] = useState<string | null>(null);
  const [assignDoctorId, setAssignDoctorId] = useState<string>('');

  const fetchQueue = useCallback(async () => {
    try {
      const docId = isDoctor ? String(user?.id) : (filterDoctor || undefined);
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
      await walkInService.assignDoctor(assignModalId, assignDoctorId);
      toast.success('Doctor assigned');
      setAssignModalId(null);
      setAssignDoctorId('');
      fetchQueue();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to assign');
    }
  };

  const handleCallNext = async (id: string) => {
    try {
      await appointmentService.updateStatus(id, 'in-progress');
      toast.success('Patient called');
      fetchQueue();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleComplete = async (id: string) => {
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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'In Queue', value: queueData.total_in_queue, icon: 'hourglass_top', color: 'text-amber-500' },
            { label: 'Current Position', value: queueData.current_position, icon: 'pending', color: 'text-purple-500' },
            { label: 'Items', value: queueData.items?.length || 0, icon: 'groups', color: 'text-blue-500' },
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
            {doctors.map(d => <option key={d.doctor_id} value={d.doctor_id}>{d.name}</option>)}
          </select>
        </div>
      )}

      {/* Queue Table */}
      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : !queueData || !queueData.items || queueData.items.length === 0 ? (
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
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Position</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Called At</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queueData.items.map((item) => (
                  <tr key={item.queue_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <span className="font-bold text-primary">{item.queue_number}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{item.patient_name || '—'}</td>
                    <td className="px-4 py-3">
                      <QueueStatusBadge position={item.position} />
                    </td>
                    <td className="px-4 py-3"><AppointmentStatusBadge status={item.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.called_at || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(isDoctor || isAdmin) && item.status !== 'in-progress' && (
                          <button onClick={() => handleCallNext(item.appointment_id)}
                            className="p-1.5 text-purple-500 hover:bg-purple-50 rounded-lg transition-colors" title="Call Patient">
                            <span className="material-symbols-outlined text-lg">campaign</span>
                          </button>
                        )}
                        {(isDoctor || isAdmin) && item.status === 'in-progress' && (
                          <button onClick={() => handleComplete(item.appointment_id)}
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
            <select value={assignDoctorId} onChange={(e) => setAssignDoctorId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
              <option value="">Select doctor...</option>
              {doctors.map(d => <option key={d.doctor_id} value={d.doctor_id}>{d.name}</option>)}
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
