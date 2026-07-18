import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  TITLE_OPTIONS, GENDER_OPTIONS, BLOOD_GROUP_OPTIONS,
  RELATIONSHIP_OPTIONS, COUNTRIES, STATE_COUNTRY_MAP,
  getStatesForCountry, getPostalLabel, getPhoneCode
} from '../utils/constants';
import patientService from '../services/patientService';
import { useToast } from '../contexts/ToastContext';
import { useDashboardRefresh } from '../contexts/DashboardRefreshContext';
import { useAuth } from '../contexts/AuthContext';
import feLogger from '../services/loggerService';
import EmailVerificationField from '../components/patients/EmailVerificationField';
import PhoneVerificationField from '../components/patients/PhoneVerificationField';
import VerifiedBadge from '../components/patients/VerifiedBadge';

// BRD v1.1 §2.4 — Patient History symptom dropdown (multi-select + custom entries)
const SYMPTOM_OPTIONS = [
  'Itching', 'Irritation', 'Distance Vision (Both Eyes)', 'Near Vision (Both Eyes)',
  'Redness', 'Swelling', 'Delgium', 'Cataract', 'Eye Injury', 'Eye Pressure',
  'Watering', 'Glaucoma', 'Diabetic Retinopathy',
];

const FIELD_LABELS: Partial<Record<string, string>> = {
  title: 'Title',
  first_name: 'First Name',
  last_name: 'Last Name',
  date_of_birth: 'Date of Birth',
  gender: 'Gender',
  blood_group: 'Blood Group',
  phone_country_code: 'Country Code',
  phone_number: 'Mobile Number',
  email: 'Email',
  address_line_1: 'Address Line 1',
  address_line_2: 'Address Line 2',
  city: 'City',
  state: 'State',
  pin_code: 'PIN Code',
  country: 'Country',
  emergency_contact_name: 'Emergency Contact Name',
  emergency_contact_phone: 'Emergency Contact Phone',
  emergency_contact_country_code: 'Emergency Country Code',
  emergency_contact_relation: 'Emergency Relationship',
};

// All form fields as plain strings — no zod dependency in the form layer
type FD = {
  title: string; first_name: string; last_name: string;
  date_of_birth: string; gender: string; blood_group: string;
  phone_country_code: string; phone_number: string; email: string;
  address_line_1: string; address_line_2: string; city: string;
  state: string; pin_code: string; country: string;
  emergency_contact_name: string; emergency_contact_phone: string;
  emergency_contact_country_code: string; emergency_contact_relation: string;
};

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { id: patientId } = useParams<{ id?: string }>();
  const isEditMode = !!patientId;
  const toast = useToast();
  const { triggerRefresh } = useDashboardRefresh();
  const { isEyeHospitalFeatureEnabled } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(isEditMode);

  // Patient History block (BRD v1.1 §2) — eye-hospital feature pack only
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [customSymptom, setCustomSymptom] = useState('');
  const [bloodSugarValue, setBloodSugarValue] = useState('');
  const [bloodSugarUnit, setBloodSugarUnit] = useState('mg/dL');

  // Verification status (BRD_OP_1 §3.2) — only meaningful in edit mode; a
  // brand-new, unsaved patient has neither an id nor a verification state yet.
  const [verification, setVerification] = useState({ is_email_verified: false, is_phone_verified: false });

  const toggleSymptom = (symptom: string) => {
    setSymptoms(prev => prev.includes(symptom) ? prev.filter(s => s !== symptom) : [...prev, symptom]);
  };
  const addCustomSymptom = () => {
    const value = customSymptom.trim();
    if (value && !symptoms.includes(value)) setSymptoms(prev => [...prev, value]);
    setCustomSymptom('');
  };
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FD, string>>>({}); 
  // Tracks whether Submit has been clicked at least once
  // Before first submit: no inline errors ever shown (clean UX)
  // After first submit: errors update live as user corrects each field
  const submittedRef = React.useRef(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isSubmitting },
  } = useForm<FD>({
    // No zodResolver — eliminates @hookform/resolvers v3 + zod v4 version mismatch
    // Validation is done manually inside onSubmit only
    defaultValues: {
      title: '', first_name: '', last_name: '', date_of_birth: '',
      gender: '', blood_group: '', phone_country_code: '+91', phone_number: '',
      email: '', address_line_1: '', address_line_2: '', city: '',
      state: '', pin_code: '', country: 'India',
      emergency_contact_name: '', emergency_contact_phone: '',
      emergency_contact_country_code: '+91', emergency_contact_relation: ''
    },
  });

  // Edit mode: load the existing patient and prefill the form. The backend's
  // PUT /patients/{id} expects the same full field set as create (it's not a
  // partial PATCH), so every field must be populated before the form is usable.
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    patientService.getPatient(patientId).then(p => {
      if (cancelled) return;
      reset({
        title: (p as unknown as { title?: string }).title || '',
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        date_of_birth: p.date_of_birth ? p.date_of_birth.slice(0, 10) : '',
        gender: p.gender || '',
        blood_group: p.blood_group || '',
        phone_country_code: p.phone_country_code || '+91',
        phone_number: p.phone_number || '',
        email: p.email || '',
        address_line_1: p.address_line_1 || '',
        address_line_2: p.address_line_2 || '',
        city: p.city || '',
        state: p.state || '',
        pin_code: p.pin_code || '',
        country: p.country || 'India',
        emergency_contact_name: p.emergency_contact_name || '',
        emergency_contact_phone: p.emergency_contact_phone || '',
        emergency_contact_country_code: p.emergency_contact_country_code || '+91',
        emergency_contact_relation: p.emergency_contact_relation || '',
      });
      setReasonForVisit(p.reason_for_visit || '');
      setSymptoms(p.symptoms || []);
      setBloodSugarValue(p.blood_sugar_value != null ? String(p.blood_sugar_value) : '');
      setBloodSugarUnit(p.blood_sugar_unit || 'mg/dL');
      setVerification({
        is_email_verified: !!p.is_email_verified,
        is_phone_verified: !!p.is_phone_verified,
      });
    }).catch(() => {
      toast.error('Failed to load patient details');
      navigate('/patients');
    }).finally(() => {
      if (!cancelled) setLoadingPatient(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const watchCountry = watch('country');
  const watchState = watch('state');
  const watchDob = watch('date_of_birth');
  const watchTitle = watch('title');
  const watchGender = watch('gender');
  const watchPhone = watch('phone_number');
  const watchEmail = watch('email');

  // Duplicate-patient guard (BUG-06): once a full 10-digit mobile number is
  // entered, look it up. If someone is already registered with it, warn with
  // their registration number and link to the record so front-desk can
  // cross-verify before creating a duplicate. Warning only — never blocks
  // (families legitimately share one phone).
  const [duplicatePatient, setDuplicatePatient] = useState<{ id: string; prn: string; name: string } | null>(null);
  useEffect(() => {
    if (isEditMode || !/^\d{10}$/.test(watchPhone || '')) {
      setDuplicatePatient(null);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await patientService.getPatients(1, 5, watchPhone);
        const match = res.data.find(p => p.phone_number === watchPhone);
        setDuplicatePatient(match ? {
          id: match.id,
          prn: match.patient_reference_number,
          name: `${match.first_name} ${match.last_name}`.trim(),
        } : null);
      } catch {
        setDuplicatePatient(null);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [watchPhone, isEditMode]);

  // Native <input type="date"> can report intermediate/partial values while
  // the year is still being typed digit-by-digit (e.g. "0002" before "2026"
  // is fully typed), which briefly computes as a wildly wrong age. Gate the
  // title auto-correction below on the field having been left (blurred) at
  // least once since it was last focused, so it only runs once DOB entry is
  // actually complete — not on every keystroke.
  const [dobBlurred, setDobBlurred] = useState(false);

  // Clear server error on any change.
  // After first submit: re-validate live so each field's error clears the moment it is fixed.
  // Before first submit: no inline errors shown at all — pristine form experience.
  useEffect(() => {
    const subscription = watch((values) => {
      setServerError(null);
      if (submittedRef.current) {
        setFieldErrors(validateAll(values as FD));
      }
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  // Auto-correct title when DOB indicates a child (under 5)
  const CHILD_TITLES = ['Baby', 'Master'];
  const ADULT_ONLY_TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'];
  const isChild = (() => {
    if (!watchDob) return false;
    const dob = new Date(watchDob);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age < 5;
  })();

  useEffect(() => {
    // isChild defaults to false whenever DOB is still empty (see above), which
    // is "unknown", not "confirmed adult". Without this guard, picking "Baby"
    // or "Master" before entering a DOB was immediately reverted to blank by
    // the second condition below, since !isChild was true for the wrong reason.
    // Only cross-verify the title against age once we actually have a DOB —
    // and only once the DOB field has been left, not mid-typing (see dobBlurred).
    if (!watchDob || !dobBlurred) return;

    if (isChild && watchTitle && ADULT_ONLY_TITLES.includes(watchTitle)) {
      // Gender may not be selected yet at this point — "Baby" is the safe
      // default and gets refined to "Master" below once gender is known.
      const corrected = watchGender === 'Male' ? 'Master' : 'Baby';
      setValue('title', corrected);
      toast.info(`Title auto-corrected to "${corrected}" — patient is under 5 years old`);
    }
    if (!isChild && watchTitle && CHILD_TITLES.includes(watchTitle)) {
      setValue('title', '');
      toast.info('Please select a title — patient is 5 years or older');
    }
  }, [isChild, watchDob, watchTitle, watchGender, dobBlurred, setValue]);

  // Refine Baby ↔ Master once gender becomes known/changes (e.g. gender picked
  // after DOB, or changed afterwards) — this is the one place age AND gender
  // both determine a single correct title, unlike the adult titles above.
  useEffect(() => {
    if (!watchDob || !dobBlurred || !isChild || !watchGender) return;
    if (watchTitle === 'Baby' && watchGender === 'Male') {
      setValue('title', 'Master');
    } else if (watchTitle === 'Master' && watchGender !== 'Male') {
      setValue('title', 'Baby');
    }
  }, [watchGender, isChild, watchDob, watchTitle, dobBlurred, setValue]);

  // Correct Mr./Mrs./Ms. against gender the same way (BUG-05) — covers the
  // case where title was picked before gender, or gender is changed after.
  // Dr./Prof. are gender-neutral and left alone.
  useEffect(() => {
    if (!watchGender || isChild) return;
    if (watchTitle === 'Mr.' && watchGender !== 'Male') {
      setValue('title', 'Ms.');
      toast.info('Title auto-corrected to "Ms." to match the selected gender');
    } else if ((watchTitle === 'Mrs.' || watchTitle === 'Ms.') && watchGender === 'Male') {
      setValue('title', 'Mr.');
      toast.info('Title auto-corrected to "Mr." to match the selected gender');
    }
  }, [watchGender, watchTitle, isChild, setValue]);

  useEffect(() => {
    if (watchState && STATE_COUNTRY_MAP[watchState]) {
      const mappedCountry = STATE_COUNTRY_MAP[watchState];
      if (mappedCountry !== watchCountry) {
        setValue('country', mappedCountry);
      }
    }
  }, [watchState, watchCountry, setValue]);

  useEffect(() => {
    if (watchCountry) {
      const phoneCode = getPhoneCode(watchCountry);
      setValue('phone_country_code', phoneCode);
    }
  }, [watchCountry, setValue]);

  const states = getStatesForCountry(watchCountry || 'India');
  const postalLabel = getPostalLabel(watchCountry || 'India');

  // ── Manual validation — runs only on Submit, no live schema dependency ──────
  const CHILD_TITLES_V = ['Baby', 'Master'];
  const ADULT_TITLES_V = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'];

  const validateAll = (d: FD): Partial<Record<keyof FD, string>> => {
    const e: Partial<Record<keyof FD, string>> = {};
    if (!d.title) e.title = 'Title is required';
    if (!d.first_name.trim()) e.first_name = 'First name is required';
    else if (!/^[A-Za-z]+$/.test(d.first_name.trim())) e.first_name = 'Only letters (A–Z) allowed — no numbers, spaces or symbols';
    if (!d.last_name.trim()) e.last_name = 'Last name is required';
    else if (!/^[A-Za-z]+$/.test(d.last_name.trim())) e.last_name = 'Only letters (A–Z) allowed — no numbers, spaces or symbols';
    // Only enforced for new patients — an existing patient's real (possibly
    // short, e.g. "Li"/"Wu") last name must not block editing their other fields.
    else if (!isEditMode && d.last_name.trim().length <= 2) e.last_name = 'Last name must be more than 2 letters';
    if (!d.date_of_birth) e.date_of_birth = 'Date of birth is required';
    else if (new Date(d.date_of_birth) >= new Date()) e.date_of_birth = 'Date of birth must be in the past';
    if (!d.gender) e.gender = 'Gender is required';
    if (!d.blood_group) e.blood_group = 'Blood group is required';
    if (!d.phone_number) e.phone_number = 'Phone number is required';
    else if (!/^\d{10}$/.test(d.phone_number)) e.phone_number = 'Must be exactly 10 digits';
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = 'Invalid email address';
    if (!d.address_line_1.trim()) e.address_line_1 = 'Address is required';
    else if (d.address_line_1.trim().length < 5) e.address_line_1 = 'Address must be at least 5 characters';
    else if (!/[A-Za-z]/.test(d.address_line_1)) e.address_line_1 = 'Address must contain text, not just numbers';
    if (d.pin_code && !/^\d{6}$/.test(d.pin_code)) e.pin_code = 'PIN code must be exactly 6 digits';
    if (d.emergency_contact_phone) {
      // Only enforced for new patients — some existing patients have this
      // stored with a country-code prefix (pre-dating the 10-digit rule);
      // editing their other fields must not be blocked by that legacy value.
      if (!isEditMode && !/^\d{10}$/.test(d.emergency_contact_phone)) e.emergency_contact_phone = 'Must be exactly 10 digits';
      else if (d.emergency_contact_phone === d.phone_number) e.emergency_contact_phone = 'Must differ from the patient\'s phone number';
    }
    // Title vs age
    if (d.date_of_birth && d.title && !e.date_of_birth && !e.title) {
      const dob = new Date(d.date_of_birth);
      let ageYears = new Date().getFullYear() - dob.getFullYear();
      const mm = new Date().getMonth() - dob.getMonth();
      if (mm < 0 || (mm === 0 && new Date().getDate() < dob.getDate())) ageYears--;
      const isChild = ageYears < 5;
      if (isChild && ADULT_TITLES_V.includes(d.title))
        e.title = `Children under 5 must use "Baby" or "Master" instead of "${d.title}"`;
      if (!isChild && CHILD_TITLES_V.includes(d.title))
        e.title = `"${d.title}" is only for children under 5`;
    }
    return e;
  };

  const onSubmit = async (data: FD) => {
    submittedRef.current = true;
    // Step 1: run local validation — no network call until everything is clean
    const errs = validateAll(data);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      feLogger.warn('patient_registration', `Validation failed: ${Object.keys(errs).join(', ')}`);
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return; // stops here — isSubmitting resets automatically via react-hook-form finally block
    }
    // Step 2: call backend
    setFieldErrors({});
    setServerError(null);
    feLogger.info('patient_registration', isEditMode ? 'Submitting patient update form' : 'Submitting patient registration form');
    try {
      const payload: Record<string, unknown> = { ...data };
      if (isEyeHospitalFeatureEnabled) {
        payload.reason_for_visit = reasonForVisit || undefined;
        payload.symptoms = symptoms.length ? symptoms : undefined;
        payload.blood_sugar_value = bloodSugarValue ? Number(bloodSugarValue) : undefined;
        payload.blood_sugar_unit = bloodSugarValue ? bloodSugarUnit : undefined;
      }

      if (isEditMode && patientId) {
        const result = await patientService.updatePatient(patientId, payload as any);
        feLogger.info('patient_registration', `Patient updated: ${result.patient_reference_number}`);
        toast.success('Patient details updated successfully');
        triggerRefresh();
        setTimeout(() => navigate(`/patients/${patientId}`), 1000);
        return;
      }

      const result = await patientService.createPatient(payload as any);
      feLogger.info('patient_registration', `Patient registered: ${result.patient_reference_number}`);
      toast.success(`Patient registered successfully! ID: ${result.patient_reference_number}`);
      triggerRefresh();

      // Check if we came from walk-ins and should redirect back
      const returnUrl = sessionStorage.getItem('walkInReturnUrl');
      if (returnUrl) {
        sessionStorage.removeItem('walkInReturnUrl');
        // Redirect back with new patient ID
        setTimeout(() => navigate(`${returnUrl}?new_patient_id=${result.id}`), 1000);
      } else {
        // Default redirect to patient list
        setTimeout(() => navigate('/patients'), 2000);
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string | Array<{ msg: string }> } }; code?: string };
      let message: string;
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ERR_NETWORK') {
        message = 'Cannot reach the server. Please check your connection and try again.';
      } else {
        const detail = axiosError.response?.data?.detail;
        message = Array.isArray(detail)
          ? detail.map((d) => d.msg).join('\n')
          : (typeof detail === 'string' ? detail : null) ?? (isEditMode ? 'Update failed. Please try again.' : 'Registration failed. Please try again.');
      }
      feLogger.error('patient_registration', `${isEditMode ? 'Update' : 'Registration'} failed: ${message}`);
      setServerError(message);
      toast.error(message);
    }
  };

  const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200';
  const inputErrorClass = 'w-full bg-white border border-red-400 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-all duration-200';
  const selectClass = 'w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 cursor-pointer';
  const selectErrorClass = 'w-full bg-white border border-red-400 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-all duration-200 cursor-pointer';
  const labelClass = 'text-sm font-medium text-slate-700 mb-1.5 block';
  const errorClass = 'mt-1 text-xs text-red-500 flex items-center gap-1';
  const hintClass = 'mt-1 text-xs text-slate-400';

  const blockNonAlpha = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!/^[A-Za-z]$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'].includes(e.key)) {
      e.preventDefault();
    }
  };
  const blockNonDigit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'].includes(e.key)) {
      e.preventDefault();
    }
  };

  if (loadingPatient) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <span className="material-icons">arrow_back</span>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">{isEditMode ? 'edit' : 'person_add'}</span>
              {isEditMode ? 'Edit Patient' : 'Patient Registration'}
              {isEditMode && <VerifiedBadge patient={verification} />}
            </h1>
            <p className="text-slate-500 text-sm">
              {isEditMode ? 'Update the patient\'s details below.' : 'Fill in the patient details to create a new record.'}
            </p>
          </div>
        </div>
      </header>

      <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Validation error banner — shown when Submit is clicked with field errors */}
        {Object.keys(fieldErrors).length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-500 flex-shrink-0 text-xl mt-0.5">warning</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
               Please fix the {Object.keys(fieldErrors).length} highlighted error{Object.keys(fieldErrors).length > 1 ? 's' : ''}  before submitting
              </p>
              <ul className="mt-2 space-y-1">
                {(Object.entries(fieldErrors) as [string, string][]).map(([key, msg]) => (
                  <li key={key} className="flex items-start gap-1.5 text-xs text-amber-700">
                    <span className="material-symbols-outlined text-[13px] mt-0.5 shrink-0">arrow_right</span>
                    <span><span className="font-semibold">{FIELD_LABELS[key] ?? key}:</span> {msg}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {/* Section 1: Personal Details */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Personal Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Title <span className="text-red-500">*</span></label>
              <select {...register('title')} className={fieldErrors.title ? selectErrorClass : selectClass}>
                <option value="">Select title</option>
                {TITLE_OPTIONS.map(t => {
                  const disableAdult = isChild && ADULT_ONLY_TITLES.includes(t);
                  const disableChild = !!(watchDob && !isChild && CHILD_TITLES.includes(t));
                  // Mr. is male-only, Mrs./Ms. are female-only — Dr./Prof. stay
                  // gender-neutral (BUG-05: "Mr." was selectable/left in place
                  // for a female patient with nothing to catch the mismatch).
                  const disableGenderMismatch = !!watchGender && (
                    (t === 'Mr.' && watchGender !== 'Male') ||
                    ((t === 'Mrs.' || t === 'Ms.') && watchGender !== 'Female')
                  );
                  const disabled = disableAdult || disableChild || disableGenderMismatch;
                  return (
                    <option key={t} value={t} disabled={disabled}>
                      {t}{disableAdult ? ' (not for children)' : ''}{disableChild ? ' (children only)' : ''}{disableGenderMismatch ? ' (gender mismatch)' : ''}
                    </option>
                  );
                })}
              </select>
              {fieldErrors.title
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.title}</p>
                : isChild
                  ? <p className="mt-1 text-xs text-amber-600 flex items-center gap-1"><span className="material-symbols-outlined text-xs">child_care</span>Child detected — use Baby or Master</p>
                  : <p className={hintClass}>Select appropriate title for the patient</p>}
            </div>
            <div>
              <label className={labelClass}>First Name <span className="text-red-500">*</span></label>
              <input
                {...register('first_name')}
                className={fieldErrors.first_name ? inputErrorClass : inputClass}
                placeholder="First name"
                maxLength={100}
                onKeyDown={blockNonAlpha}
              />
              {fieldErrors.first_name
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.first_name}</p>
                : <p className={hintClass}>Letters only — must start with an alphabet</p>}
            </div>
            <div>
              <label className={labelClass}>Last Name <span className="text-red-500">*</span></label>
              <input
                {...register('last_name')}
                className={fieldErrors.last_name ? inputErrorClass : inputClass}
                placeholder="Last name"
                maxLength={100}
                onKeyDown={blockNonAlpha}
              />
              {fieldErrors.last_name
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.last_name}</p>
                : <p className={hintClass}>Letters only — must start with an alphabet</p>}
            </div>
            <div>
              <label className={labelClass}>Gender <span className="text-red-500">*</span></label>
              <select {...register('gender')} className={fieldErrors.gender ? selectErrorClass : selectClass}>
                <option value="">Select gender</option>
                {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              {fieldErrors.gender
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.gender}</p>
                : <p className={hintClass}>Select the patient's gender</p>}
            </div>
            <div>
              <label className={labelClass}>Date of Birth <span className="text-red-500">*</span></label>
              <input
                {...register('date_of_birth')}
                type="date"
                onFocus={() => setDobBlurred(false)}
                onBlur={(e) => { register('date_of_birth').onBlur(e); setDobBlurred(true); }}
                className={fieldErrors.date_of_birth ? inputErrorClass : inputClass}
                min="1900-01-01"
                max={new Date().toISOString().split('T')[0]}
              />
              {fieldErrors.date_of_birth
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.date_of_birth}</p>
                : <p className={hintClass}>Must be a past date — future dates not allowed</p>}
            </div>
            <div>
              <label className={labelClass}>Blood Group <span className="text-red-500">*</span></label>
              <select {...register('blood_group')} className={fieldErrors.blood_group ? selectErrorClass : selectClass}>
                <option value="">Select blood group</option>
                {BLOOD_GROUP_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              {fieldErrors.blood_group
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.blood_group}</p>
                : <p className={hintClass}>Select the ABO/Rh blood type</p>}
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input {...register('email')} type="email" className={fieldErrors.email ? inputErrorClass : inputClass} placeholder="patient@example.com" />
              {fieldErrors.email
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.email}</p>
                : <p className={hintClass}>Optional — used for appointment reminders</p>}
              <EmailVerificationField
                patientId={patientId || null}
                email={watchEmail}
                isEmailVerified={verification.is_email_verified}
                onVerified={() => setVerification(v => ({ ...v, is_email_verified: true }))}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Contact Details */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Contact Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Country Code <span className="text-red-500">*</span></label>
              <select {...register('phone_country_code')} className={fieldErrors.phone_country_code ? selectErrorClass : selectClass}>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.phoneCode}>
                    {c.phoneCode} ({c.name})
                  </option>
                ))}
              </select>
              {fieldErrors.phone_country_code
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.phone_country_code}</p>
                : <p className={hintClass}>Select country dial code</p>}
            </div>
            <div>
              <label className={labelClass}>Mobile Number <span className="text-red-500">*</span></label>
              <input
                {...register('phone_number')}
                type="tel"
                className={fieldErrors.phone_number ? inputErrorClass : inputClass}
                placeholder="9876543210"
                maxLength={10}
                onKeyDown={blockNonDigit}
              />
              {fieldErrors.phone_number
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.phone_number}</p>
                : <p className={hintClass}>Enter exactly 10 digits — no spaces or dashes</p>}
              <PhoneVerificationField
                patientId={patientId || null}
                isPhoneVerified={verification.is_phone_verified}
                onVerified={() => setVerification(v => ({ ...v, is_phone_verified: true }))}
              />
            </div>
          </div>

          {/* Duplicate-patient warning (BUG-06) — informational, never blocks */}
          {duplicatePatient && (
            <div className="mt-4 flex items-start gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl">
              <span className="material-symbols-outlined text-amber-600 mt-0.5 flex-shrink-0">warning</span>
              <div className="text-sm">
                <p className="font-semibold text-amber-800">A patient is already registered with this mobile number</p>
                <p className="text-amber-700 mt-0.5">
                  {duplicatePatient.name} —{' '}
                  <button
                    type="button"
                    onClick={() => navigate(`/patients/${duplicatePatient.id}`)}
                    className="font-mono font-bold underline hover:text-amber-900"
                    title="Open this patient's record to cross-verify"
                  >
                    {duplicatePatient.prn}
                  </button>
                </p>
                <p className="text-amber-600 text-xs mt-1">Open the record to cross-verify before creating a duplicate. You can still register a new patient if this is a family member sharing the same number.</p>
              </div>
            </div>
          )}
        </div>

        {/* Patient History block (BRD v1.1 §2) — eye-hospital feature pack only */}
        {isEyeHospitalFeatureEnabled && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
              <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Patient History</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Reason for Visit</label>
                <textarea
                  value={reasonForVisit}
                  onChange={(e) => setReasonForVisit(e.target.value)}
                  className={inputClass}
                  rows={2}
                  placeholder="Primary reason the patient has come to the hospital"
                />
              </div>
              <div>
                <label className={labelClass}>Symptoms</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {SYMPTOM_OPTIONS.map(symptom => (
                    <button
                      key={symptom}
                      type="button"
                      onClick={() => toggleSymptom(symptom)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                        symptoms.includes(symptom)
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {symptom}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={customSymptom}
                    onChange={(e) => setCustomSymptom(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSymptom(); } }}
                    className={inputClass}
                    placeholder="Type a custom symptom and press Enter"
                  />
                  <button type="button" onClick={addCustomSymptom} className="px-4 py-2.5 text-sm font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5">
                    Add
                  </button>
                </div>
                {symptoms.filter(s => !SYMPTOM_OPTIONS.includes(s)).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {symptoms.filter(s => !SYMPTOM_OPTIONS.includes(s)).map(s => (
                      <span key={s} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-primary text-white">
                        {s}
                        <button type="button" onClick={() => toggleSymptom(s)} className="hover:opacity-75">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Blood Sugar</label>
                  <input
                    type="number"
                    value={bloodSugarValue}
                    onChange={(e) => setBloodSugarValue(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. 110"
                    min={0}
                  />
                </div>
                <div>
                  <label className={labelClass}>Unit</label>
                  <select value={bloodSugarUnit} onChange={(e) => setBloodSugarUnit(e.target.value)} className={selectClass}>
                    <option value="mg/dL">mg/dL</option>
                    <option value="mmol/L">mmol/L</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 3: Address */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Address</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2 lg:col-span-3">
              <label className={labelClass}>Address Line 1 <span className="text-red-500">*</span></label>
              <input {...register('address_line_1')} className={fieldErrors.address_line_1 ? inputErrorClass : inputClass} placeholder="Street address" />
              {fieldErrors.address_line_1
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.address_line_1}</p>
                : <p className={hintClass}>Min 5 characters — must include street name, not just a number</p>}
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className={labelClass}>Address Line 2</label>
              <input {...register('address_line_2')} className={inputClass} placeholder="Apartment, suite, etc." />
            </div>
            <div>
              <label className={labelClass}>State / Province</label>
              {states.length > 0 ? (
                <select {...register('state')} className={selectClass}>
                  <option value="">Select state</option>
                  {states.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <input {...register('state')} className={inputClass} placeholder="State or province" />
              )}
            </div>
            <div>
              <label className={labelClass}>City / District </label>
              <input {...register('city')} className={inputClass} placeholder="City" />
            </div>
            <div>
              <label className={labelClass}>{postalLabel}</label>
              <input {...register('pin_code')} className={fieldErrors.pin_code ? inputErrorClass : inputClass} placeholder="e.g. 636309" maxLength={6} onKeyDown={blockNonDigit} />
              {fieldErrors.pin_code
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.pin_code}</p>
                : <p className={hintClass}>6 numeric characters (e.g. 636309)</p>}
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <select {...register('country')} className={selectClass}>
                {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Section 4: Emergency Contact */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-8 h-[2px] bg-amber-400/40 rounded-full"></span>
            <h2 className="text-sm font-bold text-amber-600 uppercase tracking-wider">Emergency Contact</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Contact Name</label>
              <input
                {...register('emergency_contact_name')}
                className={inputClass}
                placeholder="Emergency contact name"
                maxLength={200}
                onKeyDown={blockNonAlpha}
              />
              <p className={hintClass}>Person to contact in emergencies</p>
            </div>
            <div>
              <label className={labelClass}>Relationship</label>
              <select {...register('emergency_contact_relation')} className={selectClass}>
                <option value="">Select relationship</option>
                {RELATIONSHIP_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <p className={hintClass}>Relation to the patient</p>
            </div>
            <div>
              <label className={labelClass}>Country Code</label>
              <select
                {...register('emergency_contact_country_code')}
                className={selectClass}
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.phoneCode}>
                    {c.phoneCode} ({c.name})
                  </option>
                ))}
              </select>
              <p className={hintClass}>Select country dial code</p>
            </div>
            <div>
              <label className={labelClass}>Mobile Number</label>
              <input
                {...register('emergency_contact_phone')}
                type="tel"
                className={fieldErrors.emergency_contact_phone ? inputErrorClass : inputClass}
                placeholder="9876543210"
                maxLength={10}
                onKeyDown={blockNonDigit}
              />
              {fieldErrors.emergency_contact_phone
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.emergency_contact_phone}</p>
                : <p className={hintClass}>10 digits — must differ from patient's number</p>}
            </div>
          </div>
        </div>

        {/* Actions */}
        {serverError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-red-500 flex-shrink-0 text-xl">error</span>
            <div>
              <p className="text-sm font-semibold text-red-700">{isEditMode ? 'Update failed' : 'Registration failed'}</p>
              <p className="text-sm text-red-600 mt-0.5 whitespace-pre-line">{serverError}</p>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-semibold text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-all flex items-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {isEditMode ? 'Updating...' : 'Registering...'}
              </>
            ) : (
              <>
                <span className="material-icons text-lg">{isEditMode ? 'save' : 'person_add'}</span>
                {isEditMode ? 'Save Changes' : 'Patient Registration'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Register;
