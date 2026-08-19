import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import prescriptionService from '../services/prescriptionService';
import appointmentService from '../services/appointmentService';
import patientService from '../services/patientService';
import walkInService from '../services/walkInService';
import scheduleService from '../services/scheduleService';
import hospitalService, { type HospitalInstitutionOption } from '../services/hospitalService';
import opticalService from '../services/opticalService';
import labService from '../services/labService';
import type { PrescriptionItemCreate, Medicine, PrescriptionTemplate, EyeSide } from '../types/prescription';
import type { OpticalPrescriptionCreateData } from '../types/optical';
import type { LabTest, LabTestPanel, PatientLabResult } from '../types/lab';
import type { Patient } from '../types/patient';
import type { DoctorOption } from '../types/appointment';
import SearchableSelect, { type SuggestionOption } from '../components/common/SearchableSelect';
import { genId } from '../utils/id';
import { canEdit } from '../config/modulePermissions';
import AvailabilityCalendar from '../components/common/AvailabilityCalendar';
import { useDoctorMonthAvailability } from '../hooks/useDoctorMonthAvailability';
import { useListKeyboardNav } from '../hooks/useListKeyboardNav';
import AutocompleteField from '../components/common/AutocompleteField';
import { formatLocalDateISO, formatMonthKey } from '../utils/calendarDate';
import PrescriptionHistoryGrid from '../components/patients/PrescriptionHistoryGrid';
import VitalsCard from '../components/prescription/VitalsCard';

const FREQUENCY_OPTIONS = ['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-0', '0-1-1', '1-1-1', '1-1-1-1', '1 hrs', '2 hrs'];
const DURATION_UNITS = ['days', 'weeks', 'months'];
const ROUTE_OPTIONS = ['oral', 'topical', 'injection', 'inhalation', 'sublingual', 'rectal', 'nasal', 'ophthalmic', 'otic'];
const FOOD_TIMING_OPTIONS = ['', 'Before food', 'After food'];

// Categories that are valid for eye-side (RE/LE) dosing — must be ophthalmic/eye-drop type
const EYE_DROP_CATEGORIES = new Set(['drops', 'eye drops', 'eye drop', 'ophthalmic', 'ophthalmic drops', 'eye ointment', 'ophthalmic ointment']);

interface MedInfo { category: string | null; units_per_pack: number; unit_of_measure: string; }

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
  id: genId(),
  diagnosis,
  items: items && items.length > 0 ? items : [emptyItem()],
});

const PrescriptionBuilder: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: editId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isModuleEnabled } = useAuth();
  const { showToast } = useToast();

  const isEditMode = Boolean(editId);
  const pharmacyEnabled = isModuleEnabled('pharmacy');
  const opticalModuleEnabled = isModuleEnabled('optical');
  // Walk-in-at-the-pharmacy-counter flow: a pharmacist (no linked Doctor row)
  // authoring a prescription directly may optionally pick which real doctor
  // to file it under — doctor_id is nullable on the backend
  // (prescription_service.py no longer requires it), so leaving this blank
  // just persists doctor_id = NULL. Doctors/visiting_doctors keep the
  // existing behavior of the backend auto-resolving their own Doctor row.
  const userRoles = useMemo(() => (user?.roles || []).map(r => String(r).toLowerCase()), [user?.roles]);
  const isPharmacistUser = userRoles.includes('pharmacist');
  const isDoctorRole = userRoles.includes('doctor') || userRoles.includes('visiting_doctor');
  const needsDoctorPicker = !isEditMode && !isDoctorRole;
  const [pharmacistDoctors, setPharmacistDoctors] = useState<DoctorOption[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    () => (needsDoctorPicker ? sessionStorage.getItem('pharmacistRxDoctorId') || '' : ''),
  );
  const [doctorLabel, setDoctorLabel] = useState<string>(
    () => (needsDoctorPicker ? sessionStorage.getItem('pharmacistRxDoctorLabel') || '' : ''),
  );

  useEffect(() => {
    if (!needsDoctorPicker) return;
    scheduleService.getDoctors().then(setPharmacistDoctors).catch(() => {});
  }, [needsDoctorPicker]);
  // Lab tests apply to every hospital type (not eye-specific), so this card is
  // gated by the module flag alone — unlike the optical card's isEyeHospital.
  const labModuleEnabled = isModuleEnabled('lab');

  // Form state
  const [patientId, setPatientId] = useState(searchParams.get('patient_id') || '');
  const [appointmentId, setAppointmentId] = useState(searchParams.get('appointment_id') || '');
  const [queueId] = useState(searchParams.get('queue_id') || '');
  const isConsultationMode = Boolean(queueId);
  const [patient, setPatient] = useState<Patient | null>(null);
  // Referral context (who referred this patient in, and why) — fetched so it's
  // visible to the receiving doctor instead of silently never surfacing.
  const [referralInfo, setReferralInfo] = useState<{
    isReferral: boolean;
    referringDoctorName: string | null;
    notes: string | null;
    chiefComplaint: string | null;
  } | null>(null);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [advice, setAdvice] = useState('');
  const [isOpthal, setIsOpthal] = useState(user?.hospital_specialty === 'eye_hospital');
  // Optional Optical (Spectacle) Prescription, created alongside the drug
  // prescription in the same visit — eye hospitals only. Defaulted open (not
  // behind an extra "ADD OPTICAL" click) so every section is visible as soon
  // as a new prescription is opened; leaving the fields blank still just
  // means no optical Rx is created (see hasOpticalFields at save time).
  const [addOpticalRx, setAddOpticalRx] = useState(user?.hospital_specialty === 'eye_hospital' || user?.hospital_specialty === 'multi_specialty');
  const [opticalRx, setOpticalRx] = useState<Omit<OpticalPrescriptionCreateData, 'patient_id' | 'appointment_id'>>({});
  const [createdOpticalRxId, setCreatedOpticalRxId] = useState<string | null>(null);
  // A nurse (or an earlier save in this same consultation) may already have
  // created this visit's optical prescription — when set, saving updates
  // that record instead of creating a duplicate one.
  const [existingOpticalRxId, setExistingOpticalRxId] = useState<string | null>(null);
  const [existingOpticalRxFinalized, setExistingOpticalRxFinalized] = useState(false);
  const opticalNumField = (field: keyof OpticalPrescriptionCreateData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOpticalRx(prev => ({ ...prev, [field]: value === '' ? undefined : Number(value) }));
  };
  // Optional Laboratory tests, ordered alongside the drug prescription in the
  // same visit — any hospital type (gated by labModuleEnabled).
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  // Named bundles (e.g. "MHC — Master Health Checkup") a doctor can pick as
  // one unit — see the package-chip row rendered above the search box below.
  const [labPanels, setLabPanels] = useState<LabTestPanel[]>([]);
  const [selectedLabTestIds, setSelectedLabTestIds] = useState<string[]>([]);
  const [labNotes, setLabNotes] = useState('');
  const [labTestSearch, setLabTestSearch] = useState('');
  // Completed/pending lab results for THIS patient — shown read-only in the
  // consultation view so the doctor sees the tests they advised (and their
  // results once done) without leaving the prescription screen.
  const [pastLabResults, setPastLabResults] = useState<PatientLabResult[]>([]);
  const [blocks, setBlocks] = useState<DiagnosisBlock[]>([createBlock()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if hospital is eye hospital or multi-specialty — this gates access
  // to the eye-hospital feature pack (optical Rx, institution letterhead,
  // patient-history auto-fill) as an ADDITIVE option, not a replacement of
  // the general prescription format.
  const isEyeHospital = user?.hospital_specialty === 'eye_hospital' || user?.hospital_specialty === 'multi_specialty';
  // multi_specialty hospitals treat both eye and non-eye patients, so — unlike
  // a pure eye_hospital, which only ever needs the Eye (RE/LE) medicines
  // table — they need to choose the format per prescription rather than
  // being locked into one. See the format toggle below and isOpthal's use as
  // the table's render condition (previously incorrectly hard-coded to
  // isEyeHospital, which forced every multi_specialty prescription into the
  // eye-drop table even for non-eye patients).
  const canChooseRxFormat = user?.hospital_specialty === 'multi_specialty';
  // POST/PUT /optical/prescriptions accept either "optical" (admin/optical_staff,
  // full Optical Store) or the narrower "optical.exam" (doctor/nurse, entry-only —
  // see module_roles.py) — a doctor authoring their own consultation's optical Rx
  // here only ever holds the latter, so checking "optical" alone (as this used to)
  // hid this whole section from every doctor. Without this OR, the section either
  // renders for a role who'll get a silent 403 on save, or hides for a role who's
  // actually allowed to save.
  const canCreateOpticalRx = canEdit('optical', user?.roles) || canEdit('optical.exam', user?.roles);

  // Institution dual-letterhead selector (BRD §4.2) + Patient History auto-fill (BRD §4.4)
  const [institutionId, setInstitutionId] = useState('');
  const [institutions, setInstitutions] = useState<HospitalInstitutionOption[]>([]);
  const [vitalsBloodSugar, setVitalsBloodSugar] = useState('');
  const [historySymptoms, setHistorySymptoms] = useState<string[]>([]);

  useEffect(() => {
    if (!isEyeHospital) return;
    hospitalService.getInstitutions().then(setInstitutions).catch(() => {});
  }, [isEyeHospital]);

  // Load the orderable lab test catalog once, when the module is on and we're
  // creating (not editing) a prescription.
  useEffect(() => {
    if (!labModuleEnabled || isEditMode) return;
    labService.getTests(1, 500).then(res => setLabTests(res.data)).catch(() => {});
    labService.getPanels().then(setLabPanels).catch(() => {});
  }, [labModuleEnabled, isEditMode]);

  // The patient's own lab results (all finalized orders) — refreshed whenever
  // the selected patient changes, so a doctor consulting a returning patient
  // immediately sees the outcome of tests advised on a previous visit.
  useEffect(() => {
    if (!labModuleEnabled || !patient?.id) { setPastLabResults([]); return; }
    labService.getPatientResults(patient.id).then(setPastLabResults).catch(() => {});
  }, [labModuleEnabled, patient?.id]);

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
  // Lets the dropdown open on focus, before any typing — otherwise the only
  // way to pick a patient is to already know something to search for.
  const [patientFocused, setPatientFocused] = useState(false);

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

  // Lab test catalog can grow large (dozens of tests across several
  // categories) — filter client-side by name/code/category, then group the
  // filtered list under category subheadings so the checkbox grid stays
  // scannable instead of one long unbroken list.
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

  // Returning from the full Patient Registration form (Register.tsx) after
  // registering a walk-in patient who wasn't found in search below — same
  // sessionStorage 'walkInReturnUrl' + '?new_patient_id=' round trip already
  // used by WalkInRegistration.tsx, reused as-is rather than inventing a
  // second mechanism. Just feeds the new id into the existing patientId
  // effect above instead of duplicating its fetch/autofill logic.
  useEffect(() => {
    const newPatientId = searchParams.get('new_patient_id');
    if (!newPatientId) return;
    setPatientId(newPatientId);
    setShowPatientSearch(false);
    searchParams.delete('new_patient_id');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToRegisterPatient = () => {
    // Register.tsx appends "?new_patient_id=..." to this on return, so it
    // must be the bare pathname (matches WalkInRegistration.tsx's contract) —
    // appending location.search here would produce a malformed double "?".
    // The doctor picked above (if any) survives the round trip via the
    // 'pharmacistRxDoctorId' sessionStorage key set on selection, not via URL.
    sessionStorage.setItem('walkInReturnUrl', location.pathname);
    navigate('/register');
  };

  // Load referral context, if this consultation was reached via a referral —
  // previously nothing here ever fetched the appointment record at all, so a
  // referring doctor's notes/reason never reached the receiving doctor's screen.
  useEffect(() => {
    if (!appointmentId) { setReferralInfo(null); return; }
    let cancelled = false;
    appointmentService.getAppointment(appointmentId)
      .then(appt => {
        if (cancelled) return;
        setReferralInfo({
          isReferral: appt.appointment_type === 'referral',
          referringDoctorName: appt.referring_doctor_name || null,
          notes: appt.notes || null,
          chiefComplaint: appt.chief_complaint || null,
        });
      })
      .catch(() => { if (!cancelled) setReferralInfo(null); });
    return () => { cancelled = true; };
  }, [appointmentId]);

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

  // Landed on /prescriptions/new (the normal "Start Consultation" flow) for
  // a specific appointment — check whether a prescription already exists
  // for it (most commonly a nurse's draft-vitals record, see
  // NurseVitals.tsx) and redirect into editing it instead of rendering a
  // blank form, so the doctor sees the nurse's vitals pre-filled. Silently
  // does nothing when none exists (the common case — most consultations
  // still start blank); a finalized one redirects here too, but the
  // edit-mode effect above already handles that case (bounces back out with
  // an error toast), so no separate check is needed.
  useEffect(() => {
    if (editId || !appointmentId) return;
    let cancelled = false;
    prescriptionService.getPrescriptionByAppointment(appointmentId)
      .then(rx => {
        if (cancelled) return;
        const params = new URLSearchParams(searchParams);
        navigate(`/prescriptions/${rx.id}/edit?${params.toString()}`, { replace: true });
      })
      .catch(() => { /* no existing prescription for this appointment yet */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, appointmentId]);

  // Pre-fill the embedded "Add Optical" section with a nurse's draft for
  // this visit (see NewOpticalPrescription.tsx / WalkInQueue.tsx's "Optical"
  // action) — independent of the vitals redirect above, since this section
  // lives inline on this same page in both create and edit mode, not behind
  // a redirect. Silently does nothing when none exists (the common case).
  useEffect(() => {
    if (!appointmentId || !isEyeHospital) return;
    let cancelled = false;
    opticalService.getPrescriptionByAppointment(appointmentId)
      .then(rx => {
        if (cancelled || !rx) return;
        setExistingOpticalRxId(rx.id);
        setExistingOpticalRxFinalized(!!rx.is_finalized);
        setAddOpticalRx(true);
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
      })
      .catch(() => { /* no existing optical prescription for this appointment yet */ });
    return () => { cancelled = true; };
  }, [appointmentId, isEyeHospital]);

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
    // Pre-fill from what the referring doctor has already written, instead of
    // making them retype the same observation as the referral reason.
    setReferReason(clinicalNotes || '');
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

  // Patient search — empty query still resolves (most-recently-registered
  // patients) so focusing the field shows something to browse, not only
  // once the user has started typing.
  const searchPatients = useCallback(async (q: string) => {
    try {
      const res = await patientService.getPatients(1, 5, q);
      setPatientResults(res.data);
    } catch { setPatientResults([]); }
  }, []);

  useEffect(() => {
    if (!patientFocused) { setPatientResults([]); return; }
    const timer = setTimeout(() => searchPatients(patientSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [patientSearch, patientFocused, searchPatients]);

  // Medicine search — an empty query still resolves (first page of the
  // formulary), so focusing an empty medicine-name field can browse the
  // catalog instead of requiring the user to already know what to type.
  const searchMedicines = useCallback(async (q: string) => {
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

  const patientNav = useListKeyboardNav(patientResults, selectPatient);

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
    // Referral doesn't require a written prescription — a doctor may refer
    // out without prescribing anything themselves — and must not navigate
    // away mid-referral, since the referral call still needs to run after.
    skipEmptyCheck: boolean = false,
    silent: boolean = false,
  ): Promise<string | null> => {
    if (!patient) { showToast('error', 'Please select a patient'); return null; }
    // A pharmacist (or any non-doctor) authoring a NEW prescription may
    // optionally attribute it to a doctor — doctor_id is nullable on the
    // backend now, so an empty pick is fine and simply persists as NULL.

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
    // A lab-only prescription (tests, no medicines/optical) is valid — the
    // server-side finalize handles the empty-medicine case for lab orders.
    const hasLab = labModuleEnabled && selectedLabTestIds.length > 0;
    // is_opthal is now a content-derived flag, not a manual per-prescription
    // toggle (that toggle was removed — general and eye-drop medicines are
    // entered in the same unified table now). It's kept true if any medicine
    // row was actually given an eye side, if an optical Rx was attached, or
    // if it was already true (e.g. loaded from an existing eye-hospital
    // record) — it only drives the cosmetic "OPTHAL" badge downstream.
    const effectiveIsOpthal = isEyeHospital
      ? (isOpthal || hasOptical || validItems.some(i => !!i.eye_side))
      : undefined;
    if (validItems.length === 0 && !hasOptical && !hasLab && !skipEmptyCheck) {
      showToast('error', isEyeHospital
        ? 'Please add at least one medicine, a lab test, or fill out the optical prescription.'
        : labModuleEnabled
          ? 'Add at least one medicine or lab test'
          : 'Add at least one medicine'
      );
      return null;
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
      let freshOpticalRxId: string | null = existingOpticalRxId;

      if (isEditMode && editId) {
        // Update existing prescription
        const updated = await prescriptionService.updatePrescription(editId, {
          diagnosis: allDiagnoses || undefined,
          clinical_notes: clinicalNotes || undefined,
          advice: advice || undefined,
          is_opthal: effectiveIsOpthal,
          ...institutionPayload,
          ...vitalsPayload,
          items: validItems,
        });
        rxId = updated.id;
      } else {
        // Create new prescription
        const rx = await prescriptionService.createPrescription({
          patient_id: patient.id,
          doctor_id: needsDoctorPicker ? (selectedDoctorId || undefined) : undefined,
          appointment_id: appointmentId || undefined,
          queue_id: queueId || undefined,
          diagnosis: allDiagnoses || undefined,
          clinical_notes: clinicalNotes || undefined,
          advice: advice || undefined,
          is_opthal: effectiveIsOpthal,
          ...institutionPayload,
          ...vitalsPayload,
          items: validItems,
        });
        rxId = rx.id;
      }

      // Optical + lab are independent sub-resources of this visit, not of
      // the drug prescription's own create/update mode — a nurse's optical
      // draft (or a doctor re-saving mid-consultation) must be updated here
      // too when isEditMode is true, not just on first creation. Previously
      // this whole block lived only inside the "create new prescription"
      // branch above, so re-saving an existing (e.g. nurse-vitals-redirected)
      // consultation silently dropped any optical/lab entry the doctor made.
      if (hasOptical && !existingOpticalRxFinalized) {
        try {
          const optRx = existingOpticalRxId
            ? await opticalService.updatePrescription(existingOpticalRxId, opticalRx)
            : await opticalService.createPrescription({
                patient_id: patient.id,
                appointment_id: appointmentId || undefined,
                ...opticalRx,
              });
          freshOpticalRxId = optRx.id;
          setCreatedOpticalRxId(optRx.id);
          setExistingOpticalRxId(optRx.id);
        } catch (opticalErr: any) {
          // The drug prescription above already saved successfully — surface
          // the optical failure separately rather than treating the whole
          // save as failed (e.g. the update was rejected because a doctor
          // had already finalized this optical prescription elsewhere).
          showToast(
            'error',
            `Prescription saved, but the optical prescription could not be saved: ${
              opticalErr?.response?.data?.detail || 'unknown error'
            }`,
          );
        }
      }

      // Lab order — independent, non-blocking, same sequencing as optical:
      // a failure here doesn't roll back the drug prescription. The
      // server-side finalize_prescription links + queues it automatically.
      // Only relevant on first creation (a lab order is only ever created
      // once per prescription, never re-created on a later edit/save).
      if (hasLab && !isEditMode) {
        try {
          await labService.createOrder({
            patient_id: patient.id,
            appointment_id: appointmentId || undefined,
            prescription_id: rxId,
            test_ids: selectedLabTestIds,
            notes: labNotes || undefined,
          });
        } catch (labErr: any) {
          showToast(
            'error',
            `Prescription saved, but the lab order could not be created: ${
              labErr?.response?.data?.detail || 'unknown error'
            }`,
          );
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
      } else if (!silent) {
        showToast('success', isEditMode ? 'Prescription updated' : 'Prescription saved as draft');
        if (!isEditMode) navigate('/prescriptions');
      }
      return rxId;
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to save prescription');
      return null;
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
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          {/* Icon-only, top-left — matches the back-button convention used
              across the app. Consultation mode is only ever reached from the
              Walk-in Queue (it requires a queue_id), so a fixed destination
              is always correct there; navigate(-1) covers every other way
              this page can be reached (Prescriptions list, a patient's
              "My Schedule" row, etc.). */}
          <button
            onClick={() => { if (isConsultationMode) navigate('/appointments/queue'); else navigate(-1); }}
            className="text-slate-400 hover:text-slate-600"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
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
        </div>
        <div className="flex gap-3">
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

      {/* Referral banner — surfaces the referring doctor's notes/reason so
          they're actually visible here instead of only living in the DB. */}
      {referralInfo?.isReferral && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <span className="material-symbols-outlined text-orange-500 mt-0.5">forward_to_inbox</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-orange-800">
              Referred patient{referralInfo.referringDoctorName ? ` from ${referralInfo.referringDoctorName}` : ''}
            </p>
            {referralInfo.notes && (
              <p className="mt-0.5 text-sm text-orange-700">{referralInfo.notes}</p>
            )}
            {/* Complaint itself now shown once, in the general Complaint card
                below (near Vitals) rather than duplicated here — see that
                card's comment. */}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Form — expanded to take 3/4 width */}
        <div className="lg:col-span-3 space-y-6">
          {/* Prescribing Doctor — pharmacist (or any non-doctor reaching this
              route) may optionally attribute the prescription to a real
              doctor; POST /prescriptions accepts an omitted doctor_id and
              persists doctor_id = NULL. */}
          {needsDoctorPicker && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">stethoscope</span> Prescribing Doctor
              </h3>
              <label className="block text-xs font-bold text-slate-500 mb-2">
                File this prescription under (optional)
              </label>
              <SearchableSelect
                value={doctorLabel}
                onChange={(value, metadata) => {
                  const id = metadata?.id ? (metadata.id as string) : '';
                  setDoctorLabel(value);
                  setSelectedDoctorId(id);
                  // Persisted so the doctor pick survives the /register round
                  // trip (component remounts on navigation) — same technique
                  // used by NewLabOrder.tsx / NewOpticalPrescription.tsx.
                  if (id) {
                    sessionStorage.setItem('pharmacistRxDoctorId', id);
                    sessionStorage.setItem('pharmacistRxDoctorLabel', value);
                  } else {
                    sessionStorage.removeItem('pharmacistRxDoctorId');
                    sessionStorage.removeItem('pharmacistRxDoctorLabel');
                  }
                }}
                suggestions={pharmacistDoctors.map((d): SuggestionOption => ({
                  id: d.doctor_id,
                  label: d.name,
                  sublabel: d.specialization || undefined,
                  metadata: { id: d.doctor_id },
                }))}
                placeholder="Search doctor (optional)..."
                allowManualEntry={false}
              />
              <p className="text-[11px] text-slate-400 mt-2">
                {isPharmacistUser
                  ? 'Optionally file this prescription under a licensed doctor at this hospital.'
                  : 'Optionally select the doctor this prescription should be attributed to.'}
              </p>
            </div>
          )}

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
                    onKeyDown={patientNav.onKeyDown}
                    onFocus={() => setPatientFocused(true)}
                    onBlur={() => window.setTimeout(() => setPatientFocused(false), 150)}
                    placeholder="Search by name, phone, or PRN... or click to browse recent patients"
                    className="input-field pl-10 pr-9"
                    autoFocus
                  />
                  {patientSearch && (
                    <button type="button" onClick={() => setPatientSearch('')} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600">
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  )}
                </div>
                {patientFocused && patientResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {!patientSearch.trim() && (
                      <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">Recent patients</p>
                    )}
                    {patientResults.map((p, idx) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectPatient(p)}
                        onMouseEnter={() => patientNav.setActiveIndex(idx)}
                        className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 ${
                          idx === patientNav.activeIndex ? 'bg-primary/10' : 'hover:bg-slate-50'
                        }`}
                      >
                        <p className="text-sm font-medium">{p.first_name} {p.last_name}</p>
                        <p className="text-xs text-slate-500">
                          {p.patient_reference_number} | {p.phone_number}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {patientFocused && patientSearch.trim().length >= 2 && patientResults.length === 0 && (
                  <div className="mt-2 bg-slate-50 rounded-lg px-3 py-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="material-symbols-outlined text-base">search_off</span>
                      No patient found for "<span className="font-semibold text-slate-700">{patientSearch}</span>"
                    </div>
                    <button
                      type="button"
                      onClick={goToRegisterPatient}
                      className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline pl-6"
                    >
                      <span className="material-symbols-outlined text-sm">person_add</span>
                      Register as new patient
                    </button>
                  </div>
                )}
                {!patientSearch && !patientFocused && (
                  <p className="text-xs text-slate-400 mt-2">
                    Search for a patient or{' '}
                    <button type="button" onClick={goToRegisterPatient} className="text-primary font-semibold hover:underline">
                      register a new one
                    </button>
                  </p>
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

          {/* Prescription History — shown below patient details, not in the
              sidebar, so the doctor sees it inline while reviewing the
              patient before writing a new prescription. Renders nothing of
              its own accord when the patient has no prior prescriptions. */}
          {patient && <PrescriptionHistoryGrid patientId={patient.id} variant="card" />}

          {/* Lab Results (read-only) — the outcome of tests advised for this
              patient, so the doctor reviews them in-consultation without
              leaving the screen. Moved up to sit alongside Prescription
              History (same "read the patient's past before writing today's
              notes" flow) instead of its old position near the bottom of the
              form, past Diagnosis/Medicines/Lab-order-entry/Optical/Clinical
              Notes, where a doctor would have to scroll past the entire
              consultation form to find it — easy to miss, and too late to
              inform anything written above it. Shown whenever there are any
              (create or edit mode); data itself was already correct
              (get_patient_lab_results only ever returns report_status =
              'finalized' orders) — this was a placement fix, not a data fix. */}
          {labModuleEnabled && pastLabResults.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">biotech</span>
                Lab Results
              </h3>
              <div className="space-y-3">
                {pastLabResults.map(order => (
                  <div key={order.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                      <span className="text-xs font-mono text-slate-600">
                        {order.order_number}
                        <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                          order.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>{order.status.replace('_', ' ')}</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(order.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          {order.items.flatMap(item => (
                            item.parameters.length > 0 ? item.parameters.map((p, idx) => (
                              <tr key={`${item.id}-${idx}`}>
                                <td className="px-3 py-1.5 text-slate-700">{p.name}</td>
                                <td className="px-3 py-1.5 text-slate-900">
                                  {p.value}{p.unit ? ` ${p.unit}` : ''}
                                </td>
                                <td className="px-3 py-1.5 text-slate-400 text-xs">{p.reference_range || ''}</td>
                                <td className="px-3 py-1.5">
                                  {p.flag && (
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                                      p.flag === 'normal' ? 'bg-emerald-50 text-emerald-700'
                                        : p.flag === 'high' ? 'bg-red-50 text-red-600'
                                        : p.flag === 'low' ? 'bg-amber-50 text-amber-700'
                                        : 'bg-orange-50 text-orange-700'
                                    }`}>{p.flag}</span>
                                  )}
                                </td>
                              </tr>
                            )) : [(
                              <tr key={item.id}>
                                <td className="px-3 py-1.5 text-slate-700">
                                  {item.billed_name || item.test_name}
                                  {item.billed_name && item.billed_name !== item.test_name && (
                                    <span className="block text-xs text-slate-400">Catalog reference: {item.test_name}</span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-slate-400 italic" colSpan={3}>Pending</td>
                              </tr>
                            )]
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Patient History — auto-filled from registration (BRD §2.5/§4.4).
              Moved to appear before Complaint/Vitals below so the doctor sees
              the patient's known history first, ahead of today's numbers.
              Blood Sugar used to have its own input in this card too — it's
              now shown/edited inside the Vitals card instead (one of the
              vitals, not patient-history trivia), so this card is
              Symptoms-only. */}
          {isEyeHospital && historySymptoms.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">history</span> Patient History
              </h3>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5 block">Symptoms</label>
                <div className="flex flex-wrap gap-1.5">
                  {historySymptoms.map(s => (
                    <span key={s} className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Complaint — nurse (or reception at registration) can record the
              patient's issue ahead of the consultation (see NurseVitals.tsx /
              NewOpticalPrescription.tsx); shown once here regardless of
              referral status (the referral banner above used to duplicate
              this as "Original complaint", now removed there). Read-only —
              this is the same Appointment.chief_complaint reception/nurse
              already own, not a field this screen writes to. */}
          {referralInfo?.chiefComplaint && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">symptoms</span> Complaint
              </h3>
              <p className="text-sm text-slate-700">{referralInfo.chiefComplaint}</p>
            </div>
          )}

          {/* Vitals Section — nurse can pre-fill this before the doctor opens
              the consultation (see NurseVitals.tsx); shared field/layout via
              VitalsCard so both screens look identical. Blood sugar renders
              inside this same card (eye hospitals only) rather than as a
              separate "Patient History" box further down the page — it's
              one of the vitals, so it belongs with the rest of them. */}
          {patient && (
            <VitalsCard
              values={{ bp: vitalsBp, pulse: vitalsPulse, temp: vitalsTemp, weight: vitalsWeight, spo2: vitalsSpo2 }}
              onChange={(v) => {
                setVitalsBp(v.bp);
                setVitalsPulse(v.pulse);
                setVitalsTemp(v.temp);
                setVitalsWeight(v.weight);
                setVitalsSpo2(v.spo2);
              }}
              bloodSugar={isEyeHospital ? vitalsBloodSugar : undefined}
              onBloodSugarChange={isEyeHospital ? setVitalsBloodSugar : undefined}
            />
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
                  <AutocompleteField
                    as="input"
                    field="diagnosis"
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
                    {/* Single unified medicines table for every hospital type — general
                        medicines and eye drops are entered in the SAME table, on the
                        SAME row-set, at the same time (per BRD: "medicine for the
                        general and the eye are collected at the same place"). There is
                        no longer a per-prescription "General"/"Eye (Opthal)" format
                        toggle — that toggle forced an all-or-nothing choice per
                        prescription (every row eye-drop-only, or every row
                        general-only), which made it impossible to prescribe a normal
                        medicine alongside an eye drop in one visit. The LE/RE toggles
                        below are instead enabled/disabled PER ROW, driven by that
                        row's own selected medicine's category (eyeSideDisabled, via
                        EYE_DROP_CATEGORIES) — exactly the "enable/disable based on
                        medicine type" behavior asked for. */}
                    <div className="grid grid-cols-[28px_1fr_36px_36px_88px_96px_108px_76px_1fr_28px] gap-1 bg-slate-100 border-b border-slate-200 px-3 py-2">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">#</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Medicine</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase text-center">LE</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase text-center">RE</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Dosage</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Frequency</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Duration</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Route</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Food Timing</div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase text-center">×</div>
                    </div>

                    {block.items.map((item, itemIdx) => {
                      const reOn = item.eye_side === 'RE' || item.eye_side === 'Both';
                      const leOn = item.eye_side === 'LE' || item.eye_side === 'Both';
                      const selectedStock = item.medicine_id ? medicineStockById[item.medicine_id] : undefined;
                      const isSelectedOutOfStock = typeof selectedStock === 'number' && selectedStock <= 0;
                      const medInfo = item.medicine_id ? medicineInfoById[item.medicine_id] : undefined;
                      // LE/RE buttons are only enabled for eye-drop category medicines —
                      // if a medicine is selected from the DB and its category isn't
                      // ophthalmic, the buttons lock, so a general medicine on this same
                      // row can never be miscoded with an eye side.
                      const medCategory = (medInfo?.category || '').toLowerCase();
                      const eyeSideDisabled = !!item.medicine_id && !EYE_DROP_CATEGORIES.has(medCategory);
                      return (
                        <div
                          key={itemIdx}
                          className={`grid grid-cols-[28px_1fr_36px_36px_88px_96px_108px_76px_1fr_28px] gap-1 items-center px-3 py-1.5 border-b border-slate-100 last:border-0 hover:bg-blue-50/30 transition-colors ${item.medicine_name.trim() ? 'bg-white' : 'bg-slate-50/50'} ${isSelectedOutOfStock ? 'bg-red-50/60' : ''}`}
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
                                // Focusing an empty field browses the formulary
                                // (first page) instead of showing nothing until typed.
                                if (!item.medicine_name.trim()) {
                                  setMedicineSearch('');
                                  setActiveMedResultIdx(-1);
                                  searchMedicines('');
                                }
                              }}
                              onBlur={() => setTimeout(() => { setActiveMedBlockIdx(null); setActiveMedItemIdx(null); }, 400)}
                              onKeyDown={(e) => handleMedicineInputKeyDown(e, blockIdx, itemIdx)}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                              placeholder="Type, or click to browse formulary..."
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
                              placeholder={(leOn || reOn) ? '1 drop' : '500mg'}
                            />
                          </div>

                          {/* Frequency */}
                          <div className="pr-1">
                            <select
                              value={item.frequency || ''}
                              onChange={e => updateItem(blockIdx, itemIdx, 'frequency', e.target.value)}
                              className="w-full px-1 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-slate-600"
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
                    })}

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

          {/* Clinical Notes */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">clinical_notes</span> Clinical Notes
            </h3>
            <AutocompleteField
              as="textarea"
              field="clinical_notes"
              rows={3}
              value={clinicalNotes}
              onChange={e => setClinicalNotes(e.target.value)}
              className="input-field"
              placeholder="Patient presents with..."
            />
          </div>


          {/* Laboratory Tests — any hospital type (gated by the lab module),
              create-mode only. Ordered as an independent record; the server-side
              finalize links + queues it when the doctor finalizes this Rx. */}
          {labModuleEnabled && !isEditMode && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-sm">biotech</span>
                  Laboratory Tests
                </h3>
                {selectedLabTestIds.length > 0 && (
                  <span className="px-3 py-1 text-xs font-bold rounded-lg bg-primary/10 text-primary">
                    {selectedLabTestIds.length} selected
                  </span>
                )}
              </div>
              {labTests.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No active lab tests in the catalog yet. Add tests under Laboratory → Test Catalog.
                </p>
              ) : (
                <div className="space-y-4">
                  {labPanels.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                        Health Checkup Packages
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {labPanels.map(panel => {
                          // Same toggle mechanic as the per-category "Select
                          // all" checkbox below — just triggered from a named
                          // package instead of a single category, since a
                          // package's tests can span several categories.
                          const panelIds = panel.test_ids;
                          const allSelected = panelIds.length > 0 && panelIds.every(id => selectedLabTestIds.includes(id));
                          return (
                            <button
                              key={panel.id}
                              type="button"
                              onClick={() => setSelectedLabTestIds(prev =>
                                allSelected
                                  ? prev.filter(id => !panelIds.includes(id))
                                  : [...new Set([...prev, ...panelIds])]
                              )}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                                allSelected ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-600 hover:border-primary/40'
                              }`}
                            >
                              {allSelected && <span className="material-symbols-outlined text-sm align-middle mr-1">check_circle</span>}
                              {panel.name} <span className="text-slate-400 font-normal">({panel.test_ids.length})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    <input
                      value={labTestSearch}
                      onChange={e => setLabTestSearch(e.target.value)}
                      placeholder="Search tests by name, code, or category..."
                      className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-3">
                    {labTestGroups.length === 0 ? (
                      <p className="text-sm text-slate-400">No tests match "{labTestSearch}".</p>
                    ) : (
                      labTestGroups.map(({ category, tests }) => {
                        // "Select all" toggles every test in this one category
                        // group at once — for a patient who needs the whole
                        // panel (e.g. all Liver Function Tests) — without
                        // disturbing the existing per-test checkboxes, which
                        // still work individually exactly as before.
                        const groupIds = tests.map(t => t.id);
                        const allChecked = groupIds.length > 0 && groupIds.every(id => selectedLabTestIds.includes(id));
                        const someChecked = groupIds.some(id => selectedLabTestIds.includes(id));
                        return (
                        <div key={category}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                              {category}
                            </div>
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">Lab Notes</label>
                    <textarea
                      rows={2}
                      value={labNotes}
                      onChange={e => setLabNotes(e.target.value)}
                      className="input-field"
                      placeholder="Instructions for the lab (optional)..."
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Optical (Spectacle) Prescription — eye-hospital feature pack only.
              Shown whenever this is a brand-new prescription (!isEditMode) OR
              there's a live appointmentId (a nurse's saved vitals draft — see
              NurseVitals.tsx — routes the doctor straight into edit mode for
              THIS SAME visit, and that draft may carry its own optical entry;
              see the opticalService.getPrescriptionByAppointment effect
              above). Every "New Prescription" entry point across the app —
              queue-driven consultation or a standalone create — must show
              this section for an eye-hospital doctor. A historical,
              standalone EDIT of an old prescription with no appointment_id
              correctly stays excluded — that's a genuinely separate record
              being revised, not a fresh visit. Optical module (store)
              controls whether the patient is sent to the optical store after
              finalization. */}
          {isEyeHospital && (!isEditMode || !!appointmentId) && canCreateOpticalRx && addOpticalRx && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-sm">visibility</span>
                Eye Exam
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              </div>
            </div>
          )}

          {isEyeHospital && (!isEditMode || !!appointmentId) && canCreateOpticalRx && (
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

                  {/* Per-eye PD — distinct from PD Distance/Near above (which
                      split by viewing distance, not by eye); some opticians
                      measure and prescribe PD per eye instead of a single
                      binocular value. */}
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
                    <AutocompleteField as="input" field="optical_prescription_notes" value={opticalRx.notes || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, notes: e.target.value }))} className="input-field" />
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
            <AutocompleteField
              as="textarea"
              field="advice"
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
                onClick={() => { if (isConsultationMode) navigate('/appointments/queue'); else navigate(-1); }}
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{med.name}</span>
                      {med.strength && <span className="text-slate-500">{med.strength}</span>}
                      {med.category && (
                        <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-semibold capitalize">
                          {med.category}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 block">{med.generic_name}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-2">Search by name, generic name, strength (e.g. "500mg"), dosage form (e.g. "syrup"), or composition.</p>
          </div>
        </div>
      </div>

      {/* ── Refer to Doctor Modal ──────────────────────────────────── */}
      {showReferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            {/* Fixed header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
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

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-2 space-y-4">
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

            {/* Fixed footer — always visible */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={closeReferModal}
                className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!referDoctorId || !referDate || !queueId) return;
                  setReferSaving(true);
                  try {
                    // Save whatever the referring doctor has already written
                    // (clinical notes, diagnosis, medicines, optical Rx) before
                    // handing off — referring used to be a dead-end action that
                    // silently discarded any unsaved documentation.
                    const hasDraftContent =
                      clinicalNotes.trim() ||
                      advice.trim() ||
                      blocks.some(b => b.diagnosis.trim() || b.items.some(i => i.medicine_name.trim())) ||
                      (isEyeHospital && addOpticalRx && Object.values(opticalRx).some(v => v !== undefined && v !== ''));
                    if (hasDraftContent) {
                      const savedId = await handleSave(false, false, true, true);
                      if (!savedId) { setReferSaving(false); return; }
                    }

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
                {referSaving ? 'Saving & Referring...' : 'Save & Refer to Doctor'}
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
            {!medicineSearch.trim() && (
              <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">Formulary — browse or type to search</p>
            )}
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

export default PrescriptionBuilder;
