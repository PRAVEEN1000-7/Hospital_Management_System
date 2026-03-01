import React, { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import walkInService from '../services/walkInService';
import scheduleService from '../services/scheduleService';
import patientService from '../services/patientService';
import {
  TITLE_OPTIONS, GENDER_OPTIONS, BLOOD_GROUP_OPTIONS,
  COUNTRIES, getStatesForCountry, getPostalLabel, getPhoneCode,
} from '../utils/constants';
import type { DoctorOption } from '../types/appointment';
import type { Patient } from '../types/patient';

// ── Quick-register form ────────────────────────────────────────────────
interface RegForm {
  title: string; first_name: string; last_name: string;
  gender: string; date_of_birth: string; blood_group: string;
  phone_country_code: string; phone_number: string; email: string;
  address_line_1: string; address_line_2: string;
  city: string; state: string; postal_code: string; country: string;
  emergency_contact_name: string;
  emergency_contact_phone: string; emergency_contact_relation: string;
}
const emptyReg = (): RegForm => ({
  title: '', first_name: '', last_name: '',
  gender: '', date_of_birth: '', blood_group: '',
  phone_country_code: '+91', phone_number: '', email: '',
  address_line_1: '', address_line_2: '',
  city: '', state: '', postal_code: '', country: 'India',
  emergency_contact_name: '',
  emergency_contact_phone: '', emergency_contact_relation: '',
});

const WalkInRegistration: React.FC = () => {
  const toast = useToast();

  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
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

  // ── Register new patient modal ────────────────────────────────────────
  const [showRegModal, setShowRegModal] = useState(false);
  const [regForm, setRegForm] = useState<RegForm>(emptyReg());
  const [regErrors, setRegErrors] = useState<Partial<Record<keyof RegForm, string>>>({});
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regSection, setRegSection] = useState<'personal' | 'contact' | 'emergency'>('personal');

  const regStates = getStatesForCountry(regForm.country || 'India');
  const regPostalLabel = getPostalLabel(regForm.country || 'India');
  const setReg = (field: keyof RegForm, value: string) =>
    setRegForm(f => ({ ...f, [field]: value }));

  useEffect(() => { scheduleService.getDoctors().then(setDoctors).catch(() => {}); }, []);

  // Sync country code when country changes in reg form
  useEffect(() => {
    if (regForm.country) setReg('phone_country_code', getPhoneCode(regForm.country));
  }, [regForm.country]);

  useEffect(() => {
    if (patientSearch.length < 2) { setPatients([]); return; }
    const tid = setTimeout(async () => {
      setPatientLoading(true);
      try {
        const res = await patientService.getPatients(1, 10, patientSearch);
        setPatients(res.data);
      } catch { /* silent */ }
      setPatientLoading(false);
    }, 300);
    return () => clearTimeout(tid);
  }, [patientSearch]);

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
      });

      // Check if patient was auto-waitlisted (all slots full)
      if (result.waitlisted) {
        const wEntry = result.waitlist_entry;
        setWaitlisted({
          message: result.message || 'Patient added to waitlist',
          position: wEntry?.position || 0,
          patientName: wEntry?.patient_name || selectedPatient.full_name || '—',
          doctorName: wEntry?.doctor_name || '—',
        });
        toast.success('Patient added to waitlist — all doctor slots are full');
      } else {
        setSuccess({
          queueNumber: result.id?.slice(-6)?.toUpperCase() || '—',
          estimatedWait: 0,
        });
        toast.success('Walk-in registered successfully');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Registration failed');
    }
    setSubmitting(false);
  };

  const handleReset = () => {
    setSelectedPatient(null);
    setPatientSearch('');
    setSelectedDoctorId('');
    setUrgencyLevel('normal');
    setReason('');
    setSuccess(null);
    setWaitlisted(null);
  };

  // ── Reg modal handlers ────────────────────────────────────────────────
  const validateRegPersonal = (): boolean => {
    const errs: Partial<Record<keyof RegForm, string>> = {};
    if (!regForm.title) errs.title = 'Required';
    if (!regForm.first_name.trim()) errs.first_name = 'Required';
    if (!regForm.last_name.trim()) errs.last_name = 'Required';
    if (!regForm.gender) errs.gender = 'Required';
    if (!regForm.date_of_birth) errs.date_of_birth = 'Required';
    if (!regForm.blood_group) errs.blood_group = 'Required';
    setRegErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateRegContact = (): boolean => {
    const errs: Partial<Record<keyof RegForm, string>> = {};
    if (!regForm.phone_number.trim()) errs.phone_number = 'Required';
    if (!regForm.address_line_1.trim()) errs.address_line_1 = 'Required';
    if (regForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regForm.email))
      errs.email = 'Invalid email';
    setRegErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRegNext = () => {
    if (regSection === 'personal' && validateRegPersonal()) setRegSection('contact');
    else if (regSection === 'contact' && validateRegContact()) setRegSection('emergency');
  };

  const handleRegSubmit = async () => {
    if (!validateRegContact()) { setRegSection('contact'); return; }
    setRegSubmitting(true);
    try {
      const payload: Record<string, string | undefined> = {};
      (Object.keys(regForm) as (keyof RegForm)[]).forEach(k => {
        payload[k] = regForm[k] || undefined;
      });
      if (payload.phone_number) payload.phone_number = payload.phone_number.replace(/\D/g, '');
      if (payload.emergency_contact_phone)
        payload.emergency_contact_phone = payload.emergency_contact_phone.replace(/\D/g, '') || undefined;
      const newPatient = await patientService.createPatient(payload as any);
      toast.success(`Patient registered! PRN: ${newPatient.patient_reference_number}`);
      setSelectedPatient(newPatient);
      setPatientSearch(`${newPatient.first_name} ${newPatient.last_name}`);
      setPatients([]);
      closeRegModal();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      toast.error(Array.isArray(detail) ? detail.map((d: any) => d.msg).join(', ') : detail || 'Registration failed');
    }
    setRegSubmitting(false);
  };

  const closeRegModal = () => {
    setShowRegModal(false);
    setRegForm(emptyReg());
    setRegErrors({});
    setRegSection('personal');
  };

  if (waitlisted) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">directions_walk</span>
              Walk-in Registration
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
              Walk-in Registration
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
          <button onClick={handleReset}
            className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2 mx-auto">
            <span className="material-symbols-outlined text-base">add</span>
            Register Another
          </button>
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
            Walk-in Registration
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">Register a walk-in patient and add to the queue</p>
        </div>
        <button
          onClick={() => setShowRegModal(true)}
          className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          Register New Patient
        </button>
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
              placeholder="Search by name, PRN, or phone..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
          </div>
          {patientLoading && <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1"><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>Searching...</p>}
          {patients.length > 0 && !selectedPatient && (
            <div className="mt-1.5 border border-slate-200 rounded-lg max-h-52 overflow-y-auto">
              {patients.map(p => (
                <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch(`${p.first_name} ${p.last_name}`); setPatients([]); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">{p.first_name[0]}{p.last_name[0]}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{p.first_name} {p.last_name}</p>
                    <p className="text-[10px] text-slate-400">PRN: {p.patient_reference_number}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {patientSearch.length >= 2 && !patientLoading && patients.length === 0 && !selectedPatient && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-base">search_off</span>
              No patient found.
              <button onClick={() => setShowRegModal(true)} className="text-emerald-600 font-semibold hover:underline">
                Register as new patient
              </button>
            </div>
          )}
          {selectedPatient && (
            <div className="mt-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{selectedPatient.first_name[0]}{selectedPatient.last_name[0]}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">{selectedPatient.first_name} {selectedPatient.last_name}</p>
                <p className="text-[10px] text-slate-500">PRN: {selectedPatient.patient_reference_number}{selectedPatient.phone_number ? ` · ${selectedPatient.phone_number}` : ''}</p>
              </div>
              <button onClick={() => { setSelectedPatient(null); setPatientSearch(''); }} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          )}
          {!selectedPatient && patientSearch.length === 0 && (
            <div className="mt-3 flex flex-col items-center justify-center py-6 text-slate-300">
              <span className="material-symbols-outlined text-4xl mb-1">person_search</span>
              <p className="text-xs text-slate-400">Search for a patient or <button onClick={() => setShowRegModal(true)} className="text-emerald-600 font-semibold hover:underline">register a new one</button></p>
            </div>
          )}
        </div>

        {/* ── Right column: Visit details (2/5 width) ── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
          {/* Doctor */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Doctor <span className="text-slate-300">(optional)</span></label>
            <select value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value as any)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white">
              <option value="">Auto-assign (next available)</option>
              {doctors.map(d => <option key={d.doctor_id} value={d.doctor_id}>{d.name} — {d.specialization || 'General'}</option>)}
            </select>
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
          <div className="flex-1 flex flex-col">
            <label className="block text-xs font-bold text-slate-500 mb-1">Reason for Visit</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              placeholder="Brief description of the visit reason..."
              className="w-full flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
          </div>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!selectedPatient || submitting}
            className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-bold disabled:opacity-40 hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-base">{submitting ? 'progress_activity' : 'how_to_reg'}</span>
            {submitting ? 'Registering...' : 'Register Walk-in'}
          </button>
        </div>
      </div>

      {/* ══ Register New Patient Modal ═══════════════════════════════════════ */}
      {showRegModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeRegModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-emerald-600 text-xl">person_add</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Register New Patient</h3>
                  <p className="text-[11px] text-slate-400">Create a record then proceed with walk-in</p>
                </div>
              </div>
              <button onClick={closeRegModal} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Section tabs */}
            <div className="flex gap-1 px-6 pt-4">
              {(['personal', 'contact', 'emergency'] as const).map((s, i) => (
                <button
                  key={s}
                  onClick={() => setRegSection(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                    regSection === s ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[9px]">{i + 1}</span>
                  {s === 'personal' ? 'Personal' : s === 'contact' ? 'Contact' : 'Emergency'}
                </button>
              ))}
            </div>

            {/* Scrollable form body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* ─ Personal ─ */}
              {regSection === 'personal' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Title <span className="text-red-500">*</span></label>
                      <select value={regForm.title} onChange={e => setReg('title', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                        <option value="">Select</option>
                        {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {regErrors.title && <p className="text-[10px] text-red-500 mt-0.5">{regErrors.title}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">First Name <span className="text-red-500">*</span></label>
                      <input value={regForm.first_name} onChange={e => setReg('first_name', e.target.value)}
                        placeholder="First name"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                      {regErrors.first_name && <p className="text-[10px] text-red-500 mt-0.5">{regErrors.first_name}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Last Name <span className="text-red-500">*</span></label>
                      <input value={regForm.last_name} onChange={e => setReg('last_name', e.target.value)}
                        placeholder="Last name"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                      {regErrors.last_name && <p className="text-[10px] text-red-500 mt-0.5">{regErrors.last_name}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Gender <span className="text-red-500">*</span></label>
                      <select value={regForm.gender} onChange={e => setReg('gender', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                        <option value="">Select</option>
                        {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                      {regErrors.gender && <p className="text-[10px] text-red-500 mt-0.5">{regErrors.gender}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Date of Birth <span className="text-red-500">*</span></label>
                      <input type="date" value={regForm.date_of_birth} onChange={e => setReg('date_of_birth', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                      {regErrors.date_of_birth && <p className="text-[10px] text-red-500 mt-0.5">{regErrors.date_of_birth}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Blood Group <span className="text-red-500">*</span></label>
                      <select value={regForm.blood_group} onChange={e => setReg('blood_group', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                        <option value="">Select</option>
                        {BLOOD_GROUP_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      {regErrors.blood_group && <p className="text-[10px] text-red-500 mt-0.5">{regErrors.blood_group}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Email (optional)</label>
                    <input type="email" value={regForm.email} onChange={e => setReg('email', e.target.value)}
                      placeholder="patient@example.com"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                    {regErrors.email && <p className="text-[10px] text-red-500 mt-0.5">{regErrors.email}</p>}
                  </div>
                </>
              )}

              {/* ─ Contact ─ */}
              {regSection === 'contact' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Country Code <span className="text-red-500">*</span></label>
                      <select value={regForm.phone_country_code} onChange={e => setReg('phone_country_code', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                        {COUNTRIES.map(c => (
                          <option key={c.code} value={c.phoneCode}>{c.phoneCode} ({c.name})</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1">Phone Number <span className="text-red-500">*</span></label>
                      <input value={regForm.phone_number} onChange={e => setReg('phone_number', e.target.value)}
                        placeholder="Phone number (digits only)"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                      {regErrors.phone_number && <p className="text-[10px] text-red-500 mt-0.5">{regErrors.phone_number}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Address Line 1 <span className="text-red-500">*</span></label>
                    <input value={regForm.address_line_1} onChange={e => setReg('address_line_1', e.target.value)}
                      placeholder="Street address, building..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                    {regErrors.address_line_1 && <p className="text-[10px] text-red-500 mt-0.5">{regErrors.address_line_1}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Address Line 2 (optional)</label>
                    <input value={regForm.address_line_2} onChange={e => setReg('address_line_2', e.target.value)}
                      placeholder="Apartment, suite, floor..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">City</label>
                      <input value={regForm.city} onChange={e => setReg('city', e.target.value)}
                        placeholder="City"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">State</label>
                      {regStates.length > 0 ? (
                        <select value={regForm.state} onChange={e => setReg('state', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                          <option value="">Select</option>
                          {regStates.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <input value={regForm.state} onChange={e => setReg('state', e.target.value)}
                          placeholder="State / Province"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{regPostalLabel}</label>
                      <input value={regForm.postal_code} onChange={e => setReg('postal_code', e.target.value)}
                        placeholder={regPostalLabel}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Country</label>
                      <select value={regForm.country} onChange={e => setReg('country', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                        {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* ─ Emergency Contact ─ */}
              {regSection === 'emergency' && (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-start gap-2">
                    <span className="material-symbols-outlined text-amber-500 text-lg mt-0.5">info</span>
                    <p className="text-[11px] text-amber-700">Emergency contact is optional but recommended for walk-in patients.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Contact Name</label>
                      <input value={regForm.emergency_contact_name} onChange={e => setReg('emergency_contact_name', e.target.value)}
                        placeholder="Full name"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Relationship</label>
                      <select value={regForm.emergency_contact_relation} onChange={e => setReg('emergency_contact_relation', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                        <option value="">Select</option>
                        {['Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister', 'Friend', 'Guardian', 'Other'].map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-bold text-slate-500 mb-1">Phone Number</label>
                      <input value={regForm.emergency_contact_phone} onChange={e => setReg('emergency_contact_phone', e.target.value)}
                        placeholder="Emergency contact number"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <button onClick={closeRegModal} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg font-medium">
                Cancel
              </button>
              <div className="flex gap-2">
                {regSection !== 'personal' && (
                  <button
                    onClick={() => setRegSection(regSection === 'emergency' ? 'contact' : 'personal')}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-sm align-middle mr-1">arrow_back</span>Back
                  </button>
                )}
                {regSection !== 'emergency' ? (
                  <button
                    onClick={handleRegNext}
                    className="px-5 py-2 text-sm font-bold text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm"
                  >
                    Next<span className="material-symbols-outlined text-sm align-middle ml-1">arrow_forward</span>
                  </button>
                ) : (
                  <button
                    onClick={handleRegSubmit}
                    disabled={regSubmitting}
                    className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                  >
                    {regSubmitting ? 'Registering...' : 'Register & Select Patient'}
                    <span className="material-symbols-outlined text-sm align-middle ml-1">check</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalkInRegistration;
