import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import prescriptionService from '../services/prescriptionService';
import patientService from '../services/patientService';
import walkInService from '../services/walkInService';
import scheduleService from '../services/scheduleService';
import hospitalService, { type HospitalInstitutionOption } from '../services/hospitalService';
import opticalService from '../services/opticalService';
import type { PrescriptionItemCreate, Medicine, PrescriptionTemplate, EyeSide } from '../types/prescription';
import type { OpticalPrescriptionCreateData } from '../types/optical';
import type { Patient } from '../types/patient';
import type { DoctorOption } from '../types/appointment';
import AvailabilityCalendar from '../components/common/AvailabilityCalendar';
import { useDoctorMonthAvailability } from '../hooks/useDoctorMonthAvailability';
import { formatLocalDateISO, formatMonthKey } from '../utils/calendarDate';

const FREQUENCY_OPTIONS = ['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-0', '0-1-1', '1-1-1', '1-1-1-1'];
const DURATION_UNITS = ['days', 'weeks', 'months'];
const ROUTE_OPTIONS = ['oral', 'topical', 'injection', 'inhalation', 'sublingual', 'rectal', 'nasal', 'ophthalmic', 'otic'];
const FOOD_TIMING_OPTIONS = ['', 'Before food', 'After food'];

const _LIQUID_CATS = new Set(['syrup', 'suspension', 'liquid', 'solution', 'linctus', 'elixir', 'tincture']);
const _SINGLE_UNIT_CATS = new Set(['drops', 'eye drops', 'ear drops', 'nasal drops', 'nasal spray', 'cream', 'ointment', 'gel', 'lotion', 'paste', 'inhaler', 'spray', 'patch', 'suppository']);
// Categories that are valid for eye-side (RE/LE) dosing — must be ophthalmic/eye-drop type
const EYE_DROP_CATEGORIES = new Set(['drops', 'eye drops', 'eye drop', 'ophthalmic', 'ophthalmic drops', 'eye ointment', 'ophthalmic ointment']);

interface MedInfo { category: string | null; units_per_pack: number; unit_of_measure: string; }

function computeDispenseQty(
  item: PrescriptionItemCreate,
  info?: MedInfo,
): { qty: number | null; unit: string } {
  const uom = (info?.unit_of_measure || '').toLowerCase();
  const unit = uom === 'strip' ? 'tablets' : (uom || 'units');

  if (!item.frequency || !item.duration_value || item.duration_value <= 0) {
    return { qty: null, unit };
  }

  const parts = item.frequency.match(/\d+(?:\.\d+)?/g);
  if (!parts?.length) return { qty: null, unit };
  const dailyDoses = parts.reduce((s, p) => s + Number(p), 0);
  if (dailyDoses <= 0) return { qty: null, unit };

  const durUnit = (item.duration_unit || 'days').toLowerCase();
  let days = item.duration_value;
  if (durUnit === 'weeks') days *= 7;
  if (durUnit === 'months') days *= 30;

  const cat = (info?.category || '').toLowerCase();
  const uop = Math.max(1, info?.units_per_pack || 1);

  if (_LIQUID_CATS.has(cat) || (uom === 'bottle' && cat !== 'drops')) {
    return { qty: Math.max(1, Math.ceil(days / 5)), unit: uom || 'bottle' };
  }
  if (_SINGLE_UNIT_CATS.has(cat) || uom === 'tube') {
    return { qty: 1, unit: uom || 'unit' };
  }
  const totalDoses = Math.ceil(dailyDoses * days);
  return { qty: totalDoses, unit };
}

/** Toggles one eye on/off for the Eye Hospital Drug Prescription RE/LE columns. */
function toggleEyeSide(current: EyeSide | null | undefined, side: 'RE' | 'LE'): EyeSide | undefined {
  const reOn = current === 'RE' || current === 'Both';
  const leOn = current === 'LE' || current === 'Both';
  const nextRe = side === 'RE' ? !reOn : reOn;
  const nextLe = side === 'LE' ? !leOn : leOn;
  if (nextRe && nextLe) return 'Both';
  if (nextRe) return 'RE';
  if (nextLe) return 'LE';
  return undefined;
}

const getDisplayMedicineName = (med: Medicine): string => {
  if (!med.strength) return med.name;
  const name = med.name.trim();
  const strength = med.strength.trim();
  if (name.toLowerCase().endsWith(strength.toLowerCase())) {
    return name.slice(0, -strength.length).trim();
  }
  return name;
};

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
  frequency: '',
  duration_value: undefined,
  duration_unit: 'days',
  route: undefined,
  instructions: '',
  quantity: undefined,
  allow_substitution: true,
  display_order: 0,
  eye_side: undefined,
});

/** A diagnosis group — each diagnosis has its own list of medicines */
interface DiagnosisBlock {
  id: string;
  diagnosis: string;
  items: PrescriptionItemCreate[];
}

const createBlock = (diagnosis = '', items?: PrescriptionItemCreate[]): DiagnosisBlock => ({
  id: typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36),
  diagnosis,
  items: items && items.length > 0 ? items : [emptyItem()],
});

const PrescriptionBuilder: React.FC = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user, isModuleEnabled } = useAuth();
  const { showToast } = useToast();

  const isEditMode = Boolean(editId);
  const pharmacyEnabled = isModuleEnabled('pharmacy');
  const opticalModuleEnabled = isModuleEnabled('optical');

  // Form state
  const [patientId, setPatientId] = useState(searchParams.get('patient_id') || '');
  const [appointmentId, setAppointmentId] = useState(searchParams.get('appointment_id') || '');
  const [queueId] = useState(searchParams.get('queue_id') || '');
  const isConsultationMode = Boolean(queueId);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [advice, setAdvice] = useState('');
  const [isOpthal, setIsOpthal] = useState(user?.hospital_specialty === 'eye_hospital');
  // Optional Optical (Spectacle) Prescription, created alongside the drug
  // prescription in the same visit — eye hospitals only.
  const [addOpticalRx, setAddOpticalRx] = useState(false);
  const [opticalRx, setOpticalRx] = useState<Omit<OpticalPrescriptionCreateData, 'patient_id' | 'appointment_id'>>({});
  const [createdOpticalRxId, setCreatedOpticalRxId] = useState<string | null>(null);
  const opticalNumField = (field: keyof OpticalPrescriptionCreateData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOpticalRx(prev => ({ ...prev, [field]: value === '' ? undefined : Number(value) }));
  };
  const [blocks, setBlocks] = useState<DiagnosisBlock[]>([createBlock()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if hospital is eye hospital or multi-specialty
  const isEyeHospital = user?.hospital_specialty === 'eye_hospital' || user?.hospital_specialty === 'multi_specialty';

  // Institution dual-letterhead selector (BRD §4.2) + Patient History auto-fill (BRD §4.4)
  const [institutionId, setInstitutionId] = useState('');
  const [institutions, setInstitutions] = useState<HospitalInstitutionOption[]>([]);
  const [vitalsBloodSugar, setVitalsBloodSugar] = useState('');
  const [historySymptoms, setHistorySymptoms] = useState<string[]>([]);

  useEffect(() => {
    if (!isEyeHospital) return;
    hospitalService.getInstitutions().then(setInstitutions).catch(() => {});
  }, [isEyeHospital]);

  // Vitals state
  const [vitalsBp, setVitalsBp] = useState('');
  const [vitalsPulse, setVitalsPulse] = useState('');
  const [vitalsTemp, setVitalsTemp] = useState('');
  const [vitalsWeight, setVitalsWeight] = useState('');
  const [vitalsSpo2, setVitalsSpo2] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [showFollowUpCalendar, setShowFollowUpCalendar] = useState(false);
  const [followUpCalendarMonth, setFollowUpCalendarMonth] = useState<string>(formatMonthKey());

  // Search states
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientSearch, setShowPatientSearch] = useState(!patientId);

  // Medicine search — scoped to a specific block + item
  const [medicineSearch, setMedicineSearch] = useState('');
  const [medicineResults, setMedicineResults] = useState<Medicine[]>([]);
  const [medicineStockById, setMedicineStockById] = useState<Record<string, number>>({});
  const [medicineInfoById, setMedicineInfoById] = useState<Record<string, MedInfo>>({});
  const [activeMedBlockIdx, setActiveMedBlockIdx] = useState<number | null>(null);
  const [activeMedItemIdx, setActiveMedItemIdx] = useState<number | null>(null);
  const [activeMedResultIdx, setActiveMedResultIdx] = useState<number>(-1);
  const medicineOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Portal dropdown positioning
  const activeMedInputRef = useRef<HTMLInputElement | null>(null);
  const [medDropdownPos, setMedDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

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
  const [referCalendarMonth, setReferCalendarMonth] = useState<string>(formatMonthKey());
  const today = formatLocalDateISO();
  const currentDoctorId = useMemo(
    () => referDoctors.find((d) => d.user_id === user?.id)?.doctor_id || null,
    [referDoctors, user?.id],
  );

  const {
    availabilityMap: referDateAvailability,
    loading: referAvailabilityLoading,
    reset: resetReferAvailability,
  } = useDoctorMonthAvailability({
    doctorId: referDoctorId,
    monthKey: referCalendarMonth,
    minDateISO: today,
    enabled: showReferModal && !!referDoctorId,
  });

  const {
    availabilityMap: followUpDateAvailability,
    loading: followUpAvailabilityLoading,
  } = useDoctorMonthAvailability({
    doctorId: currentDoctorId,
    monthKey: followUpCalendarMonth,
    minDateISO: today,
    enabled: isConsultationMode && !!currentDoctorId,
  });

  // Load patient if ID passed via URL
  useEffect(() => {
    if (patientId) {
      patientService.getPatient(patientId)
        .then(p => {
          setPatient(p);
          setShowPatientSearch(false);
          // Patient History auto-fill (BRD §2.5/§4.4) — only for a brand-new
          // prescription; editing an existing one keeps what was saved on it.
          if (isEyeHospital && !editId) {
            if (p.blood_sugar_value != null) setVitalsBloodSugar(`${p.blood_sugar_value} ${p.blood_sugar_unit || 'mg/dL'}`);
            if (p.symptoms?.length) setHistorySymptoms(p.symptoms);
            if (p.reason_for_visit) setClinicalNotes(prev => prev || p.reason_for_visit || '');
          }
        })
        .catch(() => showToast('error', 'Patient not found'));
    }
  }, [patientId, isEyeHospital, editId]);

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
        setIsOpthal(rx.is_opthal || false);
        setInstitutionId(rx.institution_id || '');
        setVitalsBloodSugar(rx.vitals_blood_sugar || '');
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
                eye_side: item.eye_side || undefined,
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

  const isSelectedReferralDateUnavailable = referDate ? referDateAvailability[referDate] === false : false;
  const isSelectedFollowUpDateUnavailable = followUpDate ? followUpDateAvailability[followUpDate] === false : false;
  const selectedReferDoctor = referDoctors.find((d) => d.doctor_id === referDoctorId);
  const currentDoctor = referDoctors.find((d) => d.doctor_id === currentDoctorId);

  const openReferModal = () => {
    setShowReferModal(true);
    setReferDoctorId('');
    setReferDate('');
    setReferReason('');
    setReferDoctorLoad(null);
    setReferCalendarMonth(today.slice(0, 7));
    resetReferAvailability();
  };

  const closeReferModal = () => {
    setShowReferModal(false);
    setReferDoctorId('');
    setReferDate('');
    setReferReason('');
    setReferDoctorLoad(null);
    setReferCalendarMonth(today.slice(0, 7));
    resetReferAvailability();
  };

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
      const res = await prescriptionService.getMedicines(1, 20, q);
      setMedicineResults(res.data);
    } catch (err: any) {
      setMedicineResults([]);
      const msg = err?.response?.data?.detail;
      if (msg) showToast('error', `Medicine search: ${msg}`);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = setTimeout(() => searchMedicines(medicineSearch), 300);
    return () => clearTimeout(timer);
  }, [medicineSearch, searchMedicines]);

  useEffect(() => {
    if (medicineResults.length === 0) {
      setActiveMedResultIdx(-1);
      return;
    }
    setActiveMedResultIdx((idx) => {
      if (idx < 0) return 0;
      if (idx >= medicineResults.length) return medicineResults.length - 1;
      return idx;
    });
  }, [medicineResults]);

  useEffect(() => {
    if (activeMedResultIdx < 0) return;
    medicineOptionRefs.current[activeMedResultIdx]?.scrollIntoView({ block: 'nearest' });
  }, [activeMedResultIdx, medicineResults]);

  // Recompute portal dropdown position whenever results arrive or the active
  // input changes, AND keep it glued to the input while the page (or any nested
  // scroll container) scrolls or the window resizes. Without this, the
  // fixed-position dropdown stays put and detaches from the field on scroll.
  useEffect(() => {
    if (activeMedBlockIdx === null || activeMedItemIdx === null || !activeMedInputRef.current) {
      setMedDropdownPos(null);
      return;
    }
    const reposition = () => {
      const el = activeMedInputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMedDropdownPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 288) });
    };
    reposition();
    // capture=true so scrolls inside nested overflow containers are caught too.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [activeMedBlockIdx, activeMedItemIdx, medicineResults]);

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
    const currentItem = updatedItems[itemIdx];
    const isEyeDrop = EYE_DROP_CATEGORIES.has((med.category || '').toLowerCase());
    // Only keep eye_side selection if the chosen medicine is actually an eye drop.
    // If a non-eye-drop is selected while RE/LE was active, clear it.
    const eyeSideActive = !!currentItem.eye_side && isEyeDrop;
    updatedItems[itemIdx] = {
      ...currentItem,
      medicine_id: med.id,
      medicine_name: getDisplayMedicineName(med),
      generic_name: med.generic_name,
      eye_side: eyeSideActive ? currentItem.eye_side : undefined,
      dosage: eyeSideActive ? '1 drop' : (med.strength || ''),
    };
    newBlocks[blockIdx] = { ...newBlocks[blockIdx], items: updatedItems };
    setBlocks(newBlocks);
    setMedicineStockById((prev) => ({ ...prev, [med.id]: med.total_stock ?? 0 }));
    setMedicineInfoById((prev) => ({
      ...prev,
      [med.id]: {
        category: med.category,
        units_per_pack: med.units_per_pack ?? 1,
        unit_of_measure: med.unit_of_measure ?? 'units',
      },
    }));
    setMedicineSearch('');
    setMedicineResults([]);
    setActiveMedBlockIdx(null);
    setActiveMedItemIdx(null);
    setActiveMedResultIdx(-1);
  };

  /**
   * Smarter eye-side toggle for the eye hospital table.
   * When an eye side is switched ON  → auto-fill dosage with "1 drop" (unless
   *   the doctor has already typed a custom drops value like "2 drops").
   * When eye side is cleared (both OFF) → restore the medicine's strength from
   *   the medicine DB, or clear the field so the doctor can type a tablet dosage.
   */
  const updateEyeSide = (blockIdx: number, itemIdx: number, side: 'RE' | 'LE') => {
    const newBlocks = [...blocks];
    const updatedItems = [...newBlocks[blockIdx].items];
    const item = updatedItems[itemIdx];
    const newEyeSide = toggleEyeSide(item.eye_side, side);

    // Determine the right dosage to set alongside the eye_side change.
    let newDosage = item.dosage;
    const currentDosageLooksLikeStrength = item.dosage && !item.dosage.toLowerCase().includes('drop');

    if (newEyeSide) {
      // Eye side is now active — switch to drops dosage if not already set.
      if (!item.dosage || currentDosageLooksLikeStrength) {
        newDosage = '1 drop';
      }
    } else {
      // Eye side cleared — restore the medicine's strength (if we know it),
      // or clear the drops value so the doctor can type a tablet dosage.
      if (item.medicine_id) {
        // We stored the strength when the medicine was selected; retrieve via current dosage hint.
        // Best effort: if dosage looks like drops, clear it so strength can be typed.
        if (item.dosage.toLowerCase().includes('drop')) {
          newDosage = ''; // Doctor will see empty field, ready for tablet strength input
        }
      } else {
        if (item.dosage.toLowerCase().includes('drop')) {
          newDosage = '';
        }
      }
    }

    updatedItems[itemIdx] = { ...item, eye_side: newEyeSide, dosage: newDosage };
    newBlocks[blockIdx] = { ...newBlocks[blockIdx], items: updatedItems };
    setBlocks(newBlocks);
  };

  const updateItem = (blockIdx: number, itemIdx: number, field: keyof PrescriptionItemCreate, value: unknown) => {
    const newBlocks = [...blocks];
    const updatedItems = [...newBlocks[blockIdx].items];
    updatedItems[itemIdx] = { ...updatedItems[itemIdx], [field]: value };
    newBlocks[blockIdx] = { ...newBlocks[blockIdx], items: updatedItems };
    // Auto-add a new row once medicine + dosage are filled (frequency is optional).
    if (itemIdx === updatedItems.length - 1) {
      const lastItem = updatedItems[itemIdx];
      const lastRowFilled = lastItem.medicine_name?.trim() && lastItem.dosage?.trim();
      if (lastRowFilled) {
        updatedItems.push({ ...emptyItem(), display_order: updatedItems.length });
        newBlocks[blockIdx] = { ...newBlocks[blockIdx], items: updatedItems };
      }
    }
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

  /** Handle medicine name typing and trigger search */
  const handleMedicineNameChange = (blockIdx: number, itemIdx: number, value: string) => {
    if (!value.trim()) {
      setBlocks((prev) => {
        const next = [...prev];
        const updatedItems = [...next[blockIdx].items];
        updatedItems[itemIdx] = {
          ...emptyItem(),
          display_order: updatedItems[itemIdx].display_order ?? itemIdx,
        };
        next[blockIdx] = { ...next[blockIdx], items: updatedItems };
        return next;
      });
      setMedicineSearch('');
      setMedicineResults([]);
      setActiveMedResultIdx(-1);
      return;
    }

    updateItem(blockIdx, itemIdx, 'medicine_name', value);
    setMedicineSearch(value);
    setActiveMedBlockIdx(blockIdx);
    setActiveMedItemIdx(itemIdx);
    setActiveMedResultIdx(0);
  };

  const handleMedicineInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    blockIdx: number,
    itemIdx: number,
  ) => {
    const isActiveInput = activeMedBlockIdx === blockIdx && activeMedItemIdx === itemIdx;
    if (!isActiveInput || medicineResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const baseIdx = activeMedResultIdx < 0 ? 0 : activeMedResultIdx;
      const nextIdx = Math.min(baseIdx + 1, medicineResults.length - 1);
      setActiveMedResultIdx(nextIdx);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIdx = Math.max(activeMedResultIdx - 1, 0);
      setActiveMedResultIdx(nextIdx);
      return;
    }

    if (e.key === 'Enter') {
      if (activeMedResultIdx >= 0 && activeMedResultIdx < medicineResults.length) {
        e.preventDefault();
        selectMedicine(medicineResults[activeMedResultIdx], blockIdx, itemIdx);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setMedicineResults([]);
      setActiveMedResultIdx(-1);
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

  const handleSave = async (
    finalize: boolean = false,
    completeQueue: boolean = false,
  ) => {
    if (!patient) { showToast('error', 'Please select a patient'); return; }

    // Flatten blocks into single diagnosis string & ordered items for the API
    const allDiagnoses = blocks.map(b => b.diagnosis.trim()).filter(Boolean).join('; ');
    let displayOrder = 0;
    const validItems: PrescriptionItemCreate[] = blocks.flatMap(b =>
      b.items
        .filter((i: PrescriptionItemCreate) => i.medicine_name.trim())
        .map((i: PrescriptionItemCreate) => ({ ...i, display_order: displayOrder++ }))
    );
    const hasOpticalFields = Object.values(opticalRx).some(v => v !== undefined && v !== '');
    const hasOptical = isEyeHospital && addOpticalRx && hasOpticalFields;
    if (validItems.length === 0 && !hasOptical) {
      showToast('error', isEyeHospital
        ? 'Please add at least one medicine or fill out the optical prescription.'
        : 'Add at least one medicine'
      );
      return;
    }

    // Common vitals payload
    const vitalsPayload = {
      vitals_bp: vitalsBp || undefined,
      vitals_pulse: vitalsPulse || undefined,
      vitals_temp: vitalsTemp || undefined,
      vitals_weight: vitalsWeight || undefined,
      vitals_spo2: vitalsSpo2 || undefined,
      vitals_blood_sugar: isEyeHospital ? (vitalsBloodSugar || undefined) : undefined,
      follow_up_date: followUpDate || undefined,
    };
    const institutionPayload = isEyeHospital ? { institution_id: institutionId || undefined } : {};

    setSaving(true);
    try {
      let rxId: string;
      let freshOpticalRxId: string | null = null;

      if (isEditMode && editId) {
        // Update existing prescription
        const updated = await prescriptionService.updatePrescription(editId, {
          diagnosis: allDiagnoses || undefined,
          clinical_notes: clinicalNotes || undefined,
          advice: advice || undefined,
          is_opthal: isEyeHospital ? isOpthal : undefined,
          ...institutionPayload,
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
          is_opthal: isEyeHospital ? isOpthal : undefined,
          ...institutionPayload,
          ...vitalsPayload,
          items: validItems,
        });
        rxId = rx.id;

        if (addOpticalRx) {
          try {
            const createdOptRx = await opticalService.createPrescription({
              patient_id: patient.id,
              appointment_id: appointmentId || undefined,
              ...opticalRx,
            });
            freshOpticalRxId = createdOptRx.id;
            setCreatedOpticalRxId(createdOptRx.id);
          } catch (opticalErr: any) {
            // The drug prescription above already saved successfully — surface
            // the optical failure separately rather than treating the whole
            // save as failed (e.g. current doctor isn't an eye specialist).
            showToast(
              'error',
              `Prescription saved, but the optical prescription could not be created: ${
                opticalErr?.response?.data?.detail || 'unknown error'
              }`,
            );
          }
        }
      }

      if (completeQueue) {
        // Finalize prescription + complete queue entry in one call
        await prescriptionService.finalizeAndComplete(rxId);
        showToast('success', 'Prescription finalized & consultation completed!');
        // Always return to today's patients list after completing a consultation
        navigate('/appointments/queue');
      } else if (finalize) {
        await prescriptionService.finalizePrescription(rxId);
        showToast(
          'success',
          pharmacyEnabled
            ? 'Prescription finalized & sent to pharmacy!'
            : 'Prescription finalized — ready to print/download',
        );
        // If an optical Rx was also created, land there for print/dispense.
        // Otherwise go to the medicine prescription detail for print/download.
        if (freshOpticalRxId) {
          navigate(`/optical/prescriptions/${freshOpticalRxId}`);
        } else {
          navigate(`/prescriptions/${rxId}`);
        }
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
                    {patient.patient_reference_number} | {computeAge(patient)}/{patient.gender?.[0]?.toUpperCase() || ''} | {patient.blood_group || ''}
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
                    className="input-field pl-10 pr-9"
                    autoFocus
                  />
                  {patientSearch && (
                    <button type="button" onClick={() => setPatientSearch('')} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600">
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  )}
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
                {/* Only show chronic conditions / allergies when actually recorded —
                    walk-in registration does not capture these fields, so don't imply
                    a clinical assessment was made when nothing was entered. */}
                {(patient.chronic_conditions || patient.known_allergies) && (
                <>
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
                </>
                )}

                {/* Patient Quick Info */}
                <div className="mt-4 rounded-lg border-2 border-indigo-200 p-4 bg-indigo-50/70 shadow-sm">
                  <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-indigo-600" style={{ fontSize: '18px' }}>badge</span>
                    Patient Summary
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div className="bg-white rounded-lg p-2.5 border border-indigo-100 shadow-sm">
                      <span className="text-[10px] text-indigo-400 block font-semibold uppercase tracking-wide">Age/Gender</span>
                      <span className="font-bold text-indigo-900">{computeAge(patient)} / {patient.gender?.[0]?.toUpperCase() || 'N/A'}</span>
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
                    {isEyeHospital ? (
                      <>
                        {/* Eye Hospital Unified Table — LE/RE eye drops + normal medicines with optional Freq/Duration */}
                        <div className="grid grid-cols-[28px_1fr_40px_40px_100px_88px_108px_28px] gap-1 bg-slate-100 border-b border-slate-200 px-3 py-2">
                          <div className="text-[10px] font-semibold text-slate-500 uppercase">#</div>
                          <div className="text-[10px] font-semibold text-slate-500 uppercase">Medicine</div>
                          <div className="text-[10px] font-semibold text-slate-500 uppercase text-center">LE</div>
                          <div className="text-[10px] font-semibold text-slate-500 uppercase text-center">RE</div>
                          <div className="text-[10px] font-semibold text-slate-500 uppercase">Dosage</div>
                          <div className="text-[10px] font-semibold text-slate-400 uppercase">Freq</div>
                          <div className="text-[10px] font-semibold text-slate-400 uppercase">Duration</div>
                          <div className="text-[10px] font-semibold text-slate-500 uppercase text-center">×</div>
                        </div>

                        {/* Eye Hospital Medicine Rows — eye drops use RE/LE + dosage; normal medicines use Freq/Duration */}
                        {block.items.map((item, itemIdx) => {
                          const reOn = item.eye_side === 'RE' || item.eye_side === 'Both';
                          const leOn = item.eye_side === 'LE' || item.eye_side === 'Both';
                          const medInfo = item.medicine_id ? medicineInfoById[item.medicine_id] : undefined;
                          const { qty: dispQty, unit: dispUnit } = computeDispenseQty(item, medInfo);
                          // RE/LE buttons are only enabled for eye-drop category medicines.
                          // If a medicine is selected from DB and its category is not ophthalmic, lock the buttons.
                          const medCategory = (medInfo?.category || '').toLowerCase();
                          const eyeSideDisabled = !!item.medicine_id && !EYE_DROP_CATEGORIES.has(medCategory);
                          return (
                            <div
                              key={itemIdx}
                              className={`grid grid-cols-[28px_1fr_40px_40px_100px_88px_108px_28px] gap-1 items-center px-3 py-1.5 border-b border-slate-100 last:border-0 hover:bg-blue-50/30 transition-colors ${item.medicine_name.trim() ? 'bg-white' : 'bg-slate-50/50'}`}
                            >
                              <div className="text-xs text-slate-400 font-medium">{itemIdx + 1}</div>

                              <div className="relative pr-1">
                                <input
                                  type="text"
                                  value={item.medicine_name}
                                  onChange={e => handleMedicineNameChange(blockIdx, itemIdx, e.target.value)}
                                  onFocus={(e) => {
                                    activeMedInputRef.current = e.currentTarget;
                                    setActiveMedBlockIdx(blockIdx);
                                    setActiveMedItemIdx(itemIdx);
                                  }}
                                  onBlur={() => setTimeout(() => { setActiveMedBlockIdx(null); setActiveMedItemIdx(null); }, 400)}
                                  onKeyDown={(e) => handleMedicineInputKeyDown(e, blockIdx, itemIdx)}
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                                  placeholder="Type medicine name..."
                                />
                              </div>

                              {/* LE toggle */}
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => !eyeSideDisabled && updateEyeSide(blockIdx, itemIdx, 'LE')}
                                  title={eyeSideDisabled ? 'Not applicable — not an eye drop medicine' : 'Left Eye'}
                                  disabled={eyeSideDisabled}
                                  className={`w-7 h-7 rounded border text-[9px] font-bold transition-colors ${
                                    eyeSideDisabled
                                      ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed'
                                      : leOn
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  LE
                                </button>
                              </div>
                              {/* RE toggle */}
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => !eyeSideDisabled && updateEyeSide(blockIdx, itemIdx, 'RE')}
                                  title={eyeSideDisabled ? 'Not applicable — not an eye drop medicine' : 'Right Eye'}
                                  disabled={eyeSideDisabled}
                                  className={`w-7 h-7 rounded border text-[9px] font-bold transition-colors ${
                                    eyeSideDisabled
                                      ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed'
                                      : reOn
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  RE
                                </button>
                              </div>

                              {/* Dosage */}
                              <div className="pr-1">
                                <input
                                  type="text"
                                  value={item.dosage}
                                  onChange={e => updateItem(blockIdx, itemIdx, 'dosage', e.target.value)}
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                                  placeholder={(leOn || reOn) ? '1 drop' : 'e.g. 500mg'}
                                />
                              </div>

                              {/* Frequency (optional — for normal oral medicines) */}
                              <div className="pr-1">
                                <select
                                  value={item.frequency || ''}
                                  onChange={e => updateItem(blockIdx, itemIdx, 'frequency', e.target.value)}
                                  className="w-full px-1 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-slate-600"
                                >
                                  <option value="">—</option>
                                  {FREQUENCY_OPTIONS.map(f => (
                                    <option key={f} value={f}>{f}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Duration (optional) */}
                              <div className="pr-1">
                                <div className="flex gap-0.5">
                                  <input
                                    type="number"
                                    value={item.duration_value || ''}
                                    onChange={e => updateItem(blockIdx, itemIdx, 'duration_value', parseInt(e.target.value) || null)}
                                    className="w-9 px-1 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-center"
                                    min={1}
                                    placeholder="—"
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
                          );
                        })}
                      </>
                    ) : (
                      <>
                    {/* Table Header */}
                    <div className="grid grid-cols-[40px_1fr_80px_100px_120px_72px_80px_1fr_40px] gap-1 bg-slate-100 border-b border-slate-200 px-3 py-2">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">#</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Medicine</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Dosage</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Frequency</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Duration</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase text-center">Qty</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Route</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Food Timing</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase text-center">×</div>
                    </div>

                    {/* Medicine Rows */}
                    {block.items.map((item, itemIdx) => (
                      (() => {
                        const selectedStock = item.medicine_id ? medicineStockById[item.medicine_id] : undefined;
                        const isSelectedOutOfStock = typeof selectedStock === 'number' && selectedStock <= 0;
                        const medInfo = item.medicine_id ? medicineInfoById[item.medicine_id] : undefined;
                        const { qty: dispQty, unit: dispUnit } = computeDispenseQty(item, medInfo);
                        return (
                      <div
                        key={itemIdx}
                        className={`grid grid-cols-[40px_1fr_80px_100px_120px_72px_80px_1fr_40px] gap-1 items-center px-3 py-1.5 border-b border-slate-100 last:border-0 hover:bg-blue-50/30 transition-colors ${item.medicine_name.trim() ? 'bg-white' : 'bg-slate-50/50'} ${isSelectedOutOfStock ? 'bg-red-50/60' : ''}`}
                      >
                        {/* Row number */}
                        <div className="text-xs text-slate-400 font-medium">{itemIdx + 1}</div>

                        {/* Medicine Name with autocomplete */}
                        <div className="relative pr-2">
                          <input
                            type="text"
                            value={item.medicine_name}
                            onChange={e => handleMedicineNameChange(blockIdx, itemIdx, e.target.value)}
                            onFocus={(e) => {
                              activeMedInputRef.current = e.currentTarget;
                              setActiveMedBlockIdx(blockIdx);
                              setActiveMedItemIdx(itemIdx);
                            }}
                            onBlur={() => setTimeout(() => { setActiveMedBlockIdx(null); setActiveMedItemIdx(null); }, 400)}
                            onKeyDown={(e) => handleMedicineInputKeyDown(e, blockIdx, itemIdx)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                            placeholder="Type medicine name..."
                          />
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
                            <option value="">Select</option>
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

                        {/* Qty preview (read-only, computed) */}
                        <div className="flex flex-col items-center justify-center">
                          {dispQty !== null ? (
                            <>
                              <span className="text-sm font-bold text-primary leading-tight">{dispQty}</span>
                              <span className="text-[9px] text-slate-400 leading-none truncate max-w-[64px] text-center">{dispUnit}</span>
                            </>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </div>

                        {/* Route */}
                        <div className="pr-1">
                          <select
                            value={item.route || ''}
                            onChange={e => updateItem(blockIdx, itemIdx, 'route', e.target.value)}
                            className="w-full px-1 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                          >
                            <option value="">Select</option>
                            {ROUTE_OPTIONS.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>

                        {/* Food timing */}
                        <div className="pr-1">
                          <select
                            value={(item.instructions === 'Before food' || item.instructions === 'After food') ? item.instructions : ''}
                            onChange={e => updateItem(blockIdx, itemIdx, 'instructions', e.target.value || '')}
                            className="w-full px-1 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                          >
                            {FOOD_TIMING_OPTIONS.map(option => (
                              <option key={option || 'none'} value={option}>
                                {option || 'Select'}
                              </option>
                            ))}
                          </select>
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
                        );
                      })()
                    ))}
                      </>
                    )}

                    {/* Quick Add Row */}
                    <div
                      onClick={() => addItemToBlock(blockIdx)}
                      className="grid grid-cols-1 items-center px-3 py-2 bg-slate-50/80 hover:bg-primary/5 cursor-pointer transition-colors border-t border-dashed border-slate-200"
                    >
                      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-primary">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add_circle</span>
                        Click to add another medicine row
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Institution selector (BRD §4.2) — eye-hospital feature pack only */}
          {isEyeHospital && institutions.length > 1 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">corporate_fare</span> Institution Letterhead
              </h3>
              <div className="flex flex-wrap gap-2">
                {institutions.map((inst: HospitalInstitutionOption) => (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => setInstitutionId(inst.id)}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                      institutionId === inst.id
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {inst.name.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Patient History — auto-filled from registration (BRD §2.5/§4.4) */}
          {isEyeHospital && (historySymptoms.length > 0 || vitalsBloodSugar) && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">history</span> Patient History
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5 block">Blood Sugar</label>
                  <input
                    value={vitalsBloodSugar}
                    onChange={e => setVitalsBloodSugar(e.target.value)}
                    className="input-field"
                    placeholder="e.g. 110 mg/dL"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5 block">Symptoms</label>
                  <div className="flex flex-wrap gap-1.5">
                    {historySymptoms.map(s => (
                      <span key={s} className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

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


          {/* Optical (Spectacle) Prescription — eye-hospital feature pack only,
              create-mode only (it's a separate record, not part of this edit).
              Shown for all eye hospitals; optical module (store) controls whether
              the patient is sent to the optical store after finalization. */}
          {isEyeHospital && !isEditMode && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-sm">visibility</span>
                  Optical (Spectacle) Prescription
                </h3>
                <button
                  type="button"
                  onClick={() => setAddOpticalRx(v => !v)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                    addOpticalRx ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-primary/30 hover:bg-primary/5'
                  }`}
                >
                  {addOpticalRx ? 'OPTICAL ✓' : 'ADD OPTICAL'}
                </button>
              </div>
              {addOpticalRx && (
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
              )}
            </div>
          )}

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
            {/* <p className="text-xs text-slate-500 mb-2">
              Availability is based on {currentDoctor?.name ? `Dr. ${currentDoctor.name}` : 'current doctor'} slots.
            </p> */}
            <button
              type="button"
              onClick={() => setShowFollowUpCalendar((v) => !v)}
              className="w-full max-w-xs px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white hover:bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none flex items-center justify-between"
              title="Select follow-up date"
            >
              <span className={followUpDate ? 'text-slate-800' : 'text-slate-400'}>
                {followUpDate
                  ? new Date(followUpDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : 'Select follow-up date'}
              </span>
              <span className="material-symbols-outlined text-slate-500">calendar_month</span>
            </button>

            {showFollowUpCalendar && (
              <div className="max-w-md mt-3">
                <AvailabilityCalendar
                  monthKey={followUpCalendarMonth}
                  onMonthKeyChange={setFollowUpCalendarMonth}
                  selectedDate={followUpDate}
                  onSelectDate={(dateIso) => {
                    setFollowUpDate(dateIso);
                    setShowFollowUpCalendar(false);
                  }}
                  minDateISO={today}
                  availabilityMap={followUpDateAvailability}
                  loading={followUpAvailabilityLoading}
                  unavailableHint="No slot available on selected date. Consider another date."
                />
              </div>
            )}

            {followUpDate && isSelectedFollowUpDateUnavailable && (
              <p className="text-xs text-red-600 mt-2">
                Selected follow-up date has no slot availability. Please choose another date.
              </p>
            )}
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
                  onClick={openReferModal}
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
                  <span className="material-symbols-outlined text-sm">{pharmacyEnabled ? 'send' : 'verified'}</span>
                  {saving
                    ? 'Saving...'
                    : pharmacyEnabled ? 'Save & Send to Pharmacy' : 'Save & Finalize'}
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
                className="w-full pl-10 pr-9 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                placeholder="Search medicines..."
                value={medicineSearch}
                onChange={e => { setMedicineSearch(e.target.value); setActiveMedBlockIdx(null); setActiveMedItemIdx(null); }}
              />
              {medicineSearch && (
                <button type="button" onClick={() => setMedicineSearch('')} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              )}
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
              <button onClick={closeReferModal} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
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
                <p className="text-xs text-slate-500 mb-2">
                  Availability is based on {selectedReferDoctor?.name || 'selected doctor'} slots.
                </p>
                <AvailabilityCalendar
                  monthKey={referCalendarMonth}
                  onMonthKeyChange={setReferCalendarMonth}
                  selectedDate={referDate}
                  onSelectDate={setReferDate}
                  minDateISO={today}
                  availabilityMap={referDateAvailability}
                  loading={referAvailabilityLoading}
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
              <button onClick={closeReferModal}
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
                    closeReferModal();
                    navigate('/appointments/queue');
                  } catch (err: any) {
                    showToast('error', err?.response?.data?.detail || 'Failed to refer patient');
                  }
                  setReferSaving(false);
                }}
                disabled={!referDoctorId || !referDate || referSaving || isSelectedReferralDateUnavailable}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-xl hover:bg-orange-600 disabled:opacity-50 shadow-sm transition-all">
                <span className="material-symbols-outlined text-base">send</span>
                {referSaving ? 'Referring...' : 'Confirm Referral'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Medicine autocomplete portal — escapes any overflow:hidden/auto ancestor */}
      {activeMedBlockIdx !== null && activeMedItemIdx !== null && medicineResults.length > 0 && medDropdownPos &&
        createPortal(
          <div
            style={{ position: 'fixed', top: medDropdownPos.top, left: medDropdownPos.left, width: medDropdownPos.width, zIndex: 9999 }}
            className="bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto"
          >
            {medicineResults.map((med, idx) => {
              const isOutOfStock = (med.total_stock ?? 0) <= 0;
              return (
                <button
                  key={med.id}
                  ref={(el) => { medicineOptionRefs.current[idx] = el; }}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    if (activeMedBlockIdx !== null && activeMedItemIdx !== null) {
                      selectMedicine(med, activeMedBlockIdx, activeMedItemIdx);
                    }
                  }}
                  onMouseEnter={() => {
                    setActiveMedResultIdx(idx);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs border-b border-slate-100 last:border-0 ${
                    activeMedResultIdx === idx ? 'bg-primary/10' : isOutOfStock ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{med.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isOutOfStock ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {isOutOfStock ? 'Out of stock' : `Stock: ${med.total_stock ?? 0}`}
                    </span>
                  </div>
                  {med.strength && <span className="text-slate-500"> {med.strength}</span>}
                  <span className="text-[10px] text-slate-400 block">{med.generic_name}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )
      }
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
