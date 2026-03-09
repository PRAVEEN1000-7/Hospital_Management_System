import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  TITLE_OPTIONS, GENDER_OPTIONS, BLOOD_GROUP_OPTIONS,
  RELATIONSHIP_OPTIONS, COUNTRIES, STATE_COUNTRY_MAP,
  getStatesForCountry, getPostalLabel, getPhoneCode
} from '../utils/constants';
import patientService from '../services/patientService';
import { useToast } from '../contexts/ToastContext';
import feLogger from '../services/loggerService';

// All form fields as plain strings — no zod dependency in the form layer
type FD = {
  title: string; first_name: string; last_name: string;
  date_of_birth: string; gender: string; blood_group: string;
  phone_country_code: string; phone_number: string; email: string;
  address_line_1: string; address_line_2: string; city: string;
  state: string; pin_code: string; country: string;
  emergency_contact_name: string; emergency_contact_phone: string;
  emergency_contact_relation: string;
};

const Register: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FD, string>>>({}); 
  const formRef = React.useRef<HTMLFormElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
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
      emergency_contact_relation: '',
    },
  });

  const watchCountry = watch('country');
  const watchState = watch('state');
  const watchDob = watch('date_of_birth');
  const watchTitle = watch('title');

  // Clear errors when the user edits the form
  useEffect(() => {
    const subscription = watch(() => { setServerError(null); setFieldErrors({}); });
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
    if (isChild && watchTitle && ADULT_ONLY_TITLES.includes(watchTitle)) {
      setValue('title', 'Baby');
    }
  }, [isChild, watchTitle, setValue]);

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
    else if (!/^[A-Za-z\s.'-]+$/.test(d.first_name)) e.first_name = 'Letters only — no numbers or special characters';
    if (!d.last_name.trim()) e.last_name = 'Last name is required';
    else if (!/^[A-Za-z\s.'-]+$/.test(d.last_name)) e.last_name = 'Letters only — no numbers or special characters';
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
      if (!/^\d{10}$/.test(d.emergency_contact_phone)) e.emergency_contact_phone = 'Must be exactly 10 digits';
      else if (d.emergency_contact_phone === d.phone_number) e.emergency_contact_phone = 'Must differ from the patient\'s phone number';
    }
    // Title vs age
    if (d.date_of_birth && d.title && !e.date_of_birth && !e.title) {
      const dob = new Date(d.date_of_birth);
      let ageYears = new Date().getFullYear() - dob.getFullYear();
      const mm = new Date().getMonth() - dob.getMonth();
      if (mm < 0 || (mm === 0 && new Date().getDate() < dob.getDate())) ageYears--;
      if (ageYears < 5 && ADULT_TITLES_V.includes(d.title))
        e.title = `For children under 5, use Baby or Master instead of ${d.title}`;
      if (ageYears >= 5 && CHILD_TITLES_V.includes(d.title))
        e.title = `"${d.title}" is only for children under 5`;
    }
    return e;
  };

  const onSubmit = async (data: FD) => {
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
    feLogger.info('patient_registration', 'Submitting patient registration form');
    try {
      const result = await patientService.createPatient(data as any);
      feLogger.info('patient_registration', `Patient registered: ${result.patient_reference_number}`);
      toast.success(`Patient registered successfully! ID: ${result.patient_reference_number}`);
      setTimeout(() => navigate('/patients'), 2000);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string | Array<{ msg: string }> } }; code?: string };
      let message: string;
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ERR_NETWORK') {
        message = 'Cannot reach the server. Please check your connection and try again.';
      } else {
        const detail = axiosError.response?.data?.detail;
        message = Array.isArray(detail)
          ? detail.map((d) => d.msg).join('\n')
          : (typeof detail === 'string' ? detail : null) ?? 'Registration failed. Please try again.';
      }
      feLogger.error('patient_registration', `Registration failed: ${message}`);
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
    if (!/^[A-Za-z\s.'\\-]$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'].includes(e.key)) {
      e.preventDefault();
    }
  };
  const blockNonDigit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'].includes(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <div>
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <span className="material-icons">arrow_back</span>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">person_add</span>
              Patient Registration
            </h1>
            <p className="text-slate-500 text-sm">Fill in the patient details to create a new record.</p>
          </div>
        </div>
      </header>

      <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Validation error banner — shown when Submit is clicked with field errors */}
        {Object.keys(fieldErrors).length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-500 flex-shrink-0 text-xl">warning</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">Please fix the errors below</p>
              <p className="text-sm text-amber-700 mt-0.5">{Object.keys(fieldErrors).length} field{Object.keys(fieldErrors).length > 1 ? 's need' : ' needs'} attention. Fields with errors have a red border.</p>
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
                {TITLE_OPTIONS.map(t => (
                  <option key={t} value={t} disabled={isChild && ADULT_ONLY_TITLES.includes(t)}>
                    {t}{isChild && ADULT_ONLY_TITLES.includes(t) ? ' (not for children)' : ''}
                  </option>
                ))}
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
                : <p className={hintClass}>Alphabets only — no numbers or special characters</p>}
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
                : <p className={hintClass}>Alphabets only — no numbers or special characters</p>}
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
            </div>
          </div>
        </div>

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Contact Name</label>
              <input
                {...register('emergency_contact_name')}
                className={inputClass}
                placeholder="Emergency contact name"
                maxLength={200}
                onKeyDown={blockNonAlpha}
              />
              <p className={hintClass}>Alphabets only — person to contact in emergencies</p>
            </div>
            <div>
              <label className={labelClass}>Relationship</label>
              <select {...register('emergency_contact_relation')} className={selectClass}>
                <option value="">Select relationship</option>
                {RELATIONSHIP_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <p className={hintClass}>How is this person related to the patient?</p>
            </div>
            <div>
              <label className={labelClass}>Contact Mobile</label>
              <input
                {...register('emergency_contact_phone')}
                type="tel"
                className={fieldErrors.emergency_contact_phone ? inputErrorClass : inputClass}
                placeholder="Emergency contact number"
                maxLength={10}
                onKeyDown={blockNonDigit}
              />
              {fieldErrors.emergency_contact_phone
                ? <p className={errorClass}><span className="material-symbols-outlined text-xs">error</span>{fieldErrors.emergency_contact_phone}</p>
                : <p className={hintClass}>10 digits — must differ from the patient's phone number</p>}
            </div>
          </div>
        </div>

        {/* Actions */}
        {serverError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-red-500 flex-shrink-0 text-xl">error</span>
            <div>
              <p className="text-sm font-semibold text-red-700">Registration failed</p>
              <p className="text-sm text-red-600 mt-0.5 whitespace-pre-line">{serverError}</p>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
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
                Registering...
              </>
            ) : (
              <>
                <span className="material-icons text-lg">person_add</span>
                Register Patient
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Register;
