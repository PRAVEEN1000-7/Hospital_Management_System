import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import walkInService from '../services/walkInService';
import type { UnassignedWalkIn } from '../services/walkInService';
import scheduleService from '../services/scheduleService';
import type { QueueStatus as QueueStatusType, QueueItem, DoctorOption } from '../types/appointment';

// ── Priority helpers ───────────────────────────────────────────────
const PRIORITY_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  emergency: { label: 'Emergency', bg: 'bg-red-50',    text: 'text-red-700',    icon: 'emergency' },
  urgent:    { label: 'Urgent',    bg: 'bg-amber-50',  text: 'text-amber-700',  icon: 'priority_high' },
  normal:    { label: 'Normal',    bg: 'bg-slate-100',  text: 'text-slate-600',  icon: 'schedule' },
};

const QUEUE_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  waiting:          { label: 'Waiting',         bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  called:           { label: 'Called',           bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  in_consultation:  { label: 'In Consultation',  bg: 'bg-purple-50',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  completed:        { label: 'Completed',        bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  skipped:          { label: 'Skipped',          bg: 'bg-slate-100',  text: 'text-slate-500',   dot: 'bg-slate-400' },
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

// ── Main Component ─────────────────────────────────────────────────
const WalkInQueue: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const roles = user?.roles || [];
  const isDoctor = roles.includes('doctor');
  const isReception = roles.includes('receptionist');
  const isAdmin = roles.includes('admin') || roles.includes('super_admin');
  const canFilter = isReception || isAdmin;
  const canActOnQueue = isDoctor;  // Only doctors can perform clinical actions

  const [queueData, setQueueData] = useState<QueueStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [filterDoctor, setFilterDoctor] = useState<string>('');
  const [sendModalId, setSendModalId] = useState<string | null>(null);
  const [sendModalPatientName, setSendModalPatientName] = useState<string>('');
  const [sendDoctorId, setSendDoctorId] = useState<string>('');
  const [doctorLoads, setDoctorLoads] = useState<Record<string, number>>({});
  const [sendingInProgress, setSendingInProgress] = useState(false);
  const [detailItem, setDetailItem] = useState<QueueItem | null>(null);
  const [unassigned, setUnassigned] = useState<UnassignedWalkIn[]>([]);

  // ── Fetch unassigned walk-ins (reception/admin only) ──────────
  const fetchUnassigned = useCallback(async () => {
    if (!canFilter) return;
    try {
      const data = await walkInService.getUnassigned();
      setUnassigned(data.items);
    } catch { /* silent */ }
  }, [canFilter]);

  // ── Fetch queue ────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    try {
      // Doctor: backend auto-filters, no doctor_id needed
      // Reception/Admin: pass selected doctor filter
      const docId = isDoctor ? undefined : (filterDoctor || undefined);
      const data = await walkInService.getQueueStatus(docId);
      setQueueData(data);
    } catch {
      toast.error('Failed to load queue');
    }
    setLoading(false);
  }, [filterDoctor, isDoctor]);

  // Load doctor list for filter dropdown and send modal (reception/admin only)
  useEffect(() => {
    if (canFilter) {
      scheduleService.getDoctors().then(setDoctors).catch(() => {});
      walkInService.getDoctorLoads().then(setDoctorLoads).catch(() => {});
      fetchUnassigned();
    }
  }, [canFilter, fetchUnassigned]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // Auto-refresh every 15s
  useEffect(() => {
    const timer = setInterval(() => { fetchQueue(); fetchUnassigned(); }, 15000);
    return () => clearInterval(timer);
  }, [fetchQueue, fetchUnassigned]);

  // ── Queue actions ──────────────────────────────────────────────
  const handleCall = async (queueId: string) => {
    try {
      await walkInService.callPatient(queueId);
      toast.success('Patient called');
      fetchQueue();
    } catch { toast.error('Failed to call patient'); }
  };

  const handleStartConsultation = async (queueId: string) => {
    try {
      await walkInService.startConsultation(queueId);
      toast.success('Consultation started');
      fetchQueue();
    } catch { toast.error('Failed to start consultation'); }
  };

  const handleComplete = async (queueId: string) => {
    try {
      await walkInService.completePatient(queueId);
      toast.success('Consultation completed');
      fetchQueue();
    } catch { toast.error('Failed to complete'); }
  };

  const handleSkip = async (queueId: string) => {
    try {
      await walkInService.skipPatient(queueId);
      toast.success('Patient skipped');
      fetchQueue();
    } catch { toast.error('Failed to skip'); }
  };

  const handleSendToDoctor = async () => {
    if (!sendModalId || !sendDoctorId) return;
    setSendingInProgress(true);
    try {
      const result = await walkInService.sendToDoctor(sendModalId, sendDoctorId);
      const docName = doctors.find(d => d.doctor_id === sendDoctorId)?.name || 'doctor';
      const token = (result as any).queue_number;
      toast.success(`Patient sent to ${docName}'s queue${token ? ` (Token #${token})` : ''}`);
      setSendModalId(null);
      setSendDoctorId('');
      setSendModalPatientName('');
      // Refresh doctor loads + queue + unassigned
      walkInService.getDoctorLoads().then(setDoctorLoads).catch(() => {});
      fetchQueue();
      fetchUnassigned();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to send patient');
    }
    setSendingInProgress(false);
  };

  // ── Derived data ───────────────────────────────────────────────
  const activeItems = (queueData?.items || []).filter(
    i => !['completed', 'skipped'].includes(i.status),
  );
  const completedItems = (queueData?.items || []).filter(
    i => ['completed', 'skipped'].includes(i.status),
  );
  // Always show active items first, then completed/skipped at the bottom
  const displayItems = [...activeItems, ...completedItems];

  /** Check if an item was completed within the last 60 seconds */
  const isRecentlyCompleted = (item: QueueItem): boolean => {
    if (item.status !== 'completed' || !item.consultation_end_at) return false;
    return Date.now() - new Date(item.consultation_end_at).getTime() < 60000;
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isDoctor ? 'My Queue' : 'Walk-in Queue'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isDoctor
              ? 'Patients waiting for your consultation — sorted by urgency'
              : 'Real-time walk-in queue — sorted by urgency (auto-refreshes every 15s)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); fetchQueue(); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-lg">refresh</span> Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {queueData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'In Queue', value: queueData.total_waiting, icon: 'hourglass_top', color: 'text-amber-500', bg: 'bg-amber-50' },
            { label: 'In Progress', value: queueData.total_in_progress, icon: 'clinical_notes', color: 'text-purple-500', bg: 'bg-purple-50' },
            { label: 'Completed', value: queueData.total_completed, icon: 'task_alt', color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: 'Total Active', value: activeItems.length, icon: 'groups', color: 'text-blue-500', bg: 'bg-blue-50' },
          ].map(s => (
            <div key={s.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</span>
                <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center`}>
                  <span className={`material-symbols-outlined text-lg ${s.color}`}>{s.icon}</span>
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        {canFilter && (
          <select value={filterDoctor} onChange={(e) => { setFilterDoctor(e.target.value); setLoading(true); }}
            className="w-full sm:w-72 px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
            <option value="">All Doctors</option>
            {doctors.map(d => (
              <option key={d.doctor_id} value={d.doctor_id}>
                {d.name}{d.specialization ? ` — ${d.specialization}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Unassigned Walk-ins — reception/admin only */}
      {canFilter && unassigned.length > 0 && (
        <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-orange-500">warning</span>
            <h3 className="text-sm font-bold text-orange-800">
              Unassigned Patients ({unassigned.length})
            </h3>
            <span className="text-xs text-orange-600">— No doctor assigned yet, route them to a queue</span>
          </div>
          <div className="space-y-2">
            {unassigned.map(item => {
              const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
              return (
                <div key={item.appointment_id}
                  className={`flex items-center justify-between gap-3 bg-white rounded-lg border border-orange-100 px-4 py-3 ${
                    item.priority === 'emergency' ? 'ring-1 ring-red-200' :
                    item.priority === 'urgent' ? 'ring-1 ring-amber-200' : ''
                  }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-500">
                      {(item.patient_name || '?').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {item.patient_name || 'Unknown Patient'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.patient_reference_number && (
                          <span className="text-[10px] font-mono text-slate-400">PRN: {item.patient_reference_number}</span>
                        )}
                        {item.patient_gender && (
                          <span className="text-[10px] text-slate-400 capitalize">{item.patient_gender}</span>
                        )}
                        {item.patient_age != null && (
                          <span className="text-[10px] text-slate-400">{item.patient_age}y</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.bg} ${pri.text}`}>
                      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>{pri.icon}</span>
                      {pri.label}
                    </span>
                    {item.chief_complaint && (
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={item.chief_complaint}>
                        {item.chief_complaint}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">{timeAgo(item.check_in_at)}</span>
                    <button
                      onClick={() => { setSendModalId(item.appointment_id); setSendDoctorId(''); setSendModalPatientName(item.patient_name || 'Patient'); }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors shadow-sm">
                      <span className="material-symbols-outlined text-sm">send</span>
                      Send to Doctor
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Queue Table */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
        </div>
      ) : displayItems.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
          <span className="material-symbols-outlined text-5xl mb-3 block">groups</span>
          <p className="text-sm font-medium">No patients in queue</p>
          <p className="text-xs mt-1">Walk-in patients will appear here automatically</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-20">Token</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patient</th>
                  {!isDoctor && (
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Doctor</th>
                  )}
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Urgency</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Complaint</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Wait Time</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item) => {
                  const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                  const qs = QUEUE_STATUS_CONFIG[item.status] || QUEUE_STATUS_CONFIG.waiting;
                  const isActive = !['completed', 'skipped'].includes(item.status);
                  const recentComplete = isRecentlyCompleted(item);
                  return (
                    <tr key={item.queue_id}
                      className={`border-b border-slate-100 transition-colors ${
                        recentComplete ? 'bg-emerald-50/50 animate-pulse' :
                        item.priority === 'emergency' ? 'bg-red-50/30' :
                        item.priority === 'urgent' ? 'bg-amber-50/20' : ''
                      } ${!isActive && !recentComplete ? 'opacity-50' : 'hover:bg-slate-50/50'}`}>
                      {/* Token / Queue Number */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-sm font-bold
                          ${item.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                            item.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                            'bg-primary/10 text-primary'}`}>
                          {item.queue_number}
                        </span>
                      </td>

                      {/* Patient */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDetailItem(item)}
                          className="text-left hover:bg-slate-50 rounded-lg -m-1 p-1 transition-colors group"
                        >
                          <p className="font-semibold text-slate-900 group-hover:text-primary transition-colors">
                            {item.patient_name || '—'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.patient_reference_number && (
                              <span className="text-[10px] font-mono text-slate-400">
                                PRN: {item.patient_reference_number}
                              </span>
                            )}
                            {item.patient_gender && (
                              <span className="text-[10px] text-slate-400 capitalize">{item.patient_gender}</span>
                            )}
                            {item.patient_age != null && (
                              <span className="text-[10px] text-slate-400">{item.patient_age}y</span>
                            )}
                          </div>
                        </button>
                      </td>

                      {/* Doctor (hidden for doctor view) */}
                      {!isDoctor && (
                        <td className="px-4 py-3">
                          <p className="text-slate-700 text-xs font-medium">{item.doctor_name || '—'}</p>
                        </td>
                      )}

                      {/* Urgency Badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${pri.bg} ${pri.text}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{pri.icon}</span>
                          {pri.label}
                        </span>
                      </td>

                      {/* Complaint */}
                      <td className="px-4 py-3">
                        <p className="text-slate-500 text-xs truncate max-w-[180px]" title={item.chief_complaint || ''}>
                          {item.chief_complaint || '—'}
                        </p>
                      </td>

                      {/* Queue Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${qs.bg} ${qs.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${qs.dot}`}></span>
                          {qs.label}
                        </span>
                      </td>

                      {/* Wait Time */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-500">{timeAgo(item.check_in_at)}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* 1. Call Patient: waiting → called */}
                          {canActOnQueue && item.status === 'waiting' && (
                            <button onClick={() => handleCall(item.queue_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors" title="Call Patient">
                              <span className="material-symbols-outlined text-sm">campaign</span>
                              Call
                            </button>
                          )}
                          {/* 2. Start Consultation: called → in_consultation */}
                          {canActOnQueue && item.status === 'called' && (
                            <button onClick={() => handleStartConsultation(item.queue_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors" title="Start Consultation">
                              <span className="material-symbols-outlined text-sm">clinical_notes</span>
                              Start
                            </button>
                          )}
                          {/* 3. Complete: in_consultation → completed */}
                          {canActOnQueue && item.status === 'in_consultation' && (
                            <button onClick={() => handleComplete(item.queue_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors" title="Mark Complete">
                              <span className="material-symbols-outlined text-sm">task_alt</span>
                              Done
                            </button>
                          )}
                          {/* Skip: available for waiting/called/in_consultation */}
                          {canActOnQueue && ['waiting', 'called', 'in_consultation'].includes(item.status) && (
                            <button onClick={() => handleSkip(item.queue_id)}
                              className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors" title="Skip (No Show)">
                              <span className="material-symbols-outlined text-lg">person_off</span>
                            </button>
                          )}
                          {/* Send / Reassign to Doctor: for reception/admin on waiting items */}
                          {canFilter && item.status === 'waiting' && (
                            <button onClick={() => {
                              if (item.doctor_id) {
                                if (!window.confirm(`This patient is already assigned to ${item.doctor_name || 'a doctor'}. Reassign to a different doctor?`)) return;
                              }
                              setSendModalId(item.appointment_id);
                              setSendDoctorId(item.doctor_id || '');
                              setSendModalPatientName(item.patient_name || 'Patient');
                            }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                                item.doctor_id
                                  ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                                  : 'text-orange-600 bg-orange-50 hover:bg-orange-100'
                              }`} title={item.doctor_id ? 'Reassign to Different Doctor' : 'Send to Doctor'}>
                              <span className="material-symbols-outlined text-sm">{item.doctor_id ? 'swap_horiz' : 'send'}</span>
                              {item.doctor_id ? 'Reassign' : 'Send'}
                            </button>
                          )}
                          {/* View Details button for any item */}
                          <button onClick={() => setDetailItem(item)}
                            className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors" title="View Patient Details">
                            <span className="material-symbols-outlined text-lg">visibility</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Send to Doctor Modal */}
      {sendModalId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSendModalId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-orange-500">send</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Send to Doctor</h3>
                <p className="text-xs text-slate-500">Route <strong>{sendModalPatientName}</strong> to a doctor's queue</p>
              </div>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {doctors.map(d => {
                const waitCount = doctorLoads[d.doctor_id] || 0;
                const isSelected = sendDoctorId === d.doctor_id;
                return (
                  <button key={d.doctor_id} onClick={() => setSendDoctorId(d.doctor_id)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left transition-all border ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                    }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                        isSelected ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {d.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-slate-900'}`}>{d.name}</p>
                        {d.specialization && <p className="text-[10px] text-slate-400 truncate">{d.specialization}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        waitCount === 0 ? 'bg-emerald-50 text-emerald-600' :
                        waitCount <= 3 ? 'bg-amber-50 text-amber-600' :
                        'bg-red-50 text-red-600'
                      }`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>groups</span>
                        {waitCount} waiting
                      </span>
                      {isSelected && <span className="material-symbols-outlined text-primary text-lg">check_circle</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setSendModalId(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSendToDoctor} disabled={!sendDoctorId || sendingInProgress}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 shadow-sm">
                <span className="material-symbols-outlined text-base">send</span>
                {sendingInProgress ? 'Sending...' : 'Send to Doctor'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Patient Detail Modal */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetailItem(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-2xl">person</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-900 truncate">{detailItem.patient_name || 'Unknown Patient'}</h3>
                {detailItem.patient_reference_number && (
                  <p className="text-xs text-slate-400 font-mono">MRN: {detailItem.patient_reference_number}</p>
                )}
              </div>
              <button onClick={() => setDetailItem(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Patient Info Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gender</p>
                <p className="text-sm font-semibold text-slate-800 capitalize">{detailItem.patient_gender || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Age</p>
                <p className="text-sm font-semibold text-slate-800">
                  {detailItem.patient_age != null ? `${detailItem.patient_age} years` : '—'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date of Birth</p>
                <p className="text-sm font-semibold text-slate-800">
                  {detailItem.patient_date_of_birth
                    ? new Date(detailItem.patient_date_of_birth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Blood Group</p>
                <p className="text-sm font-semibold text-slate-800">{detailItem.patient_blood_group || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Phone</p>
                <p className="text-sm font-semibold text-slate-800">{detailItem.patient_phone || '—'}</p>
              </div>
            </div>

            {/* Queue / Appointment Info */}
            <div className="border-t border-slate-100 pt-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Queue Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-slate-400">confirmation_number</span>
                  <div>
                    <p className="text-[10px] text-slate-400">Token</p>
                    <p className="text-sm font-bold text-slate-800">#{detailItem.queue_number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-slate-400">priority_high</span>
                  <div>
                    <p className="text-[10px] text-slate-400">Priority</p>
                    <p className={`text-sm font-bold capitalize ${
                      detailItem.priority === 'emergency' ? 'text-red-600' :
                      detailItem.priority === 'urgent' ? 'text-amber-600' : 'text-slate-800'
                    }`}>{detailItem.priority}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-slate-400">schedule</span>
                  <div>
                    <p className="text-[10px] text-slate-400">Check-in</p>
                    <p className="text-sm font-semibold text-slate-800">{timeAgo(detailItem.check_in_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-slate-400">info</span>
                  <div>
                    <p className="text-[10px] text-slate-400">Status</p>
                    <p className="text-sm font-semibold text-slate-800 capitalize">{detailItem.status.replace('_', ' ')}</p>
                  </div>
                </div>
              </div>
              {detailItem.chief_complaint && (
                <div className="mt-3 bg-amber-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Chief Complaint</p>
                  <p className="text-sm text-amber-900">{detailItem.chief_complaint}</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
              {canActOnQueue && detailItem.status === 'waiting' && (
                <button onClick={() => { handleCall(detailItem.queue_id); setDetailItem(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-base">campaign</span> Call Patient
                </button>
              )}
              {canActOnQueue && detailItem.status === 'called' && (
                <button onClick={() => { handleStartConsultation(detailItem.queue_id); setDetailItem(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-purple-500 rounded-lg hover:bg-purple-600 shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-base">clinical_notes</span> Start Consultation
                </button>
              )}
              {canActOnQueue && detailItem.status === 'in_consultation' && (
                <button onClick={() => { handleComplete(detailItem.queue_id); setDetailItem(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-base">task_alt</span> Mark Complete
                </button>
              )}
              <button onClick={() => setDetailItem(null)}
                className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalkInQueue;
