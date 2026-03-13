import React, { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import scheduleService from '../services/scheduleService';
import appointmentService from '../services/appointmentService';
import patientService from '../services/patientService';
import TimeSlotPicker from '../components/appointments/TimeSlotPicker';
import {
  TITLE_OPTIONS, GENDER_OPTIONS, BLOOD_GROUP_OPTIONS,
  COUNTRIES, getStatesForCountry, getPostalLabel, getPhoneCode,
} from '../utils/constants';
import type { DoctorOption, TimeSlot, AvailableSlots } from '../types/appointment';
import type { Patient } from '../types/patient';

// ── Quick-register form state ────────────────────────────────────────────
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

const AppointmentBooking: React.FC = () => {
  const toast = useToast();

  // Step tracker
  const [step, setStep] = useState(1); // 1: Patient, 2: Doctor, 3: Slot, 4: Confirm

  // State
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorOption | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [consultationType, setConsultationType] = useState('offline');
  const [reason, setReason] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Patient search
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);

  // Doctor search/filter
  const [doctorSearch, setDoctorSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  // ── Register new patient modal ──────────────────────────────────────────
  const [showRegModal, setShowRegModal] = useState(false);
  const [regForm, setRegForm] = useState<RegForm>(emptyReg());
  const [regErrors, setRegErrors] = useState<Partial<Record<keyof RegForm, string>>>({});
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regSection, setRegSection] = useState<'personal' | 'contact' | 'emergency'>('personal');

  const regStates = getStatesForCountry(regForm.country || 'India');
  const regPostalLabel = getPostalLabel(regForm.country || 'India');

  const setReg = (field: keyof RegForm, value: string) =>
    setRegForm(f => ({ ...f, [field]: value }));

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
      // Strip non-digit characters from phone fields (backend pattern: ^\d{4,15}$)
      if (payload.phone_number) payload.phone_number = payload.phone_number.replace(/\D/g, '');
      if (payload.emergency_contact_phone) payload.emergency_contact_phone = payload.emergency_contact_phone.replace(/\D/g, '') || undefined;
      const newPatient = await patientService.createPatient(payload as any);
      toast.success(`Patient registered! PRN: ${newPatient.patient_reference_number}`);
      setSelectedPatient(newPatient);
      setPatientSearch(`${newPatient.first_name} ${newPatient.last_name}`);
      setShowRegModal(false);
      setRegForm(emptyReg());
      setRegSection('personal');
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

  // Load doctors
  useEffect(() => {
    scheduleService.getDoctors().then(setDoctors).catch(() => {});
  }, []);

  // Update country code when country changes in reg form
  useEffect(() => {
    if (regForm.country) {
      const code = getPhoneCode(regForm.country);
      setReg('phone_country_code', code);
    }
  }, [regForm.country]);

  // Search patients
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

  // Fetch slots when doctor+date selected
  useEffect(() => {
    if (!selectedDoctor || !selectedDate) return;
    setSlotsLoading(true);
    scheduleService.getAvailableSlots(selectedDoctor.doctor_id, selectedDate)
      .then((res: AvailableSlots) => setSlots(res.slots))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDoctor, selectedDate]);

  const handleBook = async () => {
    if (!selectedPatient || !selectedDoctor || !selectedDate || !selectedTime) return;
    setSubmitting(true);
    try {
      await appointmentService.createAppointment({
        patient_id: selectedPatient.id,
        doctor_id: selectedDoctor.doctor_id,
        appointment_type: 'scheduled',
        visit_type: consultationType,
        appointment_date: selectedDate,
        start_time: selectedTime,
        chief_complaint: reason || undefined,
      });
      toast.success('Appointment booked successfully!');
      // Reset
      setStep(1);
      setSelectedPatient(null);
      setSelectedDoctor(null);
      setSelectedDate('');
      setSelectedTime(null);
      setReason('');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to book appointment');
    }
    setSubmitting(false);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Book Appointment</h1>
        <p className="text-slate-500 text-sm mt-1">Schedule a patient appointment with a doctor</p>
      </div>

      {/* Step Indicators */}
      <div className="flex items-center gap-2 mb-8">
        {['Patient', 'Doctor & Date', 'Time Slot', 'Confirm'].map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <div className={`flex-1 h-0.5 ${step > i ? 'bg-primary' : 'bg-slate-200'}`} />}
            <button
              onClick={() => { if (i + 1 < step) setStep(i + 1); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                step === i + 1 ? 'bg-primary text-white' :
                step > i + 1 ? 'bg-primary/10 text-primary' :
                'bg-slate-100 text-slate-400'
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-current">
                {step > i + 1 ? '✓' : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {/* Step 1: Patient */}
        {step === 1 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Select Patient</h2>
              <button
                onClick={() => setShowRegModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-base">person_add</span>
                Register New Patient
              </button>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <span className="material-symbols-outlined text-lg">search</span>
              </span>
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => { setPatientSearch(e.target.value); setSelectedPatient(null); }}
                placeholder="Search existing patient by name, PRN, or phone..."
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
            </div>
            {patientLoading && <p className="text-xs text-slate-400 mt-2">Searching...</p>}
            {/* Divider hint */}
            {!selectedPatient && patientSearch.length === 0 && (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-[11px] text-slate-400 font-medium">or register a new patient above</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>
            )}
            {patients.length > 0 && !selectedPatient && (
              <div className="mt-2 border border-slate-200 rounded-lg max-h-60 overflow-y-auto">
                {patients.map(p => (
                  <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch(`${p.first_name} ${p.last_name}`); setPatients([]); }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {p.first_name[0]}{p.last_name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{p.first_name} {p.last_name}</p>
                      <p className="text-xs text-slate-400">PRN: {p.patient_reference_number} · {p.phone_number}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedPatient && (
              <div className="mt-4 bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                  {selectedPatient.first_name[0]}{selectedPatient.last_name[0]}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{selectedPatient.first_name} {selectedPatient.last_name}</p>
                  <p className="text-xs text-slate-500">PRN: {selectedPatient.patient_reference_number} · {selectedPatient.gender}</p>
                </div>
                <button onClick={() => { setSelectedPatient(null); setPatientSearch(''); }}
                  className="ml-auto text-slate-400 hover:text-red-500">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            )}
            <div className="flex justify-end mt-6">
              <button onClick={() => setStep(2)} disabled={!selectedPatient}
                className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors shadow-sm">
                Next <span className="material-symbols-outlined text-sm align-middle ml-1">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Doctor & Date */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-4">Select Doctor & Date</h2>
            {/* Doctor search and filter */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 mb-1">Find Doctor</label>
              <div className="flex gap-2 mb-2">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <span className="material-symbols-outlined text-lg">search</span>
                  </span>
                  <input type="text" value={doctorSearch} onChange={(e) => setDoctorSearch(e.target.value)}
                    placeholder="Search by name..."
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
                  className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white">
                  <option value="">All Specializations</option>
                  {[...new Set(doctors.map(d => d.specialization).filter(Boolean))].sort().map(spec => (
                    <option key={spec} value={spec!}>{spec}</option>
                  ))}
                </select>
              </div>
              {/* Filtered doctor list */}
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                {doctors
                  .filter(d => {
                    const matchSearch = !doctorSearch || d.name.toLowerCase().includes(doctorSearch.toLowerCase());
                    const matchDept = !deptFilter || d.specialization === deptFilter;
                    return matchSearch && matchDept;
                  })
                  .map(d => (
                    <button key={d.doctor_id} onClick={() => { setSelectedDoctor(d); setSelectedTime(null); }}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-slate-100 last:border-0 transition-colors ${
                        selectedDoctor?.doctor_id === d.doctor_id ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-slate-50'
                      }`}>
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {d.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{d.name}</p>
                        <p className="text-[10px] text-slate-400">{d.specialization || 'General'}</p>
                      </div>
                      {selectedDoctor?.doctor_id === d.doctor_id && (
                        <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                      )}
                    </button>
                  ))
                }
                {doctors.filter(d => {
                  const matchSearch = !doctorSearch || d.name.toLowerCase().includes(doctorSearch.toLowerCase());
                  const matchDept = !deptFilter || d.specialization === deptFilter;
                  return matchSearch && matchDept;
                }).length === 0 && (
                  <p className="text-center py-4 text-sm text-slate-400">No doctors found</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Date</label>
                <input type="date" value={selectedDate} min={today} onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(null); }}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Consultation Type</label>
              <div className="flex gap-3">
                {['offline', 'online'].map(t => (
                  <button key={t} onClick={() => setConsultationType(t)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                      consultationType === t ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                    <span className="material-symbols-outlined text-lg">{t === 'online' ? 'videocam' : 'person'}</span>
                    {t === 'online' ? 'Online' : 'In-Person'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg">
                <span className="material-symbols-outlined text-sm align-middle mr-1">arrow_back</span> Back
              </button>
              <button onClick={() => setStep(3)} disabled={!selectedDoctor || !selectedDate}
                className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors shadow-sm">
                Next <span className="material-symbols-outlined text-sm align-middle ml-1">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Time Slot */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Select Time Slot</h2>
            <p className="text-xs text-slate-400 mb-4">{selectedDoctor?.name} · {selectedDate}</p>
            {slotsLoading ? (
              <div className="text-center py-10 text-slate-400">
                <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
              </div>
            ) : (
              <TimeSlotPicker slots={slots} selectedTime={selectedTime} onSelect={setSelectedTime} />
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 mt-4 mb-1">Reason for Visit (optional)</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="Briefly describe the reason..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg">
                <span className="material-symbols-outlined text-sm align-middle mr-1">arrow_back</span> Back
              </button>
              <button onClick={() => setStep(4)} disabled={!selectedTime}
                className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors shadow-sm">
                Review <span className="material-symbols-outlined text-sm align-middle ml-1">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-4">Confirm Appointment</h2>
            <div className="bg-slate-50 rounded-xl p-5 space-y-3">
              <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">Patient</span><span className="text-sm font-semibold text-slate-900">{selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : ''}</span></div>
              <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">Doctor</span><span className="text-sm font-semibold text-slate-900">{selectedDoctor?.name}</span></div>
              <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">Date</span><span className="text-sm font-semibold text-slate-900">{selectedDate}</span></div>
              <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">Time</span><span className="text-sm font-semibold text-slate-900">{selectedTime ? formatTimeStr(selectedTime) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">Type</span><span className="text-sm font-semibold text-slate-900 capitalize">{consultationType}</span></div>
              {reason && <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">Reason</span><span className="text-sm text-slate-700">{reason}</span></div>}
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(3)} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg">
                <span className="material-symbols-outlined text-sm align-middle mr-1">arrow_back</span> Back
              </button>
              <button onClick={handleBook} disabled={submitting}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-emerald-700 transition-colors shadow-sm">
                {submitting ? 'Booking...' : 'Confirm Booking'}
                <span className="material-symbols-outlined text-sm align-middle ml-1">check</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Register New Patient Modal ───────────────────────────────── */}
      {showRegModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeRegModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-emerald-600 text-xl">person_add</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Register New Patient</h3>
                  <p className="text-[11px] text-slate-400">Fill details to create a patient record</p>
                </div>
              </div>
              <button onClick={closeRegModal} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Tab switcher */}
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
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* ─ Personal Details ─ */}
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

              {/* ─ Contact Details ─ */}
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
                        placeholder="Phone number"
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
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-start gap-2 mb-2">
                    <span className="material-symbols-outlined text-amber-500 text-lg mt-0.5">info</span>
                    <p className="text-[11px] text-amber-700">Emergency contact is optional but recommended for patient safety.</p>
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

            {/* Modal footer */}
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
                    <span className="material-symbols-outlined text-sm align-middle mr-1">arrow_back</span> Back
                  </button>
                )}
                {regSection !== 'emergency' ? (
                  <button
                    onClick={handleRegNext}
                    className="px-5 py-2 text-sm font-bold text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm"
                  >
                    Next <span className="material-symbols-outlined text-sm align-middle ml-1">arrow_forward</span>
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

function formatTimeStr(t: string): string {
  const parts = t.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export default AppointmentBooking;
