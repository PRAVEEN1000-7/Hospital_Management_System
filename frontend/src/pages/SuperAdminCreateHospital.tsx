import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronLeft, Eye, EyeOff, Phone } from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';
import { useToast } from '../contexts/ToastContext';
import DialCodeSelect from '../components/common/DialCodeSelect';

// ── Country data (3-letter ISO codes used by the backend) ─────────────────────
interface CountryEntry {
  code3: string;
  name: string;
  phoneCode: string;
  postalLabel: string;
  postalMaxLength: number;
  timezone: string;
  states?: string[];
}

const COUNTRIES_DATA: CountryEntry[] = [
  {
    code3: 'IND', name: 'India', phoneCode: '+91', postalLabel: 'PIN Code', postalMaxLength: 6, timezone: 'Asia/Kolkata',
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
    code3: 'USA', name: 'United States', phoneCode: '+1', postalLabel: 'ZIP Code', postalMaxLength: 10, timezone: 'America/New_York',
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
    code3: 'GBR', name: 'United Kingdom', phoneCode: '+44', postalLabel: 'Postcode', postalMaxLength: 8, timezone: 'Europe/London',
    states: ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  },
  {
    code3: 'CAN', name: 'Canada', phoneCode: '+1', postalLabel: 'Postal Code', postalMaxLength: 7, timezone: 'America/Toronto',
    states: [
      'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
      'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island',
      'Quebec', 'Saskatchewan', 'Yukon',
    ],
  },
  {
    code3: 'AUS', name: 'Australia', phoneCode: '+61', postalLabel: 'Postcode', postalMaxLength: 4, timezone: 'Australia/Sydney',
    states: [
      'Australian Capital Territory', 'New South Wales', 'Northern Territory',
      'Queensland', 'South Australia', 'Tasmania', 'Victoria', 'Western Australia',
    ],
  },
  {
    code3: 'ARE', name: 'UAE', phoneCode: '+971', postalLabel: 'Postal Code', postalMaxLength: 5, timezone: 'Asia/Dubai',
    states: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'],
  },
  {
    code3: 'SAU', name: 'Saudi Arabia', phoneCode: '+966', postalLabel: 'Postal Code', postalMaxLength: 5, timezone: 'Asia/Riyadh',
    states: ['Riyadh', 'Makkah', 'Madinah', 'Eastern Province', 'Asir', 'Tabuk', 'Hail', 'Jazan', 'Najran'],
  },
  {
    code3: 'DEU', name: 'Germany', phoneCode: '+49', postalLabel: 'Postleitzahl', postalMaxLength: 5, timezone: 'Europe/Berlin',
    states: [
      'Baden-Württemberg', 'Bavaria', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg',
      'Hesse', 'Lower Saxony', 'Mecklenburg-Vorpommern', 'North Rhine-Westphalia',
      'Rhineland-Palatinate', 'Saarland', 'Saxony', 'Saxony-Anhalt', 'Schleswig-Holstein', 'Thuringia',
    ],
  },
  {
    code3: 'FRA', name: 'France', phoneCode: '+33', postalLabel: 'Code Postal', postalMaxLength: 5, timezone: 'Europe/Paris',
  },
  {
    code3: 'MYS', name: 'Malaysia', phoneCode: '+60', postalLabel: 'Postcode', postalMaxLength: 5, timezone: 'Asia/Kuala_Lumpur',
    states: [
      'Johor', 'Kedah', 'Kelantan', 'Kuala Lumpur', 'Labuan', 'Malacca', 'Negeri Sembilan',
      'Pahang', 'Penang', 'Perak', 'Perlis', 'Putrajaya', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
    ],
  },
  { code3: 'SGP', name: 'Singapore', phoneCode: '+65', postalLabel: 'Postal Code', postalMaxLength: 6, timezone: 'Asia/Singapore' },
  {
    code3: 'PHL', name: 'Philippines', phoneCode: '+63', postalLabel: 'ZIP Code', postalMaxLength: 4, timezone: 'Asia/Manila',
  },
  {
    code3: 'PAK', name: 'Pakistan', phoneCode: '+92', postalLabel: 'Postal Code', postalMaxLength: 5, timezone: 'Asia/Karachi',
    states: ['Azad Kashmir', 'Balochistan', 'Gilgit-Baltistan', 'Islamabad', 'Khyber Pakhtunkhwa', 'Punjab', 'Sindh'],
  },
  {
    code3: 'BGD', name: 'Bangladesh', phoneCode: '+880', postalLabel: 'Postal Code', postalMaxLength: 4, timezone: 'Asia/Dhaka',
    states: ['Barishal', 'Chattogram', 'Dhaka', 'Khulna', 'Mymensingh', 'Rajshahi', 'Rangpur', 'Sylhet'],
  },
  {
    code3: 'LKA', name: 'Sri Lanka', phoneCode: '+94', postalLabel: 'Postal Code', postalMaxLength: 5, timezone: 'Asia/Colombo',
    states: ['Central', 'Eastern', 'North Central', 'Northern', 'North Western', 'Sabaragamuwa', 'Southern', 'Uva', 'Western'],
  },
  {
    code3: 'NGA', name: 'Nigeria', phoneCode: '+234', postalLabel: 'Postal Code', postalMaxLength: 6, timezone: 'Africa/Lagos',
  },
  {
    code3: 'ZAF', name: 'South Africa', phoneCode: '+27', postalLabel: 'Postal Code', postalMaxLength: 4, timezone: 'Africa/Johannesburg',
    states: ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'],
  },
  { code3: 'KEN', name: 'Kenya', phoneCode: '+254', postalLabel: 'Postal Code', postalMaxLength: 5, timezone: 'Africa/Nairobi' },
  { code3: 'GHA', name: 'Ghana', phoneCode: '+233', postalLabel: 'Postal Code', postalMaxLength: 10, timezone: 'Africa/Accra' },
  {
    code3: 'NZL', name: 'New Zealand', phoneCode: '+64', postalLabel: 'Postcode', postalMaxLength: 4, timezone: 'Pacific/Auckland',
  },
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

// ── Helpers ──────────────────────────────────────────────────────────────────
const getCountry = (code3: string) => COUNTRIES_DATA.find((c) => c.code3 === code3);

// Dial codes deduplicated by value — several countries share one (+1 → US & Canada),
// so each code appears once and the picker searches by country name or code.
const DIAL_CODES: { phoneCode: string; countries: string }[] = (() => {
  const byCode = new Map<string, string[]>();
  for (const c of COUNTRIES_DATA) {
    byCode.set(c.phoneCode, [...(byCode.get(c.phoneCode) ?? []), c.name]);
  }
  return Array.from(byCode, ([phoneCode, names]) => ({
    phoneCode,
    countries: names.join(' / '),
  })).sort((a, b) => Number(a.phoneCode.slice(1)) - Number(b.phoneCode.slice(1)));
})();

// ── Styles ───────────────────────────────────────────────────────────────────
const inputBase =
  'w-full bg-white border rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all duration-200';
const inputClass = `${inputBase} border-slate-300 focus:ring-blue-500 focus:border-blue-500`;
const inputErrorClass = `${inputBase} border-red-400 focus:ring-red-300 focus:border-red-400`;
const selectBase =
  'w-full bg-white border rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 transition-all duration-200 cursor-pointer';
const selectClass = `${selectBase} border-slate-300 focus:ring-blue-500 focus:border-blue-500`;
const selectErrorClass = `${selectBase} border-red-400 focus:ring-red-300 focus:border-red-400`;
const labelClass = 'text-sm font-medium text-slate-700 mb-1.5 block';
const hintClass = 'mt-1 text-xs text-slate-400';
const errorClass = 'mt-1 text-xs text-red-500 flex items-center gap-1';

// ── Types ─────────────────────────────────────────────────────────────────────
interface FormData {
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
  admin_email: string;
  admin_username: string;
  admin_first_name: string;
  admin_last_name: string;
  admin_password: string;
}

type FieldErrors = Partial<Record<keyof FormData, string>>;

// ── Validation ────────────────────────────────────────────────────────────────
function validateForm(d: FormData): FieldErrors {
  const e: FieldErrors = {};

  if (!d.name.trim()) e.name = 'Hospital name is required';
  else if (d.name.trim().length < 3) e.name = 'Must be at least 3 characters';

  if (!d.email.trim()) e.email = 'Official email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = 'Invalid email address';

  if (!d.phone_number.trim()) e.phone_number = 'Phone number is required';
  else if (!/^\d{10}$/.test(d.phone_number))
    e.phone_number = 'Must be exactly 10 digits';

  if (!d.country) e.country = 'Country is required';
  if (!d.timezone) e.timezone = 'Timezone is required';

  if (!d.admin_email.trim()) e.admin_email = 'Admin email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.admin_email)) e.admin_email = 'Invalid email address';

  if (!d.admin_username.trim()) e.admin_username = 'Admin username is required';
  else if (d.admin_username.trim().length < 3) e.admin_username = 'Must be at least 3 characters';
  else if (!/^[a-z0-9_]+$/.test(d.admin_username)) e.admin_username = 'Lowercase letters, numbers and underscores only';

  if (!d.admin_first_name.trim()) e.admin_first_name = 'First name is required';
  else if (!/^[\p{L}\s'.-]+$/u.test(d.admin_first_name.trim())) e.admin_first_name = 'Letters only';

  if (!d.admin_last_name.trim()) e.admin_last_name = 'Last name is required';
  else if (!/^[\p{L}\s'.-]+$/u.test(d.admin_last_name.trim())) e.admin_last_name = 'Letters only';

  if (!d.admin_password) e.admin_password = 'Password is required';
  else if (d.admin_password.length < 8) e.admin_password = 'Minimum 8 characters';

  return e;
}

// ── Section header (matches patient form style) ───────────────────────────────
const SectionHeader: React.FC<{ label: string; color?: string }> = ({
  label,
  color = 'bg-primary/20',
}) => (
  <div className="flex items-center gap-2 mb-5">
    <span className={`w-8 h-[2px] ${color} rounded-full`} />
    <h2 className="text-sm font-bold text-primary uppercase tracking-wider">{label}</h2>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
const SuperAdminCreateHospital: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
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
    admin_email: '',
    admin_username: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_password: '',
  });

  const set = (field: keyof FormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (submittedRef.current) setFieldErrors(validateForm(next));
      return next;
    });
    setServerError(null);
  };

  // Changing the country cascades to the dependent fields in a single, atomic
  // update — phone code + timezone auto-fill, and the now-irrelevant state is
  // cleared so the State dropdown never holds a value from the previous country.
  const handleCountryChange = (code3: string) => {
    const c = getCountry(code3);
    setForm((prev) => {
      const next = {
        ...prev,
        country: code3,
        phone_code: c?.phoneCode ?? prev.phone_code,
        timezone: c?.timezone ?? prev.timezone,
        state_province: '',
      };
      if (submittedRef.current) setFieldErrors(validateForm(next));
      return next;
    });
    setServerError(null);
  };

  const suggestUsername = () => {
    if (form.admin_username.trim()) return;
    const base =
      form.admin_email.trim().split('@')[0] ||
      form.name.trim().toLowerCase().replace(/\s+/g, '_');
    if (!base) return;
    set('admin_username', `${base}_${Date.now().toString().slice(-4)}`);
  };

  const blockNonDigit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Let clipboard / select-all shortcuts through (Ctrl+V, Cmd+A, etc.)
    if (e.ctrlKey || e.metaKey) return;
    if (
      e.key.length === 1 &&
      !/^\d$/.test(e.key)
    ) {
      e.preventDefault();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    submittedRef.current = true;

    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    setIsSubmitting(true);
    setServerError(null);
    try {
      const phone = form.phone_number ? `${form.phone_code}${form.phone_number}` : null;
      const payload: Record<string, unknown> = {
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
        admin_email: form.admin_email,
        admin_username: form.admin_username || null,
        admin_first_name: form.admin_first_name,
        admin_last_name: form.admin_last_name,
        admin_password: form.admin_password,
      };
      await superAdminApi.createTenant(payload);
      toast.success('Hospital created successfully');
      navigate('/superadmin/hospitals');
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Failed to create hospital';
      setServerError(detail);
      toast.error(detail);
      setIsSubmitting(false);
    }
  };

  const selectedCountry = getCountry(form.country);
  const states = selectedCountry?.states ?? [];
  const postalLabel = selectedCountry?.postalLabel ?? 'Postal Code';
  const postalMaxLength = selectedCountry?.postalMaxLength ?? 10;

  const Err: React.FC<{ field: keyof FormData }> = ({ field }) =>
    fieldErrors[field] ? (
      <p className={errorClass}>
        <span className="material-symbols-outlined text-xs">error</span>
        {fieldErrors[field]}
      </p>
    ) : null;

  return (
    <div className="max-w-4xl mx-auto pb-10">
      {/* Page header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/superadmin/hospitals')}
          className="flex items-center gap-1.5 text-slate-500 hover:text-primary transition-colors mb-4 text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Hospitals
        </button>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="text-primary w-6 h-6" />
          Onboard New Hospital
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Fill in the details below to provision a new hospital with a dedicated admin account.
        </p>
      </div>

      {/* Validation error banner */}
      {Object.keys(fieldErrors).length > 0 && submittedRef.current && (
        <div className="mb-5 bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-500 flex-shrink-0 text-xl mt-0.5">warning</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Fix {Object.keys(fieldErrors).length} error{Object.keys(fieldErrors).length > 1 ? 's' : ''} before submitting
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

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" noValidate autoComplete="off">

        {/* ── Section 1: Hospital Information ─────────────────────────────── */}
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

            {/* Official Email */}
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
                maxLength={14}
                value={form.registration_number}
                onChange={(e) => set('registration_number', e.target.value.slice(0, 14))}
              />
              <p className={hintClass}>Required for compliance and regulatory reporting</p>
            </div>

            {/* Phone Country Code + Number */}
            <div className="md:col-span-2">
              <label className={labelClass}>
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  Phone Number <span className="text-red-500">*</span>
                </span>
              </label>
              <div className="flex gap-2">
                <div className="w-28 shrink-0">
                  <DialCodeSelect
                    className={`${selectClass} cursor-pointer`}
                    value={form.phone_code}
                    options={DIAL_CODES}
                    onChange={(code) => set('phone_code', code)}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="tel"
                    inputMode="numeric"
                    className={fieldErrors.phone_number ? inputErrorClass : inputClass}
                    placeholder="e.g. 9876543210"
                    maxLength={10}
                    value={form.phone_number}
                    onKeyDown={blockNonDigit}
                    onChange={(e) => set('phone_number', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  />
                </div>
              </div>
              <Err field="phone_number" />
              {!fieldErrors.phone_number && (
                <p className={hintClass}>Pick the country code (type to search), then enter a 10-digit number</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 2: Location ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <SectionHeader label="Hospital Location" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Country — updating this auto-fills phone code + timezone */}
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
                  <option key={c.code3} value={c.code3}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Err field="country" />
              {!fieldErrors.country && (
                <p className={hintClass}>Auto-fills phone code &amp; timezone</p>
              )}
            </div>

            {/* State / Province — dropdown if available, text input otherwise */}
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
                placeholder={`e.g. ${selectedCountry?.code3 === 'IND' ? '600001' : '10001'}`}
                maxLength={postalMaxLength}
                value={form.postal_code}
                onChange={(e) => set('postal_code', e.target.value.slice(0, postalMaxLength))}
              />
              <p className={hintClass}>Postal / ZIP code for the hospital address</p>
            </div>

            {/* Timezone — auto-filled when country changes, editable */}
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
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <Err field="timezone" />
              {!fieldErrors.timezone && (
                <p className={hintClass}>
                  Auto-selected from country — used for appointments and date/time displays
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 3: Primary Administrator ────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <SectionHeader label="Primary Administrator" />
          <p className="text-xs text-slate-500 mb-5 -mt-3">
            This account will have full admin access to the hospital portal.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Admin Email */}
            <div>
              <label className={labelClass}>
                Admin Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                className={fieldErrors.admin_email ? inputErrorClass : inputClass}
                placeholder="admin@hospital.com"
                value={form.admin_email}
                onChange={(e) => set('admin_email', e.target.value)}
              />
              <Err field="admin_email" />
              {!fieldErrors.admin_email && <p className={hintClass}>Login email for the hospital admin</p>}
            </div>

            {/* Admin Username */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`${labelClass} mb-0`}>
                  Username <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={suggestUsername}
                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  Auto-suggest
                </button>
              </div>
              <input
                type="text"
                className={fieldErrors.admin_username ? inputErrorClass : inputClass}
                placeholder="e.g. admin_citygen"
                minLength={3}
                maxLength={50}
                value={form.admin_username}
                onChange={(e) =>
                  set('admin_username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                }
              />
              <Err field="admin_username" />
              {!fieldErrors.admin_username && (
                <p className={hintClass}>Min 3 chars — lowercase letters, numbers and underscores only</p>
              )}
            </div>

            {/* First Name */}
            <div>
              <label className={labelClass}>
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={fieldErrors.admin_first_name ? inputErrorClass : inputClass}
                placeholder="John"
                maxLength={100}
                value={form.admin_first_name}
                onChange={(e) => set('admin_first_name', e.target.value)}
              />
              <Err field="admin_first_name" />
              {!fieldErrors.admin_first_name && <p className={hintClass}>Admin's first / given name</p>}
            </div>

            {/* Last Name */}
            <div>
              <label className={labelClass}>
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={fieldErrors.admin_last_name ? inputErrorClass : inputClass}
                placeholder="Doe"
                maxLength={100}
                value={form.admin_last_name}
                onChange={(e) => set('admin_last_name', e.target.value)}
              />
              <Err field="admin_last_name" />
              {!fieldErrors.admin_last_name && <p className={hintClass}>Admin's last / family name</p>}
            </div>

            {/* Password — full width */}
            <div className="md:col-span-2">
              <label className={labelClass}>
                Admin Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={(fieldErrors.admin_password ? inputErrorClass : inputClass) + ' pr-11'}
                  placeholder="Minimum 8 characters"
                  minLength={8}
                  autoComplete="new-password"
                  value={form.admin_password}
                  onChange={(e) => set('admin_password', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Err field="admin_password" />
              {!fieldErrors.admin_password && (
                <p className={hintClass}>
                  Min 8 characters — share securely with the admin after creation
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Server error */}
        {serverError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-red-500 flex-shrink-0 text-xl">error</span>
            <div>
              <p className="text-sm font-semibold text-red-700">Creation failed</p>
              <p className="text-sm text-red-600 mt-0.5 whitespace-pre-line">{serverError}</p>
            </div>
          </div>
        )}

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/superadmin/hospitals')}
            className="px-6 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating Hospital…
              </>
            ) : (
              <>
                <Building2 className="w-4 h-4" />
                Create Hospital
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};

export default SuperAdminCreateHospital;