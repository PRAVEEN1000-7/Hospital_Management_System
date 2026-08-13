import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import labService from '../../services/labService';
import patientService from '../../services/patientService';
import scheduleService from '../../services/scheduleService';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';
import type { Patient } from '../../types/patient';
import type { DoctorOption } from '../../types/appointment';
import type { LabTest } from '../../types/lab';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';

const NewLabOrder: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Patient lookup ──────────────────────────────────────────────
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  // Lets the dropdown open on focus, before any typing — otherwise the only
  // way to pick a patient is to already know something to search for.
  const [patientFocused, setPatientFocused] = useState(false);
  const selectPatient = (p: Patient) => { setSelectedPatient(p); setPatientSearch(`${p.first_name} ${p.last_name}`); setPatients([]); setPatientFocused(false); };
  const patientNav = useListKeyboardNav(patients, selectPatient);

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
    // The doctor picked below (if any) survives the round trip via the
    // 'labOrderDoctorId'/'labOrderDoctorLabel' sessionStorage keys set on
    // selection, not via URL — same technique PrescriptionBuilder.tsx uses
    // for its doctor picker.
    sessionStorage.setItem('walkInReturnUrl', location.pathname);
    navigate('/register');
  };

  // ── Doctor picker — OPTIONAL. LabOrder.doctor_id is nullable in the
  // schema, so a lab_technician (who has no linked Doctor row of their own)
  // can leave this blank and the order is simply filed with doctor_id NULL.
  // Fetched the same way WalkInQueue.tsx's reception "Send to Doctor" picker
  // does, for the cases where staff do want to attribute the order. */
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState(() => sessionStorage.getItem('labOrderDoctorId') || '');
  const [doctorLabel, setDoctorLabel] = useState(() => sessionStorage.getItem('labOrderDoctorLabel') || '');

  useEffect(() => {
    scheduleService.getDoctors().then(setDoctors).catch(() => toast.error('Failed to load doctor list'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lab test picker — same search + category-grouped checklist UX as
  // PrescriptionBuilder.tsx's Laboratory Tests section. ──────────────
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [labTestSearch, setLabTestSearch] = useState('');
  const [selectedLabTestIds, setSelectedLabTestIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    labService.getTests(1, 500).then(res => setLabTests(res.data)).catch(() => toast.error('Failed to load lab test catalog'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labTestGroups = useMemo(() => {
    const q = labTestSearch.trim().toLowerCase();
    const filtered = q
      ? labTests.filter((t) =>
          t.name.toLowerCase().includes(q) ||
          t.code.toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q))
      : labTests;
    const groups = new Map<string, LabTest[]>();
    filtered.forEach((t) => {
      const key = t.category || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    });
    return Array.from(groups.entries()).map(([category, tests]) => ({ category, tests }));
  }, [labTests, labTestSearch]);

  const canSubmit = !!selectedPatient && selectedLabTestIds.length > 0 && !submitting;

  const resetForm = () => {
    setSelectedPatient(null);
    setPatientSearch('');
    setSelectedDoctorId('');
    setDoctorLabel('');
    setSelectedLabTestIds([]);
    setLabTestSearch('');
    setNotes('');
  };

  const handleSubmit = async () => {
    if (!selectedPatient) { toast.error('Select or register a patient first'); return; }
    if (selectedLabTestIds.length === 0) { toast.error('Select at least one lab test'); return; }
    setSubmitting(true);
    try {
      const order = await labService.createOrder({
        patient_id: selectedPatient.id,
        doctor_id: selectedDoctorId || undefined, // optional — see doctor-picker comment above
        test_ids: selectedLabTestIds,
        notes: notes.trim() || undefined,
      });
      toast.success(`Lab order ${order.order_number} created`);
      resetForm();
      navigate(`/lab/orders/${order.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to create lab order');
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New Lab Order</h1>
        <p className="text-slate-500 text-sm mt-1">
          Order lab tests directly for a walk-in patient — no prior doctor consultation required.
        </p>
      </div>

      {/* ── Patient ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">1. Patient</h2>
          <button
            onClick={goToRegisterPatient}
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
            onKeyDown={patientNav.onKeyDown}
            onFocus={() => setPatientFocused(true)}
            onBlur={() => window.setTimeout(() => setPatientFocused(false), 150)}
            placeholder="Search by name, PRN, or phone... or click to browse recent patients"
            className="w-full pl-10 pr-9 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          />
          {patientSearch && (
            <button type="button" onClick={() => { setPatientSearch(''); setSelectedPatient(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          )}
        </div>
        {patientLoading && <p className="text-xs text-slate-400 mt-2">Searching...</p>}
        {patientFocused && patients.length > 0 && !selectedPatient && (
          <div className="mt-2 border border-slate-200 rounded-lg max-h-60 overflow-y-auto">
            {!patientSearch.trim() && (
              <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">Recent patients</p>
            )}
            {patients.map((p, idx) => (
              <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => selectPatient(p)}
                onMouseEnter={() => patientNav.setActiveIndex(idx)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-100 last:border-0 ${
                  idx === patientNav.activeIndex ? 'bg-primary/10' : 'hover:bg-slate-50'
                }`}>
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
      </div>

      {/* ── Doctor ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">2. File Under Doctor (Optional)</h2>
        <p className="text-xs text-slate-400 mb-3">
          Optionally attribute this lab order to a doctor on record — leave blank if there is none.
        </p>
        <SearchableSelect
          value={doctorLabel}
          onChange={(value, metadata) => {
            const id = metadata?.id ? (metadata.id as string) : '';
            setDoctorLabel(value);
            setSelectedDoctorId(id);
            // Persisted so the doctor pick survives the /register round trip
            // (component remounts on navigation) — same technique
            // PrescriptionBuilder.tsx uses via 'pharmacistRxDoctorId'.
            if (id) {
              sessionStorage.setItem('labOrderDoctorId', id);
              sessionStorage.setItem('labOrderDoctorLabel', value);
            } else {
              sessionStorage.removeItem('labOrderDoctorId');
              sessionStorage.removeItem('labOrderDoctorLabel');
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
      </div>

      {/* ── Lab tests ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">3. Lab Tests</h2>
          {selectedLabTestIds.length > 0 && (
            <span className="px-3 py-1 text-xs font-bold rounded-lg bg-primary/10 text-primary">
              {selectedLabTestIds.length} selected
            </span>
          )}
        </div>
        {labTests.length === 0 ? (
          <p className="text-sm text-slate-400">No active lab tests in the catalog yet. Add tests under Laboratory → Test Catalog.</p>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
              <input
                value={labTestSearch}
                onChange={e => setLabTestSearch(e.target.value)}
                placeholder="Search tests by name, code, or category..."
                className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-3">
              {labTestGroups.length === 0 ? (
                <p className="text-sm text-slate-400">No tests match "{labTestSearch}".</p>
              ) : (
                labTestGroups.map(({ category, tests }) => {
                  const groupIds = tests.map(t => t.id);
                  const allChecked = groupIds.length > 0 && groupIds.every(id => selectedLabTestIds.includes(id));
                  const someChecked = groupIds.some(id => selectedLabTestIds.includes(id));
                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">{category}</div>
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-primary cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                            onChange={() => setSelectedLabTestIds(prev =>
                              allChecked
                                ? prev.filter(id => !groupIds.includes(id))
                                : [...new Set([...prev, ...groupIds])]
                            )}
                            className="accent-primary"
                          />
                          Select all
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {tests.map(t => {
                          const checked = selectedLabTestIds.includes(t.id);
                          return (
                            <label
                              key={t.id}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                                checked ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setSelectedLabTestIds(prev =>
                                  prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                                )}
                                className="accent-primary"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium text-slate-800 truncate">{t.name}</span>
                                <span className="block text-xs text-slate-400">
                                  {t.code}{t.price ? ` · ₹${Number(t.price).toFixed(2)}` : ''}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any clinical notes for the lab..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors shadow-sm inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">biotech</span>
          {submitting ? 'Creating...' : 'Create Lab Order'}
        </button>
      </div>

    </div>
  );
};

export default NewLabOrder;
