import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, ChevronLeft, Save, Phone } from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';
import { useToast } from '../contexts/ToastContext';

// ── Country data (3-letter ISO codes match the backend) ──────────────────────
interface CountryEntry {
  code3: string;
  name: string;
  phoneCode: string;
  postalLabel: string;
  timezone: string;
  states?: string[];
}

const COUNTRIES_DATA: CountryEntry[] = [
  {
    code3: 'IND', name: 'India', phoneCode: '+91', postalLabel: 'PIN Code', timezone: 'Asia/Kolkata',
    states: [
      'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
      'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
      'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
      'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
      'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Delhi',
      'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
    ],
  },
  {
    code3: 'USA', name: 'United States', phoneCode: '+1', postalLabel: 'ZIP Code', timezone: 'America/New_York',
    states: [
      'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
      'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
      'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
      'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
      'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
      'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
      'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
      'Wisconsin', 'Wyoming', 'District of Columbia',
    ],
  },
  {
    code3: 'GBR', name: 'United Kingdom', phoneCode: '+44', postalLabel: 'Postcode', timezone: 'Europe/London',
    states: ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  },
  {
    code3: 'CAN', name: 'Canada', phoneCode: '+1', postalLabel: 'Postal Code', timezone: 'America/Toronto',
    states: [
      'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
      'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island',
      'Quebec', 'Saskatchewan', 'Yukon',
    ],
  },
  {
    code3: 'AUS', name: 'Australia', phoneCode: '+61', postalLabel: 'Postcode', timezone: 'Australia/Sydney',
    states: [
      'Australian Capital Territory', 'New South Wales', 'Northern Territory',
      'Queensland', 'South Australia', 'Tasmania', 'Victoria', 'Western Australia',
    ],
  },
  {
    code3: 'ARE', name: 'UAE', phoneCode: '+971', postalLabel: 'Postal Code', timezone: 'Asia/Dubai',
    states: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'],
  },
  {
    code3: 'SAU', name: 'Saudi Arabia', phoneCode: '+966', postalLabel: 'Postal Code', timezone: 'Asia/Riyadh',
    states: ['Riyadh', 'Makkah', 'Madinah', 'Eastern Province', 'Asir', 'Tabuk', 'Hail', 'Jazan', 'Najran'],
  },
  {
    code3: 'DEU', name: 'Germany', phoneCode: '+49', postalLabel: 'Postleitzahl', timezone: 'Europe/Berlin',
    states: [
      'Baden-Württemberg', 'Bavaria', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg',
      'Hesse', 'Lower Saxony', 'Mecklenburg-Vorpommern', 'North Rhine-Westphalia',
      'Rhineland-Palatinate', 'Saarland', 'Saxony', 'Saxony-Anhalt', 'Schleswig-Holstein', 'Thuringia',
    ],
  },
  { code3: 'FRA', name: 'France', phoneCode: '+33', postalLabel: 'Code Postal', timezone: 'Europe/Paris' },
  {
    code3: 'MYS', name: 'Malaysia', phoneCode: '+60', postalLabel: 'Postcode', timezone: 'Asia/Kuala_Lumpur',
    states: [
      'Johor', 'Kedah', 'Kelantan', 'Kuala Lumpur', 'Labuan', 'Malacca', 'Negeri Sembilan',
      'Pahang', 'Penang', 'Perak', 'Perlis', 'Putrajaya', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
    ],
  },
  { code3: 'SGP', name: 'Singapore', phoneCode: '+65', postalLabel: 'Postal Code', timezone: 'Asia/Singapore' },
  { code3: 'PHL', name: 'Philippines', phoneCode: '+63', postalLabel: 'ZIP Code', timezone: 'Asia/Manila' },
  {
    code3: 'PAK', name: 'Pakistan', phoneCode: '+92', postalLabel: 'Postal Code', timezone: 'Asia/Karachi',
    states: ['Azad Kashmir', 'Balochistan', 'Gilgit-Baltistan', 'Islamabad', 'Khyber Pakhtunkhwa', 'Punjab', 'Sindh'],
  },
  {
    code3: 'BGD', name: 'Bangladesh', phoneCode: '+880', postalLabel: 'Postal Code', timezone: 'Asia/Dhaka',
    states: ['Barishal', 'Chattogram', 'Dhaka', 'Khulna', 'Mymensingh', 'Rajshahi', 'Rangpur', 'Sylhet'],
  },
  {
    code3: 'LKA', name: 'Sri Lanka', phoneCode: '+94', postalLabel: 'Postal Code', timezone: 'Asia/Colombo',
    states: ['Central', 'Eastern', 'North Central', 'Northern', 'North Western', 'Sabaragamuwa', 'Southern', 'Uva', 'Western'],
  },
  { code3: 'NGA', name: 'Nigeria', phoneCode: '+234', postalLabel: 'Postal Code', timezone: 'Africa/Lagos' },
  {
    code3: 'ZAF', name: 'South Africa', phoneCode: '+27', postalLabel: 'Postal Code', timezone: 'Africa/Johannesburg',
    states: ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'],
  },
  { code3: 'KEN', name: 'Kenya', phoneCode: '+254', postalLabel: 'Postal Code', timezone: 'Africa/Nairobi' },
  { code3: 'GHA', name: 'Ghana', phoneCode: '+233', postalLabel: 'Postal Code', timezone: 'Africa/Accra' },
  { code3: 'NZL', name: 'New Zealand', phoneCode: '+64', postalLabel: 'Postcode', timezone: 'Pacific/Auckland' },
];

const TIMEZONES = [
  { value: 'UTC', label: 'UTC — Coordinated Universal Time' },
  { value: 'America/New_York', label: 'America/New_York — Eastern Time (US)' },
  { value: 'America/Chicago', label: 'America/Chicago — Central Time (US)' },
  { value: 'America/Denver', label: 'America/Denver — Mountain Time (US)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles — Pacific Time (US)' },
  { value: 'America/Toronto', label: 'America/Toronto — Eastern Time (Canada)' },
  { value: 'America/Vancouver', label: 'America/Vancouver — Pacific Time (Canada)' },
  { value: 'Europe/London', label: 'Europe/London — Greenwich Mean Time' },
  { value: 'Europe/Paris', label: 'Europe/Paris — Central European Time' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin — Central European Time' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata — India Standard Time' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai — Gulf Standard Time' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh — Arabia Standard Time' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore — Singapore Time' },
  { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala_Lumpur — Malaysia Time' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo — Japan Standard Time' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai — China Standard Time' },
  { value: 'Asia/Karachi', label: 'Asia/Karachi — Pakistan Standard Time' },
  { value: 'Asia/Dhaka', label: 'Asia/Dhaka — Bangladesh Standard Time' },
  { value: 'Asia/Colombo', label: 'Asia/Colombo — Sri Lanka Time' },
  { value: 'Asia/Manila', label: 'Asia/Manila — Philippine Time' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos — West Africa Time' },
  { value: 'Africa/Nairobi', label: 'Africa/Nairobi — East Africa Time' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg — South Africa Standard Time' },
  { value: 'Africa/Accra', label: 'Africa/Accra — Ghana Mean Time' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney — Australian Eastern Time' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland — New Zealand Standard Time' },
];

const getCountry = (code3: string) => COUNTRIES_DATA.find((c) => c.code3 === code3);

/** Split a stored phone string like "+919876543210" into { code, number } */
const splitPhone = (phone: string, fallbackCode3: string): { code: string; number: string } => {
  const defaultCode = getCountry(fallbackCode3)?.phoneCode ?? '+1';
  if (!phone) return { code: defaultCode, number: '' };
  const normalized = phone.replace(/\s/g, '');
  // Try longest codes first to avoid "+1" matching "+1x" codes
  const sorted = [...COUNTRIES_DATA]
    .map((c) => c.phoneCode)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => b.length - a.length);
  for (const code of sorted) {
    if (normalized.startsWith(code)) {
      return { code, number: normalized.slice(code.length) };
    }
  }
  return { code: defaultCode, number: phone };
};

// ── Styles ────────────────────────────────────────────────────────────────────
const inputBase = 'w-full bg-white border rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all duration-200';
const inputClass = `${inputBase} border-slate-300 focus:ring-blue-500 focus:border-blue-500`;
const inputErrorClass = `${inputBase} border-red-400 focus:ring-red-300 focus:border-red-400`;
const selectBase = 'w-full bg-white border rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 transition-all duration-200 cursor-pointer';
const selectClass = `${selectBase} border-slate-300 focus:ring-blue-500 focus:border-blue-500`;
const selectErrorClass = `${selectBase} border-red-400 focus:ring-red-300 focus:border-red-400`;
const labelClass = 'text-sm font-medium text-slate-700 mb-1.5 block';
const hintClass = 'mt-1 text-xs text-slate-400';
const errorClass = 'mt-1 text-xs text-red-500 flex items-center gap-1';

// ── Form types ────────────────────────────────────────────────────────────────
interface EditForm {
  name: string;
  email: string;
  phone_code: string;
  phone_number: string;
  registration_number: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state_province: string;
  postal_code: string;
  country: string;
  timezone: string;
  status: string;
}

type FieldErrors = Partial<Record<keyof EditForm, string>>;

function validateForm(d: EditForm): FieldErrors {
  const e: FieldErrors = {};
  if (!d.name.trim()) e.name = 'Hospital name is required';
  else if (d.name.trim().length < 3) e.name = 'Must be at least 3 characters';
  if (!d.email.trim()) e.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = 'Invalid email address';
  if (d.phone_number && !/^\d{5,15}$/.test(d.phone_number.replace(/\s/g, '')))
    e.phone_number = 'Must be 5–15 digits';
  if (!d.country) e.country = 'Country is required';
  if (!d.timezone) e.timezone = 'Timezone is required';
  return e;
}

// ── Section header ────────────────────────────────────────────────────────────
const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-2 mb-5">
    <span className="w-8 h-[2px] bg-primary/20 rounded-full" />
    <h2 className="text-sm font-bold text-primary uppercase tracking-wider">{label}</h2>
  </div>
);

// ── Component ─────────────────────────────────────────────────────────────────
const SuperAdminHospitalEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [form, setForm] = useState<EditForm>({
    name: '',
    email: '',
    phone_code: '+1',
    phone_number: '',
    registration_number: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    state_province: '',
    postal_code: '',
    country: 'USA',
    timezone: 'America/New_York',
    status: 'pending',
  });

  // Track whether the country was changed by the user (vs loaded from API)
  const countryInitialisedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const res = await superAdminApi.getTenant(id);
        const t = res.data;
        const country3 = (t.country || 'USA') as string;
        const { code, number } = splitPhone(t.phone || '', country3);
        setForm({
          name: t.name || '',
          email: t.email || '',
          phone_code: code,
          phone_number: number,
          registration_number: t.registration_number || '',
          address_line_1: t.address_line_1 || '',
          address_line_2: t.address_line_2 || '',
          city: t.city || '',
          state_province: t.state_province || '',
          postal_code: t.postal_code || '',
          country: country3,
          timezone: t.timezone || getCountry(country3)?.timezone || 'UTC',
          status: t.status || 'pending',
        });
        countryInitialisedRef.current = true;
      } catch {
        toast.error('Failed to load hospital details');
        navigate('/superadmin/hospitals');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [id]);

  const set = (field: keyof EditForm, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (submittedRef.current) setFieldErrors(validateForm(next));
      return next;
    });
    setServerError(null);
  };

  // When user explicitly changes country, auto-update phone code + timezone + clear state
  const handleCountryChange = (newCode3: string) => {
    const c = getCountry(newCode3);
    setForm((prev) => ({
      ...prev,
      country: newCode3,
      phone_code: c?.phoneCode ?? prev.phone_code,
      timezone: c?.timezone ?? prev.timezone,
      state_province: '',
    }));
    setServerError(null);
  };

  const blockNonDigit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      !/^\d$/.test(e.key) &&
      !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key)
    ) {
      e.preventDefault();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    submittedRef.current = true;

    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    setIsSaving(true);
    setServerError(null);
    try {
      const phone = form.phone_number ? `${form.phone_code}${form.phone_number}` : null;
      await superAdminApi.updateTenant(id, {
        name: form.name,
        email: form.email,
        phone,
        registration_number: form.registration_number || null,
        address_line_1: form.address_line_1 || null,
        address_line_2: form.address_line_2 || null,
        city: form.city || null,
        state_province: form.state_province || null,
        postal_code: form.postal_code || null,
        country: form.country,
        timezone: form.timezone,
        status: form.status,
      });
      toast.success('Hospital updated successfully');
      navigate(`/superadmin/hospitals/${id}`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to update hospital';
      setServerError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const selectedCountry = getCountry(form.country);
  const states = selectedCountry?.states ?? [];
  const postalLabel = selectedCountry?.postalLabel ?? 'Postal Code';

  const Err: React.FC<{ field: keyof EditForm }> = ({ field }) =>
    fieldErrors[field] ? (
      <p className={errorClass}>
        <span className="material-symbols-outlined text-xs">error</span>
        {fieldErrors[field]}
      </p>
    ) : null;

  return (
    <div className="max-w-4xl mx-auto pb-10">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(`/superadmin/hospitals/${id}`)}
          className="flex items-center gap-1.5 text-slate-500 hover:text-primary transition-colors mb-4 text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Hospital Details
        </button>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="text-primary w-6 h-6" />
          Edit Hospital Details
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Update the hospital's profile, contact information, location, and status.
        </p>
      </div>

      {/* Validation banner */}
      {Object.keys(fieldErrors).length > 0 && submittedRef.current && (
        <div className="mb-5 bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-500 flex-shrink-0 text-xl mt-0.5">warning</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Fix {Object.keys(fieldErrors).length} error{Object.keys(fieldErrors).length > 1 ? 's' : ''} before saving
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {Object.entries(fieldErrors).map(([k, msg]) => (
                <li key={k} className="text-xs text-amber-700 flex items-start gap-1">
                  <span className="material-symbols-outlined text-[12px] mt-0.5">arrow_right</span>
                  {msg}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" noValidate>

        {/* ── Section 1: Hospital Information ──────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <SectionHeader label="Hospital Information" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Hospital Name — full width */}
            <div className="md:col-span-2">
              <label className={labelClass}>
                Hospital Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={fieldErrors.name ? inputErrorClass : inputClass}
                placeholder="e.g. City General Hospital"
                maxLength={200}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
              <Err field="name" />
              {!fieldErrors.name && <p className={hintClass}>Official registered name of the hospital</p>}
            </div>

            {/* Email */}
            <div>
              <label className={labelClass}>
                Official Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                className={fieldErrors.email ? inputErrorClass : inputClass}
                placeholder="contact@hospital.com"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
              <Err field="email" />
              {!fieldErrors.email && <p className={hintClass}>Primary contact email for the hospital</p>}
            </div>

            {/* Registration Number */}
            <div>
              <label className={labelClass}>
                Registration / License No.{' '}
                <span className="text-slate-400 font-normal text-xs">(optional)</span>
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="Government-issued registration number"
                value={form.registration_number}
                onChange={(e) => set('registration_number', e.target.value)}
              />
              <p className={hintClass}>Required for compliance and regulatory reporting</p>
            </div>

            {/* Phone — full width */}
            <div className="md:col-span-2">
              <label className={labelClass}>
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  Phone Number
                </span>
              </label>
              <div className="flex gap-2">
                <select
                  className={`${selectClass} w-36 shrink-0`}
                  value={form.phone_code}
                  onChange={(e) => set('phone_code', e.target.value)}
                >
                  {COUNTRIES_DATA.map((c) => (
                    <option key={c.code3} value={c.phoneCode}>
                      {c.phoneCode} ({c.name})
                    </option>
                  ))}
                </select>
                <div className="flex-1">
                  <input
                    type="tel"
                    className={fieldErrors.phone_number ? inputErrorClass : inputClass}
                    placeholder="e.g. 9876543210"
                    maxLength={15}
                    value={form.phone_number}
                    onKeyDown={blockNonDigit}
                    onChange={(e) => set('phone_number', e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
              <Err field="phone_number" />
              {!fieldErrors.phone_number && (
                <p className={hintClass}>Select country code, then enter digits only</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 2: Location ───────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <SectionHeader label="Hospital Location" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Country */}
            <div>
              <label className={labelClass}>
                Country <span className="text-red-500">*</span>
              </label>
              <select
                className={fieldErrors.country ? selectErrorClass : selectClass}
                value={form.country}
                onChange={(e) => handleCountryChange(e.target.value)}
              >
                {COUNTRIES_DATA.map((c) => (
                  <option key={c.code3} value={c.code3}>{c.name}</option>
                ))}
              </select>
              <Err field="country" />
              {!fieldErrors.country && <p className={hintClass}>Auto-updates phone code &amp; timezone</p>}
            </div>

            {/* State / Province — dropdown when available */}
            <div>
              <label className={labelClass}>State / Province</label>
              {states.length > 0 ? (
                <select
                  className={selectClass}
                  value={form.state_province}
                  onChange={(e) => set('state_province', e.target.value)}
                >
                  <option value="">Select state / province</option>
                  {states.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className={inputClass}
                  placeholder="State or province"
                  value={form.state_province}
                  onChange={(e) => set('state_province', e.target.value)}
                />
              )}
              <p className={hintClass}>
                {states.length > 0 ? 'Select from the list' : 'Type the state or province name'}
              </p>
            </div>

            {/* City */}
            <div>
              <label className={labelClass}>City / District</label>
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. Mumbai"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
              />
              <p className={hintClass}>City where the hospital is located</p>
            </div>

            {/* Address Line 1 — full width */}
            <div className="lg:col-span-3">
              <label className={labelClass}>Address Line 1</label>
              <input
                type="text"
                className={inputClass}
                placeholder="Street address, building name, P.O. box"
                value={form.address_line_1}
                onChange={(e) => set('address_line_1', e.target.value)}
              />
              <p className={hintClass}>Street-level address of the hospital</p>
            </div>

            {/* Address Line 2 — full width */}
            <div className="lg:col-span-3">
              <label className={labelClass}>
                Address Line 2{' '}
                <span className="text-slate-400 font-normal text-xs">(optional)</span>
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="Apartment, floor, landmark, etc."
                value={form.address_line_2}
                onChange={(e) => set('address_line_2', e.target.value)}
              />
            </div>

            {/* Postal Code */}
            <div>
              <label className={labelClass}>{postalLabel}</label>
              <input
                type="text"
                className={inputClass}
                placeholder={selectedCountry?.code3 === 'IND' ? 'e.g. 600001' : 'e.g. 10001'}
                maxLength={12}
                value={form.postal_code}
                onChange={(e) => set('postal_code', e.target.value)}
              />
              <p className={hintClass}>Postal / ZIP code for the hospital address</p>
            </div>

            {/* Timezone */}
            <div className="md:col-span-2">
              <label className={labelClass}>
                Timezone <span className="text-red-500">*</span>
              </label>
              <select
                className={fieldErrors.timezone ? selectErrorClass : selectClass}
                value={form.timezone}
                onChange={(e) => set('timezone', e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
              <Err field="timezone" />
              {!fieldErrors.timezone && (
                <p className={hintClass}>Used for appointments and all date/time displays</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 3: Status ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <SectionHeader label="Account Status" />
          <div className="max-w-xs">
            <label className={labelClass}>Hospital Status</label>
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <p className={hintClass}>
              Active allows hospital staff to log in. Suspended blocks access immediately.
            </p>
          </div>
        </div>

        {/* Server error */}
        {serverError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-red-500 flex-shrink-0 text-xl">error</span>
            <div>
              <p className="text-sm font-semibold text-red-700">Update failed</p>
              <p className="text-sm text-red-600 mt-0.5 whitespace-pre-line">{serverError}</p>
            </div>
          </div>
        )}

        {/* ── Submit ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/superadmin/hospitals/${id}`)}
            className="px-6 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98]"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};

export default SuperAdminHospitalEdit;
