import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import opticalService from '../../services/opticalService';
import patientService from '../../services/patientService';
import appointmentService from '../../services/appointmentService';
import scheduleService from '../../services/scheduleService';
import type { Patient } from '../../types/patient';
import type { DoctorOption } from '../../types/appointment';
import type { OpticalPrescriptionCreateData } from '../../types/optical';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';
import { canEdit } from '../../config/modulePermissions';

const NewOpticalPrescription: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();
  // Full "optical" edit (admin/optical_staff) can manage the whole Optical
  // Store, so after saving they land on the Rx detail page as before. A
  // caller with only the narrower "optical.exam" permission (nurse's
  // pre-consultation quick-entry, or a doctor without Optical Store access)
  // has no view access to that detail page at all, so they return to the
  // Walk-in Queue instead — same pattern as NurseVitals.tsx.
  const hasFullOpticalAccess = canEdit('optical', user?.roles);

  // ── Patient lookup ────────────────────────────────────────────────────
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientFocused, setPatientFocused] = useState(false);
  const selectPatient = (p: Patient) => { setSelectedPatient(p); setPatientSearch(''); setPatientFocused(false); };
  const patientNav = useListKeyboardNav(patients, selectPatient);

  useEffect(() => {
    if (selectedPatient || !patientFocused) { setPatients([]); return; }
    const timeoutId = window.setTimeout(() => {
      patientService.getPatients(1, 10, patientSearch.trim()).then(r => setPatients(r.data)).catch(() => setPatients([]));
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [patientSearch, selectedPatient, patientFocused]);

  // Pre-fill from Walk-in Queue's "Optical" action, same convention as
  // PrescriptionBuilder.tsx/NurseVitals.tsx — patient auto-selected (skips
  // the search step) and appointment_id carried through to the created
  // prescription so it's linked to that visit.
  const [appointmentId] = useState(searchParams.get('appointment_id') || '');
  useEffect(() => {
    const prefillPatientId = searchParams.get('patient_id');
    if (!prefillPatientId) return;
    patientService.getPatient(prefillPatientId).then(selectPatient).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Doctor picker — OPTIONAL. doctor_id is nullable on the backend, and
  // optical_staff isn't a doctor so it can't be resolved from the logged-in
  // user like the Prescription Builder's embedded flow does. Optical staff
  // may optionally file the Rx under a real doctor from the hospital's
  // roster, or leave it blank. ──
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [doctorId, setDoctorId] = useState(() => sessionStorage.getItem('opticalRxDoctorId') || '');
  const [doctorLabel, setDoctorLabel] = useState(() => sessionStorage.getItem('opticalRxDoctorLabel') || '');
  useEffect(() => {
    scheduleService.getDoctors().then(setDoctors).catch(() => toast.error('Failed to load doctors'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Optical (spectacle) Rx clinical fields — identical set to what
  // PrescriptionBuilder.tsx's embedded "Add Optical" section collects
  // (left/right SPH, CYL, Axis, Add, VA; PD distance/near; notes). ──
  const [opticalRx, setOpticalRx] = useState<Omit<OpticalPrescriptionCreateData, 'patient_id' | 'doctor_id'>>({});
  const opticalNumField = (field: keyof OpticalPrescriptionCreateData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOpticalRx(prev => ({ ...prev, [field]: value === '' ? undefined : Number(value) }));
  };
  const [saving, setSaving] = useState(false);

  // ── Re-open an existing draft for this appointment instead of creating a
  // duplicate — mirrors NurseVitals.tsx's draft-vitals lookup. Covers both a
  // nurse re-entering "Optical" for the same visit, and the case where the
  // page is reloaded mid-entry.
  const [existingRxId, setExistingRxId] = useState<string | null>(null);
  const [existingRxFinalized, setExistingRxFinalized] = useState(false);
  useEffect(() => {
    if (!appointmentId) return;
    opticalService.getPrescriptionByAppointment(appointmentId).then(rx => {
      if (!rx) return;
      setExistingRxId(rx.id);
      setExistingRxFinalized(!!rx.is_finalized);
      setOpticalRx({
        right_sph: rx.right_sph ?? undefined, right_cyl: rx.right_cyl ?? undefined,
        right_axis: rx.right_axis ?? undefined, right_add: rx.right_add ?? undefined, right_va: rx.right_va ?? undefined,
        right_vision: rx.right_vision ?? undefined, right_iop: rx.right_iop ?? undefined, right_nld: rx.right_nld ?? undefined,
        left_sph: rx.left_sph ?? undefined, left_cyl: rx.left_cyl ?? undefined,
        left_axis: rx.left_axis ?? undefined, left_add: rx.left_add ?? undefined, left_va: rx.left_va ?? undefined,
        left_vision: rx.left_vision ?? undefined, left_iop: rx.left_iop ?? undefined, left_nld: rx.left_nld ?? undefined,
        pd_distance: rx.pd_distance ?? undefined, pd_near: rx.pd_near ?? undefined,
        pd_right: rx.pd_right ?? undefined, pd_left: rx.pd_left ?? undefined,
        notes: rx.notes ?? undefined,
      });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  // Patient's issue/complaint at the time of this visit — same field
  // reception fills in at registration (Appointment.chief_complaint), same
  // as NurseVitals.tsx's Complaint field, so both entry points read/write
  // the one appointment record the doctor already reads from. Only
  // applicable when this Rx is tied to a live visit (appointmentId set) —
  // the standalone walk-in-without-consultation case has no appointment to
  // attach a complaint to.
  const [complaint, setComplaint] = useState('');
  useEffect(() => {
    if (!appointmentId) return;
    appointmentService.getAppointment(appointmentId)
      .then(appt => setComplaint(appt.chief_complaint || ''))
      .catch(() => {});
  }, [appointmentId]);

  // Returning from the full Patient Registration form (Register.tsx) after
  // registering a walk-in patient who wasn't found in search above — same
  // sessionStorage 'walkInReturnUrl' + '?new_patient_id=' round trip already
  // used by PrescriptionBuilder.tsx, reused as-is rather than the reduced
  // inline modal this page used to have (that duplicated only a subset of
  // Register.tsx's fields — now every "register new patient" entry point in
  // the app goes through the same canonical form).
  useEffect(() => {
    const newPatientId = searchParams.get('new_patient_id');
    if (!newPatientId) return;
    patientService.getPatient(newPatientId)
      .then(selectPatient)
      .catch(() => toast.error('Could not load newly registered patient'));
    searchParams.delete('new_patient_id');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToRegisterPatient = () => {
    // Register.tsx appends "?new_patient_id=..." to this on return, so it
    // must be the bare pathname (matches PrescriptionBuilder.tsx's contract) —
    // appending location.search here would produce a malformed double "?".
    // The doctor picked above (if any) survives the round trip via the
    // 'opticalRxDoctorId'/'opticalRxDoctorLabel' sessionStorage keys set on
    // selection, not via URL — same technique PrescriptionBuilder.tsx uses
    // for its doctor picker.
    sessionStorage.setItem('walkInReturnUrl', location.pathname);
    navigate('/register');
  };

  const hasOpticalFields = Object.values(opticalRx).some(v => v !== undefined && v !== '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) { toast.error('Select or register a patient'); return; }
    if (!hasOpticalFields) { toast.error('Fill in at least one field of the eye prescription'); return; }
    if (existingRxFinalized) { toast.error('This visit’s optical prescription has already been finalized and can no longer be edited'); return; }

    setSaving(true);
    try {
      const rx = existingRxId
        ? await opticalService.updatePrescription(existingRxId, opticalRx)
        : await opticalService.createPrescription({
            patient_id: selectedPatient.id,
            doctor_id: doctorId || undefined,
            ...opticalRx,
            appointment_id: appointmentId || undefined,
          });
      if (appointmentId) {
        await appointmentService.updateAppointment(appointmentId, { chief_complaint: complaint || undefined });
      }
      toast.success(existingRxId ? 'Eye prescription draft saved' : `Eye prescription ${rx.prescription_number} created`);
      if (hasFullOpticalAccess) {
        navigate(`/optical/prescriptions/${rx.id}`);
      } else {
        navigate('/appointments/queue');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save eye prescription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{existingRxId ? 'Eye Prescription Draft' : 'New Eye Prescription'}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {appointmentId
              ? 'Record the eye-exam measurements ahead of the consultation — saved as a draft the doctor will see and finalize.'
              : 'Record a spectacle/eyewear prescription directly from the Optical Store — no doctor consultation required.'}
          </p>
        </div>
      </div>

      {existingRxFinalized && (
        <div className="px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          This visit's optical prescription has already been finalized by the doctor and can no longer be edited here.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Patient */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-xs font-semibold text-slate-500 uppercase">Patient *</label>
            <button
              type="button"
              onClick={goToRegisterPatient}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-base">person_add</span>
              Register New Patient
            </button>
          </div>
          {selectedPatient ? (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                {selectedPatient.first_name[0]}{selectedPatient.last_name[0]}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{selectedPatient.first_name} {selectedPatient.last_name}</p>
                <p className="text-xs text-slate-500">PRN: {selectedPatient.patient_reference_number} · {selectedPatient.phone_number}</p>
              </div>
              <button type="button" onClick={() => { setSelectedPatient(null); setPatientSearch(''); }}
                className="ml-auto text-slate-400 hover:text-red-500">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                onKeyDown={patientNav.onKeyDown}
                onFocus={() => setPatientFocused(true)}
                onBlur={() => window.setTimeout(() => setPatientFocused(false), 150)}
                placeholder="Search existing patient by name, PRN, or phone — or register a new one above"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
              />
              {patientFocused && patients.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {!patientSearch.trim() && (
                    <p className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-100">Recent patients</p>
                  )}
                  {patients.map((p, idx) => (
                    <button key={p.id} type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectPatient(p)}
                      onMouseEnter={() => patientNav.setActiveIndex(idx)}
                      className={`w-full text-left px-3 py-2 text-sm ${idx === patientNav.activeIndex ? 'bg-primary/10' : 'hover:bg-slate-50'}`}>
                      {p.first_name} {p.last_name} <span className="text-slate-400 text-xs">({p.patient_reference_number})</span>
                    </button>
                  ))}
                </div>
              )}
              {patientFocused && patientSearch.trim().length >= 2 && patients.length === 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs text-slate-400">
                  No matching patient — use "Register New Patient" above.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Doctor */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">File Under Doctor (Optional)</label>
          <SearchableSelect
            value={doctorLabel}
            onChange={(value, metadata) => {
              const id = metadata?.id ? (metadata.id as string) : '';
              setDoctorLabel(value);
              setDoctorId(id);
              // Persisted so the doctor pick survives the /register round trip
              // (component remounts on navigation) — same technique
              // PrescriptionBuilder.tsx uses via 'pharmacistRxDoctorId'.
              if (id) {
                sessionStorage.setItem('opticalRxDoctorId', id);
                sessionStorage.setItem('opticalRxDoctorLabel', value);
              } else {
                sessionStorage.removeItem('opticalRxDoctorId');
                sessionStorage.removeItem('opticalRxDoctorLabel');
              }
            }}
            suggestions={doctors.map((d): SuggestionOption => ({
              id: d.doctor_id,
              label: d.name,
              sublabel: d.specialization || undefined,
              metadata: { id: d.doctor_id },
            }))}
            placeholder="Search doctor (optional)..."
            allowManualEntry={false}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            This walk-in prescription is recorded without a consultation — optionally pick the doctor it should be filed under.
          </p>
        </div>

        {/* Complaint — only applicable when tied to a live visit; a
            standalone walk-in Rx (no consultation) has no appointment to
            attach it to. */}
        {appointmentId && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary text-sm">symptoms</span>
              Complaint
            </h3>
            <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)}
              rows={2} placeholder="What is the patient reporting? (e.g. eye redness, watering)"
              className="input-field resize-none" />
          </div>
        )}

        {/* Eye Exam — Vision / IOP / NLD, kept separate from and shown before
            the spectacle (SPH/CYL/Axis) prescription below since it records
            the raw exam findings rather than a lens prescription. */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-sm">visibility</span>
            Eye Exam
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-lg p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide pb-1 border-b border-slate-100">Right Eye (OD)</h4>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Vision</label>
                <input value={opticalRx.right_vision || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, right_vision: e.target.value }))} placeholder="6/9" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">IOP / Tension (Schiotz)</label>
                <input value={opticalRx.right_iop || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, right_iop: e.target.value }))} placeholder="16 mmHg" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">NLD</label>
                <input value={opticalRx.right_nld || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, right_nld: e.target.value }))} placeholder="Patent" className="input-field" />
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide pb-1 border-b border-slate-100">Left Eye (OS)</h4>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Vision</label>
                <input value={opticalRx.left_vision || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, left_vision: e.target.value }))} placeholder="6/9" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">IOP / Tension (Schiotz)</label>
                <input value={opticalRx.left_iop || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, left_iop: e.target.value }))} placeholder="16 mmHg" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">NLD</label>
                <input value={opticalRx.left_nld || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, left_nld: e.target.value }))} placeholder="Patent" className="input-field" />
              </div>
            </div>
          </div>
        </div>

        {/* Optical (Spectacle) Prescription */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-sm">visibility</span>
            Optical (Spectacle) Prescription
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Right Eye (OD) — shown first (screen-left) per the clinical
                  convention of facing the patient, matching Eye Exam above. */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide pb-1 border-b border-slate-100">Right Eye (OD)</h4>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">SPH</label>
                  <input type="number" step="0.25" value={opticalRx.right_sph ?? ''} onChange={opticalNumField('right_sph')} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">CYL</label>
                  <input type="number" step="0.25" value={opticalRx.right_cyl ?? ''} onChange={opticalNumField('right_cyl')} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Axis</label>
                  <input type="number" min={0} max={180} value={opticalRx.right_axis ?? ''} onChange={opticalNumField('right_axis')} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Add</label>
                  <input type="number" step="0.25" value={opticalRx.right_add ?? ''} onChange={opticalNumField('right_add')} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Visual Acuity</label>
                  <input value={opticalRx.right_va || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, right_va: e.target.value }))} placeholder="6/6" className="input-field" />
                </div>
              </div>

              {/* Left Eye (OS) */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide pb-1 border-b border-slate-100">Left Eye (OS)</h4>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">SPH</label>
                  <input type="number" step="0.25" value={opticalRx.left_sph ?? ''} onChange={opticalNumField('left_sph')} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">CYL</label>
                  <input type="number" step="0.25" value={opticalRx.left_cyl ?? ''} onChange={opticalNumField('left_cyl')} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Axis</label>
                  <input type="number" min={0} max={180} value={opticalRx.left_axis ?? ''} onChange={opticalNumField('left_axis')} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Add</label>
                  <input type="number" step="0.25" value={opticalRx.left_add ?? ''} onChange={opticalNumField('left_add')} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Visual Acuity</label>
                  <input value={opticalRx.left_va || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, left_va: e.target.value }))} placeholder="6/6" className="input-field" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">PD Distance (mm)</label>
                <input type="number" step="0.5" value={opticalRx.pd_distance ?? ''} onChange={opticalNumField('pd_distance')} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">PD Near (mm)</label>
                <input type="number" step="0.5" value={opticalRx.pd_near ?? ''} onChange={opticalNumField('pd_near')} className="input-field" />
              </div>
            </div>

            {/* Per-eye PD — distinct from PD Distance/Near above (which split
                by viewing distance, not by eye); some opticians measure and
                prescribe PD per eye instead of a single binocular value. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">PD Right / OD (mm)</label>
                <input type="number" step="0.5" value={opticalRx.pd_right ?? ''} onChange={opticalNumField('pd_right')} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">PD Left / OS (mm)</label>
                <input type="number" step="0.5" value={opticalRx.pd_left ?? ''} onChange={opticalNumField('pd_left')} className="input-field" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Optical Notes</label>
              <input value={opticalRx.notes || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, notes: e.target.value }))} className="input-field" />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving || existingRxFinalized}
            className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Saving...' : existingRxId ? 'Save Draft' : hasFullOpticalAccess ? 'Create Prescription' : 'Save Draft'}
          </button>
        </div>
      </form>

    </div>
  );
};

export default NewOpticalPrescription;
