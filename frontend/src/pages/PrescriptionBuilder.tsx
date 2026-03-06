import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import prescriptionService from '../services/prescriptionService';
import patientService from '../services/patientService';
import walkInService from '../services/walkInService';
import scheduleService from '../services/scheduleService';
import type { PrescriptionItemCreate, Medicine, PrescriptionTemplate } from '../types/prescription';
import type { Patient } from '../types/patient';
import type { DoctorOption } from '../types/appointment';

const FREQUENCY_OPTIONS = ['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-0', '0-1-1', '1-1-1', '1-1-1-1'];
const DURATION_UNITS = ['days', 'weeks', 'months'];
const ROUTE_OPTIONS = ['oral', 'topical', 'injection', 'inhalation', 'sublingual', 'rectal', 'nasal', 'ophthalmic', 'otic'];

const emptyItem = (): PrescriptionItemCreate => ({
  medicine_name: '',
  generic_name: '',
  dosage: '',
  frequency: '1-0-1',
  duration_value: 7,
  duration_unit: 'days',
  route: 'oral',
  instructions: '',
  quantity: undefined,
  allow_substitution: true,
  display_order: 0,
});

/** A diagnosis group — each diagnosis has its own list of medicines */
interface DiagnosisBlock {
  id: string;
  diagnosis: string;
  items: PrescriptionItemCreate[];
}

const createBlock = (diagnosis = '', items?: PrescriptionItemCreate[]): DiagnosisBlock => ({
  id: crypto.randomUUID(),
  diagnosis,
  items: items && items.length > 0 ? items : [emptyItem()],
});

const PrescriptionBuilder: React.FC = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isEditMode = Boolean(editId);

  // Form state
  const [patientId, setPatientId] = useState(searchParams.get('patient_id') || '');
  const [appointmentId, setAppointmentId] = useState(searchParams.get('appointment_id') || '');
  const [queueId] = useState(searchParams.get('queue_id') || '');
  const isConsultationMode = Boolean(queueId);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [advice, setAdvice] = useState('');
  const [blocks, setBlocks] = useState<DiagnosisBlock[]>([createBlock()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Vitals state
  const [vitalsBp, setVitalsBp] = useState('');
  const [vitalsPulse, setVitalsPulse] = useState('');
  const [vitalsTemp, setVitalsTemp] = useState('');
  const [vitalsWeight, setVitalsWeight] = useState('');
  const [vitalsSpo2, setVitalsSpo2] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  // Search states
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientSearch, setShowPatientSearch] = useState(!patientId);

  // Medicine search — scoped to a specific block + item
  const [medicineSearch, setMedicineSearch] = useState('');
  const [medicineResults, setMedicineResults] = useState<Medicine[]>([]);
  const [activeMedBlockIdx, setActiveMedBlockIdx] = useState<number | null>(null);
  const [activeMedItemIdx, setActiveMedItemIdx] = useState<number | null>(null);

  // Templates
  const [templates, setTemplates] = useState<PrescriptionTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  // Refer to Doctor modal state
  const [showReferModal, setShowReferModal] = useState(false);
  const [referDoctors, setReferDoctors] = useState<DoctorOption[]>([]);
  const [referDoctorId, setReferDoctorId] = useState('');
  const [referDate, setReferDate] = useState('');
  const [referReason, setReferReason] = useState('');
  const [referSaving, setReferSaving] = useState(false);
  const [referDoctorLoad, setReferDoctorLoad] = useState<number | null>(null);

  // Load patient if ID passed via URL
  useEffect(() => {
    if (patientId) {
      patientService.getPatient(patientId)
        .then(p => { setPatient(p); setShowPatientSearch(false); })
        .catch(() => showToast('error', 'Patient not found'));
    }
  }, [patientId]);

  // Load existing prescription in edit mode
  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    prescriptionService.getPrescription(editId)
      .then(rx => {
        if (rx.is_finalized) {
          showToast('error', 'Cannot edit a finalized prescription');
          navigate(`/prescriptions/${editId}`);
          return;
        }
        setPatientId(rx.patient_id);
        setAppointmentId(rx.appointment_id || '');
        setClinicalNotes(rx.clinical_notes || '');
        setAdvice(rx.advice || '');
        setVitalsBp(rx.vitals_bp || '');
        setVitalsPulse(rx.vitals_pulse || '');
        setVitalsTemp(rx.vitals_temp || '');
        setVitalsWeight(rx.vitals_weight || '');
        setVitalsSpo2(rx.vitals_spo2 || '');
        setFollowUpDate(rx.follow_up_date || '');
        const loadedItems: PrescriptionItemCreate[] =
          rx.items && rx.items.length > 0
            ? rx.items.map((item, idx) => ({
                medicine_id: item.medicine_id || undefined,
                medicine_name: item.medicine_name,
                generic_name: item.generic_name || '',
                dosage: item.dosage,
                frequency: item.frequency,
                duration_value: item.duration_value || 7,
                duration_unit: item.duration_unit || 'days',
                route: item.route || 'oral',
                instructions: item.instructions || '',
                quantity: item.quantity || undefined,
                allow_substitution: item.allow_substitution,
                display_order: idx,
              }))
            : [];
        setBlocks([createBlock(rx.diagnosis || '', loadedItems.length > 0 ? loadedItems : undefined)]);
      })
      .catch(() => {
        showToast('error', 'Failed to load prescription');
        navigate('/prescriptions');
      })
      .finally(() => setLoading(false));
  }, [editId]);

  // Load templates
  useEffect(() => {
    prescriptionService.getTemplates()
      .then(setTemplates)
      .catch(() => {});
  }, []);

  // Load doctors for referral (consultation mode only)
  useEffect(() => {
    if (isConsultationMode) {
      scheduleService.getDoctors().then(setReferDoctors).catch(() => {});
    }
  }, [isConsultationMode]);

  // Fetch doctor load for referral warning
  useEffect(() => {
    if (!referDoctorId || !referDate) { setReferDoctorLoad(null); return; }
    let cancelled = false;
    walkInService.getDoctorLoads(referDate).then(loads => {
      if (cancelled) return;
      setReferDoctorLoad(loads[referDoctorId] ?? 0);
    }).catch(() => { if (!cancelled) setReferDoctorLoad(null); });
    return () => { cancelled = true; };
  }, [referDoctorId, referDate]);

  // Patient search
  const searchPatients = useCallback(async (q: string) => {
    if (q.length < 2) { setPatientResults([]); return; }
    try {
      const res = await patientService.getPatients(1, 5, q);
      setPatientResults(res.data);
    } catch { setPatientResults([]); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchPatients(patientSearch), 300);
    return () => clearTimeout(timer);
  }, [patientSearch, searchPatients]);

  // Medicine search
  const searchMedicines = useCallback(async (q: string) => {
    if (q.length < 2) { setMedicineResults([]); return; }
    try {
      const res = await prescriptionService.getMedicines(1, 10, q);
      setMedicineResults(res.data);
    } catch { setMedicineResults([]); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchMedicines(medicineSearch), 300);
    return () => clearTimeout(timer);
  }, [medicineSearch, searchMedicines]);

  const selectPatient = (p: Patient) => {
    setPatient(p);
    setPatientId(p.id);
    setShowPatientSearch(false);
    setPatientSearch('');
    setPatientResults([]);
  };

  const selectMedicine = (med: Medicine, blockIdx: number, itemIdx: number) => {
    const newBlocks = [...blocks];
    const updatedItems = [...newBlocks[blockIdx].items];
    updatedItems[itemIdx] = {
      ...updatedItems[itemIdx],
      medicine_id: med.id,
      medicine_name: `${med.name}${med.strength ? ' ' + med.strength : ''}`,
      generic_name: med.generic_name,
    };
    newBlocks[blockIdx] = { ...newBlocks[blockIdx], items: updatedItems };
    setBlocks(newBlocks);
    setMedicineSearch('');
    setMedicineResults([]);
    setActiveMedBlockIdx(null);
    setActiveMedItemIdx(null);
  };

  const updateItem = (blockIdx: number, itemIdx: number, field: keyof PrescriptionItemCreate, value: unknown) => {
    const newBlocks = [...blocks];
    const updatedItems = [...newBlocks[blockIdx].items];
    updatedItems[itemIdx] = { ...updatedItems[itemIdx], [field]: value };
    newBlocks[blockIdx] = { ...newBlocks[blockIdx], items: updatedItems };
    setBlocks(newBlocks);
  };

  const addItemToBlock = (blockIdx: number) => {
    const newBlocks = [...blocks];
    const updatedItems = [...newBlocks[blockIdx].items, { ...emptyItem(), display_order: newBlocks[blockIdx].items.length }];
    newBlocks[blockIdx] = { ...newBlocks[blockIdx], items: updatedItems };
    setBlocks(newBlocks);
  };

  const removeItemFromBlock = (blockIdx: number, itemIdx: number) => {
    const newBlocks = [...blocks];
    if (newBlocks[blockIdx].items.length === 1) return;
    const updatedItems = newBlocks[blockIdx].items.filter((_: PrescriptionItemCreate, i: number) => i !== itemIdx);
    newBlocks[blockIdx] = { ...newBlocks[blockIdx], items: updatedItems };
    setBlocks(newBlocks);
  };

  /** Auto-add a new empty row when user starts typing in the last medicine row */
  const handleMedicineNameChange = (blockIdx: number, itemIdx: number, value: string) => {
    updateItem(blockIdx, itemIdx, 'medicine_name', value);
    setMedicineSearch(value);
    setActiveMedBlockIdx(blockIdx);
    setActiveMedItemIdx(itemIdx);
    // Auto-add new row if typing in the last item
    if (itemIdx === blocks[blockIdx].items.length - 1 && value.length > 0) {
      const lastItem = blocks[blockIdx].items[itemIdx];
      if (!lastItem.medicine_name || lastItem.medicine_name === value) {
        addItemToBlock(blockIdx);
      }
    }
  };

  const addBlock = () => {
    setBlocks([...blocks, createBlock()]);
  };

  const removeBlock = (blockIdx: number) => {
    if (blocks.length === 1) return;
    setBlocks(blocks.filter((_: DiagnosisBlock, i: number) => i !== blockIdx));
  };

  const updateBlockDiagnosis = (blockIdx: number, value: string) => {
    const newBlocks = [...blocks];
    newBlocks[blockIdx] = { ...newBlocks[blockIdx], diagnosis: value };
    setBlocks(newBlocks);
  };

  const applyTemplate = (tmpl: PrescriptionTemplate) => {
    setAdvice(tmpl.advice || '');
    const newItems: PrescriptionItemCreate[] = tmpl.items.map((ti, idx) => ({
      medicine_name: ti.medicine_name,
      generic_name: ti.generic_name || '',
      dosage: ti.dosage,
      frequency: ti.frequency,
      duration_value: ti.duration_value || 7,
      duration_unit: ti.duration_unit || 'days',
      route: ti.route || 'oral',
      instructions: ti.instructions || '',
      allow_substitution: true,
      display_order: idx,
    }));
    setBlocks([createBlock(tmpl.diagnosis || '', newItems.length > 0 ? newItems : undefined)]);
    setShowTemplates(false);
    prescriptionService.useTemplate(tmpl.id).catch(() => {});
    showToast('success', `Template "${tmpl.name}" applied`);
  };

  const handleSave = async (finalize: boolean = false, completeQueue: boolean = false) => {
    if (!patient) { showToast('error', 'Please select a patient'); return; }

    // Flatten blocks into single diagnosis string & ordered items for the API
    const allDiagnoses = blocks.map(b => b.diagnosis.trim()).filter(Boolean).join('; ');
    let displayOrder = 0;
    const validItems: PrescriptionItemCreate[] = blocks.flatMap(b =>
      b.items
        .filter((i: PrescriptionItemCreate) => i.medicine_name.trim())
        .map((i: PrescriptionItemCreate) => ({ ...i, display_order: displayOrder++ }))
    );
    if (validItems.length === 0) { showToast('error', 'Add at least one medicine'); return; }

    // Common vitals payload
    const vitalsPayload = {
      vitals_bp: vitalsBp || undefined,
      vitals_pulse: vitalsPulse || undefined,
      vitals_temp: vitalsTemp || undefined,
      vitals_weight: vitalsWeight || undefined,
      vitals_spo2: vitalsSpo2 || undefined,
      follow_up_date: followUpDate || undefined,
    };

    setSaving(true);
    try {
      let rxId: string;

      if (isEditMode && editId) {
        // Update existing prescription
        const updated = await prescriptionService.updatePrescription(editId, {
          diagnosis: allDiagnoses || undefined,
          clinical_notes: clinicalNotes || undefined,
          advice: advice || undefined,
          ...vitalsPayload,
          items: validItems,
        });
        rxId = updated.id;
      } else {
        // Create new prescription
        const rx = await prescriptionService.createPrescription({
          patient_id: patient.id,
          appointment_id: appointmentId || undefined,
          queue_id: queueId || undefined,
          diagnosis: allDiagnoses || undefined,
          clinical_notes: clinicalNotes || undefined,
          advice: advice || undefined,
          ...vitalsPayload,
          items: validItems,
        });
        rxId = rx.id;
      }

      if (completeQueue) {
        // Finalize prescription + complete queue entry in one call
        await prescriptionService.finalizeAndComplete(rxId);
        showToast('success', 'Prescription finalized & consultation completed!');
        navigate('/appointments/queue');
      } else if (finalize) {
        await prescriptionService.finalizePrescription(rxId);
        showToast('success', 'Prescription finalized & sent to pharmacy!');
        navigate('/prescriptions');
      } else {
        showToast('success', isEditMode ? 'Prescription updated' : 'Prescription saved as draft');
        if (!isEditMode) navigate('/prescriptions');
      }
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to save prescription');
    } finally {
      setSaving(false);
    }
  };

  const initials = patient
    ? `${patient.first_name?.[0] || ''}${patient.last_name?.[0] || ''}`.toUpperCase()
    : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <nav className="flex text-sm text-slate-400 mb-1">
            <span>{isConsultationMode ? 'Queue' : 'Prescriptions'}</span>
            <span className="mx-2">/</span>
            <span className="text-slate-600">{isConsultationMode ? 'Consultation' : isEditMode ? 'Edit Prescription' : 'New Prescription'}</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900">
            {isConsultationMode ? 'Consultation & Prescription' : isEditMode ? 'Edit Prescription' : 'E-Prescription Builder'}
          </h1>
        </div>
        <div className="flex gap-3">
          {isConsultationMode && (
            <button
              onClick={() => navigate('/appointments/queue')}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Back to Queue
            </button>
          )}
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">bookmark</span>
            Load Template
          </button>
          <button
            onClick={() => navigate('/prescriptions')}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">list</span>
            All Prescriptions
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Form — expanded to take 3/4 width */}
        <div className="lg:col-span-3 space-y-6">
          {/* Patient Selection */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">person</span> Patient
            </h3>

            {patient && !showPatientSearch ? (
              <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                  {initials}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-primary">
                    {patient.first_name} {patient.last_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {patient.patient_reference_number} | {patient.age_years ? `${patient.age_years}y` : ''}/{patient.gender?.[0]?.toUpperCase() || ''} | {patient.blood_group || ''}
                  </p>
                </div>
                <button
                  onClick={() => { setShowPatientSearch(true); setPatient(null); setPatientId(''); }}
                  className="text-primary text-sm font-medium hover:underline"
                >
                  Change Patient
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="material-symbols-outlined text-slate-400 text-sm">search</span>
                  </span>
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={e => setPatientSearch(e.target.value)}
                    placeholder="Search patient by name, phone, or PRN..."
                    className="input-field pl-10"
                    autoFocus
                  />
                </div>
                {patientResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {patientResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => selectPatient(p)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                      >
                        <p className="text-sm font-medium">{p.first_name} {p.last_name}</p>
                        <p className="text-xs text-slate-500">
                          {p.patient_reference_number} | {p.phone_number}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Patient Medical History & Allergies — shown when patient is selected */}
          {patient && (
            <div className="rounded-xl border-2 border-indigo-300 shadow-lg overflow-hidden ring-2 ring-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-indigo-50/40">
              {/* ALLERGY ALERT BANNER */}
              {patient.known_allergies && (
                <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-5 shadow-md">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-white text-2xl animate-pulse">warning</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-3">
                        <span>⚠ Allergy Alert</span>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold bg-yellow-400 text-red-900 shadow-sm animate-pulse">CRITICAL</span>
                      </h4>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {patient.known_allergies.split(',').map((allergy, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-bold bg-white text-red-700 border-2 border-red-200 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-red-600" style={{ fontSize: '16px' }}>block</span>
                            {allergy.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* MEDICAL HISTORY SECTION */}
              <div className="px-6 py-5">
                <h3 className="text-base font-bold mb-4 flex items-center gap-2 text-indigo-800">
                  <span className="material-symbols-outlined text-indigo-600">history</span>
                  Patient Medical History
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-wider">Important</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Chronic Conditions */}
                  <div className="rounded-lg border-2 border-amber-300 p-4 bg-amber-50 shadow-sm">
                    <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-amber-600" style={{ fontSize: '18px' }}>monitor_heart</span>
                      Chronic Conditions
                    </h4>
                    {patient.chronic_conditions ? (
                      <div className="flex flex-wrap gap-2">
                        {patient.chronic_conditions.split(',').map((condition, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border-2 border-amber-300 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-amber-600 mr-1" style={{ fontSize: '14px' }}>warning</span>
                            {condition.trim()}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No chronic conditions recorded</p>
                    )}
                  </div>

                  {/* Known Allergies (detailed card view) */}
                  <div className={`rounded-lg border-2 p-4 shadow-sm ${patient.known_allergies ? 'border-red-400 bg-red-50' : 'border-green-300 bg-green-50'}`}>
                    <h4 className={`text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5 ${patient.known_allergies ? 'text-red-700' : 'text-green-700'}`}>
                      <span className={`material-symbols-outlined ${patient.known_allergies ? 'text-red-600' : 'text-green-600'}`} style={{ fontSize: '18px' }}>allergy</span>
                      Known Allergies
                    </h4>
                    {patient.known_allergies ? (
                      <div className="flex flex-wrap gap-2">
                        {patient.known_allergies.split(',').map((allergy, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border-2 border-red-400 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-red-600" style={{ fontSize: '14px' }}>dangerous</span>
                            {allergy.trim()}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-green-700 font-semibold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-green-600" style={{ fontSize: '18px' }}>check_circle</span>
                        No known allergies (NKDA)
                      </p>
                    )}
                  </div>
                </div>

                {/* Patient Quick Info */}
                <div className="mt-4 rounded-lg border-2 border-indigo-200 p-4 bg-indigo-50/70 shadow-sm">
                  <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-indigo-600" style={{ fontSize: '18px' }}>badge</span>
                    Patient Summary
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div className="bg-white rounded-lg p-2.5 border border-indigo-100 shadow-sm">
                      <span className="text-[10px] text-indigo-400 block font-semibold uppercase tracking-wide">Age/Gender</span>
                      <span className="font-bold text-indigo-900">{patient.age_years ? `${patient.age_years}y` : 'N/A'} / {patient.gender?.[0]?.toUpperCase() || 'N/A'}</span>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border border-indigo-100 shadow-sm">
                      <span className="text-[10px] text-indigo-400 block font-semibold uppercase tracking-wide">Blood Group</span>
                      <span className="font-bold text-indigo-900">{patient.blood_group || 'N/A'}</span>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border border-indigo-100 shadow-sm">
                      <span className="text-[10px] text-indigo-400 block font-semibold uppercase tracking-wide">PRN</span>
                      <span className="font-bold text-indigo-900">{patient.patient_reference_number}</span>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border border-indigo-100 shadow-sm">
                      <span className="text-[10px] text-indigo-400 block font-semibold uppercase tracking-wide">Phone</span>
                      <span className="font-bold text-indigo-900">{patient.phone_number}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Vitals Section */}
          {patient && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">vital_signs</span> Vitals
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">BP (mmHg)</label>
                  <input type="text" value={vitalsBp} onChange={e => setVitalsBp(e.target.value)} placeholder="120/80"
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Pulse (bpm)</label>
                  <input type="text" value={vitalsPulse} onChange={e => setVitalsPulse(e.target.value)} placeholder="72"
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Temp (&deg;F)</label>
                  <input type="text" value={vitalsTemp} onChange={e => setVitalsTemp(e.target.value)} placeholder="98.6"
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Weight (kg)</label>
                  <input type="text" value={vitalsWeight} onChange={e => setVitalsWeight(e.target.value)} placeholder="70"
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">SpO2 (%)</label>
                  <input type="text" value={vitalsSpo2} onChange={e => setVitalsSpo2(e.target.value)} placeholder="98"
                    className="input-field" />
                </div>
              </div>
            </div>
          )}

          {/* Single Diagnosis & Medicines block */}
          {blocks.slice(0, 1).map((block, blockIdx) => (
            <div key={block.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-visible">
              {/* Block header */}
              <div className="flex justify-between items-center px-6 pt-5 pb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-sm">medical_information</span>
                  Diagnosis & Medicines
                </h3>
              </div>

              <div className="px-6 pb-5 space-y-4">
                {/* Diagnosis input */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Diagnosis <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={block.diagnosis}
                    onChange={e => updateBlockDiagnosis(blockIdx, e.target.value)}
                    className="input-field"
                    placeholder="e.g., Essential Hypertension (I10)"
                  />
                </div>

                {/* Medicines Table */}
                <div>
                  <h4 className="text-sm font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-xs">medication</span>
                    Medicines
                    <span className="text-[10px] text-slate-400 ml-1">({block.items.filter(i => i.medicine_name.trim()).length} added)</span>
                  </h4>

                  <div className="border border-slate-200 rounded-lg overflow-visible">
                    {/* Table Header */}
                    <div className="grid grid-cols-[40px_1fr_80px_100px_120px_80px_1fr_40px] gap-1 bg-slate-100 border-b border-slate-200 px-3 py-2">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">#</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Medicine</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Dosage</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Frequency</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Duration</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Route</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Instruction</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase text-center">×</div>
                    </div>

                    {/* Medicine Rows */}
                    {block.items.map((item, itemIdx) => (
                      <div
                        key={itemIdx}
                        className={`grid grid-cols-[40px_1fr_80px_100px_120px_80px_1fr_40px] gap-1 items-center px-3 py-1.5 border-b border-slate-100 last:border-0 hover:bg-blue-50/30 transition-colors ${item.medicine_name.trim() ? 'bg-white' : 'bg-slate-50/50'}`}
                      >
                        {/* Row number */}
                        <div className="text-xs text-slate-400 font-medium">{itemIdx + 1}</div>

                        {/* Medicine Name with autocomplete */}
                        <div className="relative pr-2">
                          <input
                            type="text"
                            value={item.medicine_name}
                            onChange={e => handleMedicineNameChange(blockIdx, itemIdx, e.target.value)}
                            onFocus={() => { setActiveMedBlockIdx(blockIdx); setActiveMedItemIdx(itemIdx); }}
                            onBlur={() => setTimeout(() => { setActiveMedBlockIdx(null); setActiveMedItemIdx(null); }, 200)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                            placeholder="Type medicine name..."
                          />
                          {item.generic_name && (
                            <p className="text-[9px] text-slate-400 mt-0.5 truncate">{item.generic_name}</p>
                          )}
                          {activeMedBlockIdx === blockIdx && activeMedItemIdx === itemIdx && medicineResults.length > 0 && (
                            <div className="absolute z-50 left-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                              {medicineResults.map(med => (
                                <button
                                  key={med.id}
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => selectMedicine(med, blockIdx, itemIdx)}
                                  className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs border-b border-slate-100 last:border-0"
                                >
                                  <span className="font-medium">{med.name}</span>
                                  {med.strength && <span className="text-slate-500"> {med.strength}</span>}
                                  <span className="text-[10px] text-slate-400 block">{med.generic_name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Dosage */}
                        <div className="pr-1">
                          <input
                            type="text"
                            value={item.dosage}
                            onChange={e => updateItem(blockIdx, itemIdx, 'dosage', e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                            placeholder="500mg"
                          />
                        </div>

                        {/* Frequency */}
                        <div className="pr-1">
                          <select
                            value={item.frequency}
                            onChange={e => updateItem(blockIdx, itemIdx, 'frequency', e.target.value)}
                            className="w-full px-1 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                          >
                            {FREQUENCY_OPTIONS.map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        </div>

                        {/* Duration */}
                        <div className="pr-1">
                          <div className="flex gap-0.5">
                            <input
                              type="number"
                              value={item.duration_value || ''}
                              onChange={e => updateItem(blockIdx, itemIdx, 'duration_value', parseInt(e.target.value) || null)}
                              className="w-10 px-1 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-center"
                              min={1}
                            />
                            <select
                              value={item.duration_unit || 'days'}
                              onChange={e => updateItem(blockIdx, itemIdx, 'duration_unit', e.target.value)}
                              className="flex-1 px-1 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                            >
                              {DURATION_UNITS.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Route */}
                        <div className="pr-1">
                          <select
                            value={item.route || 'oral'}
                            onChange={e => updateItem(blockIdx, itemIdx, 'route', e.target.value)}
                            className="w-full px-1 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                          >
                            {ROUTE_OPTIONS.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>

                        {/* Instructions */}
                        <div className="pr-1">
                          <input
                            type="text"
                            value={item.instructions || ''}
                            onChange={e => updateItem(blockIdx, itemIdx, 'instructions', e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                            placeholder="e.g., After meals, with warm water..."
                          />
                        </div>

                        {/* Delete */}
                        <div className="flex justify-center">
                          <button
                            onClick={() => removeItemFromBlock(blockIdx, itemIdx)}
                            disabled={block.items.length === 1}
                            className="w-6 h-6 rounded border border-red-200 flex items-center justify-center hover:bg-red-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                          >
                            <span className="material-symbols-outlined text-red-400" style={{ fontSize: '14px' }}>close</span>
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Quick Add Row */}
                    <div
                      onClick={() => {
                        const lastItem = block.items[block.items.length - 1];
                        if (lastItem.medicine_name.trim()) addItemToBlock(blockIdx);
                      }}
                      className="grid grid-cols-1 items-center px-3 py-2 bg-slate-50/80 hover:bg-primary/5 cursor-pointer transition-colors border-t border-dashed border-slate-200"
                    >
                      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-primary">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add_circle</span>
                        Click to add another medicine row (or just start typing in the last empty row)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Clinical Notes */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">clinical_notes</span> Clinical Notes
            </h3>
            <textarea
              rows={3}
              value={clinicalNotes}
              onChange={e => setClinicalNotes(e.target.value)}
              className="input-field"
              placeholder="Patient presents with..."
            />
          </div>

          {/* Advice */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">info</span> Advice
            </h3>
            <textarea
              rows={3}
              value={advice}
              onChange={e => setAdvice(e.target.value)}
              className="input-field"
              placeholder="Diet, exercise, follow-up instructions..."
            />
          </div>

          {/* Follow-up Date */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">event_upcoming</span> Follow-up Date
            </h3>
            <input
              type="date"
              value={followUpDate}
              onChange={e => setFollowUpDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="input-field max-w-xs"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pb-6">
            <div className="flex gap-2">
              <button
                onClick={() => navigate(isConsultationMode ? '/appointments/queue' : '/prescriptions')}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              {isConsultationMode && (
                <button
                  onClick={() => { setShowReferModal(true); setReferDoctorId(''); setReferDate(''); setReferReason(''); }}
                  className="px-4 py-2 rounded-lg border border-orange-200 text-sm font-semibold text-orange-700 hover:bg-orange-50 flex items-center gap-2 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">send</span>
                  Refer to Doctor
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleSave(false, false)}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              {isConsultationMode ? (
                <button
                  onClick={() => handleSave(false, true)}
                  disabled={saving}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">task_alt</span>
                  {saving ? 'Saving...' : 'Save & Complete'}
                </button>
              ) : (
                <button
                  onClick={() => handleSave(true, false)}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">send</span>
                  {saving ? 'Saving...' : 'Save & Send to Pharmacy'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Templates + History */}
        <div className="space-y-6">
          {/* Templates */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xs">star</span> Favorite Templates
            </h4>
            {templates.length > 0 ? (
              <div className="space-y-2">
                {templates.slice(0, 5).map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => applyTemplate(tmpl)}
                    className="w-full text-left p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <p className="text-sm font-medium">{tmpl.name}</p>
                    <p className="text-xs text-slate-500">
                      {tmpl.items?.map((i: any) => i.medicine_name).join(', ')}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Used {tmpl.usage_count} times</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No templates yet. Create one from a finished prescription.</p>
            )}
          </div>

          {/* Medicine Formulary */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h4 className="text-sm font-semibold mb-3">Formulary Search</h4>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="material-symbols-outlined text-slate-400 text-sm">search</span>
              </span>
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                placeholder="Search medicines..."
                value={medicineSearch}
                onChange={e => { setMedicineSearch(e.target.value); setActiveMedBlockIdx(null); setActiveMedItemIdx(null); }}
              />
            </div>
            {activeMedBlockIdx === null && medicineResults.length > 0 && (
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {medicineResults.map(med => (
                  <div key={med.id} className="p-2 bg-slate-50 rounded text-xs">
                    <span className="font-medium">{med.name}</span>
                    {med.strength && <span className="text-slate-500"> {med.strength}</span>}
                    <span className="text-slate-400 block">{med.generic_name}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-2">Search generic/brand names.</p>
          </div>

          {/* Patient History (if patient selected) */}
          {patient && (
            <PatientRxHistory patientId={patient.id} />
          )}
        </div>
      </div>

      {/* ── Refer to Doctor Modal ──────────────────────────────────── */}
      {showReferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-orange-600">send</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Refer to Another Doctor</h3>
                  <p className="text-xs text-slate-500">{patient?.first_name} {patient?.last_name}</p>
                </div>
              </div>
              <button onClick={() => setShowReferModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Select Doctor / Specialist <span className="text-red-500">*</span>
                </label>
                <select
                  value={referDoctorId}
                  onChange={(e) => setReferDoctorId(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="">— Choose a doctor —</option>
                  {referDoctors.map(d => (
                    <option key={d.doctor_id} value={d.doctor_id}>
                      {d.name}{d.specialization ? ` — ${d.specialization}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Appointment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={referDate}
                  onChange={(e) => setReferDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              {referDoctorLoad !== null && referDoctorId && referDate && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm ${
                  referDoctorLoad >= 15 ? 'bg-red-50 text-red-700 border border-red-200' :
                  referDoctorLoad >= 8 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  <span className="material-symbols-outlined text-base">
                    {referDoctorLoad >= 15 ? 'warning' : referDoctorLoad >= 8 ? 'info' : 'check_circle'}
                  </span>
                  <span>
                    {referDoctors.find(d => d.doctor_id === referDoctorId)?.name || 'Selected doctor'} already has <strong>{referDoctorLoad}</strong> patient{referDoctorLoad !== 1 ? 's' : ''} on this date
                  </span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Referral Reason
                </label>
                <textarea
                  value={referReason}
                  onChange={(e) => setReferReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Needs cardiology evaluation for chest pain..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setShowReferModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!referDoctorId || !referDate || !queueId) return;
                  setReferSaving(true);
                  try {
                    const result = await walkInService.referToDoctor({
                      queue_id: queueId,
                      to_doctor_id: referDoctorId,
                      referral_date: referDate,
                      referral_reason: referReason || undefined,
                    });
                    showToast('success', result.message);
                    setShowReferModal(false);
                    setReferDoctorLoad(null);
                    navigate('/appointments/queue');
                  } catch (err: any) {
                    showToast('error', err?.response?.data?.detail || 'Failed to refer patient');
                  }
                  setReferSaving(false);
                }}
                disabled={!referDoctorId || !referDate || referSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-xl hover:bg-orange-600 disabled:opacity-50 shadow-sm transition-all">
                <span className="material-symbols-outlined text-base">send</span>
                {referSaving ? 'Referring...' : 'Confirm Referral'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Sub-component: Patient prescription history sidebar
const PatientRxHistory: React.FC<{ patientId: string }> = ({ patientId }) => {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    prescriptionService.getPatientPrescriptions(patientId, 1, 5)
      .then(res => setHistory(res.data))
      .catch(() => {});
  }, [patientId]);

  const statusColor: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-700',
    finalized: 'bg-blue-100 text-blue-700',
    dispensed: 'bg-green-100 text-green-700',
    partially_dispensed: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h4 className="text-sm font-semibold mb-3">Prescription History</h4>
      {history.length > 0 ? (
        <div className="space-y-2">
          {history.map(rx => (
            <div key={rx.id} className="p-2 rounded-lg bg-slate-50 flex justify-between items-center">
              <div>
                <p className="text-xs font-medium">
                  {new Date(rx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <p className="text-[10px] text-slate-400">{rx.diagnosis || 'No diagnosis'}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColor[rx.status] || 'bg-slate-100 text-slate-600'}`}>
                {rx.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">No previous prescriptions.</p>
      )}
    </div>
  );
};

export default PrescriptionBuilder;
