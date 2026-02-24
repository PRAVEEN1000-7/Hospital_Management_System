import React, { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import walkInService from '../services/walkInService';
import scheduleService from '../services/scheduleService';
import patientService from '../services/patientService';
import type { DoctorOption } from '../types/appointment';
import type { Patient } from '../types/patient';

const WalkInRegistration: React.FC = () => {
  const toast = useToast();

  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | ''>('');
  const [urgencyLevel, setUrgencyLevel] = useState('routine');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ queueNumber: string; estimatedWait: number } | null>(null);

  // Patient search
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);

  useEffect(() => { scheduleService.getDoctors().then(setDoctors).catch(() => {}); }, []);

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
    setSubmitting(true);
    try {
      const appt = await walkInService.register({
        patient_id: selectedPatient.id,
        doctor_id: selectedDoctorId ? Number(selectedDoctorId) : undefined,
        reason_for_visit: reason || undefined,
        urgency_level: urgencyLevel,
      });
      setSuccess({
        queueNumber: appt.queue_number || '—',
        estimatedWait: appt.estimated_wait_time || 0,
      });
      toast.success('Walk-in registered successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Registration failed');
    }
    setSubmitting(false);
  };

  const handleReset = () => {
    setSelectedPatient(null);
    setPatientSearch('');
    setSelectedDoctorId('');
    setUrgencyLevel('routine');
    setReason('');
    setSuccess(null);
  };

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-emerald-600 text-3xl">check_circle</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Walk-in Registered</h2>
          <div className="bg-slate-50 rounded-xl p-6 mt-4 mb-6">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Queue Number</p>
            <p className="text-4xl font-black text-primary">{success.queueNumber}</p>
            <p className="text-sm text-slate-500 mt-2">Estimated wait: <span className="font-semibold text-slate-700">~{success.estimatedWait} min</span></p>
          </div>
          <button onClick={handleReset}
            className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm">
            Register Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Walk-in Registration</h1>
        <p className="text-slate-500 text-sm mt-1">Register a walk-in patient and add to queue</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        {/* Patient Search */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">Patient *</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <span className="material-symbols-outlined text-lg">search</span>
            </span>
            <input type="text" value={patientSearch}
              onChange={(e) => { setPatientSearch(e.target.value); setSelectedPatient(null); }}
              placeholder="Search patient by name, PRN, or phone..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
          </div>
          {patientLoading && <p className="text-xs text-slate-400 mt-1">Searching...</p>}
          {patients.length > 0 && !selectedPatient && (
            <div className="mt-1 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
              {patients.map(p => (
                <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch(p.full_name); setPatients([]); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 last:border-0">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{p.first_name[0]}{p.last_name[0]}</div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{p.full_name}</p>
                    <p className="text-[10px] text-slate-400">PRN: {p.prn}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedPatient && (
            <div className="mt-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">person</span>
              <div>
                <p className="text-sm font-bold text-slate-900">{selectedPatient.full_name}</p>
                <p className="text-[10px] text-slate-500">PRN: {selectedPatient.prn}</p>
              </div>
              <button onClick={() => { setSelectedPatient(null); setPatientSearch(''); }} className="ml-auto text-slate-400 hover:text-red-500">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          )}
        </div>

        {/* Doctor (optional) */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">Assign Doctor (optional)</label>
          <select value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value as any)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white">
            <option value="">Auto-assign (next available)</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name} — {d.department || 'General'}</option>)}
          </select>
        </div>

        {/* Urgency */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">Urgency Level</label>
          <div className="flex gap-3">
            {[
              { key: 'routine', label: 'Routine', icon: 'check_circle', color: 'emerald' },
              { key: 'urgent', label: 'Urgent', icon: 'warning', color: 'amber' },
              { key: 'emergency', label: 'Emergency', icon: 'emergency', color: 'red' },
            ].map(u => (
              <button key={u.key} onClick={() => setUrgencyLevel(u.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                  urgencyLevel === u.key
                    ? `bg-${u.color}-50 border-${u.color}-300 text-${u.color}-700`
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                <span className="material-symbols-outlined text-lg">{u.icon}</span>
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">Reason for Visit</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Brief description..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={!selectedPatient || submitting}
          className="w-full py-3 bg-primary text-white rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors shadow-sm">
          {submitting ? 'Registering...' : 'Register Walk-in'}
        </button>
      </div>
    </div>
  );
};

export default WalkInRegistration;
