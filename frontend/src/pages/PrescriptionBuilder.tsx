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
import type { PrescriptionItemCreate, Medicine, EyeSide, FrequentMedicine } from '../types/prescription';
import type { OpticalPrescriptionCreateData } from '../types/optical';
import type { LabTest, LabTestPanel, PatientLabResult } from '../types/lab';
import type { Patient, MedicalConditionEntry } from '../types/patient';
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
import LabTestHistoryCard from '../components/patients/LabTestHistoryCard';
import VitalsCard from '../components/prescription/VitalsCard';
import DRSCard from '../components/prescription/DRSCard';

const FREQUENCY_OPTIONS = ['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-0', '0-1-1', '1-1-1', '1-1-1-1', '1 hrs', '2 hrs'];
// Fixed "Condition / History" checklist, shown below Prescription History —
// patient-level (persists across visits, saved via patientService's own
// dedicated medical-conditions endpoint), not part of the prescription itself.
const MEDICAL_CONDITIONS_CHECKLIST = [
  'Diabetes Mellitus',
  'Hypertension',
  'Thyroid Disorder',
  'Asthma / COPD',
  'Coronary Artery Disease',
  'Chronic Kidney Disease',
];
// "Others" — free-text only (no Currently in Treatment Yes/No; just a
// details box per condition), rendered as their own group below the main
// checklist.
const OTHER_MEDICAL_CONDITIONS = [
  'Tuberculosis',
  'Epilepsy',
  'Liver Disease',
  'Cancer / Malignancy',
];
const ALL_MEDICAL_CONDITIONS = [...MEDICAL_CONDITIONS_CHECKLIST, ...OTHER_MEDICAL_CONDITIONS];
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
  // True once the edit-mode load effect confirms this prescription was
  // already finalized (and nothing on it has been dispensed yet, or it
  // would have redirected away instead — see that effect). Changes what
  // the primary save button does: re-finalizing an already-finalized
  // prescription would just 400 on the backend, so this correction editing
  // flow needs its own "Save Changes" action instead of "Save & Send to
  // Pharmacy" / "Save & Complete".
  const [editingFinalizedRx, setEditingFinalizedRx] = useState(false);
  // Whether this visit already has a lab order — distinct from isEditMode.
  // A prescription commonly enters edit mode on its very first real save
  // (e.g. a nurse's draft-vitals record already exists for this visit — see
  // the by-appointment redirect effect below), at which point it has NO lab
  // order yet even though isEditMode is true. Using isEditMode itself to
  // decide "should we create the lab order" skipped that first-ever
  // creation silently — the doctor picked lab tests and finalized, but no
  // order was ever created, so results never showed up anywhere downstream.
  const [hasExistingLabOrder, setHasExistingLabOrder] = useState(false);
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
  // "Patient Past History" — a fixed list of selectable condition names (see
  // ALL_MEDICAL_CONDITIONS). A condition is "selected" simply by being
  // present in this array — no per-condition details/treatment fields.
  const [medicalConditions, setMedicalConditions] = useState<MedicalConditionEntry[]>([]);
  const [savingConditions, setSavingConditions] = useState(false);
  // One free-text "Others" slot — unlike MEDICAL_CONDITIONS_CHECKLIST /
  // OTHER_MEDICAL_CONDITIONS (fixed, known condition names), this lets the
  // doctor record a condition not on either list at all, by typing its own
  // name. Kept out of the `medicalConditions` array (which is keyed by a
  // fixed condition name) until save, when it's appended as one more entry.
  const [customCondition, setCustomCondition] = useState<{ name: string; details: string }>({ name: '', details: '' });
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
  // Both cards are collapsed by default — a doctor clicks to open and type.
  // Once there's real content (typed here, or loaded from an existing
  // draft/prescription), the card stays expanded regardless of this flag so
  // existing notes are never hidden from view.
  const [clinicalNotesOpen, setClinicalNotesOpen] = useState(false);
  const [adviceOpen, setAdviceOpen] = useState(false);
  const clinicalNotesExpanded = clinicalNotesOpen || Boolean(clinicalNotes.trim());
  const adviceExpanded = adviceOpen || Boolean(advice.trim());
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
  // Compact RE/LE × SPH/CYL/AXIS grid — one card per prescribed block (AR
  // machine reading or the doctor's final call), matching the printed
  // spectacle-prescription layout instead of two separate per-eye boxes
  // stacked vertically, to cut down the vertical space this section used to
  // take before the doctor even reaches Diagnosis & Medicines below.
  // `showVA` also renders the per-eye Visual Acuity row (Doctor Prescribed
  // only — an auto-refractometer doesn't produce an acuity reading).
  const renderOpticalRxGrid = (prefix: 'machine' | '', addField: 'add' | 'machine_add', showVA: boolean) => {
    const rf = (base: string) => `right_${prefix ? prefix + '_' : ''}${base}` as keyof OpticalPrescriptionCreateData;
    const lf = (base: string) => `left_${prefix ? prefix + '_' : ''}${base}` as keyof OpticalPrescriptionCreateData;
    const cellInput = (field: keyof OpticalPrescriptionCreateData, extraProps: Record<string, any> = {}) => (
      <input
        type="number"
        value={(opticalRx as any)[field] ?? ''}
        onChange={opticalNumField(field)}
        className="w-full px-2 py-1.5 text-sm text-center border-0 cursor-text focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
        {...extraProps}
      />
    );
    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-2 text-center text-xs font-bold text-slate-600 uppercase tracking-wide bg-slate-50">
          <div className="py-1.5 border-r border-slate-200">RE</div>
          <div className="py-1.5">LE</div>
        </div>
        {/* Sub-header, Visual Acuity and Add labels all use text-xs — same
            size as the "RE"/"LE" header above and every other field label on
            this page (PD, Optical Notes, etc.) — so nothing in this table
            reads as a different scale from the rest of the form. */}
        <div className="grid grid-cols-6 text-center text-xs font-semibold text-slate-500 uppercase border-t border-slate-200">
          <div className="py-1 border-r border-slate-100">SPH</div>
          <div className="py-1 border-r border-slate-100">CYL</div>
          <div className="py-1 border-r border-slate-200">Axis</div>
          <div className="py-1 border-r border-slate-100">SPH</div>
          <div className="py-1 border-r border-slate-100">CYL</div>
          <div className="py-1">Axis</div>
        </div>
        <div className="grid grid-cols-6 gap-px bg-slate-200 border-t border-slate-200">
          <div className="bg-white">{cellInput(rf('sph'), { step: '0.25' })}</div>
          <div className="bg-white">{cellInput(rf('cyl'), { step: '0.25' })}</div>
          <div className="bg-white">{cellInput(rf('axis'), { min: 0, max: 180 })}</div>
          <div className="bg-white">{cellInput(lf('sph'), { step: '0.25' })}</div>
          <div className="bg-white">{cellInput(lf('cyl'), { step: '0.25' })}</div>
          <div className="bg-white">{cellInput(lf('axis'), { min: 0, max: 180 })}</div>
        </div>
        {/* Add — one shared field for both eyes, same convention as PD below.
            Comes before Visual Acuity per the requested field order. */}
        <div className="border-t border-slate-200 p-2">
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Add</label>
          <input type="number" step="0.25" value={(opticalRx as any)[addField] ?? ''} onChange={opticalNumField(addField)} className="input-field" />
        </div>
        {showVA && (
          <div className="grid grid-cols-2 gap-px bg-slate-200 border-t border-slate-200">
            <div className="bg-white p-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Visual Acuity</label>
              <input
                value={opticalRx.right_va || ''}
                onChange={(e) => setOpticalRx(prev => ({ ...prev, right_va: e.target.value }))}
                placeholder="6/6"
                className="input-field"
              />
            </div>
            <div className="bg-white p-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Visual Acuity</label>
              <input
                value={opticalRx.left_va || ''}
                onChange={(e) => setOpticalRx(prev => ({ ...prev, left_va: e.target.value }))}
                placeholder="6/6"
                className="input-field"
              />
            </div>
          </div>
        )}
      </div>
    );
  };
  // Optional Laboratory tests, ordered alongside the drug prescription in the
  // same visit — any hospital type (gated by labModuleEnabled).
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  // Named bundles (e.g. "MHC — Master Health Checkup") a doctor can pick as
  // one unit — see the package-chip row rendered above the search box below.
  const [labPanels, setLabPanels] = useState<LabTestPanel[]>([]);
  const [selectedLabTestIds, setSelectedLabTestIds] = useState<string[]>([]);
  const [labNotes, setLabNotes] = useState('');
  // Lab Notes doubles as the search-and-select input for adding tests beyond
  // whatever a Health Checkup Package already covers — typing shows a
  // typeahead of matching catalog tests, and picking one actually selects
  // that test (adds it to selectedLabTestIds, the real order). There used to
  // be a second, separate "Investigation" box for this same search/suggest
  // behavior, but it was purely descriptive text for the print output —
  // redundant with this one full catalog search, so it's gone; Lab Notes is
  // now the only input here. Replaces the old separate search box + full
  // categorized checkbox grid, which took up a lot of
  // vertical space before the doctor even reached Diagnosis & Medicines.
  const [labNotesSuggestOpen, setLabNotesSuggestOpen] = useState(false);
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
  const [vitalsDrs, setVitalsDrs] = useState('');
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

  // Frequently Prescribed panel — top medicines by prescribing history at
  // this hospital, so a doctor can one-click add a common medicine instead
  // of typing/searching it every time.
  const [frequentMedicines, setFrequentMedicines] = useState<FrequentMedicine[]>([]);
  const [loadingFrequent, setLoadingFrequent] = useState(true);
  const [activeMedBlockIdx, setActiveMedBlockIdx] = useState<number | null>(null);
  const [activeMedItemIdx, setActiveMedItemIdx] = useState<number | null>(null);
  const [activeMedResultIdx, setActiveMedResultIdx] = useState<number>(-1);
  const medicineOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Portal dropdown positioning
  const activeMedInputRef = useRef<HTMLInputElement | null>(null);
  const [medDropdownPos, setMedDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

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

  // Suggestions for Lab Notes, which doubles as the search-and-select input
  // for the real test order — matched against whatever the doctor is
  // currently typing after the last comma (so "CBC, Lipid" still suggests
  // off of "Lipid" alone), excluding tests already selected so the dropdown
  // only ever offers "remaining" tests to add.
  const labNotesSuggestions = useMemo(() => {
    const parts = labNotes.split(',');
    const current = parts[parts.length - 1].trim().toLowerCase();
    if (!current) return [];
    return labTests
      .filter((t) => !selectedLabTestIds.includes(t.id) && t.name.toLowerCase().includes(current))
      .slice(0, 8);
  }, [labTests, labNotes, selectedLabTestIds]);

  // Names of every currently selected test, for the removable-chip summary
  // below the Lab Notes input — the doctor's only way to review/undo an
  // individual selection now that the full checkbox grid is gone.
  const selectedLabTestNames = useMemo(
    () => selectedLabTestIds
      .map((id) => labTests.find((t) => t.id === id))
      .filter((t): t is LabTest => !!t),
    [selectedLabTestIds, labTests],
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
          // Bug fix: this used to also copy the patient's last known blood
          // sugar into today's Vitals card and their registration-time
          // reason_for_visit into Clinical Notes — both looked like real
          // data entered for THIS visit when they weren't (and the latter
          // defeated Clinical Notes' hidden-by-default behavior, since a
          // non-empty value auto-expands it). Symptoms still auto-fill since
          // they're shown read-only in the separate Patient History card
          // below, not injected into an editable field.
          if (isEyeHospital && !editId) {
            if (p.symptoms?.length) setHistorySymptoms(p.symptoms);
          }
        })
        .catch(() => showToast('error', 'Patient not found'));
    }
  }, [patientId, isEyeHospital, editId]);

  // Sync the "Condition / History" checklist whenever the patient changes
  // (covers both the patientId-driven load above and the search-select
  // handler further down) — merges whatever was already saved for this
  // patient onto the fixed checklist, defaulting anything not yet answered.
  useEffect(() => {
    if (!patient) return;
    const saved = patient.medical_conditions || [];
    // A fixed-list condition counts as "selected" simply by being present
    // in the saved array — old records that still carry details/treatment
    // values from before this became a plain checklist keep showing as
    // selected; those old fields are just no longer surfaced or editable.
    setMedicalConditions(saved.filter(e => ALL_MEDICAL_CONDITIONS.includes(e.condition)));
    // Any saved entry whose condition name isn't one of the fixed ones is
    // the free-text "Others" slot from a previous save — restore it instead
    // of silently dropping it.
    const custom = saved.find(e => !ALL_MEDICAL_CONDITIONS.includes(e.condition));
    setCustomCondition(custom ? { name: custom.condition, details: custom.details || '' } : { name: '', details: '' });
  }, [patient]);

  // Persists immediately — there's no separate Save button for this card;
  // every click/edit here takes effect right away.
  const persistMedicalConditions = async (fixedList: MedicalConditionEntry[], custom: { name: string; details: string }) => {
    if (!patient) return;
    setSavingConditions(true);
    try {
      const trimmedName = custom.name.trim();
      const toSave = trimmedName
        ? [...fixedList, { condition: trimmedName, details: custom.details || null, currently_in_treatment: null }]
        : fixedList;
      const updated = await patientService.updateMedicalConditions(patient.id, toSave);
      setPatient(updated);
    } catch {
      showToast('error', 'Failed to save Patient Past History');
    } finally {
      setSavingConditions(false);
    }
  };
  // Click to select, click again to deselect — a fixed-list condition's
  // presence in medicalConditions IS its selected state. Saves immediately.
  const toggleCondition = (condition: string) => {
    setMedicalConditions(prev => {
      const next = prev.some(e => e.condition === condition)
        ? prev.filter(e => e.condition !== condition)
        : [...prev, { condition, details: null, currently_in_treatment: null }];
      persistMedicalConditions(next, customCondition);
      return next;
    });
  };
  // The free-text "Others" box has no click-to-select action, so it saves on
  // blur instead (still no explicit Save button to press).
  const persistCustomConditionOnBlur = () => {
    persistMedicalConditions(medicalConditions, customCondition);
  };

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
        // A finalized prescription can still be corrected (dosage typo, add/
        // remove a medicine, etc.) — but only before pharmacy has actually
        // dispensed anything against it (see update_prescription's own
        // guard on the backend, which is the real enforcement; this is just
        // the friendlier front-door version of the same rule).
        const anyDispensed = (rx.items || []).some(item => (item.dispensed_quantity || 0) > 0);
        if (rx.is_finalized && anyDispensed) {
          showToast('error', 'This prescription has already been dispensed and can no longer be edited');
          navigate(`/prescriptions/${editId}`);
          return;
        }
        setEditingFinalizedRx(!!rx.is_finalized);
        setHasExistingLabOrder(!!rx.has_lab_order);
        setPatientId(rx.patient_id);
        setAppointmentId(rx.appointment_id || '');
        setClinicalNotes(rx.clinical_notes || '');
        setAdvice(rx.advice || '');
        setIsOpthal(rx.is_opthal || false);
        setInstitutionId(rx.institution_id || '');
        setVitalsBloodSugar(rx.vitals_blood_sugar || '');
        setVitalsDrs(rx.vitals_drs || '');
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

  // Landed on /prescriptions/new (the normal "Start Consultation" flow, or
  // "My Patients"' row-click for a completed visit — see
  // DoctorAppointments.tsx's openPrescription) for a specific appointment —
  // check whether a prescription already exists for it and redirect into
  // it instead of rendering a blank form. A draft (most commonly a nurse's
  // draft-vitals record, see NurseVitals.tsx) redirects into EDIT mode so
  // the doctor sees it pre-filled and can keep writing. A FINALIZED one
  // redirects straight to the read-only detail view instead — previously
  // this always redirected to edit mode first, which then bounced back out
  // via the edit-mode effect above (is_finalized check) with an "Cannot
  // edit a finalized prescription" error toast on every single click of an
  // already-completed patient in "My Patients", even though the doctor never
  // asked to edit anything, just to view it. Silently does nothing when no
  // prescription exists yet (the common case — most consultations still
  // start blank).
  useEffect(() => {
    if (editId || !appointmentId) return;
    let cancelled = false;
    prescriptionService.getPrescriptionByAppointment(appointmentId)
      .then(rx => {
        if (cancelled) return;
        const params = new URLSearchParams(searchParams);
        if (rx.is_finalized) {
          navigate(`/prescriptions/${rx.id}?${params.toString()}`, { replace: true });
        } else {
          navigate(`/prescriptions/${rx.id}/edit?${params.toString()}`, { replace: true });
        }
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
          right_machine_sph: rx.right_machine_sph ?? undefined, right_machine_cyl: rx.right_machine_cyl ?? undefined,
          right_machine_axis: rx.right_machine_axis ?? undefined, right_machine_add: rx.right_machine_add ?? undefined,
          left_machine_sph: rx.left_machine_sph ?? undefined, left_machine_cyl: rx.left_machine_cyl ?? undefined,
          left_machine_axis: rx.left_machine_axis ?? undefined, left_machine_add: rx.left_machine_add ?? undefined,
          right_sph: rx.right_sph ?? undefined, right_cyl: rx.right_cyl ?? undefined,
          right_axis: rx.right_axis ?? undefined, right_add: rx.right_add ?? undefined, right_va: rx.right_va ?? undefined,
          right_vision: rx.right_vision ?? undefined, right_iop: rx.right_iop ?? undefined, right_nld: rx.right_nld ?? undefined,
          left_sph: rx.left_sph ?? undefined, left_cyl: rx.left_cyl ?? undefined,
          left_axis: rx.left_axis ?? undefined, left_add: rx.left_add ?? undefined, left_va: rx.left_va ?? undefined,
          left_vision: rx.left_vision ?? undefined, left_iop: rx.left_iop ?? undefined, left_nld: rx.left_nld ?? undefined,
          pd_distance: rx.pd_distance ?? undefined, pd_near: rx.pd_near ?? undefined,
          pd_right: rx.pd_right ?? undefined, pd_left: rx.pd_left ?? undefined,
          // Fall back to the old pd_distance value for a record saved before
          // the single-PD field existed, so re-opening it doesn't show blank.
          pd: rx.pd ?? rx.pd_distance ?? undefined,
          // Same fallback for the shared Add fields — old records only ever
          // had the per-eye values, and the two normally match anyway.
          add: rx.add ?? rx.right_add ?? rx.left_add ?? undefined,
          machine_add: rx.machine_add ?? rx.right_machine_add ?? rx.left_machine_add ?? undefined,
          inv_hiv: rx.inv_hiv ?? undefined, inv_ecg: rx.inv_ecg ?? undefined, inv_vdrl: rx.inv_vdrl ?? undefined,
          inv_bp: rx.inv_bp ?? undefined, inv_blood_sugar: rx.inv_blood_sugar ?? undefined,
          inv_spo2: rx.inv_spo2 ?? undefined, inv_others: rx.inv_others ?? undefined,
          notes: rx.notes ?? undefined,
        });
      })
      .catch(() => { /* no existing optical prescription for this appointment yet */ });
    return () => { cancelled = true; };
  }, [appointmentId, isEyeHospital]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meds = await prescriptionService.getFrequentMedicines(10);
        if (!cancelled) setFrequentMedicines(meds);
      } catch {
        // Non-critical panel — fail silently, form still works without it.
        if (!cancelled) setFrequentMedicines([]);
      } finally {
        if (!cancelled) setLoadingFrequent(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** One-click add from the Frequently Prescribed panel — fills the first
   * empty medicine row (block 0, the only block), or appends a new row if
   * every row is already filled in. */
  const appendFrequentMedicine = (med: FrequentMedicine) => {
    const blockIdx = 0;
    setBlocks((prev) => {
      const next = [...prev];
      const block = next[blockIdx];
      const items = block.items;
      const emptyIdx = items.findIndex((i) => !i.medicine_name.trim());
      const filledItem: PrescriptionItemCreate = {
        ...(emptyIdx !== -1 ? items[emptyIdx] : emptyItem()),
        medicine_id: med.id,
        medicine_name: getDisplayMedicineName(med),
        generic_name: med.generic_name,
        dosage: med.strength || '',
      };
      const updatedItems = emptyIdx !== -1
        ? items.map((it, i) => (i === emptyIdx ? filledItem : it))
        : [...items, { ...filledItem, display_order: items.length }];
      next[blockIdx] = { ...block, items: updatedItems };
      return next;
    });
    // Deliberately not touching medicineStockById here — the Frequently
    // Prescribed panel doesn't fetch stock (that's the pharmacist's concern
    // at dispensing time), so there's nothing to record and no out-of-stock
    // warning should show on a row filled this way.
    setMedicineInfoById((prev) => ({
      ...prev,
      [med.id]: {
        category: med.category,
        units_per_pack: med.units_per_pack ?? 1,
        unit_of_measure: med.unit_of_measure ?? 'units',
      },
    }));
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
      // Blood Sugar is a general vital, unlike DRS (diabetic retinopathy
      // screening, genuinely eye-specific) — the backend column has never
      // been hospital-type-restricted, so it shouldn't be hidden here
      // either. Bug fix: it used to be gated the same as DRS, which meant
      // a doctor at a non-eye hospital had no way to enter it at all.
      vitals_blood_sugar: vitalsBloodSugar || undefined,
      vitals_drs: isEyeHospital ? (vitalsDrs || undefined) : undefined,
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
      // Gated on hasExistingLabOrder (does THIS visit already have one),
      // not isEditMode (is the prescription record itself new) — a
      // prescription commonly starts in edit mode on its very first real
      // save (a nurse's draft-vitals record already existed for this visit)
      // with no lab order yet, and !isEditMode alone silently skipped
      // creating one in that case even though this was the first and only
      // time lab tests were ever selected for this visit.
      if (hasLab && !hasExistingLabOrder) {
        try {
          await labService.createOrder({
            patient_id: patient.id,
            appointment_id: appointmentId || undefined,
            prescription_id: rxId,
            test_ids: selectedLabTestIds,
            notes: labNotes || undefined,
          });
          // Flip immediately so a second "Save Draft" click later in this
          // same edit session (isEditMode saves without finalizing don't
          // navigate away — see below) doesn't create a duplicate order.
          setHasExistingLabOrder(true);
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

      <div className="grid grid-cols-1 gap-6">
        {/* Form — full width now that the Favorite Templates / Formulary
            Search sidebar has been removed (per-item medicine autocomplete
            below still works via the same medicineSearch state). */}
        <div className="space-y-6">
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
          {patient && <PrescriptionHistoryGrid patientId={patient.id} variant="card" labResults={pastLabResults} />}

          {/* Condition / History — a fixed checklist of common chronic
              conditions, patient-level (persists across every future visit,
              saved via its own dedicated endpoint — see
              patientService.updateMedicalConditions), not part of this one
              prescription. Distinct from the free-text "Symptoms" card
              below, which is this specific visit's presenting complaint. */}
          {patient && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-sm">history_edu</span>
                  Patient Past History
                </h3>
                {/* No Save button — every click/edit below persists
                    immediately (see persistMedicalConditions). This is just a
                    quiet in-flight indicator. */}
                {savingConditions && (
                  <span className="text-sm text-slate-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    Saving...
                  </span>
                )}
              </div>
              {/* Click a condition to select it, click again to deselect —
                  same chip toggle mechanic as the Lab Test Panels above. Text
                  size matches the "Others" label/inputs below (text-sm) for
                  a consistent look across the card. */}
              <div className="flex flex-wrap gap-2">
                {ALL_MEDICAL_CONDITIONS.map(condition => {
                  const selected = medicalConditions.some(e => e.condition === condition);
                  return (
                    <button
                      key={condition}
                      type="button"
                      onClick={() => toggleCondition(condition)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        selected ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-600 hover:border-primary/40'
                      }`}
                    >
                      {selected && <span className="material-symbols-outlined text-sm align-middle mr-1">check_circle</span>}
                      {condition}
                    </button>
                  );
                })}
              </div>

              {/* One free-text "Others" slot — a condition not on the fixed
                  list above, named by the doctor. Saves on blur since typing
                  isn't a "select" action. */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-600">Others</label>
                  {(customCondition.name || customCondition.details) && (
                    <button
                      type="button"
                      onClick={() => { setCustomCondition({ name: '', details: '' }); persistMedicalConditions(medicalConditions, { name: '', details: '' }); }}
                      title="Clear this entry"
                      className="p-0.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  )}
                </div>
                <div className="flex gap-2 max-w-md">
                  <input
                    value={customCondition.name}
                    onChange={(e) => setCustomCondition(prev => ({ ...prev, name: e.target.value }))}
                    onBlur={persistCustomConditionOnBlur}
                    placeholder="Condition name"
                    className="input-field flex-1 min-w-0 text-sm"
                  />
                  <input
                    value={customCondition.details}
                    onChange={(e) => setCustomCondition(prev => ({ ...prev, details: e.target.value }))}
                    onBlur={persistCustomConditionOnBlur}
                    placeholder="Details, if any"
                    className="input-field flex-1 min-w-0 text-sm"
                  />
                </div>
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
              inside this same card (every hospital type, same as the other
              vitals) rather than as a separate "Patient History" box further
              down the page — it's one of the vitals, so it belongs with the
              rest of them. */}
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
              bloodSugar={vitalsBloodSugar}
              onBloodSugarChange={setVitalsBloodSugar}
            />
          )}

          {/* DRS (Diabetic Retinopathy Screening) — positioned directly below
              Vitals, same as the nurse's entry screens. Pre-filled from
              whatever the nurse already recorded for this visit (see
              NurseVitals.tsx / VitalsDialog.tsx) — the doctor sees it here
              with no re-entry required, and can still amend it before
              finalizing. */}
          {patient && isEyeHospital && (
            <DRSCard value={vitalsDrs} onChange={setVitalsDrs} />
          )}

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

          {/* Clinical Notes — collapsed by default, click to open and type. */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3
              className={`font-semibold flex items-center gap-2 cursor-pointer select-none ${clinicalNotesExpanded ? 'mb-4' : ''}`}
              onClick={() => setClinicalNotesOpen((v) => !v)}
            >
              <span className="material-symbols-outlined text-primary text-sm">clinical_notes</span>
              <span className="flex-1">Clinical Notes</span>
              <span className="material-symbols-outlined text-primary text-lg transition-transform" style={{ transform: clinicalNotesExpanded ? 'rotate(180deg)' : 'none' }}>
                expand_more
              </span>
            </h3>
            {clinicalNotesExpanded && (
              <AutocompleteField
                as="textarea"
                field="clinical_notes"
                rows={3}
                value={clinicalNotes}
                onChange={e => setClinicalNotes(e.target.value)}
                className="input-field"
                placeholder="Patient presents with..."
              />
            )}
          </div>

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
                  {/* AR Prescribed (auto-refractometer reading) and Doctor
                      Prescribed (the doctor's final call) — same grid format
                      for both, stacked vertically one after another rather
                      than side by side. */}
                  <div>
                    <p className="text-xs font-bold text-primary uppercase tracking-wide mb-2">AR Prescribed</p>
                    {renderOpticalRxGrid('machine', 'machine_add', false)}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-primary uppercase tracking-wide mb-2">Doctor Prescribed</p>
                    {renderOpticalRxGrid('', 'add', true)}
                  </div>

                  {/* PD (single combined box for both eyes, same convention
                      as the shared "Add" field above) and Optical Notes side
                      by side instead of stacked. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">PD (mm)</label>
                      <input type="number" step="0.5" value={opticalRx.pd ?? ''} onChange={opticalNumField('pd')} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Optical Notes</label>
                      <AutocompleteField as="input" field="optical_prescription_notes" value={opticalRx.notes || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, notes: e.target.value }))} className="input-field" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {isEyeHospital && (!isEditMode || !!appointmentId) && canCreateOpticalRx && addOpticalRx && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-sm">visibility</span>
                Eye Investigation
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

              {/* Systemic investigations — one shared set of values for the
                  whole patient, not split per eye like Vision/IOP/NLD above. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">HIV</label>
                  <input value={opticalRx.inv_hiv || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, inv_hiv: e.target.value }))} placeholder="Non-Reactive" className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">ECG</label>
                  <input value={opticalRx.inv_ecg || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, inv_ecg: e.target.value }))} placeholder="Normal" className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">VDRL</label>
                  <input value={opticalRx.inv_vdrl || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, inv_vdrl: e.target.value }))} placeholder="Non-Reactive" className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">BP (mmHg)</label>
                  <input value={opticalRx.inv_bp || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, inv_bp: e.target.value }))} placeholder="120/80" className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Blood Sugar (mg/dL)</label>
                  <input value={opticalRx.inv_blood_sugar || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, inv_blood_sugar: e.target.value }))} placeholder="110" className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">SpO2 (%)</label>
                  <input value={opticalRx.inv_spo2 || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, inv_spo2: e.target.value }))} placeholder="98" className="input-field" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Others</label>
                  <input value={opticalRx.inv_others || ''} onChange={(e) => setOpticalRx(prev => ({ ...prev, inv_others: e.target.value }))} placeholder="Any other investigation finding" className="input-field" />
                </div>
              </div>
            </div>
          )}

          {/* Laboratory Test History — this patient's past lab orders, right
              above the ordering card below so the doctor sees it without
              scrolling back up to the Prescription History card near the
              top (which also shows the same list, alongside Rx history).
              Reuses the pastLabResults fetch already done for that card. */}
          {labModuleEnabled && !isEditMode && <LabTestHistoryCard labResults={pastLabResults} />}

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
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Lab Notes
                      <span className="text-[10px] font-normal text-slate-400 ml-1.5">
                        Search &amp; select remaining tests, or type instructions for the lab
                      </span>
                    </label>
                    <textarea
                      rows={2}
                      value={labNotes}
                      onChange={e => setLabNotes(e.target.value)}
                      onFocus={() => setLabNotesSuggestOpen(true)}
                      onBlur={() => setTimeout(() => setLabNotesSuggestOpen(false), 150)}
                      className="input-field"
                      placeholder="Type a test name to search, or write instructions for the lab..."
                    />
                    {labNotesSuggestOpen && labNotesSuggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {labNotesSuggestions.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedLabTestIds(prev => [...prev, t.id]);
                              const parts = labNotes.split(',');
                              parts[parts.length - 1] = ` ${t.name}`;
                              setLabNotes(parts.join(',').replace(/^ /, '') + ', ');
                            }}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-primary/5 flex items-center gap-2"
                          >
                            <span className="material-symbols-outlined text-primary text-sm">biotech</span>
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Selected-tests summary — the only way left to review or
                        undo an individual test now that the full checkbox
                        grid is gone. Includes package-selected tests too, so
                        deselecting one here also unchecks its package chip
                        above if that breaks the package's "all selected"
                        match. */}
                    {selectedLabTestNames.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedLabTestNames.map((t) => (
                          <span key={t.id} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                            {t.name}
                            <button
                              type="button"
                              onClick={() => setSelectedLabTestIds(prev => prev.filter(id => id !== t.id))}
                              className="p-0.5 hover:bg-primary/20 rounded-full"
                            >
                              <span className="material-symbols-outlined text-[14px] align-middle">close</span>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Diagnosis & Medicines, with the Frequently Prescribed quick-pick
              panel alongside it on wide screens (stacks below on mobile). */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">
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

            {/* Frequently Prescribed — one-click add of this hospital's
                most-prescribed medicines into the table on the left. */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:sticky lg:top-4 h-fit">
              <h3 className="font-semibold flex items-center gap-2 mb-3 text-sm">
                <span className="material-symbols-outlined text-primary text-sm">trending_up</span>
                Frequently Prescribed
              </h3>
              {loadingFrequent ? (
                <p className="text-xs text-slate-400">Loading…</p>
              ) : frequentMedicines.length === 0 ? (
                <p className="text-xs text-slate-400">No prescribing history yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {frequentMedicines.map((med) => (
                    <button
                      key={med.id}
                      type="button"
                      onClick={() => appendFrequentMedicine(med)}
                      title={`Add ${med.name} to this prescription`}
                      className="w-full text-left px-2.5 py-2 rounded-lg border border-slate-100 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700 group-hover:text-primary truncate">{med.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">×{med.times_prescribed}</span>
                      </div>
                      {med.strength && <span className="text-[10px] text-slate-400">{med.strength}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Advice — collapsed by default, click to open and type. */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3
              className={`font-semibold flex items-center gap-2 cursor-pointer select-none ${adviceExpanded ? 'mb-4' : ''}`}
              onClick={() => setAdviceOpen((v) => !v)}
            >
              <span className="material-symbols-outlined text-primary text-sm">info</span>
              <span className="flex-1">Advice</span>
              <span className="material-symbols-outlined text-primary text-lg transition-transform" style={{ transform: adviceExpanded ? 'rotate(180deg)' : 'none' }}>
                expand_more
              </span>
            </h3>
            {adviceExpanded && (
              <AutocompleteField
                as="textarea"
                field="advice"
                rows={3}
                value={advice}
                onChange={e => setAdvice(e.target.value)}
                className="input-field"
                placeholder="Diet, exercise, follow-up instructions..."
              />
            )}
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
              {editingFinalizedRx ? (
                // Correcting an already-finalized prescription — no second
                // finalize/complete action here (the backend would reject
                // re-finalizing, and pharmacy already has this prescription
                // in its queue either way); just save the correction in
                // place. Recorded as a new version snapshot automatically.
                <button
                  onClick={() => handleSave(false, false)}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              ) : (
                <>
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
                </>
              )}
            </div>
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
