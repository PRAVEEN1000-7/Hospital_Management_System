import React, { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import scheduleService from '../services/scheduleService';
import appointmentService from '../services/appointmentService';
import patientService from '../services/patientService';
import TimeSlotPicker from '../components/appointments/TimeSlotPicker';
import type { DoctorOption, TimeSlot, AvailableSlots } from '../types/appointment';
import type { Patient } from '../types/patient';

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

  // Load doctors
  useEffect(() => {
    scheduleService.getDoctors().then(setDoctors).catch(() => {});
  }, []);

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
    scheduleService.getAvailableSlots(selectedDoctor.id, selectedDate)
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
        doctor_id: selectedDoctor.id,
        appointment_type: 'scheduled',
        consultation_type: consultationType,
        appointment_date: selectedDate,
        appointment_time: selectedTime,
        reason_for_visit: reason || undefined,
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
            <h2 className="text-lg font-bold text-slate-900 mb-4">Select Patient</h2>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <span className="material-symbols-outlined text-lg">search</span>
              </span>
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => { setPatientSearch(e.target.value); setSelectedPatient(null); }}
                placeholder="Search by name, PRN, or phone..."
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
            </div>
            {patientLoading && <p className="text-xs text-slate-400 mt-2">Searching...</p>}
            {patients.length > 0 && !selectedPatient && (
              <div className="mt-2 border border-slate-200 rounded-lg max-h-60 overflow-y-auto">
                {patients.map(p => (
                  <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch(p.full_name); setPatients([]); }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {p.first_name[0]}{p.last_name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{p.full_name}</p>
                      <p className="text-xs text-slate-400">PRN: {p.prn} · {p.mobile_number}</p>
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
                  <p className="text-sm font-bold text-slate-900">{selectedPatient.full_name}</p>
                  <p className="text-xs text-slate-500">PRN: {selectedPatient.prn} · {selectedPatient.gender}</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Doctor</label>
                <select value={selectedDoctor?.id || ''} onChange={(e) => {
                  const doc = doctors.find(d => d.id === Number(e.target.value));
                  setSelectedDoctor(doc || null);
                  setSelectedTime(null);
                }}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white">
                  <option value="">Choose doctor...</option>
                  {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name} — {d.department || 'General'}</option>)}
                </select>
              </div>
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
            <p className="text-xs text-slate-400 mb-4">{selectedDoctor?.full_name} · {selectedDate}</p>
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
              <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">Patient</span><span className="text-sm font-semibold text-slate-900">{selectedPatient?.full_name}</span></div>
              <div className="flex justify-between"><span className="text-xs font-bold text-slate-400">Doctor</span><span className="text-sm font-semibold text-slate-900">{selectedDoctor?.full_name}</span></div>
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
