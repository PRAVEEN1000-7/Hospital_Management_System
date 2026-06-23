import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import patientService from '../../services/patientService';
import scheduleService from '../../services/scheduleService';
import appointmentService from '../../services/appointmentService';
import type { OpticalPrescription, OpticalPrescriptionCreateData } from '../../types/optical';
import type { Patient } from '../../types/patient';
import type { DoctorOption, Appointment } from '../../types/appointment';
import { useToast } from '../../contexts/ToastContext';
import { format } from 'date-fns';

const EMPTY_RX: OpticalPrescriptionCreateData = {
  patient_id: '', doctor_id: '', appointment_id: undefined,
  right_sph: undefined, right_cyl: undefined, right_axis: undefined, right_add: undefined, right_va: '',
  left_sph: undefined, left_cyl: undefined, left_axis: undefined, left_add: undefined, left_va: '',
  pd_distance: undefined, pd_near: undefined, notes: '',
};

const fieldClass = 'w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary';
// Appointments still useful to assign a prescription against once they're done.
const ASSIGNABLE_STATUSES = ['scheduled', 'pending', 'confirmed', 'in-progress', 'completed'];
// Only ophthalmology/optometry doctors may be assigned an eye prescription — keep
// in sync with the backend's EYE_SPECIALIST_KEYWORDS in optical_service.py.
const EYE_SPECIALIST_KEYWORDS = ['ophthalm', 'optic', 'optometr', 'eye'];
const isEyeSpecialist = (specialization?: string | null) => {
  if (!specialization) return false;
  const text = specialization.toLowerCase();
  return EYE_SPECIALIST_KEYWORDS.some(kw => text.includes(kw));
};

const OpticalPrescriptions: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [prescriptions, setPrescriptions] = useState<OpticalPrescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Appointment-based picker (primary, easiest path)
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentSearch, setAppointmentSearch] = useState('');
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [manualMode, setManualMode] = useState(false);

  // Manual patient/doctor picker (fallback, for walk-ins with no appointment on file)
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [form, setForm] = useState<OpticalPrescriptionCreateData>(EMPTY_RX);

  const fetchPrescriptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await opticalService.getPrescriptions(1, 50);
      setPrescriptions(res.data);
    } catch {
      toast.error('Failed to load eye prescriptions');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  useEffect(() => {
    if (showForm) {
      scheduleService.getDoctors().then(r => setDoctors(r.filter(d => isEyeSpecialist(d.specialization)))).catch(() => {});
    }
  }, [showForm]);

  // Default to today's appointments; typing a patient name searches more broadly.
  // Only appointments with an eye specialist are shown — an eye prescription can
  // only ever be assigned to one, so a general physician's appointment isn't a
  // valid pick here regardless of how the patient got on the schedule.
  useEffect(() => {
    if (!showForm) return;
    setLoadingAppointments(true);
    const timeoutId = window.setTimeout(() => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const filters = appointmentSearch.trim()
        ? { search: appointmentSearch.trim() }
        : { date_from: today, date_to: today };
      appointmentService.getAppointments(1, 50, filters)
        .then(r => setAppointments(r.data.filter(a =>
          ASSIGNABLE_STATUSES.includes(a.status) && isEyeSpecialist(a.doctor_specialization)
        )))
        .catch(() => setAppointments([]))
        .finally(() => setLoadingAppointments(false));
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [showForm, appointmentSearch]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!patientSearch.trim()) { setPatients([]); return; }
      patientService.getPatients(1, 10, patientSearch.trim()).then(r => setPatients(r.data)).catch(() => setPatients([]));
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [patientSearch]);

  const selectedPatient = patients.find(p => p.id === form.patient_id);

  const selectAppointment = (appt: Appointment) => {
    setSelectedAppointment(appt);
    setForm(prev => ({ ...prev, patient_id: appt.patient_id, doctor_id: appt.doctor_id || '', appointment_id: appt.id }));
  };

  const clearAppointment = () => {
    setSelectedAppointment(null);
    setForm(prev => ({ ...prev, patient_id: '', doctor_id: '', appointment_id: undefined }));
  };

  const resetPickers = () => {
    setSelectedAppointment(null);
    setManualMode(false);
    setAppointmentSearch('');
    setPatientSearch('');
  };

  const handleNumChange = (field: keyof OpticalPrescriptionCreateData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm(prev => ({ ...prev, [field]: value === '' ? undefined : Number(value) }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id) { toast.error('Select a patient (via appointment or manually)'); return; }
    if (!form.doctor_id) { toast.error('Select a doctor'); return; }

    setSaving(true);
    try {
      await opticalService.createPrescription(form);
      toast.success('Eye prescription created');
      setShowForm(false);
      setForm(EMPTY_RX);
      resetPickers();
      fetchPrescriptions();
    } catch {
      toast.error('Failed to create eye prescription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Eye Prescriptions</h1>
          <p className="mt-1 text-sm text-slate-500">Sphere/cylinder/axis/add power and PD measurements per patient.</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); if (showForm) { setForm(EMPTY_RX); resetPickers(); } }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90">
          <span className="material-symbols-outlined text-lg">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancel' : 'New Prescription'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          {/* Patient & Doctor — appointment picker is the easy/primary path */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase">Patient & Doctor *</label>
              {!manualMode && (
                <button type="button" onClick={() => { setManualMode(true); clearAppointment(); }}
                  className="text-xs font-semibold text-primary hover:underline">
                  No appointment? Enter manually
                </button>
              )}
              {manualMode && (
                <button type="button" onClick={() => { setManualMode(false); setForm(prev => ({ ...prev, patient_id: '', doctor_id: '' })); }}
                  className="text-xs font-semibold text-primary hover:underline">
                  Pick from an appointment instead
                </button>
              )}
            </div>

            {!manualMode ? (
              selectedAppointment ? (
                <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                  <div className="text-sm">
                    <p className="font-semibold text-slate-900">
                      {selectedAppointment.patient_name} <span className="text-slate-400">({selectedAppointment.patient_reference_number})</span>
                    </p>
                    <p className="text-slate-600">
                      with {selectedAppointment.doctor_name || 'doctor'} — {format(new Date(selectedAppointment.appointment_date), 'dd MMM yyyy')}
                      {selectedAppointment.start_time ? `, ${selectedAppointment.start_time}` : ''}
                    </p>
                  </div>
                  <button type="button" onClick={clearAppointment} className="text-xs font-semibold text-slate-500 hover:text-red-600">
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={appointmentSearch}
                    onChange={(e) => setAppointmentSearch(e.target.value)}
                    placeholder="Search by patient name, or leave blank for today's appointments"
                    className={fieldClass}
                  />
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                    {loadingAppointments ? (
                      <div className="px-3 py-4 text-center text-sm text-slate-400">Loading appointments...</div>
                    ) : appointments.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-slate-400">
                        No eye specialist appointments found{!appointmentSearch.trim() ? ' for today' : ''}.
                      </div>
                    ) : (
                      appointments.map(appt => (
                        <button key={appt.id} type="button" onClick={() => selectAppointment(appt)}
                          className="w-full flex items-center justify-between text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0">
                          <span>
                            <span className="font-medium text-slate-900">{appt.patient_name}</span>
                            <span className="text-slate-400"> ({appt.patient_reference_number})</span>
                            <span className="text-slate-500"> — Dr. {appt.doctor_name || '—'}</span>
                          </span>
                          <span className="text-xs text-slate-400 shrink-0 ml-2">
                            {format(new Date(appt.appointment_date), 'dd MMM')}{appt.start_time ? `, ${appt.start_time}` : ''}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <input
                    value={selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : patientSearch}
                    onChange={(e) => { setPatientSearch(e.target.value); setForm(prev => ({ ...prev, patient_id: '' })); }}
                    placeholder="Search patient by name"
                    className={fieldClass}
                  />
                  {patientSearch && !form.patient_id && patients.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {patients.map(p => (
                        <button key={p.id} type="button"
                          onClick={() => { setForm(prev => ({ ...prev, patient_id: p.id })); setPatientSearch(''); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                          {p.first_name} {p.last_name} <span className="text-slate-400 text-xs">({p.patient_reference_number})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <select value={form.doctor_id} onChange={(e) => setForm(prev => ({ ...prev, doctor_id: e.target.value }))}
                    className={fieldClass}>
                    <option value="">Select eye specialist</option>
                    {doctors.map(d => <option key={d.doctor_id} value={d.doctor_id}>{d.name}{d.specialization ? ` (${d.specialization})` : ''}</option>)}
                  </select>
                  {doctors.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">No eye specialist (Ophthalmology/Optometry) doctor is configured yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase">
                  <th className="py-2 pr-2">Eye</th>
                  <th className="py-2 pr-2">SPH</th>
                  <th className="py-2 pr-2">CYL</th>
                  <th className="py-2 pr-2">Axis</th>
                  <th className="py-2 pr-2">Add</th>
                  <th className="py-2 pr-2">Visual Acuity</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1 pr-2 font-semibold text-slate-700">Right (OD)</td>
                  <td className="py-1 pr-2"><input type="number" step="0.25" value={form.right_sph ?? ''} onChange={handleNumChange('right_sph')} className={fieldClass} /></td>
                  <td className="py-1 pr-2"><input type="number" step="0.25" value={form.right_cyl ?? ''} onChange={handleNumChange('right_cyl')} className={fieldClass} /></td>
                  <td className="py-1 pr-2"><input type="number" min={0} max={180} value={form.right_axis ?? ''} onChange={handleNumChange('right_axis')} className={fieldClass} /></td>
                  <td className="py-1 pr-2"><input type="number" step="0.25" value={form.right_add ?? ''} onChange={handleNumChange('right_add')} className={fieldClass} /></td>
                  <td className="py-1 pr-2"><input value={form.right_va || ''} onChange={(e) => setForm(prev => ({ ...prev, right_va: e.target.value }))} placeholder="6/6" className={fieldClass} /></td>
                </tr>
                <tr>
                  <td className="py-1 pr-2 font-semibold text-slate-700">Left (OS)</td>
                  <td className="py-1 pr-2"><input type="number" step="0.25" value={form.left_sph ?? ''} onChange={handleNumChange('left_sph')} className={fieldClass} /></td>
                  <td className="py-1 pr-2"><input type="number" step="0.25" value={form.left_cyl ?? ''} onChange={handleNumChange('left_cyl')} className={fieldClass} /></td>
                  <td className="py-1 pr-2"><input type="number" min={0} max={180} value={form.left_axis ?? ''} onChange={handleNumChange('left_axis')} className={fieldClass} /></td>
                  <td className="py-1 pr-2"><input type="number" step="0.25" value={form.left_add ?? ''} onChange={handleNumChange('left_add')} className={fieldClass} /></td>
                  <td className="py-1 pr-2"><input value={form.left_va || ''} onChange={(e) => setForm(prev => ({ ...prev, left_va: e.target.value }))} placeholder="6/6" className={fieldClass} /></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">PD Distance (mm)</label>
              <input type="number" step="0.5" value={form.pd_distance ?? ''} onChange={handleNumChange('pd_distance')} className={fieldClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">PD Near (mm)</label>
              <input type="number" step="0.5" value={form.pd_near ?? ''} onChange={handleNumChange('pd_near')} className={fieldClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
            <input value={form.notes || ''} onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))} className={fieldClass} />
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving...' : 'Create Prescription'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : prescriptions.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2 block">description</span>
            <p className="font-medium">No eye prescriptions yet</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Rx Number</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 font-semibold text-slate-600">OD (SPH/CYL/Axis)</th>
                <th className="px-4 py-3 font-semibold text-slate-600">OS (SPH/CYL/Axis)</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prescriptions.map(rx => (
                <tr key={rx.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/optical/prescriptions/${rx.id}`)}>
                  <td className="px-4 py-3 font-medium text-slate-900">{rx.prescription_number}</td>
                  <td className="px-4 py-3 text-slate-600">{format(new Date(rx.created_at), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 text-slate-600">{rx.right_sph ?? '—'} / {rx.right_cyl ?? '—'} / {rx.right_axis ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{rx.left_sph ?? '—'} / {rx.left_cyl ?? '—'} / {rx.left_axis ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${rx.is_finalized ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {rx.is_finalized ? 'Finalized' : 'Draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default OpticalPrescriptions;
