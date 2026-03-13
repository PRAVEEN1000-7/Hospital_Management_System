import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import walkInService from '../services/walkInService';
import appointmentService from '../services/appointmentService';
import type { UnassignedWalkIn } from '../services/walkInService';
import scheduleService from '../services/scheduleService';
import type { QueueStatus as QueueStatusType, QueueItem, DoctorOption, Appointment } from '../types/appointment';
import AppointmentStatusBadge from '../components/appointments/AppointmentStatusBadge';

// ── Priority helpers ───────────────────────────────────────────────
const PRIORITY_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  emergency: { label: 'Emergency', bg: 'bg-red-50',    text: 'text-red-700',    icon: 'emergency' },
  urgent:    { label: 'Urgent',    bg: 'bg-amber-50',  text: 'text-amber-700',  icon: 'priority_high' },
  normal:    { label: 'Normal',    bg: 'bg-slate-100',  text: 'text-slate-600',  icon: 'schedule' },
};

const QUEUE_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  waiting:          { label: 'Waiting',         bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  called:           { label: 'Called',           bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  sent_to_doctor:   { label: 'Sent to Doctor',  bg: 'bg-teal-50',    text: 'text-teal-700',    dot: 'bg-teal-500' },
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
  const navigate = useNavigate();

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

  // ── Doctor View: Tab + Scheduled Appointments ─────────────────
  const [activeTab, setActiveTab] = useState<'queue' | 'scheduled' | 'completed' | 'upcoming'>('queue');
  const [scheduledAppts, setScheduledAppts] = useState<Appointment[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [notesModal, setNotesModal] = useState<{ id: string; notes: string } | null>(null);

  // ── Upcoming Queue State ──────────────────────────────────────
  const [upcomingData, setUpcomingData] = useState<Awaited<ReturnType<typeof walkInService.getUpcomingQueue>> | null>(null);
  const [upcomingLoading, setUpcomingLoading] = useState(false);

  // ── Date Picker for browsing queue by date ────────────────────
  const [selectedDate, setSelectedDate] = useState<string>('');  // empty = today

  // ── Book Next Appointment Modal State ─────────────────────────
  const [bookNextItem, setBookNextItem] = useState<QueueItem | null>(null);
  const [bookNextDate, setBookNextDate] = useState<string>('');
  const [bookNextTime, setBookNextTime] = useState<string>('');
  const [bookingSaving, setBookingSaving] = useState(false);

  // ── Refer to Doctor Modal State ───────────────────────────────
  const [referItem, setReferItem] = useState<QueueItem | null>(null);
  const [referDoctorId, setReferDoctorId] = useState<string>('');
  const [referDate, setReferDate] = useState<string>('');
  const [referReason, setReferReason] = useState<string>('');
  const [referSaving, setReferSaving] = useState(false);
  const [allDoctors, setAllDoctors] = useState<DoctorOption[]>([]);
  const [referDoctorLoad, setReferDoctorLoad] = useState<number | null>(null);

  // ── Reception View: Tab for New/Ongoing/Completed/Upcoming ─────────
  const [receptionTab, setReceptionTab] = useState<'new' | 'ongoing' | 'completed' | 'upcoming'>('new');

  const fetchScheduledAppts = useCallback(async () => {
    if (!isDoctor || !user?.id) return;
    setScheduledLoading(true);
    try {
      const data = await appointmentService.getDoctorToday(user.id);
      // Filter out walk-in types since those show in the queue tab
      setScheduledAppts(data.filter(a => a.appointment_type !== 'walk-in' && (a.appointment_type as string) !== 'walk_in'));
    } catch { /* silent */ }
    setScheduledLoading(false);
  }, [isDoctor, user?.id]);

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
      const dateParam = selectedDate || undefined;
      const data = await walkInService.getQueueStatus(docId, dateParam);
      setQueueData(data);
    } catch {
      toast.error('Failed to load queue');
    }
    setLoading(false);
  }, [filterDoctor, isDoctor, selectedDate]);

  // ── Fetch upcoming queue (doctor + reception) ─────────────────────
  const fetchUpcoming = useCallback(async () => {
    setUpcomingLoading(true);
    try {
      const data = await walkInService.getUpcomingQueue(7);
      setUpcomingData(data);
    } catch { /* silent */ }
    setUpcomingLoading(false);
  }, []);

  // Load doctor list for filter dropdown and send modal (reception/admin only)
  useEffect(() => {
    if (canFilter) {
      scheduleService.getDoctors().then(setDoctors).catch(() => {});
      walkInService.getDoctorLoads().then(setDoctorLoads).catch(() => {});
      fetchUnassigned();
    }
  }, [canFilter, fetchUnassigned]);

  // Load doctor list for referral modal (doctor role)
  useEffect(() => {
    if (isDoctor) {
      scheduleService.getDoctors().then(setAllDoctors).catch(() => {});
    }
  }, [isDoctor]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // Fetch scheduled appointments for doctors
  useEffect(() => { fetchScheduledAppts(); }, [fetchScheduledAppts]);

  // Fetch upcoming when tab switches to upcoming (doctor or reception)
  useEffect(() => {
    if (activeTab === 'upcoming' || receptionTab === 'upcoming') fetchUpcoming();
  }, [activeTab, receptionTab, fetchUpcoming]);

  // Auto-refresh every 15s
  useEffect(() => {
    const timer = setInterval(() => { fetchQueue(); fetchUnassigned(); if (isDoctor) fetchScheduledAppts(); }, 15000);
    return () => clearInterval(timer);
  }, [fetchQueue, fetchUnassigned, fetchScheduledAppts, isDoctor]);

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

  // ── Book Next Appointment Handler ────────────────────────────────
  const handleBookNextAppointment = async () => {
    if (!bookNextItem || !bookNextDate || !user?.id || !bookNextItem.patient_id) return;
    setBookingSaving(true);
    try {
      await appointmentService.createAppointment({
        patient_id: bookNextItem.patient_id,
        doctor_id: user.id,
        appointment_type: 'follow-up',
        visit_type: 'scheduled',
        appointment_date: bookNextDate,
        start_time: bookNextTime || undefined,
        chief_complaint: `Follow-up: ${bookNextItem.chief_complaint || 'General'}`,
        priority: 'normal',
      });
      toast.success('Follow-up appointment booked successfully');
      setBookNextItem(null);
      setBookNextDate('');
      setBookNextTime('');
    } catch {
      toast.error('Failed to book appointment');
    }
    setBookingSaving(false);
  };

  // ── Refer to Doctor Handler ─────────────────────────────────────
  const handleReferToDoctor = async () => {
    if (!referItem || !referDoctorId || !referDate) return;
    setReferSaving(true);
    try {
      const result = await walkInService.referToDoctor({
        queue_id: referItem.queue_id,
        to_doctor_id: referDoctorId,
        referral_date: referDate,
        referral_reason: referReason || undefined,
      });
      toast.success(result.message);
      setReferItem(null);
      setReferDoctorId('');
      setReferDate('');
      setReferReason('');
      setReferDoctorLoad(null);
      fetchQueue();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to refer patient');
    }
    setReferSaving(false);
  };

  // ── Fetch doctor load for referral warning ─────────────────────
  useEffect(() => {
    if (!referDoctorId || !referDate) { setReferDoctorLoad(null); return; }
    let cancelled = false;
    walkInService.getDoctorLoads(referDate).then(loads => {
      if (cancelled) return;
      setReferDoctorLoad(loads[referDoctorId] ?? 0);
    }).catch(() => { if (!cancelled) setReferDoctorLoad(null); });
    return () => { cancelled = true; };
  }, [referDoctorId, referDate]);

  // ── Scheduled Appointment Actions (doctor view) ────────────────
  const handleScheduledStatusChange = async (id: string, newStatus: string) => {
    try {
      await appointmentService.updateStatus(id, newStatus);
      toast.success(`Status updated to ${newStatus}`);
      fetchScheduledAppts();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update');
    }
  };

  const handleSaveScheduledNotes = async () => {
    if (!notesModal) return;
    try {
      await appointmentService.updateAppointment(notesModal.id, { doctor_notes: notesModal.notes });
      toast.success('Notes saved');
      setNotesModal(null);
      fetchScheduledAppts();
    } catch {
      toast.error('Failed to save notes');
    }
  };

  const formatTime = (t?: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
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

  // ── Send patient already in queue to doctor's NEXT UP ──────────
  const handleSendPatientToDoctor = async (queueId: string, patientName: string) => {
    try {
      await walkInService.sendPatientToDoctor(queueId);
      toast.success(`${patientName} sent to doctor's queue`);
      fetchQueue();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to send patient');
    }
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

  // ── Reception Tabs Derived Data ────────────────────────────────
  // New: waiting patients + called patients + sent_to_doctor (called = highlighted, waiting for reception to send)
  const receptionNewItems = (queueData?.items || []).filter(i => ['waiting', 'called', 'sent_to_doctor'].includes(i.status));
  // Ongoing: only in consultation (doctor has started consultation)
  const receptionOngoingItems = (queueData?.items || []).filter(i => i.status === 'in_consultation');
  // Completed: finished consultations
  const receptionCompletedItems = (queueData?.items || []).filter(i => ['completed', 'skipped'].includes(i.status));

  // Get display items based on reception tab
  const getReceptionDisplayItems = () => {
    switch (receptionTab) {
      case 'new': return receptionNewItems;
      case 'ongoing': return receptionOngoingItems;
      case 'completed': return receptionCompletedItems;
      default: return displayItems;
    }
  };

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
            {isDoctor
              ? (selectedDate && selectedDate !== new Date().toISOString().split('T')[0]
                ? `Patients — ${new Date(selectedDate + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
                : 'Today Patients')
              : 'Walk-in Queue'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isDoctor
              ? 'All your patients — walk-ins & scheduled appointments'
              : 'Real-time walk-in queue — sorted by urgency (auto-refreshes every 15s)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date Picker — browse queue for any date */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setLoading(true); }}
              className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-[150px]"
              title="Browse queue by date"
            />
          </div>
          {selectedDate && selectedDate !== new Date().toISOString().split('T')[0] && (
            <button onClick={() => { setSelectedDate(''); setLoading(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-semibold hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-sm">today</span> Back to Today
            </button>
          )}
          <button onClick={() => { setLoading(true); fetchQueue(); if (isDoctor) fetchScheduledAppts(); }}
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

      {/* Doctor View Tabs */}
      {isDoctor && (
        <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
          <button onClick={() => setActiveTab('queue')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'queue' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">queue</span>
            Walk-in Queue
            {queueData && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'queue' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'}`}>{activeItems.length}</span>}
          </button>
          <button onClick={() => setActiveTab('scheduled')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'scheduled' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">calendar_month</span>
            Scheduled
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'scheduled' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'}`}>{scheduledAppts.length}</span>
          </button>
          <button onClick={() => setActiveTab('completed')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'completed' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">task_alt</span>
            Completed
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'completed' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'}`}>{completedItems.length}</span>
          </button>
          <button onClick={() => setActiveTab('upcoming')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'upcoming' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">event_upcoming</span>
            Upcoming
            {upcomingData && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'upcoming' ? 'bg-orange-100 text-orange-600' : 'bg-slate-200 text-slate-500'}`}>{upcomingData.total_upcoming}</span>}
          </button>
        </div>
      )}

      {/* ── Doctor Queue View — Card-based efficient layout ────────── */}
      {isDoctor && activeTab === 'queue' && (
        <>
          {loading ? (
            <div className="text-center py-20 text-slate-400">
              <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl mb-3 block">event_available</span>
              <p className="text-sm font-medium">No patients waiting</p>
              <p className="text-xs mt-1">Patients will appear here when sent by reception</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Current Patient — In Consultation */}
              {(() => {
                const currentPatient = activeItems.find(i => i.status === 'in_consultation');
                if (!currentPatient) return null;
                const pri = PRIORITY_CONFIG[currentPatient.priority] || PRIORITY_CONFIG.normal;
                return (
                  <div className="bg-gradient-to-r from-purple-50 to-purple-100/50 rounded-2xl border-2 border-purple-200 p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-purple-600">clinical_notes</span>
                      <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">Current Patient — In Consultation</span>
                    </div>
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-14 h-14 bg-purple-200 rounded-xl flex items-center justify-center text-xl font-bold text-purple-700 shrink-0">
                          {currentPatient.queue_number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-lg font-bold text-slate-900 truncate">{currentPatient.patient_name || 'Unknown'}</p>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {currentPatient.patient_reference_number && (
                              <span className="text-sm font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">MRN: {currentPatient.patient_reference_number}</span>
                            )}
                            {currentPatient.patient_gender && (
                              <span className="text-sm text-slate-600 font-medium capitalize">{currentPatient.patient_gender}</span>
                            )}
                            {currentPatient.patient_age != null && (
                              <span className="text-sm text-slate-600 font-medium">{currentPatient.patient_age} years</span>
                            )}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.bg} ${pri.text}`}>
                              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>{pri.icon}</span>
                              {pri.label}
                            </span>
                          </div>
                          {currentPatient.chief_complaint && (
                            <p className="text-sm text-slate-600 mt-2 bg-white/60 rounded-lg px-3 py-1.5 inline-block">
                              <span className="font-medium text-slate-500">Complaint:</span> {currentPatient.chief_complaint}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button onClick={() => setDetailItem(currentPatient)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          <span className="material-symbols-outlined text-sm">person</span>
                          Patient Info
                        </button>
                        <button onClick={() => handleComplete(currentPatient.queue_id)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors shadow-sm">
                          <span className="material-symbols-outlined text-sm">task_alt</span>
                          Complete
                        </button>
                        <button onClick={() => { setBookNextItem(currentPatient); setBookNextDate(''); setBookNextTime(''); }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                          <span className="material-symbols-outlined text-sm">event_upcoming</span>
                          Book Follow-up
                        </button>
                        <button onClick={() => { setReferItem(currentPatient); setReferDoctorId(''); setReferDate(''); setReferReason(''); }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-orange-700 bg-white border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors">
                          <span className="material-symbols-outlined text-sm">send</span>
                          Refer to Doctor
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Called Patient — Waiting for Reception to Send */}
              {(() => {
                const calledPatient = activeItems.find(i => i.status === 'called');
                if (!calledPatient) return null;
                const pri = PRIORITY_CONFIG[calledPatient.priority] || PRIORITY_CONFIG.normal;
                return (
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100/50 rounded-2xl border-2 border-blue-200 p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-blue-600 animate-pulse">campaign</span>
                      <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Called — Waiting for Reception</span>
                      <span className="text-[10px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-semibold animate-pulse">Pending Send</span>
                    </div>
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-14 h-14 bg-blue-200 rounded-xl flex items-center justify-center text-xl font-bold text-blue-700 shrink-0">
                          {calledPatient.queue_number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-lg font-bold text-slate-900 truncate">{calledPatient.patient_name || 'Unknown'}</p>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {calledPatient.patient_reference_number && (
                              <span className="text-sm font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">MRN: {calledPatient.patient_reference_number}</span>
                            )}
                            {calledPatient.patient_gender && (
                              <span className="text-sm text-slate-600 font-medium capitalize">{calledPatient.patient_gender}</span>
                            )}
                            {calledPatient.patient_age != null && (
                              <span className="text-sm text-slate-600 font-medium">{calledPatient.patient_age}y</span>
                            )}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.bg} ${pri.text}`}>
                              {pri.label}
                            </span>
                          </div>
                          {calledPatient.chief_complaint && (
                            <p className="text-sm text-slate-600 mt-2">{calledPatient.chief_complaint}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setDetailItem(calledPatient)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          <span className="material-symbols-outlined text-sm">person</span>
                          Info
                        </button>
                        <button onClick={() => handleSkip(calledPatient.queue_id)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="No Show">
                          <span className="material-symbols-outlined text-lg">person_off</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Next Up — Sent by Reception (only sent_to_doctor patients) */}
              {(() => {
                const sentPatients = activeItems.filter(i => i.status === 'sent_to_doctor');
                const nextPatient = sentPatients[0];
                if (!nextPatient) return null;
                const pri = PRIORITY_CONFIG[nextPatient.priority] || PRIORITY_CONFIG.normal;
                const hasCalledOrConsulting = activeItems.some(i => i.status === 'called' || i.status === 'in_consultation');
                return (
                  <div className={`bg-white rounded-xl border-2 p-5 ${hasCalledOrConsulting ? 'border-slate-200' : 'border-teal-300 bg-teal-50/30'}`}>
                    <div className="flex items-center gap-2 mb-4">
                      <span className={`material-symbols-outlined ${hasCalledOrConsulting ? 'text-slate-500' : 'text-teal-600'}`}>send</span>
                      <span className={`text-xs font-bold uppercase tracking-wider ${hasCalledOrConsulting ? 'text-slate-500' : 'text-teal-700'}`}>
                        Next Up {sentPatients.length > 1 ? `(+${sentPatients.length - 1} ready)` : ''}
                      </span>
                      <span className="text-[10px] text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full font-semibold">Sent by Reception</span>
                    </div>
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${
                          nextPatient.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                          nextPatient.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                          'bg-teal-100 text-teal-700'
                        }`}>
                          {nextPatient.queue_number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900">{nextPatient.patient_name || 'Unknown'}</p>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {nextPatient.patient_reference_number && (
                              <span className="text-sm font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">MRN: {nextPatient.patient_reference_number}</span>
                            )}
                            {nextPatient.patient_gender && (
                              <span className="text-sm text-slate-500 font-medium capitalize">{nextPatient.patient_gender}</span>
                            )}
                            {nextPatient.patient_age != null && (
                              <span className="text-sm text-slate-500 font-medium">{nextPatient.patient_age}y</span>
                            )}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.bg} ${pri.text}`}>
                              {pri.label}
                            </span>
                            <span className="text-xs text-slate-400">• {timeAgo(nextPatient.check_in_at)}</span>
                          </div>
                          {nextPatient.chief_complaint && (
                            <p className="text-sm text-slate-500 mt-1 truncate">{nextPatient.chief_complaint}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setDetailItem(nextPatient)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          <span className="material-symbols-outlined text-sm">person</span>
                          Info
                        </button>
                        <button onClick={() => handleStartConsultation(nextPatient.queue_id)}
                          className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors shadow-sm">
                          <span className="material-symbols-outlined text-base">clinical_notes</span>
                          Start Consultation
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Remaining Waiting Queue — Patients waiting for reception to send */}
              {(() => {
                const waitingPatients = activeItems.filter(i => i.status === 'waiting' || i.status === 'called');
                if (waitingPatients.length === 0) return null;
                return (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-500 text-sm">hourglass_top</span>
                        <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                          Waiting for Reception ({waitingPatients.length})
                        </span>
                      </div>
                      <p className="text-[10px] text-amber-600 mt-0.5">These patients will appear in Next Up once reception sends them</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {waitingPatients.map(item => {
                        const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                        const isCalled = item.status === 'called';
                        return (
                          <div key={item.queue_id} className={`flex items-center gap-3 px-4 py-3 ${
                            isCalled ? 'bg-blue-50/50' :
                            item.priority === 'emergency' ? 'bg-red-50/30' :
                            item.priority === 'urgent' ? 'bg-amber-50/20' : ''
                          }`}>
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                              isCalled ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300' :
                              item.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                              item.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {item.queue_number}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-slate-900">{item.patient_name || 'Unknown'}</p>
                                {isCalled && (
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Called</span>
                                )}
                                {item.patient_reference_number && (
                                  <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">MRN: {item.patient_reference_number}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {item.patient_gender && <span className="text-xs text-slate-500 font-medium capitalize">{item.patient_gender}</span>}
                                {item.patient_age != null && <span className="text-xs text-slate-500 font-medium">{item.patient_age}y</span>}
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pri.bg} ${pri.text}`}>{pri.label}</span>
                                <span className="text-xs text-slate-400">{timeAgo(item.check_in_at)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {!isCalled && (
                                <button onClick={() => handleCall(item.queue_id)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                                  <span className="material-symbols-outlined text-sm">campaign</span>
                                  Call
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Completed Today — Collapsible section */}
              {/* {completedItems.length > 0 && (
                <details className="bg-white rounded-xl border border-slate-200 overflow-hidden group">
                  <summary className="px-4 py-3 bg-slate-50 border-b border-slate-100 cursor-pointer select-none flex items-center justify-between hover:bg-slate-100 transition-colors">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Completed Today ({completedItems.length})
                    </span>
                    <span className="material-symbols-outlined text-slate-400 text-sm group-open:rotate-180 transition-transform">expand_more</span>
                  </summary>
                  <div className="divide-y divide-slate-100">
                    {completedItems.map(item => (
                      <div key={item.queue_id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                        <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-xs font-bold text-emerald-600">
                          {item.queue_number}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 truncate">{item.patient_name || 'Unknown'}</p>
                        </div>
                        <span className="text-[10px] text-emerald-600 font-medium">{item.status === 'completed' ? 'Completed' : 'Skipped'}</span>
                        <button onClick={() => setDetailItem(item)}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded" title="View">
                          <span className="material-symbols-outlined text-base">visibility</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )} */}
            </div>
          )}
        </>
      )}

      {/* ── Reception/Admin Queue View — Table layout ────────────── */}
      {!isDoctor && (<>
      {/* Reception Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          <button onClick={() => setReceptionTab('new')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              receptionTab === 'new' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">hourglass_top</span>
            Waiting
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${receptionTab === 'new' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'}`}>
              {receptionNewItems.length + unassigned.length}
            </span>
          </button>
          <button onClick={() => setReceptionTab('ongoing')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              receptionTab === 'ongoing' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">clinical_notes</span>
            In Consultation
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${receptionTab === 'ongoing' ? 'bg-purple-100 text-purple-600' : 'bg-slate-200 text-slate-500'}`}>
              {receptionOngoingItems.length}
            </span>
          </button>
          <button onClick={() => setReceptionTab('completed')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              receptionTab === 'completed' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">task_alt</span>
            Completed
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${receptionTab === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
              {receptionCompletedItems.length}
            </span>
          </button>
          <button onClick={() => setReceptionTab('upcoming')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              receptionTab === 'upcoming' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">event_upcoming</span>
            Upcoming
            {upcomingData && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${receptionTab === 'upcoming' ? 'bg-orange-100 text-orange-600' : 'bg-slate-200 text-slate-500'}`}>{upcomingData.total_upcoming}</span>}
          </button>
        </div>
        {/* Doctor Filter */}
        {canFilter && (
          <select value={filterDoctor} onChange={(e) => { setFilterDoctor(e.target.value); setLoading(true); }}
            className="w-full sm:w-64 px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
            <option value="">All Doctors</option>
            {doctors.map(d => (
              <option key={d.doctor_id} value={d.doctor_id}>
                {d.name}{d.specialization ? ` — ${d.specialization}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Unassigned Walk-ins — only show in New tab */}
      {canFilter && unassigned.length > 0 && receptionTab === 'new' && (
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
                          <span className="text-xs font-mono text-slate-500">PRN: {item.patient_reference_number}</span>
                        )}
                        {item.patient_gender && (
                          <span className="text-xs text-slate-500 font-medium capitalize">{item.patient_gender}</span>
                        )}
                        {item.patient_age != null && (
                          <span className="text-xs text-slate-500 font-medium">{item.patient_age}y</span>
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
                      className="w-8 h-8 flex items-center justify-center text-white bg-orange-500 hover:bg-orange-600 hover:scale-105 active:scale-95 rounded-lg transition-all shadow-sm"
                      title="Send to Doctor">
                      <span className="material-symbols-outlined text-lg">send</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Reception Upcoming View ── */}
      {receptionTab === 'upcoming' && (
        <div>
          {upcomingLoading ? (
            <div className="text-center py-20 text-slate-400">
              <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
            </div>
          ) : !upcomingData || upcomingData.date_groups.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl mb-3 block">event_available</span>
              <p className="text-sm font-medium">No upcoming patients in the next 7 days</p>
              <p className="text-xs mt-1">Referrals, follow-ups, and scheduled appointments will appear here</p>
            </div>
          ) : (
            <div className="space-y-6">
              {upcomingData.date_groups.map(group => {
                const groupDate = new Date(group.date + 'T00:00');
                const dayLabel = groupDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <div key={group.date} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
                          <span className="material-symbols-outlined text-orange-600 text-sm">calendar_today</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{dayLabel}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{group.count} patient{group.count !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => { setSelectedDate(group.date); setReceptionTab('new'); setLoading(true); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors">
                        <span className="material-symbols-outlined text-sm">visibility</span>
                        View Queue
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                            <th className="px-5 py-2">#</th>
                            <th className="px-4 py-2">Patient</th>
                            <th className="px-4 py-2">Doctor</th>
                            <th className="px-4 py-2">Type</th>
                            <th className="px-4 py-2">Priority</th>
                            <th className="px-4 py-2">Complaint</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {group.items.map(item => {
                            const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                            const typeConfig: Record<string, { label: string; bg: string; text: string }> = {
                              referral: { label: 'Referral', bg: 'bg-orange-100', text: 'text-orange-700' },
                              'follow-up': { label: 'Follow-up', bg: 'bg-blue-100', text: 'text-blue-700' },
                              follow_up: { label: 'Follow-up', bg: 'bg-blue-100', text: 'text-blue-700' },
                              scheduled: { label: 'Scheduled', bg: 'bg-green-100', text: 'text-green-700' },
                              'walk-in': { label: 'Walk-in', bg: 'bg-slate-100', text: 'text-slate-600' },
                              walk_in: { label: 'Walk-in', bg: 'bg-slate-100', text: 'text-slate-600' },
                            };
                            const apptType = typeConfig[item.appointment_type] || { label: item.appointment_type, bg: 'bg-slate-100', text: 'text-slate-600' };
                            return (
                              <tr key={item.queue_id} className="hover:bg-slate-50/50">
                                <td className="px-5 py-2.5 text-sm font-bold text-slate-400">{item.queue_number}</td>
                                <td className="px-4 py-2.5">
                                  <p className="text-sm font-semibold text-slate-900">{item.patient_name || 'Unknown'}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {item.patient_reference_number && <span className="text-[10px] font-mono text-slate-400">MRN: {item.patient_reference_number}</span>}
                                    {item.patient_gender && <span className="text-[10px] text-slate-400 capitalize">{item.patient_gender}</span>}
                                    {item.patient_age != null && <span className="text-[10px] text-slate-400">{item.patient_age}y</span>}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="text-sm text-slate-700">{item.doctor_name || '—'}</p>
                                  {item.referring_doctor_name && (
                                    <p className="text-[10px] text-orange-600 flex items-center gap-0.5 mt-0.5">
                                      <span className="material-symbols-outlined" style={{ fontSize: 10 }}>person</span>
                                      Ref: Dr. {item.referring_doctor_name}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${apptType.bg} ${apptType.text}`}>{apptType.label}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pri.bg} ${pri.text}`}>{pri.label}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="text-xs text-slate-500 truncate max-w-[200px]" title={item.chief_complaint || ''}>
                                    {item.chief_complaint || <span className="text-slate-300">—</span>}
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Queue Table */}
      {receptionTab !== 'upcoming' && (loading ? (
        <div className="text-center py-20 text-slate-400">
          <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
        </div>
      ) : getReceptionDisplayItems().length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
          <span className="material-symbols-outlined text-5xl mb-3 block">
            {receptionTab === 'new' ? 'hourglass_empty' : receptionTab === 'ongoing' ? 'clinical_notes' : 'task_alt'}
          </span>
          <p className="text-sm font-medium">
            {receptionTab === 'new' ? 'No patients waiting or called' : 
             receptionTab === 'ongoing' ? 'No ongoing consultations' : 
             'No completed consultations today'}
          </p>
          <p className="text-xs mt-1">
            {receptionTab === 'new' ? 'Waiting & doctor-called patients appear here' : 
             receptionTab === 'ongoing' ? 'Patients in consultation appear here' : 
             'Completed patients will appear here'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-16">Token</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patient / Doctor</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Complaint</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Priority</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Status</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">
                    {receptionTab === 'completed' ? 'Completed' : 'Wait'}
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {getReceptionDisplayItems().map((item) => {
                  const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                  const qs = QUEUE_STATUS_CONFIG[item.status] || QUEUE_STATUS_CONFIG.waiting;
                  const recentComplete = isRecentlyCompleted(item);
                  const isCalled = item.status === 'called';
                  const isInConsultation = item.status === 'in_consultation';
                  const isSentToDoctor = item.status === 'sent_to_doctor';
                  const isCompleted = ['completed', 'skipped'].includes(item.status);
                  return (
                    <tr key={item.queue_id}
                      className={`border-b border-slate-100 transition-colors ${
                        isInConsultation ? 'bg-purple-50/50' :
                        isCalled ? 'bg-blue-50 ring-2 ring-blue-200 ring-inset animate-pulse' :
                        isSentToDoctor ? 'bg-teal-50/40' :
                        recentComplete ? 'bg-emerald-50/50 animate-pulse' :
                        isCompleted && receptionTab === 'completed' ? 'hover:bg-slate-50/50' :
                        item.priority === 'emergency' ? 'bg-red-50/30' :
                        item.priority === 'urgent' ? 'bg-amber-50/20' : 'hover:bg-slate-50/50'
                      }`}>
                      {/* Token / Queue Number */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                          isCalled ? 'bg-blue-500 text-white ring-2 ring-blue-300' :
                          isSentToDoctor ? 'bg-teal-100 text-teal-700' :
                          isCompleted ? 'bg-emerald-100 text-emerald-700' :
                          item.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                          item.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                          'bg-primary/10 text-primary'
                        }`}>
                          {item.queue_number}
                        </span>
                      </td>

                      {/* Patient + Doctor Combined */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDetailItem(item)}
                          className="text-left hover:bg-slate-50 rounded-lg -m-1 p-1 transition-colors group w-full"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 group-hover:text-primary transition-colors truncate">
                                {item.patient_name || '—'}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {item.patient_reference_number && (
                                  <span className="text-[11px] font-mono text-slate-400">
                                    {item.patient_reference_number}
                                  </span>
                                )}
                                {item.patient_gender && (
                                  <span className="text-[11px] text-slate-400 capitalize">{item.patient_gender}</span>
                                )}
                                {item.patient_age != null && (
                                  <span className="text-[11px] text-slate-400">{item.patient_age}y</span>
                                )}
                              </div>
                            </div>
                            {item.doctor_name && (
                              <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-lg">
                                <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 14 }}>stethoscope</span>
                                <span className="text-xs text-slate-600 font-medium">{item.doctor_name}</span>
                              </div>
                            )}
                          </div>
                        </button>
                      </td>

                      {/* Complaint */}
                      <td className="px-4 py-3">
                        <p className="text-slate-600 text-sm truncate max-w-[250px]" title={item.chief_complaint || ''}>
                          {item.chief_complaint || <span className="text-slate-300">—</span>}
                        </p>
                      </td>

                      {/* Priority Badge */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.bg} ${pri.text}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{pri.icon}</span>
                          {pri.label}
                        </span>
                      </td>

                      {/* Queue Status */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${qs.bg} ${qs.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${qs.dot}`}></span>
                          {qs.label}
                        </span>
                      </td>

                      {/* Wait Time / Completed Time */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-slate-500">
                          {receptionTab === 'completed' && item.consultation_end_at
                            ? new Date(item.consultation_end_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                            : timeAgo(item.check_in_at)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Send to Doctor: for reception/admin on waiting OR called items */}
                          {canFilter && (item.status === 'waiting' || item.status === 'called') && item.doctor_id && (
                            <button onClick={() => handleSendPatientToDoctor(item.queue_id, item.patient_name || 'Patient')}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg hover:scale-105 active:scale-95 transition-all shadow-sm text-xs font-semibold ${
                                isCalled 
                                  ? 'bg-blue-500 text-white ring-2 ring-blue-300 animate-pulse' 
                                  : 'bg-primary text-white hover:bg-primary/90'
                              }`}
                              title={isCalled ? 'Doctor Called — Send Now!' : 'Send to Doctor'}>
                              <span className="material-symbols-outlined text-base">send</span>
                              {isCalled ? 'Send Now' : 'Send'}
                            </button>
                          )}
                          {/* Assign doctor: for unassigned items */}
                          {canFilter && (item.status === 'waiting' || item.status === 'called') && !item.doctor_id && (
                            <button onClick={() => {
                              setSendModalId(item.appointment_id);
                              setSendDoctorId('');
                              setSendModalPatientName(item.patient_name || 'Patient');
                            }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 hover:scale-105 active:scale-95 transition-all shadow-sm text-xs font-semibold"
                              title="Assign & Send to Doctor">
                              <span className="material-symbols-outlined text-base">person_add</span>
                              Assign
                            </button>
                          )}
                          {/* Sent to Doctor badge */}
                          {item.status === 'sent_to_doctor' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg bg-teal-100 text-teal-700">
                              <span className="material-symbols-outlined text-sm">check_circle</span>
                              Sent to Doctor
                            </span>
                          )}
                          {/* In Consultation status indicator */}
                          {isInConsultation && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg bg-purple-100 text-purple-700">
                              <span className="material-symbols-outlined text-sm">clinical_notes</span>
                              With Doctor
                            </span>
                          )}
                          {/* View Details button for any item */}
                          <button onClick={() => setDetailItem(item)}
                            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="View Patient Details">
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
      ))}
      </>)}

      {/* ── Scheduled Appointments Tab (Doctor only) ─────────────── */}
      {isDoctor && activeTab === 'scheduled' && (
        <div>
          {scheduledLoading ? (
            <div className="text-center py-20 text-slate-400">
              <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
            </div>
          ) : scheduledAppts.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl mb-3 block">event_available</span>
              <p className="text-sm font-medium">No scheduled appointments for today</p>
              <p className="text-xs mt-1">Only walk-in patients are in your queue</p>
            </div>
          ) : (
            <div className="space-y-3">
              {scheduledAppts.map(appt => (
                <div key={appt.id} className={`bg-white rounded-xl border p-5 transition-shadow hover:shadow-sm ${
                  appt.status === 'in-progress' ? 'border-purple-200 ring-1 ring-purple-100' : 'border-slate-200'
                }`}>
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    {/* Time Block */}
                    <div className="flex-shrink-0 w-28 lg:text-center">
                      <div className="inline-flex lg:flex lg:flex-col items-center gap-2 lg:gap-0 bg-slate-50 px-3 py-2 rounded-xl">
                        <span className="material-symbols-outlined text-primary text-lg lg:mb-1">schedule</span>
                        <p className="text-lg font-bold text-slate-900">{formatTime(appt.start_time || undefined)}</p>
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5 capitalize">{appt.visit_type || 'General Visit'}</p>
                    </div>
                    {/* Patient Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-base font-bold text-slate-900">{appt.patient_name || 'Unknown Patient'}</span>
                        <AppointmentStatusBadge status={appt.status} />
                        {appt.priority && appt.priority !== 'normal' && appt.priority !== 'routine' && (
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            appt.priority === 'emergency' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                          }`}>{appt.priority}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap text-sm">
                        {appt.patient_reference_number && (
                          <span className="font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">PRN: {appt.patient_reference_number}</span>
                        )}
                        <span className="text-slate-400 font-medium">{appt.appointment_number}</span>
                        {appt.consultation_fee != null && appt.consultation_fee > 0 && (
                          <span className="text-emerald-600 font-semibold">₹{appt.consultation_fee}</span>
                        )}
                      </div>
                      {appt.chief_complaint && (
                        <div className="mt-2 flex items-start gap-2">
                          <span className="material-symbols-outlined text-slate-400 text-base mt-0.5">symptoms</span>
                          <p className="text-sm text-slate-600">{appt.chief_complaint}</p>
                        </div>
                      )}
                      {appt.check_in_at && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                          <span className="material-symbols-outlined text-sm">login</span>
                          Checked in at {new Date(appt.check_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => setNotesModal({ id: appt.id, notes: (appt as any).doctor_notes || appt.notes || '' })}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors" title="Add Notes">
                        <span className="material-symbols-outlined text-sm">edit_note</span>
                        Notes
                      </button>
                      {(appt.status === 'pending' || appt.status === 'confirmed' || appt.status === 'scheduled') && (
                        <button onClick={() => handleScheduledStatusChange(appt.id, 'in-progress')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors shadow-sm">
                          <span className="material-symbols-outlined text-sm">play_arrow</span>
                          Start
                        </button>
                      )}
                      {appt.status === 'in-progress' && (
                        <button onClick={() => handleScheduledStatusChange(appt.id, 'completed')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors shadow-sm">
                          <span className="material-symbols-outlined text-sm">task_alt</span>
                          Complete
                        </button>
                      )}
                      {appt.status !== 'completed' && appt.status !== 'cancelled' && appt.status !== 'no-show' && (
                        <button onClick={() => handleScheduledStatusChange(appt.id, 'no-show')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                          <span className="material-symbols-outlined text-sm">person_off</span>
                          No Show
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Completed Patients Tab (Doctor only) ─────────────────── */}
      {isDoctor && activeTab === 'completed' && (
        <div>
          {completedItems.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl mb-3 block">task_alt</span>
              <p className="text-sm font-medium">No completed consultations today</p>
              <p className="text-xs mt-1">Patients you complete will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {completedItems.map(item => {
                const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                return (
                  <div key={item.queue_id} className="bg-white rounded-xl border border-slate-200 p-5 transition-shadow hover:shadow-sm">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-lg font-bold text-emerald-700 shrink-0">
                          {item.queue_number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-slate-900">{item.patient_name || 'Unknown'}</p>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
                                {item.status === 'completed' ? 'check_circle' : 'person_off'}
                              </span>
                              {item.status === 'completed' ? 'Completed' : 'Skipped'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            {item.patient_reference_number && (
                              <span className="text-sm font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">MRN: {item.patient_reference_number}</span>
                            )}
                            {item.patient_gender && (
                              <span className="text-sm text-slate-500 font-medium capitalize">{item.patient_gender}</span>
                            )}
                            {item.patient_age != null && (
                              <span className="text-sm text-slate-500 font-medium">{item.patient_age}y</span>
                            )}
                            <span className={`text-[10px] font-bold ${pri.text}`}>{pri.label}</span>
                            {item.consultation_end_at && (
                              <span className="text-xs text-slate-400">
                                Completed {new Date(item.consultation_end_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          {item.chief_complaint && (
                            <p className="text-sm text-slate-500 mt-1">{item.chief_complaint}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setDetailItem(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                          <span className="material-symbols-outlined text-sm">person</span>
                          Patient Info
                        </button>
                        {item.status === 'completed' && (
                          <button onClick={() => { setReferItem(item); setReferDoctorId(''); setReferDate(''); setReferReason(''); }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
                            <span className="material-symbols-outlined text-sm">send</span>
                            Refer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Doctor Upcoming View — Future bookings grouped by date ── */}
      {isDoctor && activeTab === 'upcoming' && (
        <div>
          {upcomingLoading ? (
            <div className="text-center py-20 text-slate-400">
              <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
            </div>
          ) : !upcomingData || upcomingData.date_groups.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl mb-3 block">event_available</span>
              <p className="text-sm font-medium">No upcoming patients in the next 7 days</p>
              <p className="text-xs mt-1">Referrals, follow-ups, and scheduled appointments will appear here</p>
            </div>
          ) : (
            <div className="space-y-6">
              {upcomingData.date_groups.map(group => {
                const groupDate = new Date(group.date + 'T00:00');
                const dayLabel = groupDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <div key={group.date} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
                          <span className="material-symbols-outlined text-orange-600 text-sm">calendar_today</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{dayLabel}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{group.count} patient{group.count !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => { setSelectedDate(group.date); setActiveTab('queue'); setLoading(true); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors">
                        <span className="material-symbols-outlined text-sm">visibility</span>
                        View Queue
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.items.map(item => {
                        const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                        const typeConfig: Record<string, { label: string; bg: string; text: string }> = {
                          referral: { label: 'Referral', bg: 'bg-orange-100', text: 'text-orange-700' },
                          'follow-up': { label: 'Follow-up', bg: 'bg-blue-100', text: 'text-blue-700' },
                          'follow_up': { label: 'Follow-up', bg: 'bg-blue-100', text: 'text-blue-700' },
                          scheduled: { label: 'Scheduled', bg: 'bg-green-100', text: 'text-green-700' },
                          'walk-in': { label: 'Walk-in', bg: 'bg-slate-100', text: 'text-slate-600' },
                          walk_in: { label: 'Walk-in', bg: 'bg-slate-100', text: 'text-slate-600' },
                        };
                        const apptType = typeConfig[item.appointment_type] || { label: item.appointment_type, bg: 'bg-slate-100', text: 'text-slate-600' };
                        return (
                          <div key={item.queue_id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                              item.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                              item.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {item.queue_number}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-slate-900">{item.patient_name || 'Unknown'}</p>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${apptType.bg} ${apptType.text}`}>{apptType.label}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pri.bg} ${pri.text}`}>{pri.label}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {item.patient_reference_number && (
                                  <span className="text-xs font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">MRN: {item.patient_reference_number}</span>
                                )}
                                {item.patient_gender && <span className="text-xs text-slate-500 font-medium capitalize">{item.patient_gender}</span>}
                                {item.patient_age != null && <span className="text-xs text-slate-500 font-medium">{item.patient_age}y</span>}
                                {item.chief_complaint && (
                                  <span className="text-xs text-slate-400 truncate max-w-[200px]" title={item.chief_complaint}>{item.chief_complaint}</span>
                                )}
                              </div>
                              {item.referring_doctor_name && (
                                <p className="text-[10px] text-orange-600 mt-0.5 flex items-center gap-1">
                                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>person</span>
                                  Referred by Dr. {item.referring_doctor_name}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Scheduled Notes Modal */}
      {notesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setNotesModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Appointment Notes</h3>
            <textarea value={notesModal.notes} onChange={(e) => setNotesModal({ ...notesModal, notes: e.target.value })}
              rows={5} placeholder="Enter clinical notes, observations..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setNotesModal(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSaveScheduledNotes} className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm">Save Notes</button>
            </div>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
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

            {/* Demographics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
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
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Phone</p>
                <p className="text-sm font-semibold text-slate-800">{detailItem.patient_phone || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Email</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{detailItem.patient_email || '—'}</p>
              </div>
            </div>

            {/* Clinical Info — Allergies & Chronic Conditions */}
            {(detailItem.patient_known_allergies || detailItem.patient_chronic_conditions) && (
              <div className="mb-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  <span className="material-symbols-outlined text-xs align-text-bottom mr-1">medical_information</span>
                  Clinical Information
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {detailItem.patient_known_allergies && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="material-symbols-outlined text-red-500" style={{ fontSize: 16 }}>warning</span>
                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Known Allergies</p>
                      </div>
                      <p className="text-sm text-red-800">{detailItem.patient_known_allergies}</p>
                    </div>
                  )}
                  {detailItem.patient_chronic_conditions && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="material-symbols-outlined text-blue-500" style={{ fontSize: 16 }}>monitor_heart</span>
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Chronic Conditions</p>
                      </div>
                      <p className="text-sm text-blue-800">{detailItem.patient_chronic_conditions}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Emergency Contact */}
            {detailItem.patient_emergency_contact_name && (
              <div className="mb-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  <span className="material-symbols-outlined text-xs align-text-bottom mr-1">emergency</span>
                  Emergency Contact
                </p>
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm font-semibold text-orange-900">{detailItem.patient_emergency_contact_name}</p>
                      {detailItem.patient_emergency_contact_relation && (
                        <p className="text-[10px] text-orange-600 capitalize">{detailItem.patient_emergency_contact_relation}</p>
                      )}
                    </div>
                    {detailItem.patient_emergency_contact_phone && (
                      <p className="text-sm font-medium text-orange-800">
                        <span className="material-symbols-outlined text-xs align-text-bottom mr-0.5">call</span>
                        {detailItem.patient_emergency_contact_phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

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
              {canFilter && (detailItem.status === 'waiting' || detailItem.status === 'called') && detailItem.doctor_id && (
                <button onClick={() => { handleSendPatientToDoctor(detailItem.queue_id, detailItem.patient_name || 'Patient'); setDetailItem(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-base">send</span> Send to Doctor
                </button>
              )}
              {canActOnQueue && detailItem.status === 'sent_to_doctor' && (
                <button onClick={() => { handleStartConsultation(detailItem.queue_id); setDetailItem(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-purple-500 rounded-lg hover:bg-purple-600 shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-base">clinical_notes</span> Start Consultation
                </button>
              )}
              {canActOnQueue && detailItem.status === 'called' && (
                <button onClick={() => { handleStartConsultation(detailItem.queue_id); setDetailItem(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-purple-500 rounded-lg hover:bg-purple-600 shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-base">clinical_notes</span> Start Consultation
                </button>
              )}
              {canActOnQueue && detailItem.status === 'in_consultation' && (
                <button onClick={() => { setBookNextItem(detailItem); setBookNextDate(''); setBookNextTime(''); setDetailItem(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                  <span className="material-symbols-outlined text-base">event_upcoming</span> Book Follow-up
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

      {/* ── Book Next Appointment Modal ──────────────────────────────────── */}
      {bookNextItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-600">event_upcoming</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Book Follow-up Appointment</h3>
                  <p className="text-xs text-slate-500">{bookNextItem.patient_name}</p>
                </div>
              </div>
              <button onClick={() => setBookNextItem(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Appointment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={bookNextDate}
                  onChange={(e) => setBookNextDate(e.target.value)}
                  min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Preferred Time (Optional)
                </label>
                <input
                  type="time"
                  value={bookNextTime}
                  onChange={(e) => setBookNextTime(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setBookNextItem(null)}
                className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleBookNextAppointment}
                disabled={!bookNextDate || bookingSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 shadow-sm transition-all">
                <span className="material-symbols-outlined text-base">check</span>
                {bookingSaving ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Refer to Doctor Modal ──────────────────────────────────────── */}
      {referItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-orange-600">send</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Refer to Another Doctor</h3>
                  <p className="text-xs text-slate-500">{referItem.patient_name}</p>
                </div>
              </div>
              <button onClick={() => setReferItem(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Select Doctor / Specialist <span className="text-red-500">*</span>
                </label>
                <select
                  value={referDoctorId}
                  onChange={(e) => setReferDoctorId(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">— Choose a doctor —</option>
                  {allDoctors
                    .filter(d => d.doctor_id !== referItem.doctor_id)
                    .map(d => (
                      <option key={d.doctor_id} value={d.doctor_id}>
                        {d.name}{d.specialization ? ` — ${d.specialization}` : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Appointment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={referDate}
                  onChange={(e) => setReferDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              {referDoctorLoad !== null && referDoctorId && referDate && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm ${
                  referDoctorLoad >= 15 ? 'bg-red-50 text-red-700 border border-red-200' :
                  referDoctorLoad >= 8 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  <span className="material-symbols-outlined text-base">
                    {referDoctorLoad >= 15 ? 'warning' : referDoctorLoad >= 8 ? 'info' : 'check_circle'}
                  </span>
                  <span>
                    {allDoctors.find(d => d.doctor_id === referDoctorId)?.name || 'Selected doctor'} already has <strong>{referDoctorLoad}</strong> patient{referDoctorLoad !== 1 ? 's' : ''} on this date
                  </span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Referral Reason
                </label>
                <textarea
                  value={referReason}
                  onChange={(e) => setReferReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Needs cardiology evaluation for chest pain..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setReferItem(null)}
                className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleReferToDoctor}
                disabled={!referDoctorId || !referDate || referSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-xl hover:bg-orange-600 disabled:opacity-50 shadow-sm transition-all">
                <span className="material-symbols-outlined text-base">send</span>
                {referSaving ? 'Referring...' : 'Confirm Referral'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalkInQueue;
