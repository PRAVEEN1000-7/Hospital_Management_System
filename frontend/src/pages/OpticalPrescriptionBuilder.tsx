import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import prescriptionService from '../services/prescriptionService';
import patientService from '../services/patientService';
import type { PrescriptionItemCreate, Medicine } from '../types/prescription';
import type { LensType } from '../types/prescription';
import type { Patient } from '../types/patient';

const LENS_TYPES: { value: LensType; label: string }[] = [
  { value: 'single_vision', label: 'Single Vision' },
  { value: 'bifocal', label: 'Bifocal' },
  { value: 'progressive', label: 'Progressive' },
  { value: 'contact', label: 'Contact Lens' },
];

const computeAge = (p: Patient | null): string => {
  if (!p) return 'N/A';
  if (p.age_years) return `${p.age_years}y`;
  if (p.date_of_birth) {
    const diff = Date.now() - new Date(p.date_of_birth).getTime();
    const years = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
    return years > 0 ? `${years}y` : '<1y';
  }
  return 'N/A';
};

const emptyItem = (): PrescriptionItemCreate => ({
  medicine_name: '',
  generic_name: '',
  dosage: '',
  frequency: '1-0-1',
  duration_value: 7,
  duration_unit: 'days',
  route: 'ophthalmic',
  instructions: '',
  quantity: undefined,
  allow_substitution: true,
  display_order: 0,
});

const OpticalPrescriptionBuilder: React.FC = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isEditMode = Boolean(editId);

  // Patient
  const [patientId, setPatientId] = useState(searchParams.get('patient_id') || '');
  const [appointmentId, setAppointmentId] = useState(searchParams.get('appointment_id') || '');
  const [queueId] = useState(searchParams.get('queue_id') || '');
  const isConsultationMode = Boolean(queueId);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Patient search
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientSearch, setShowPatientSearch] = useState(!patientId);

  // Optical refraction data
  const [rightSphere, setRightSphere] = useState('');
  const [rightCylinder, setRightCylinder] = useState('');
  const [rightAxis, setRightAxis] = useState('');
  const [rightAdd, setRightAdd] = useState('');
  const [rightVa, setRightVa] = useState('');
  const [rightIpd, setRightIpd] = useState('');
  const [leftSphere, setLeftSphere] = useState('');
  const [leftCylinder, setLeftCylinder] = useState('');
  const [leftAxis, setLeftAxis] = useState('');
  const [leftAdd, setLeftAdd] = useState('');
  const [leftVa, setLeftVa] = useState('');
  const [leftIpd, setLeftIpd] = useState('');

  // Lens info
  const [lensType, setLensType] = useState<LensType | ''>('');
  const [lensMaterial, setLensMaterial] = useState('');
  const [lensCoating, setLensCoating] = useState('');

  // Clinical
  const [diagnosis, setDiagnosis] = useState('');
  const [opticalNotes, setOpticalNotes] = useState('');
  const [advice, setAdvice] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  // Vitals
  const [vitalsBp, setVitalsBp] = useState('');
  const [vitalsPulse, setVitalsPulse] = useState('');

  // Eye drops / medicines (optional)
  const [items, setItems] = useState<PrescriptionItemCreate[]>([emptyItem()]);

  // Medicine search
  const [medicineSearch, setMedicineSearch] = useState('');
  const [medicineResults, setMedicineResults] = useState<Medicine[]>([]);
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);

  // Load patient if ID from URL
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
        setDiagnosis(rx.diagnosis || '');
        setAdvice(rx.advice || '');
        setOpticalNotes(rx.optical_notes || '');
        setVitalsBp(rx.vitals_bp || '');
        setVitalsPulse(rx.vitals_pulse || '');
        setFollowUpDate(rx.follow_up_date || '');
        // Optical fields
        setRightSphere(rx.right_sphere || '');
        setRightCylinder(rx.right_cylinder || '');
        setRightAxis(rx.right_axis || '');
        setRightAdd(rx.right_add || '');
        setRightVa(rx.right_va || '');
        setRightIpd(rx.right_ipd || '');
        setLeftSphere(rx.left_sphere || '');
        setLeftCylinder(rx.left_cylinder || '');
        setLeftAxis(rx.left_axis || '');
        setLeftAdd(rx.left_add || '');
        setLeftVa(rx.left_va || '');
        setLeftIpd(rx.left_ipd || '');
        setLensType((rx.lens_type as LensType) || '');
        setLensMaterial(rx.lens_material || '');
        setLensCoating(rx.lens_coating || '');
        // Items (eye drops etc.)
        if (rx.items && rx.items.length > 0) {
          setItems(rx.items.map((item, idx) => ({
            medicine_id: item.medicine_id || undefined,
            medicine_name: item.medicine_name,
            generic_name: item.generic_name || '',
            dosage: item.dosage,
            frequency: item.frequency,
            duration_value: item.duration_value || 7,
            duration_unit: item.duration_unit || 'days',
            route: item.route || 'ophthalmic',
            instructions: item.instructions || '',
            quantity: item.quantity || undefined,
            allow_substitution: item.allow_substitution,
            display_order: idx,
          })));
        }
      })
      .catch(() => {
        showToast('error', 'Failed to load prescription');
        navigate('/prescriptions');
      })
      .finally(() => setLoading(false));
  }, [editId]);

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

  const selectMedicine = (med: Medicine, itemIdx: number) => {
    const updated = [...items];
    let cleanName = med.name;
    if (med.strength && cleanName.toLowerCase().endsWith(med.strength.toLowerCase())) {
      cleanName = cleanName.slice(0, -med.strength.length).trim();
    }
    updated[itemIdx] = {
      ...updated[itemIdx],
      medicine_id: med.id,
      medicine_name: cleanName,
      generic_name: med.generic_name,
      dosage: med.strength || '',
    };
    setItems(updated);
    setMedicineSearch('');
    setMedicineResults([]);
    setActiveItemIdx(null);
  };

  const updateItem = (idx: number, field: keyof PrescriptionItemCreate, value: unknown) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    // Auto-add row when last row fills
    if (idx === updated.length - 1) {
      const last = updated[idx];
      if (last.medicine_name?.trim() && last.dosage?.trim()) {
        updated.push({ ...emptyItem(), display_order: updated.length });
      }
    }
    setItems(updated);
  };

  const removeItem = (idx: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleMedicineNameChange = (idx: number, value: string) => {
    updateItem(idx, 'medicine_name', value);
    setMedicineSearch(value);
    setActiveItemIdx(idx);
  };

  const handleSave = async (finalize = false, completeQueue = false) => {
    if (!patient) { showToast('error', 'Please select a patient'); return; }

    const validItems = items
      .filter(i => i.medicine_name.trim())
      .map((i, idx) => ({ ...i, display_order: idx }));

    const opticalPayload = {
      right_sphere: rightSphere || undefined,
      right_cylinder: rightCylinder || undefined,
      right_axis: rightAxis || undefined,
      right_add: rightAdd || undefined,
      right_va: rightVa || undefined,
      right_ipd: rightIpd || undefined,
      left_sphere: leftSphere || undefined,
      left_cylinder: leftCylinder || undefined,
      left_axis: leftAxis || undefined,
      left_add: leftAdd || undefined,
      left_va: leftVa || undefined,
      left_ipd: leftIpd || undefined,
      lens_type: lensType || undefined,
      lens_material: lensMaterial || undefined,
      lens_coating: lensCoating || undefined,
      optical_notes: opticalNotes || undefined,
    };

    setSaving(true);
    try {
      let rxId: string;

      if (isEditMode && editId) {
        const updated = await prescriptionService.updatePrescription(editId, {
          diagnosis: diagnosis || undefined,
          advice: advice || undefined,
          vitals_bp: vitalsBp || undefined,
          vitals_pulse: vitalsPulse || undefined,
          follow_up_date: followUpDate || undefined,
          ...opticalPayload,
          items: validItems.length > 0 ? validItems : undefined,
        });
        rxId = updated.id;
      } else {
        const rx = await prescriptionService.createPrescription({
          patient_id: patient.id,
          appointment_id: appointmentId || undefined,
          queue_id: queueId || undefined,
          prescription_type: 'optical',
          diagnosis: diagnosis || undefined,
          advice: advice || undefined,
          vitals_bp: vitalsBp || undefined,
          vitals_pulse: vitalsPulse || undefined,
          follow_up_date: followUpDate || undefined,
          ...opticalPayload,
          items: validItems,
        });
        rxId = rx.id;
      }

      if (completeQueue) {
        await prescriptionService.finalizeAndComplete(rxId);
        showToast('success', 'Optical prescription finalized & consultation completed!');
        navigate('/appointments/queue');
      } else if (finalize) {
        await prescriptionService.finalizePrescription(rxId);
        showToast('success', 'Optical prescription finalized!');
        navigate('/prescriptions');
      } else {
        showToast('success', isEditMode ? 'Optical prescription updated' : 'Optical prescription saved as draft');
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
            <span>Prescriptions</span>
            <span className="mx-2">/</span>
            <span className="text-slate-600">{isEditMode ? 'Edit Optical Prescription' : 'New Optical Prescription'}</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-teal-600">visibility</span>
            {isEditMode ? 'Edit Optical Prescription' : 'Optical Prescription Builder'}
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
            onClick={() => navigate('/prescriptions')}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">list</span>
            All Prescriptions
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient Selection */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">person</span> Patient
            </h3>

            {patient && !showPatientSearch ? (
              <div className="flex items-center gap-4 p-4 bg-teal-50 rounded-lg border border-teal-200">
                <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-lg font-bold text-teal-700">
                  {initials}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-teal-800">
                    {patient.first_name} {patient.last_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {patient.patient_reference_number} | {computeAge(patient)}/{patient.gender?.[0]?.toUpperCase() || ''} | {patient.blood_group || ''}
                  </p>
                </div>
                <button
                  onClick={() => { setShowPatientSearch(true); setPatient(null); setPatientId(''); }}
                  className="text-teal-700 text-sm font-medium hover:underline"
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
                        <p className="text-xs text-slate-500">{p.patient_reference_number} | {p.phone_number}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Diagnosis */}
          {patient && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-600 text-sm">medical_information</span> Diagnosis
              </h3>
              <input
                type="text"
                value={diagnosis}
                onChange={e => setDiagnosis(e.target.value)}
                placeholder="e.g., Myopia, Hypermetropia, Astigmatism, Presbyopia..."
                className="input-field"
              />
            </div>
          )}

          {/* Refraction Data — the core optical prescription */}
          {patient && (
            <div className="bg-white rounded-xl border-2 border-teal-200 p-6 shadow-sm">
              <h3 className="font-bold mb-5 flex items-center gap-2 text-teal-800">
                <span className="material-symbols-outlined text-teal-600">visibility</span>
                Refraction / Power Details
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-700 uppercase tracking-wider">Required</span>
              </h3>

              {/* Right Eye */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">R</span>
                  Right Eye (OD)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Sphere (SPH)</label>
                    <input type="text" value={rightSphere} onChange={e => setRightSphere(e.target.value)}
                      placeholder="+1.00" className="input-field text-center" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Cylinder (CYL)</label>
                    <input type="text" value={rightCylinder} onChange={e => setRightCylinder(e.target.value)}
                      placeholder="-0.50" className="input-field text-center" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Axis</label>
                    <input type="text" value={rightAxis} onChange={e => setRightAxis(e.target.value)}
                      placeholder="180" className="input-field text-center" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Add</label>
                    <input type="text" value={rightAdd} onChange={e => setRightAdd(e.target.value)}
                      placeholder="+1.50" className="input-field text-center" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">VA</label>
                    <input type="text" value={rightVa} onChange={e => setRightVa(e.target.value)}
                      placeholder="6/6" className="input-field text-center" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">IPD (mm)</label>
                    <input type="text" value={rightIpd} onChange={e => setRightIpd(e.target.value)}
                      placeholder="32" className="input-field text-center" />
                  </div>
                </div>
              </div>

              {/* Left Eye */}
              <div className="mb-4">
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">L</span>
                  Left Eye (OS)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Sphere (SPH)</label>
                    <input type="text" value={leftSphere} onChange={e => setLeftSphere(e.target.value)}
                      placeholder="+1.00" className="input-field text-center" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Cylinder (CYL)</label>
                    <input type="text" value={leftCylinder} onChange={e => setLeftCylinder(e.target.value)}
                      placeholder="-0.50" className="input-field text-center" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Axis</label>
                    <input type="text" value={leftAxis} onChange={e => setLeftAxis(e.target.value)}
                      placeholder="180" className="input-field text-center" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Add</label>
                    <input type="text" value={leftAdd} onChange={e => setLeftAdd(e.target.value)}
                      placeholder="+1.50" className="input-field text-center" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">VA</label>
                    <input type="text" value={leftVa} onChange={e => setLeftVa(e.target.value)}
                      placeholder="6/6" className="input-field text-center" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">IPD (mm)</label>
                    <input type="text" value={leftIpd} onChange={e => setLeftIpd(e.target.value)}
                      placeholder="32" className="input-field text-center" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Lens Recommendation */}
          {patient && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-600 text-sm">eyeglasses</span> Lens Recommendation
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Lens Type</label>
                  <select value={lensType} onChange={e => setLensType(e.target.value as LensType | '')} className="input-field">
                    <option value="">-- Select --</option>
                    {LENS_TYPES.map(lt => (
                      <option key={lt.value} value={lt.value}>{lt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Lens Material</label>
                  <input type="text" value={lensMaterial} onChange={e => setLensMaterial(e.target.value)}
                    placeholder="e.g., CR-39, Polycarbonate, Hi-index..." className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Coating</label>
                  <input type="text" value={lensCoating} onChange={e => setLensCoating(e.target.value)}
                    placeholder="e.g., Anti-reflective, Blue cut, Photochromic..." className="input-field" />
                </div>
              </div>
            </div>
          )}

          {/* Eye Drops / Medicines (optional) */}
          {patient && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-600 text-sm">medication</span>
                Eye Drops / Medicines
                <span className="text-[10px] text-slate-400 ml-1">(Optional)</span>
              </h3>

              <div className="border border-slate-200 rounded-lg overflow-visible">
                {/* Header */}
                <div className="grid grid-cols-[40px_1fr_100px_100px_1fr_40px] gap-1 bg-slate-100 border-b border-slate-200 px-3 py-2">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">#</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">Medicine / Eye Drop</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">Dosage</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">Frequency</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">Instructions</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase text-center">&times;</div>
                </div>

                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[40px_1fr_100px_100px_1fr_40px] gap-1 items-center px-3 py-1.5 border-b border-slate-100 last:border-0 hover:bg-teal-50/30"
                  >
                    <div className="text-xs text-slate-400 font-medium">{idx + 1}</div>
                    <div className="relative pr-2">
                      <input
                        type="text"
                        value={item.medicine_name}
                        onChange={e => handleMedicineNameChange(idx, e.target.value)}
                        onFocus={() => setActiveItemIdx(idx)}
                        onBlur={() => setTimeout(() => setActiveItemIdx(null), 200)}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-teal-200 focus:border-teal-500 outline-none"
                        placeholder="Type eye drop name..."
                      />
                      {activeItemIdx === idx && medicineResults.length > 0 && (
                        <div className="absolute z-50 left-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                          {medicineResults.map(med => (
                            <button
                              key={med.id}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => selectMedicine(med, idx)}
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
                    <div>
                      <input type="text" value={item.dosage}
                        onChange={e => updateItem(idx, 'dosage', e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-teal-200 focus:border-teal-500 outline-none"
                        placeholder="1 drop" />
                    </div>
                    <div>
                      <input type="text" value={item.frequency}
                        onChange={e => updateItem(idx, 'frequency', e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-teal-200 focus:border-teal-500 outline-none"
                        placeholder="3x daily" />
                    </div>
                    <div>
                      <input type="text" value={item.instructions || ''}
                        onChange={e => updateItem(idx, 'instructions', e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-teal-200 focus:border-teal-500 outline-none"
                        placeholder="e.g., Both eyes, Before sleep..." />
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => removeItem(idx)}
                        disabled={items.length === 1}
                        className="w-6 h-6 rounded border border-red-200 flex items-center justify-center hover:bg-red-50 disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined text-red-400" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    </div>
                  </div>
                ))}

                <div
                  onClick={() => setItems([...items, { ...emptyItem(), display_order: items.length }])}
                  className="grid grid-cols-1 items-center px-3 py-2 bg-slate-50/80 hover:bg-teal-50 cursor-pointer transition-colors border-t border-dashed border-slate-200"
                >
                  <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-teal-600">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add_circle</span>
                    Add medicine / eye drop
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Optical Notes & Advice */}
          {patient && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-600 text-sm">clinical_notes</span> Optical Notes
              </h3>
              <textarea rows={3} value={opticalNotes} onChange={e => setOpticalNotes(e.target.value)}
                className="input-field mb-4" placeholder="Additional optical observations, findings..." />
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-600 text-sm">info</span> Advice
              </h3>
              <textarea rows={2} value={advice} onChange={e => setAdvice(e.target.value)}
                className="input-field" placeholder="Wear glasses constantly, avoid screen time..." />
            </div>
          )}

          {/* Follow-up */}
          {patient && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-600 text-sm">event_upcoming</span> Follow-up Date
              </h3>
              <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]} className="input-field max-w-xs" />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center pb-6">
            <button
              onClick={() => navigate(isConsultationMode ? '/appointments/queue' : '/prescriptions')}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <div className="flex gap-3">
              <button onClick={() => handleSave(false, false)} disabled={saving}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              {isConsultationMode ? (
                <button onClick={() => handleSave(false, true)} disabled={saving}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 shadow-sm">
                  <span className="material-symbols-outlined text-sm">task_alt</span>
                  {saving ? 'Saving...' : 'Save & Complete'}
                </button>
              ) : (
                <button onClick={() => handleSave(true, false)} disabled={saving}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors">
                  <span className="material-symbols-outlined text-sm">send</span>
                  {saving ? 'Saving...' : 'Save & Finalize'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — Prescription Summary */}
        <div className="space-y-6">
          {/* Quick power summary */}
          <div className="bg-white rounded-xl border-2 border-teal-200 p-4 shadow-sm">
            <h4 className="text-sm font-bold mb-3 flex items-center gap-2 text-teal-800">
              <span className="material-symbols-outlined text-teal-600 text-sm">summarize</span>
              Power Summary
            </h4>
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs font-bold text-blue-700 mb-1">Right Eye (OD)</p>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <span className="text-slate-500">SPH: <strong className="text-slate-900">{rightSphere || '—'}</strong></span>
                  <span className="text-slate-500">CYL: <strong className="text-slate-900">{rightCylinder || '—'}</strong></span>
                  <span className="text-slate-500">Axis: <strong className="text-slate-900">{rightAxis || '—'}</strong></span>
                  <span className="text-slate-500">Add: <strong className="text-slate-900">{rightAdd || '—'}</strong></span>
                  <span className="text-slate-500">VA: <strong className="text-slate-900">{rightVa || '—'}</strong></span>
                  <span className="text-slate-500">IPD: <strong className="text-slate-900">{rightIpd || '—'}</strong></span>
                </div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-xs font-bold text-green-700 mb-1">Left Eye (OS)</p>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <span className="text-slate-500">SPH: <strong className="text-slate-900">{leftSphere || '—'}</strong></span>
                  <span className="text-slate-500">CYL: <strong className="text-slate-900">{leftCylinder || '—'}</strong></span>
                  <span className="text-slate-500">Axis: <strong className="text-slate-900">{leftAxis || '—'}</strong></span>
                  <span className="text-slate-500">Add: <strong className="text-slate-900">{leftAdd || '—'}</strong></span>
                  <span className="text-slate-500">VA: <strong className="text-slate-900">{leftVa || '—'}</strong></span>
                  <span className="text-slate-500">IPD: <strong className="text-slate-900">{leftIpd || '—'}</strong></span>
                </div>
              </div>
            </div>
            {lensType && (
              <div className="mt-3 p-2 bg-teal-50 rounded-lg border border-teal-200">
                <p className="text-[10px] text-teal-600 font-semibold">LENS</p>
                <p className="text-xs font-medium text-teal-800">
                  {LENS_TYPES.find(l => l.value === lensType)?.label || lensType}
                  {lensMaterial && ` • ${lensMaterial}`}
                  {lensCoating && ` • ${lensCoating}`}
                </p>
              </div>
            )}
          </div>

          {/* Patient info sidebar */}
          {patient && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h4 className="text-sm font-semibold mb-3">Patient Info</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Name</span>
                  <span className="font-medium">{patient.first_name} {patient.last_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">PRN</span>
                  <span className="font-medium">{patient.patient_reference_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Age/Gender</span>
                  <span className="font-medium">{computeAge(patient)} / {patient.gender?.[0]?.toUpperCase() || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone</span>
                  <span className="font-medium">{patient.phone_number}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OpticalPrescriptionBuilder;
