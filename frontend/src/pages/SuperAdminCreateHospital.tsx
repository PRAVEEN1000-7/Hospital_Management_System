import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronLeft,
  Shield,
  MapPin,
  CreditCard,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';
import { useToast } from '../contexts/ToastContext';

interface OnboardingFormData {
  // Hospital identity
  name: string;
  email: string;
  phone: string;
  registration_number: string;
  // Location
  address_line_1: string;
  address_line_2: string;
  city: string;
  state_province: string;
  postal_code: string;
  country: string;
  timezone: string;
  // Admin
  admin_email: string;
  admin_username: string;
  admin_first_name: string;
  admin_last_name: string;
  admin_password: string;
  // Subscription
  plan_id: string;
  trial_days: number;
}

interface Plan {
  id: string;
  name: string;
  code: string;
  base_price: string;
  currency: string;
  billing_cycle: string;
  max_users: number | null;
  max_patients: number | null;
}

const COUNTRIES = [
  { code: 'USA', name: 'United States' },
  { code: 'GBR', name: 'United Kingdom' },
  { code: 'CAN', name: 'Canada' },
  { code: 'AUS', name: 'Australia' },
  { code: 'IND', name: 'India' },
  { code: 'DEU', name: 'Germany' },
  { code: 'FRA', name: 'France' },
  { code: 'NGA', name: 'Nigeria' },
  { code: 'ZAF', name: 'South Africa' },
  { code: 'KEN', name: 'Kenya' },
  { code: 'GHA', name: 'Ghana' },
  { code: 'ARE', name: 'UAE' },
  { code: 'SAU', name: 'Saudi Arabia' },
  { code: 'SGP', name: 'Singapore' },
  { code: 'MYS', name: 'Malaysia' },
  { code: 'PHL', name: 'Philippines' },
  { code: 'PAK', name: 'Pakistan' },
  { code: 'BGD', name: 'Bangladesh' },
  { code: 'LKA', name: 'Sri Lanka' },
  { code: 'NZL', name: 'New Zealand' },
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
  { value: 'Asia/Singapore', label: 'Asia/Singapore — Singapore Time' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo — Japan Standard Time' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai — China Standard Time' },
  { value: 'Asia/Karachi', label: 'Asia/Karachi — Pakistan Standard Time' },
  { value: 'Asia/Dhaka', label: 'Asia/Dhaka — Bangladesh Standard Time' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos — West Africa Time' },
  { value: 'Africa/Nairobi', label: 'Africa/Nairobi — East Africa Time' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg — South Africa Standard Time' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney — Australian Eastern Time' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland — New Zealand Standard Time' },
];

const inputClass =
  'w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm bg-white transition-colors';
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5';
const selectClass =
  'w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm bg-white transition-colors appearance-none';

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
    {icon}
    {title}
  </h2>
);

const SuperAdminCreateHospital: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);

  const [formData, setFormData] = useState<OnboardingFormData>({
    name: '',
    email: '',
    phone: '',
    registration_number: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    state_province: '',
    postal_code: '',
    country: 'USA',
    timezone: 'UTC',
    admin_email: '',
    admin_username: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_password: '',
    plan_id: '',
    trial_days: 14,
  });

  useEffect(() => {
    superAdminApi.getPlans().then((res) => {
      setPlans(res.data?.data ?? res.data ?? []);
    }).catch(() => {});
  }, []);

  const updateField = (field: keyof OnboardingFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const suggestUsername = () => {
    const base =
      formData.admin_email.trim().split('@')[0] ||
      formData.name.trim().split(' ').join('').toLowerCase();
    if (!base || formData.admin_username.trim()) return;
    updateField('admin_username', `${base}_${Date.now().toString().slice(-4)}`.toLowerCase());
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = { ...formData };
      if (!payload.plan_id) delete payload.plan_id;
      // Strip empty optional strings so backend doesn't store blank values
      ['registration_number', 'address_line_1', 'address_line_2', 'city',
       'state_province', 'postal_code', 'phone', 'admin_username'].forEach((k) => {
        if (payload[k] === '') payload[k] = null;
      });
      await superAdminApi.createTenant(payload);
      toast.success('Hospital created successfully');
      navigate('/superadmin/hospitals');
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Failed to create hospital';
      toast.error(detail);
      setIsSubmitting(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === formData.plan_id);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/superadmin/hospitals')}
          className="flex items-center gap-2 text-slate-500 hover:text-primary transition-colors mb-4 text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Hospitals
        </button>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="text-primary" />
          Onboard New Hospital
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Set up a new hospital instance with location details, a dedicated admin account, and an
          optional subscription plan.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left / Main Column ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Hospital Information */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <SectionHeader icon={<Building2 className="w-4 h-4" />} title="Hospital Information" />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Hospital Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. City General Hospital"
                  className={inputClass}
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Official Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="contact@hospital.com"
                    className={inputClass}
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+1 (555) 000-0000"
                    className={inputClass}
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Registration / License Number
                  <span className="ml-1 text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Government-issued hospital registration number"
                  className={inputClass}
                  value={formData.registration_number}
                  onChange={(e) => updateField('registration_number', e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-400">
                  Required for compliance and regulatory reporting.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Location */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <SectionHeader icon={<MapPin className="w-4 h-4" />} title="Hospital Location" />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Address Line 1</label>
                <input
                  type="text"
                  placeholder="Street address, P.O. box"
                  className={inputClass}
                  value={formData.address_line_1}
                  onChange={(e) => updateField('address_line_1', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Address Line 2{' '}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Apartment, suite, building, floor, etc."
                  className={inputClass}
                  value={formData.address_line_2}
                  onChange={(e) => updateField('address_line_2', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>City</label>
                  <input
                    type="text"
                    placeholder="e.g. New York"
                    className={inputClass}
                    value={formData.city}
                    onChange={(e) => updateField('city', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>State / Province</label>
                  <input
                    type="text"
                    placeholder="e.g. NY"
                    className={inputClass}
                    value={formData.state_province}
                    onChange={(e) => updateField('state_province', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Postal / ZIP Code</label>
                  <input
                    type="text"
                    placeholder="e.g. 10001"
                    className={inputClass}
                    value={formData.postal_code}
                    onChange={(e) => updateField('postal_code', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Country *</label>
                  <select
                    required
                    className={selectClass}
                    value={formData.country}
                    onChange={(e) => updateField('country', e.target.value)}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Timezone *</label>
                <select
                  required
                  className={selectClass}
                  value={formData.timezone}
                  onChange={(e) => updateField('timezone', e.target.value)}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  Used for appointment scheduling and all date/time displays.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Primary Administrator */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <SectionHeader icon={<Shield className="w-4 h-4" />} title="Primary Administrator" />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Admin Email *</label>
                <input
                  type="email"
                  required
                  placeholder="admin@hospital.com"
                  className={inputClass}
                  value={formData.admin_email}
                  onChange={(e) => updateField('admin_email', e.target.value)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelClass + ' mb-0'}>Admin Username *</label>
                  <button
                    type="button"
                    onClick={suggestUsername}
                    className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    Suggest username
                  </button>
                </div>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={50}
                  placeholder="e.g. admin_citygen"
                  className={inputClass}
                  value={formData.admin_username}
                  onChange={(e) =>
                    updateField('admin_username', e.target.value.toLowerCase().replace(/\s+/g, '_'))
                  }
                />
                <p className="mt-1 text-xs text-slate-400">
                  Login username for the primary hospital admin. Min 3 characters, lowercase.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>First Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="John"
                    className={inputClass}
                    value={formData.admin_first_name}
                    onChange={(e) => updateField('admin_first_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Last Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Doe"
                    className={inputClass}
                    value={formData.admin_last_name}
                    onChange={(e) => updateField('admin_last_name', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Admin Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    className={inputClass + ' pr-11'}
                    value={formData.admin_password}
                    onChange={(e) => updateField('admin_password', e.target.value)}
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
                {formData.admin_password && formData.admin_password.length < 8 && (
                  <p className="mt-1 text-xs text-red-500">Password must be at least 8 characters.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Sidebar ── */}
        <div className="space-y-6">
          {/* Subscription Plan */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <SectionHeader
              icon={<CreditCard className="w-4 h-4" />}
              title="Subscription Plan"
            />

            {plans.length === 0 ? (
              <p className="text-xs text-slate-400 mb-4">No plans available. You can assign one later.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {/* Assign Later option */}
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    formData.plan_id === ''
                      ? 'border-primary bg-primary/5'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value=""
                    checked={formData.plan_id === ''}
                    onChange={() => updateField('plan_id', '')}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Assign Later</p>
                    <p className="text-xs text-slate-400">Hospital is created in pending state.</p>
                  </div>
                </label>

                {plans.map((plan) => (
                  <label
                    key={plan.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      formData.plan_id === plan.id
                        ? 'border-primary bg-primary/5'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={plan.id}
                      checked={formData.plan_id === plan.id}
                      onChange={() => updateField('plan_id', plan.id)}
                      className="mt-0.5 accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1">
                        <p className="text-sm font-semibold text-slate-700 truncate">{plan.name}</p>
                        <span className="text-xs font-bold text-slate-900 shrink-0">
                          {parseFloat(plan.base_price) === 0
                            ? 'Free'
                            : `$${parseFloat(plan.base_price).toFixed(0)}/${plan.billing_cycle === 'monthly' ? 'mo' : 'yr'}`}
                        </span>
                      </div>
                      {(plan.max_users || plan.max_patients) && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {plan.max_users ? `Up to ${plan.max_users} users` : ''}
                          {plan.max_users && plan.max_patients ? ' · ' : ''}
                          {plan.max_patients ? `${plan.max_patients} patients` : ''}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {formData.plan_id && (
              <div>
                <label className={labelClass}>
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  Trial Period (days)
                </label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  className={inputClass}
                  value={formData.trial_days}
                  onChange={(e) => updateField('trial_days', parseInt(e.target.value) || 0)}
                />
                <p className="mt-1 text-xs text-slate-400">0 = no trial, activate immediately.</p>
              </div>
            )}
          </div>

          {/* Summary & Submit */}
          <div className="bg-slate-900 rounded-xl p-6 text-white space-y-4 sticky top-6">
            <h3 className="font-bold text-base">Ready to Launch?</h3>

            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Creates tenant &amp; hospital records
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Provisions admin account with login access
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Generates unique hospital code automatically
              </li>
              {selectedPlan ? (
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Activates <span className="font-semibold text-white ml-0.5">{selectedPlan.name}</span> plan
                  {formData.trial_days > 0 ? ` (${formData.trial_days}-day trial)` : ''}
                </li>
              ) : (
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-slate-500">No plan — assign subscription later</span>
                </li>
              )}
            </ul>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary hover:bg-primary/90 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white animate-spin rounded-full" />
              ) : (
                <Building2 className="w-5 h-5" />
              )}
              {isSubmitting ? 'Creating Hospital…' : 'Create Hospital'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default SuperAdminCreateHospital;