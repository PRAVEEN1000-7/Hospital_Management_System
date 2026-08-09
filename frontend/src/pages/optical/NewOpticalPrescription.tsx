import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import opticalService from '../../services/opticalService';
import patientService from '../../services/patientService';
import scheduleService from '../../services/scheduleService';
import type { Patient } from '../../types/patient';
import type { DoctorOption } from '../../types/appointment';
import type { OpticalPrescriptionCreateData } from '../../types/optical';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';

const NewOpticalPrescription: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

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

    setSaving(true);
    try {
      const rx = await opticalService.createPrescription({
        patient_id: selectedPatient.id,
        doctor_id: doctorId || undefined,
        ...opticalRx,
      });
      toast.success(`Eye prescription ${rx.prescription_number} created`);
      navigate(`/optical/prescriptions/${rx.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to create eye prescription');
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
          <h1 className="text-2xl font-bold text-slate-900">New Eye Prescription</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Record a spectacle/eyewear prescription directly from the Optical Store — no doctor consultation required.
          </p>
        </div>
      </div>

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

        {/* Optical (Spectacle) Prescription */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-sm">visibility</span>
            Optical (Spectacle) Prescription
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              {/* Right Eye (OD) */}
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
          <button type="submit" disabled={saving}
            className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Create Prescription'}
          </button>
        </div>
      </form>

    </div>
  );
};

export default NewOpticalPrescription;
