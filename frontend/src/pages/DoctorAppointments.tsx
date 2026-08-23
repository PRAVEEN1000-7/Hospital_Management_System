import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import appointmentService, { type DoctorTodaySummary } from '../services/appointmentService';
import appointmentSettingsService from '../services/appointmentSettingsService';
import AppointmentStatusBadge from '../components/appointments/AppointmentStatusBadge';
import type { Appointment } from '../types/appointment';
import { formatLocalDateISO, formatDateOnly } from '../utils/calendarDate';

type TimeCategory = 'morning' | 'evening' | 'full';
type PatientsTab = 'schedule' | 'all';

const DoctorAppointments: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const today = formatLocalDateISO();
  const [selectedDate, setSelectedDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [notesModal, setNotesModal] = useState<{ id: string; notes: string } | null>(null);
  // Patients handled + consultation fee collected today — only meaningful for
  // "today" (the backend summary is always today-scoped), not other dates.
  const [todaySummary, setTodaySummary] = useState<DoctorTodaySummary | null>(null);

  // Morning / Evening / Full Day view — reuses the same OPD session
  // boundaries configured in Appointment Settings (opd_morning_end_time /
  // opd_evening_start_time, same source AppointmentBooking.tsx's slot picker
  // reads) rather than a separately hardcoded cutoff, so "Morning" here means
  // the same thing it means everywhere else in the app. Defaults to whichever
  // session is active right now — before the morning session ends: Morning;
  // at/after the evening session starts: Evening; the gap between the two
  // (no active session, e.g. a lunch break) or 24-hour OPDs: Full Day.
  const [sessionTimes, setSessionTimes] = useState<{ morningEnd: string; eveningStart: string } | null>(null);
  const [timeCategory, setTimeCategory] = useState<TimeCategory>('full');
  const hasAppliedDefaultTimeCategory = useRef(false);

  // ── All Patients tab — every visit this doctor has ever had, any date,
  // separate from the day-by-day "Schedule" tab above (which keeps its own
  // Start/Complete daily workflow untouched). Uses /appointments/my-appointments
  // (no date filter, paginated) rather than getDoctorToday.
  const [patientsTab, setPatientsTab] = useState<PatientsTab>('schedule');
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [allPage, setAllPage] = useState(1);
  const [allTotalPages, setAllTotalPages] = useState(0);
  const [allTotal, setAllTotal] = useState(0);
  const [allSearch, setAllSearch] = useState('');
  const [allSearchInput, setAllSearchInput] = useState('');

  useEffect(() => {
    appointmentSettingsService.getSettings()
      .then(s => setSessionTimes({
        morningEnd: (s.opd_morning_end_time || '14:00').slice(0, 5),
        eveningStart: (s.opd_evening_start_time || '17:00').slice(0, 5),
      }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionTimes || hasAppliedDefaultTimeCategory.current) return;
    hasAppliedDefaultTimeCategory.current = true;
    const nowHm = new Date().toTimeString().slice(0, 5);
    if (nowHm < sessionTimes.morningEnd) setTimeCategory('morning');
    else if (nowHm >= sessionTimes.eveningStart) setTimeCategory('evening');
    else setTimeCategory('full');
  }, [sessionTimes]);

  const fetchAppointments = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await appointmentService.getDoctorToday(user.id, selectedDate);
      setAppointments(data);
    } catch {
      toast.error('Failed to load appointments');
    }
    setLoading(false);
  }, [user?.id, selectedDate]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  // Debounce the free-text search before it drives a fetch.
  useEffect(() => {
    const t = setTimeout(() => { setAllSearch(allSearchInput.trim()); setAllPage(1); }, 300);
    return () => clearTimeout(t);
  }, [allSearchInput]);

  const fetchAllPatients = useCallback(async () => {
    setAllLoading(true);
    try {
      const res = await appointmentService.getMyAppointments(allPage, 20, undefined, allSearch || undefined);
      setAllAppointments(res.data);
      setAllTotalPages(res.total_pages);
      setAllTotal(res.total);
    } catch {
      toast.error('Failed to load patients');
    }
    setAllLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPage, allSearch]);

  useEffect(() => {
    if (patientsTab === 'all') fetchAllPatients();
  }, [patientsTab, fetchAllPatients]);

  useEffect(() => {
    if (!user?.id || selectedDate !== today) {
      setTodaySummary(null);
      return;
    }
    appointmentService.getDoctorTodaySummary(user.id)
      .then(setTodaySummary)
      .catch(() => setTodaySummary(null));
  }, [user?.id, selectedDate, today]);

  const feeByAppointmentId = new Map(
    (todaySummary?.patients || []).map(p => [p.appointment_id, p])
  );

  const byTimeCategory = (a: Appointment): boolean => {
    if (timeCategory === 'full' || !sessionTimes || !a.start_time) return true;
    const t = a.start_time.slice(0, 5);
    if (timeCategory === 'morning') return t < sessionTimes.morningEnd;
    return t >= sessionTimes.eveningStart;
  };

  const timeFiltered = appointments.filter(byTimeCategory);

  const filtered = statusFilter
    ? timeFiltered.filter(a => a.status === statusFilter)
    : timeFiltered;

  const stats = {
    total: timeFiltered.length,
    pending: timeFiltered.filter(a => a.status === 'pending' || a.status === 'confirmed').length,
    inProgress: timeFiltered.filter(a => a.status === 'in-progress').length,
    completed: timeFiltered.filter(a => a.status === 'completed').length,
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

  // A prescription only exists once the consultation has actually started
  // (in-progress) or finished (completed) — same gate the "Rx" button below
  // already used, now shared so the whole row does the same thing clicking
  // that button did. Reuses /prescriptions/new's existing by-appointment
  // lookup (see PrescriptionBuilder.tsx) to land on the real draft/finalized
  // record for this visit instead of a blank form, whichever already exists.
  const canViewPrescription = (appt: Appointment) => appt.status === 'in-progress' || appt.status === 'completed';

  const openPrescription = (appt: Appointment) => {
    if (!canViewPrescription(appt)) return;
    const p = new URLSearchParams();
    if (appt.patient_id) p.set('patient_id', appt.patient_id);
    if (appt.id) p.set('appointment_id', appt.id);
    navigate(`/prescriptions/new?${p.toString()}`);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Patients</h1>
          <p className="text-slate-500 text-sm mt-1">
            {patientsTab === 'schedule' ? 'Manage your daily appointments' : 'Every patient who has visited you, any date'}
          </p>
        </div>
        {patientsTab === 'schedule' && (
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
        )}
      </div>

      {/* Schedule (today/date-based) vs All Patients (all-time roster) */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { key: 'schedule', label: 'Schedule', icon: 'calendar_month' },
          { key: 'all', label: 'All Patients', icon: 'groups' },
        ] as { key: PatientsTab; label: string; icon: string }[]).map(opt => (
          <button key={opt.key} onClick={() => setPatientsTab(opt.key)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              patientsTab === opt.key ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {patientsTab === 'all' ? (
        <div>
          <div className="relative mb-4 max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="material-symbols-outlined text-slate-400 text-lg">search</span>
            </span>
            <input
              type="text"
              value={allSearchInput}
              onChange={(e) => setAllSearchInput(e.target.value)}
              placeholder="Search by patient name or appointment number..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>

          {allLoading ? (
            <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
          ) : allAppointments.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl mb-3 block">groups</span>
              <p className="text-sm font-medium">{allSearch ? 'No matching patients' : 'No patients yet'}</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-3">{allTotal} visit{allTotal !== 1 ? 's' : ''} total</p>
              <div className="space-y-2">
                {allAppointments.map(appt => (
                  <div key={appt.id}
                    onClick={() => appt.patient_id && navigate(`/patients/${appt.patient_id}`)}
                    title="View patient"
                    className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all">
                    <div className="flex-shrink-0 w-24">
                      <p className="text-sm font-bold text-slate-900">{formatDateOnly(appt.appointment_date, 'MMM d, yyyy')}</p>
                      <p className="text-xs text-slate-400">{formatTime(appt.start_time || undefined)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-bold text-slate-900">{appt.patient_name || 'Unknown Patient'}</span>
                        <AppointmentStatusBadge status={appt.status} />
                        {appt.patient_reference_number && (
                          <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">PRN: {appt.patient_reference_number}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{appt.appointment_number} · {appt.visit_type || 'General'}</p>
                      {appt.chief_complaint && <p className="text-xs text-slate-400 mt-0.5 truncate">{appt.chief_complaint}</p>}
                    </div>
                    <span className="material-symbols-outlined text-slate-300 shrink-0">chevron_right</span>
                  </div>
                ))}
              </div>

              {allTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-6">
                  <button onClick={() => setAllPage(p => Math.max(1, p - 1))} disabled={allPage <= 1}
                    className="px-3 py-1.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                    Previous
                  </button>
                  <span className="text-sm text-slate-500">Page {allPage} of {allTotalPages}</span>
                  <button onClick={() => setAllPage(p => Math.min(allTotalPages, p + 1))} disabled={allPage >= allTotalPages}
                    className="px-3 py-1.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
      <>
      {/* Morning / Evening / Full Day — defaults to whichever OPD session is
          active right now (see the effect above), switchable any time. Uses
          the same session boundaries configured in Appointment Settings. */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { key: 'morning', label: 'Morning', icon: 'wb_sunny' },
          { key: 'evening', label: 'Evening', icon: 'bedtime' },
          { key: 'full', label: 'Full Day', icon: 'calendar_view_day' },
        ] as { key: TimeCategory; label: string; icon: string }[]).map(opt => (
          <button key={opt.key} onClick={() => setTimeCategory(opt.key)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              timeCategory === opt.key ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Today's patients handled + consultation fee collected */}
      {todaySummary && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gradient-to-br from-primary/5 to-blue-50 rounded-xl border border-primary/10 p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patients Handled Today</span>
              <span className="material-symbols-outlined text-primary">groups</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{todaySummary.patients_handled}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-50/50 rounded-xl border border-emerald-100 p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Consultation Fee Collected</span>
              <span className="material-symbols-outlined text-emerald-600">account_balance_wallet</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">₹{todaySummary.consultation_fee_collected_total.toLocaleString()}</p>
          </div>
        </div>
      )}

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
        {['', 'pending', 'confirmed', 'in-progress', 'completed'].map(s => (
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
          <p className="text-sm font-medium">
            No {timeCategory !== 'full' ? `${timeCategory} ` : ''}appointments for {formatDateOnly(selectedDate, 'EEEE, MMMM d')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(appt => (
            <div key={appt.id}
              onClick={() => openPrescription(appt)}
              title={canViewPrescription(appt) ? 'View prescription' : undefined}
              className={`bg-white rounded-xl border p-5 transition-shadow hover:shadow-sm ${appt.status === 'in-progress' ? 'border-purple-200 ring-1 ring-purple-100' : 'border-slate-200'} ${canViewPrescription(appt) ? 'cursor-pointer hover:border-primary/30' : ''}`}>
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
                    {feeByAppointmentId.has(appt.id) && (
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-0.5 ${feeByAppointmentId.get(appt.id)!.fee_collected ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>payments</span>
                        {feeByAppointmentId.get(appt.id)!.fee_collected ? 'Fee Paid' : 'Fee Pending'} · ₹{feeByAppointmentId.get(appt.id)!.fee_amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{appt.appointment_number} · {appt.visit_type || 'General'}</p>
                  {appt.chief_complaint && <p className="text-xs text-slate-400 mt-1">{appt.chief_complaint}</p>}
                  {appt.notes && <p className="text-xs text-blue-500 mt-1 italic"><span className="material-symbols-outlined text-xs align-text-bottom mr-0.5">note</span>{appt.notes}</p>}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setNotesModal({ id: appt.id, notes: appt.notes || '' })}
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
                  {canViewPrescription(appt) && (
                    <button
                      onClick={() => openPrescription(appt)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1"
                      title="View Prescription"
                    >
                      <span className="material-symbols-outlined text-sm">clinical_notes</span>
                      Rx
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
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
