import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardRefresh } from '../contexts/DashboardRefreshContext';
import { canEdit } from '../config/modulePermissions';
import walkInService from '../services/walkInService';
import scheduleService from '../services/scheduleService';
import patientService from '../services/patientService';
import { useListKeyboardNav } from '../hooks/useListKeyboardNav';
import type { DoctorOption } from '../types/appointment';
import type { Patient } from '../types/patient';
import VerifiedBadge from '../components/patients/VerifiedBadge';
import SearchableSelect, { type SuggestionOption } from '../components/common/SearchableSelect';
import OpdAssignConfirmDialog from '../components/opd/OpdAssignConfirmDialog';
import { VISIT_REASON_OPTIONS } from '../utils/constants';

const WalkInRegistration: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { triggerRefresh } = useDashboardRefresh();
  // Defense-in-depth: the route itself already requires edit on
  // appt.walkin_queue to be reached at all, so this can't be hit in practice
  // today — but it keeps this page safe on its own if that route gate is
  // ever loosened to allow view-only roles through.
  const canRegisterWalkIn = canEdit('appt.walkin_queue', user?.roles);

  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [doctorLabel, setDoctorLabel] = useState('');
  const [doctorScheduleState, setDoctorScheduleState] = useState<'idle' | 'checking' | 'no_schedule' | 'all_full' | 'available'>('idle');
  const [specialistAssignment, setSpecialistAssignment] = useState(false);
  const [urgencyLevel, setUrgencyLevel] = useState('normal');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ queueNumber: string; estimatedWait: number } | null>(null);
  const [waitlisted, setWaitlisted] = useState<{ message: string; position: number; patientName: string; doctorName: string } | null>(null);

  // Patient search
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  // Lets the dropdown open on focus, before any typing — otherwise the only
  // way to pick a patient is to already know something to search for.
  const [patientFocused, setPatientFocused] = useState(false);

  // OPD assignment confirm dialog (BRD_OP_1 §3.3.2) — selecting a patient
  // from search opens this dialog for review; only "Confirm & Assign"
  // proceeds to the existing selectedPatient/doctor-assignment flow below.
  const [confirmingPatient, setConfirmingPatient] = useState<Patient | null>(null);
  const [confirmAsOf, setConfirmAsOf] = useState<Date | null>(null);
  const [confirmLastVisit, setConfirmLastVisit] = useState<string | null>(null);
  const [confirmLoadingLastVisit, setConfirmLoadingLastVisit] = useState(false);

  const selectPatient = (p: Patient) => {
    setConfirmingPatient(p);
    // Computed once here (an event handler, not render) and passed down so
    // the dialog's age calculation never calls Date.now() during render.
    setConfirmAsOf(new Date());
    setConfirmLastVisit(null);
    setConfirmLoadingLastVisit(true);
    patientService.getLastVisit(p.id)
      .then((res) => setConfirmLastVisit(res.last_visit_date))
      .catch(() => setConfirmLastVisit(null))
      .finally(() => setConfirmLoadingLastVisit(false));
  };
  const patientNav = useListKeyboardNav(patients, selectPatient);

  const handleConfirmAssign = () => {
    if (!confirmingPatient) return;
    setSelectedPatient(confirmingPatient);
    setPatientSearch(`${confirmingPatient.first_name} ${confirmingPatient.last_name}`);
    setPatients([]);
    setConfirmingPatient(null);
  };
  const handleCancelAssign = () => setConfirmingPatient(null);

  // ── Register a new patient ────────────────────────────────────────────
  // Instead of a slimmed-down inline modal, send the user to the full
  // Patient Registration form (identical fields + functions — duplicate-phone
  // guard, title auto-correction, verification, patient history, etc.). The
  // full form reads walkInReturnUrl and comes back here with ?new_patient_id=,
  // which the effect below turns into an auto-selected patient.
  const goToRegister = () => {
    sessionStorage.setItem('walkInReturnUrl', location.pathname);
    navigate('/register');
  };

  // Returning from the full registration form with a freshly-created patient —
  // fetch and select them, then strip the query param so a refresh doesn't
  // re-trigger this.
  useEffect(() => {
    const newPatientId = searchParams.get('new_patient_id');
    if (!newPatientId) return;
    patientService.getPatient(newPatientId)
      .then((p) => {
        setSelectedPatient(p);
        setPatientSearch(`${p.first_name} ${p.last_name}`);
        toast.success(`Patient selected: ${p.patient_reference_number}`);
        triggerRefresh();
      })
      .catch(() => toast.error('Could not load the newly registered patient'))
      .finally(() => {
        searchParams.delete('new_patient_id');
        setSearchParams(searchParams, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { scheduleService.getDoctors().then(setDoctors).catch(() => {}); }, []);

  const doctorSuggestions: SuggestionOption[] = doctors.map(d => ({
    id: d.doctor_id,
    label: d.name,
    sublabel: d.specialization || 'General',
    metadata: { id: d.doctor_id },
  }));
  const handleDoctorSelect = (value: string, metadata?: Record<string, unknown>) => {
    setDoctorLabel(value);
    handleDoctorChange(metadata?.id ? (metadata.id as string) : '');
  };

  const handleDoctorChange = async (doctorId: string) => {
    setSelectedDoctorId(doctorId);
    if (!doctorId) { setDoctorScheduleState('idle'); setSpecialistAssignment(false); return; }
    setDoctorScheduleState('checking');
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await scheduleService.getAvailableSlots(doctorId, today);
      if (!result.slots || result.slots.length === 0) {
        setDoctorScheduleState('no_schedule');
      } else if (result.slots.every(s => !s.available)) {
        setDoctorScheduleState('all_full');
      } else {
        setDoctorScheduleState('available');
      }
    } catch {
      setDoctorScheduleState('idle');
    }
  };

  useEffect(() => {
    if (selectedPatient || !patientFocused) { setPatients([]); return; }
    const tid = setTimeout(async () => {
      setPatientLoading(true);
      try {
        // Empty search still resolves — most-recently-registered patients —
        // so the dropdown has something to pick from as soon as it's opened,
        // not only once the user has started typing.
        const res = await patientService.getPatients(1, 10, patientSearch.trim());
        setPatients(res.data);
      } catch { /* silent */ }
      setPatientLoading(false);
    }, 300);
    return () => clearTimeout(tid);
  }, [patientSearch, selectedPatient, patientFocused]);

  const handleSubmit = async () => {
    if (!selectedPatient) return;
    if (!selectedDoctorId) {
      toast.error('Please select a doctor');
      return;
    }
    setSubmitting(true);
    try {
      const result = await walkInService.register({
        patient_id: selectedPatient.id,
        doctor_id: selectedDoctorId,
        chief_complaint: reason || undefined,
        priority: urgencyLevel,
        is_specialist_assignment: specialistAssignment,
      });

      // Check if patient was auto-waitlisted (all slots full)
      if (result.waitlisted) {
        const wEntry = result.waitlist_entry;
        setWaitlisted({
          message: result.message || 'Patient added to waitlist',
          position: wEntry?.position || 0,
          patientName: wEntry?.patient_name || `${selectedPatient.first_name} ${selectedPatient.last_name}` || '—',
          doctorName: wEntry?.doctor_name || '—',
        });
        toast.success('Patient added to waitlist — all doctor slots are full');
      } else {
        setSuccess({
          queueNumber: result.queue_number ? String(result.queue_number) : (result.appointment_number || '—'),
          estimatedWait: 0,
        });
        toast.success('Walk-in registered successfully');
      }
      triggerRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Registration failed');
    }
    setSubmitting(false);
  };

  const handleReset = () => {
    setSelectedPatient(null);
    setPatientSearch('');
    setSelectedDoctorId('');
    setDoctorLabel('');
    setDoctorScheduleState('idle');
    setSpecialistAssignment(false);
    setUrgencyLevel('normal');
    setReason('');
    setSuccess(null);
    setWaitlisted(null);
  };

  if (waitlisted) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">directions_walk</span>
              OPD Assignment
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">Register a walk-in patient and add to the queue</p>
          </div>
        </div>
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-amber-200 shadow-sm p-8 text-center">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="material-symbols-outlined text-amber-600 text-3xl">playlist_add</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Added to Waitlist</h2>
          <p className="text-xs text-slate-500 mb-4">All doctor slots are full for today. Patient has been waitlisted.</p>
          <div className="bg-amber-50 rounded-xl p-5 mb-5 w-full text-left space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Patient</span>
              <span className="text-sm font-semibold text-slate-800">{waitlisted.patientName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Doctor</span>
              <span className="text-sm font-semibold text-slate-800">{waitlisted.doctorName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Position</span>
              <span className="text-2xl font-black text-amber-600">#{waitlisted.position}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-5">{waitlisted.message}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={handleReset}
              className="px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">add</span>
              Register Another
            </button>
            <button onClick={() => window.location.href = '/appointments/waitlist'}
              className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-base">playlist_add</span>
              View Waitlist
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">directions_walk</span>
              OPD Assignment
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">Register a walk-in patient and add to the queue</p>
          </div>
        </div>
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="material-symbols-outlined text-emerald-600 text-3xl">check_circle</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Walk-in Registered Successfully</h2>
          <p className="text-xs text-slate-400 mb-4">Patient has been added to the queue</p>
          <div className="bg-slate-50 rounded-xl p-5 mb-5 inline-block w-full">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Queue Number</p>
            <p className="text-4xl font-black text-primary">{success.queueNumber}</p>
            <p className="text-sm text-slate-500 mt-1.5">Estimated wait: <span className="font-semibold text-slate-700">~{success.estimatedWait} min</span></p>
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={handleReset}
              className="px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">add</span>
              Register Another
            </button>
            <button onClick={() => navigate('/appointments/queue')}
              className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-base">groups</span>
              View in Consultation Queue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Compact header row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">directions_walk</span>
            OPD Assignment
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">Register a walk-in patient and add to the queue</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/appointments/book')}
            title="Book this patient for a future date instead of today's walk-in queue"
            className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-4 py-2 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-base">event_available</span>
            Pre-book for Later Date
          </button>
          <button
            onClick={goToRegister}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-base">person_add</span>
            Register New Patient
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* ── Left column: Patient selection (3/5 width) ── */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <label className="block text-xs font-bold text-slate-500 mb-2">Select Patient <span className="text-red-400">*</span></label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <span className="material-symbols-outlined text-lg">search</span>
            </span>
            <input type="text" value={patientSearch}
              onChange={(e) => { setPatientSearch(e.target.value); setSelectedPatient(null); }}
              onKeyDown={patientNav.onKeyDown}
              onFocus={() => setPatientFocused(true)}
              onBlur={() => window.setTimeout(() => setPatientFocused(false), 150)}
              placeholder="Search by name, PRN, or phone... or click to browse recent patients"
              className="w-full pl-10 pr-9 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            {patientSearch && (
              <button type="button" onClick={() => { setPatientSearch(''); setSelectedPatient(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            )}
          </div>
          {patientLoading && <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1"><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>Searching...</p>}
          {patientFocused && patients.length > 0 && !selectedPatient && (
            <div className="mt-1.5 border border-slate-200 rounded-lg max-h-52 overflow-y-auto">
              {!patientSearch.trim() && (
                <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">Recent patients</p>
              )}
              {patients.map((p, idx) => (
                <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => selectPatient(p)}
                  onMouseEnter={() => patientNav.setActiveIndex(idx)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-slate-100 last:border-0 ${
                    idx === patientNav.activeIndex ? 'bg-primary/10' : 'hover:bg-slate-50'
                  }`}>
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">{p.first_name[0]}{p.last_name[0]}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate flex items-center gap-1">
                      {p.first_name} {p.last_name}
                      <VerifiedBadge patient={p} />
                    </p>
                    {/* Age / gender / phone for disambiguation (BRD_OP_1 §3.3.1) */}
                    <p className="text-[10px] text-slate-400 truncate">
                      {[
                        p.age_years != null ? `${p.age_years} yrs` : null,
                        p.gender || null,
                        p.phone_number || null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-[10px] text-slate-400">PRN: {p.patient_reference_number}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {patientFocused && patientSearch.length >= 2 && !patientLoading && patients.length === 0 && !selectedPatient && (
            <div className="mt-2 bg-slate-50 rounded-lg px-3 py-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="material-symbols-outlined text-base">search_off</span>
                No patient found for "<span className="font-semibold text-slate-700">{patientSearch}</span>"
              </div>
              <p className="text-[10px] text-slate-400 pl-6">
                Try searching with first name, last name, PRN, or phone number.
              </p>
              <button onClick={goToRegister} className="flex items-center gap-1 text-xs text-emerald-600 font-semibold hover:underline pl-6">
                <span className="material-symbols-outlined text-sm">person_add</span>
                Register as new patient
              </button>
            </div>
          )}
          {selectedPatient && (
            <div className="mt-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{selectedPatient.first_name[0]}{selectedPatient.last_name[0]}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 flex items-center gap-1">
                  {selectedPatient.first_name} {selectedPatient.last_name}
                  <VerifiedBadge patient={selectedPatient} />
                </p>
                <p className="text-[10px] text-slate-500">PRN: {selectedPatient.patient_reference_number}{selectedPatient.phone_number ? ` · ${selectedPatient.phone_number}` : ''}</p>
              </div>
              <button onClick={() => { setSelectedPatient(null); setPatientSearch(''); }} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          )}
          {!selectedPatient && patientSearch.length === 0 && !patientFocused && (
            <div className="mt-3 flex flex-col items-center justify-center py-6 text-slate-300">
              <span className="material-symbols-outlined text-4xl mb-1">person_search</span>
              <p className="text-xs text-slate-400">Search for a patient or <button onClick={goToRegister} className="text-emerald-600 font-semibold hover:underline">register a new one</button></p>
            </div>
          )}
        </div>

        {/* ── Right column: Visit details (2/5 width) ── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
          {/* Doctor */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Doctor</label>
            <SearchableSelect
              value={doctorLabel}
              onChange={handleDoctorSelect}
              suggestions={doctorSuggestions}
              placeholder="Search doctor..."
              allowManualEntry={false}
            />
            {doctorScheduleState === 'checking' && (
              <p className="mt-1.5 text-xs text-slate-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                Checking schedule...
              </p>
            )}
            {doctorScheduleState === 'no_schedule' && (
              <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <span className="material-symbols-outlined text-red-500 text-base mt-0.5">event_busy</span>
                <p className="text-xs text-red-700 font-medium">This doctor has no schedule for today. Please choose a different doctor or set up a schedule first.</p>
              </div>
            )}
            {doctorScheduleState === 'all_full' && (
              <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="material-symbols-outlined text-amber-500 text-base mt-0.5">info</span>
                <p className="text-xs text-amber-700 font-medium">All slots are full today — patient will be waitlisted automatically.</p>
              </div>
            )}
            {doctorScheduleState === 'available' && (
              <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Doctor has slots available today
              </p>
            )}

            <label className={`mt-3 flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-colors ${
              !selectedDoctorId ? 'opacity-50 cursor-not-allowed border-slate-200' :
              specialistAssignment ? 'bg-primary/5 border-primary/30 cursor-pointer' : 'border-slate-200 hover:border-slate-300 cursor-pointer'
            }`}>
              <input
                type="checkbox"
                checked={specialistAssignment}
                disabled={!selectedDoctorId}
                onChange={(e) => setSpecialistAssignment(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              <span>
                <span className="block text-xs font-bold text-slate-700">Specialist Assignment</span>
                <span className="block text-[11px] text-slate-400 mt-0.5">Patient will be consulted by this doctor only — cannot be reassigned or referred to another doctor</span>
              </span>
            </label>
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Urgency</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'normal', label: 'Routine', icon: 'check_circle', bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700' },
                { key: 'urgent', label: 'Urgent', icon: 'warning', bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700' },
                { key: 'emergency', label: 'Emergency', icon: 'emergency', bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700' },
              ].map(u => (
                <button key={u.key} onClick={() => setUrgencyLevel(u.key)}
                  className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    urgencyLevel === u.key
                      ? `${u.bg} ${u.border} ${u.text}`
                      : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}>
                  <span className="material-symbols-outlined text-base">{u.icon}</span>
                  {u.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div className="flex-1 flex flex-col gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Reason for Visit</label>
              <select
                value={VISIT_REASON_OPTIONS.includes(reason) ? reason : (reason ? 'Other' : '')}
                onChange={(e) => setReason(e.target.value === 'Other' ? '' : e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              >
                <option value="">Select a reason</option>
                {VISIT_REASON_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                <option value="Other">Other</option>
              </select>
            </div>
            {(!VISIT_REASON_OPTIONS.includes(reason)) && (
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="Describe the reason for visit..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
            )}
          </div>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!canRegisterWalkIn || !selectedPatient || submitting || doctorScheduleState === 'no_schedule' || doctorScheduleState === 'checking'}
            className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-bold disabled:opacity-40 hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-base">{submitting ? 'progress_activity' : 'how_to_reg'}</span>
            {submitting ? 'Registering...' : 'Register Walk-in'}
          </button>
        </div>
      </div>

      {confirmingPatient && confirmAsOf && (
        <OpdAssignConfirmDialog
          patient={confirmingPatient}
          asOf={confirmAsOf}
          lastVisitDate={confirmLastVisit}
          loadingLastVisit={confirmLoadingLastVisit}
          onConfirm={handleConfirmAssign}
          onCancel={handleCancelAssign}
        />
      )}
    </div>
  );
};

export default WalkInRegistration;
