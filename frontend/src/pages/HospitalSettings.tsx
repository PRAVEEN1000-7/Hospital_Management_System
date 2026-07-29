import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { hospitalService } from '../services/hospitalService';
import scheduleService from '../services/scheduleService';
import HospitalLogo from '../components/common/HospitalLogo';
import type { HospitalDetails, HospitalSettings as HospitalSettingsType } from '../services/hospitalService';
import type { DoctorOption } from '../types/appointment';
import { canEdit } from '../config/modulePermissions';

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'profile' | 'system';

// ── Operational setting groups (same config as AppointmentSettings) ──────────

type SettingKey = keyof HospitalSettingsType;

const settingGroups: {
  title: string;
  icon: string;
  fields: {
    key: SettingKey;
    label: string;
    description: string;
    type: 'number' | 'text' | 'boolean';
    suffix?: string;
  }[];
}[] = [
  {
    title: 'Appointment Configuration',
    icon: 'event',
    fields: [
      { key: 'appointment_slot_duration_minutes', label: 'Slot Duration', description: 'Duration per appointment slot (5–120)', type: 'number', suffix: 'min' },
      { key: 'appointment_buffer_minutes', label: 'Buffer Time', description: 'Buffer between appointments (0–60)', type: 'number', suffix: 'min' },
      { key: 'max_daily_appointments_per_doctor', label: 'Max Daily Appointments', description: 'Maximum per doctor per day (1–100)', type: 'number' },
      { key: 'follow_up_validity_days', label: 'Follow-up Validity', description: 'Days a follow-up is valid (1–365)', type: 'number', suffix: 'days' },
    ],
  },
  {
    title: 'Notifications',
    icon: 'notifications',
    fields: [
      { key: 'enable_email_notifications', label: 'Email Notifications', description: 'Send appointment notifications via email', type: 'boolean' },
      { key: 'enable_sms_notifications', label: 'SMS Notifications', description: 'Send notifications via SMS', type: 'boolean' },
      { key: 'enable_whatsapp_notifications', label: 'WhatsApp Notifications', description: 'Send notifications via WhatsApp', type: 'boolean' },
    ],
  },
  {
    title: 'ID Sequences',
    icon: 'tag',
    fields: [
      { key: 'hospital_code', label: 'Hospital Code', description: '2 uppercase letters used in IDs (e.g., HC)', type: 'text' },
      { key: 'patient_id_start_number', label: 'Patient ID Start', description: 'Starting number for patient IDs', type: 'number' },
      { key: 'staff_id_start_number', label: 'Staff ID Start', description: 'Starting number for staff IDs', type: 'number' },
      { key: 'invoice_prefix', label: 'Invoice Prefix', description: 'Prefix for invoice numbers (max 10 chars)', type: 'text' },
      { key: 'prescription_prefix', label: 'Prescription Prefix', description: 'Prefix for prescription numbers (max 10 chars)', type: 'text' },
    ],
  },
  {
    title: 'Compliance & Retention',
    icon: 'security',
    fields: [
      { key: 'data_retention_years', label: 'Data Retention', description: 'Years to retain patient data (1–99)', type: 'number', suffix: 'years' },
    ],
  },
];

// ── Timezones & currencies ───────────────────────────────────────────────────

const TIMEZONES = [
  'UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago',
  'America/Los_Angeles', 'Australia/Sydney', 'Pacific/Auckland',
];

const CURRENCIES = [
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
];

// ── Sub-components ───────────────────────────────────────────────────────────

const TabButton: React.FC<{ label: string; icon: string; active: boolean; onClick: () => void }> = ({
  label, icon, active, onClick,
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
      active
        ? 'bg-primary text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100'
    }`}
  >
    <span className="material-symbols-outlined text-base">{icon}</span>
    {label}
  </button>
);

const FormField: React.FC<{
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, hint, required, children }) => (
  <div className="space-y-1">
    <label className="block text-sm font-medium text-slate-700">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-slate-400">{hint}</p>}
  </div>
);

// ── Profile Tab ──────────────────────────────────────────────────────────────

const ProfileTab: React.FC = () => {
  const toast = useToast();
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState<Partial<HospitalDetails>>({});
  const [original, setOriginal] = useState<Partial<HospitalDetails>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await hospitalService.getFullHospitalDetails();
      setProfile(data);
      setOriginal(data);
    } catch {
      toast.error('Failed to load hospital profile');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const hasChanges = JSON.stringify(profile) !== JSON.stringify(original);

  const set = (key: keyof HospitalDetails, value: string) =>
    setProfile(prev => ({ ...prev, [key]: value }));

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const res = await hospitalService.uploadLogo(file);
      // The endpoint persists logo_url immediately, so sync both states.
      setProfile(prev => ({ ...prev, logo_url: res.logo_url }));
      setOriginal(prev => ({ ...prev, logo_url: res.logo_url }));
      window.dispatchEvent(new Event('hospital:updated')); // refresh sidebar logo live
      toast.success('Logo uploaded');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleLogoRemove = async () => {
    if (!profile.logo_url) return;
    try {
      await hospitalService.deleteLogo();
      setProfile(prev => ({ ...prev, logo_url: '' }));
      setOriginal(prev => ({ ...prev, logo_url: '' }));
      window.dispatchEvent(new Event('hospital:updated'));
      toast.success('Logo removed');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to remove logo');
    }
  };

  const handleSave = async () => {
    if (!profile.name?.trim()) {
      toast.error('Hospital name is required');
      return;
    }
    setSaving(true);
    try {
      const updated = await hospitalService.updateHospitalDetails(profile);
      setOriginal(updated);
      setProfile(updated);
      // Reflect the new name immediately in the sidebar / top-left without re-login.
      if (updated.name) updateUser({ hospital_name: updated.name });
      window.dispatchEvent(new Event('hospital:updated'));
      toast.success('Hospital profile updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save profile');
    }
    setSaving(false);
  };

  const handleReset = () => setProfile(original);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Save bar */}
      {hasChanges && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <p className="text-sm font-medium text-amber-800">You have unsaved changes</p>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-4 py-1.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span className="material-symbols-outlined text-base">save</span>}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Basic Info */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-lg">local_hospital</span>
          </div>
          <h2 className="font-bold text-slate-900">Basic Information</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FormField label="Hospital Name" required>
            <input
              value={profile.name || ''}
              onChange={e => set('name', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="e.g. City General Hospital"
            />
          </FormField>
          <FormField label="Registration Number" hint="Official hospital registration number">
            <input
              value={profile.registration_number || ''}
              onChange={e => set('registration_number', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="e.g. REG-2024-001"
            />
          </FormField>
          <FormField label="Tax / GST ID">
            <input
              value={profile.tax_id || ''}
              onChange={e => set('tax_id', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="e.g. 22AAAAA0000A1Z5"
            />
          </FormField>
          <FormField label="Hospital Logo" hint="PNG, JPG or SVG up to 2MB. Shown in the sidebar and on documents.">
            <div className="flex items-center gap-4">
              <HospitalLogo
                logoUrl={profile.logo_url}
                name={profile.name}
                className="w-16 h-16 rounded-xl shrink-0"
                textClassName="text-xl"
              />
              <div className="flex flex-col gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="px-3 py-1.5 text-sm font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 disabled:opacity-50 flex items-center gap-1.5 w-fit"
                >
                  <span className={`material-symbols-outlined text-base ${uploadingLogo ? 'animate-spin' : ''}`}>
                    {uploadingLogo ? 'progress_activity' : 'upload'}
                  </span>
                  {uploadingLogo ? 'Uploading…' : 'Upload Logo'}
                </button>
                {profile.logo_url && (
                  <button
                    type="button"
                    onClick={handleLogoRemove}
                    className="text-xs text-red-500 hover:underline text-left"
                  >
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </FormField>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-lg">contact_phone</span>
          </div>
          <h2 className="font-bold text-slate-900">Contact Details</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FormField label="Phone Number">
            <input
              value={profile.phone || ''}
              onChange={e => set('phone', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="+91 98765 43210"
            />
          </FormField>
          <FormField label="Email Address">
            <input
              type="email"
              value={profile.email || ''}
              onChange={e => set('email', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="admin@hospital.com"
            />
          </FormField>
          <FormField label="Website" hint="Public-facing website URL">
            <input
              value={profile.website || ''}
              onChange={e => set('website', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="https://www.hospital.com"
            />
          </FormField>
        </div>
      </div>

      {/* Address */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-lg">location_on</span>
          </div>
          <h2 className="font-bold text-slate-900">Address</h2>
        </div>
        <div className="grid grid-cols-1 gap-5">
          <FormField label="Address Line 1">
            <input
              value={profile.address_line_1 || ''}
              onChange={e => set('address_line_1', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="Street address"
            />
          </FormField>
          <FormField label="Address Line 2">
            <input
              value={profile.address_line_2 || ''}
              onChange={e => set('address_line_2', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="Area, landmark (optional)"
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <FormField label="City">
              <input
                value={profile.city || ''}
                onChange={e => set('city', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                placeholder="City"
              />
            </FormField>
            <FormField label="State / Province">
              <input
                value={profile.state_province || ''}
                onChange={e => set('state_province', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                placeholder="State"
              />
            </FormField>
            <FormField label="Postal Code">
              <input
                value={profile.postal_code || ''}
                onChange={e => set('postal_code', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                placeholder="PIN / ZIP"
              />
            </FormField>
          </div>
          <FormField label="Country" hint="ISO 3-letter country code">
            <input
              value={profile.country || ''}
              onChange={e => set('country', e.target.value.toUpperCase().slice(0, 3))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="IND"
              maxLength={3}
            />
          </FormField>
        </div>
      </div>

      {/* Regional */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-lg">language</span>
          </div>
          <h2 className="font-bold text-slate-900">Regional Settings</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FormField label="Timezone">
            <select
              value={profile.timezone || 'UTC'}
              onChange={e => set('timezone', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white"
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Default Currency">
            <select
              value={profile.default_currency || 'INR'}
              onChange={e => set('default_currency', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white"
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </FormField>
        </div>
      </div>
    </div>
  );
};

// ── System Settings Tab ──────────────────────────────────────────────────────

const SystemSettingsTab: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEyeHospital = user?.hospital_specialty === 'eye_hospital' || user?.hospital_specialty === 'multi_specialty';
  // Inert today (no role has "view" on system.settings by default, and the
  // /settings route itself is edit-gated) — kept as defense-in-depth so this
  // page still degrades to read-only correctly if a hospital admin ever
  // grants view-only access here via the Roles & Permissions UI.
  const canEditSettings = canEdit('system.settings', user?.roles);
  const [settings, setSettings] = useState<HospitalSettingsType | null>(null);
  const [editValues, setEditValues] = useState<Partial<HospitalSettingsType>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await hospitalService.getSettings();
      setSettings(data);
      setEditValues(data);
      setHasChanges(false);
    } catch {
      toast.error('Failed to load system settings');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  useEffect(() => {
    if (!isEyeHospital) return;
    scheduleService.getDoctors().then(setDoctors).catch(() => {});
  }, [isEyeHospital]);

  const publicQueueUrl = user?.hospital_code
    ? `${window.location.origin}/public/queue/${user.hospital_code}`
    : '';

  const handleCopyLink = async () => {
    if (!publicQueueUrl) return;
    try {
      await navigator.clipboard.writeText(publicQueueUrl);
      setLinkCopied(true);
      toast.success('Link copied — paste it into the display\'s browser');
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      toast.error('Could not copy automatically — select and copy the link manually');
    }
  };

  const handleChange = (key: SettingKey, value: string | number | boolean) => {
    if (key === 'hospital_code' && typeof value === 'string') value = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    if (key === 'data_retention_years' && typeof value === 'number') value = Math.max(1, Math.min(99, value));
    if (key === 'appointment_slot_duration_minutes' && typeof value === 'number') value = Math.max(5, Math.min(120, value));
    if (key === 'appointment_buffer_minutes' && typeof value === 'number') value = Math.max(0, Math.min(60, value));
    if (key === 'max_daily_appointments_per_doctor' && typeof value === 'number') value = Math.max(1, Math.min(100, value));
    if (key === 'follow_up_validity_days' && typeof value === 'number') value = Math.max(1, Math.min(365, value));
    if ((key === 'invoice_prefix' || key === 'prescription_prefix') && typeof value === 'string') value = value.slice(0, 10);
    setEditValues(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!canEditSettings) return;
    const hospitalCode = editValues.hospital_code;
    if (typeof hospitalCode === 'string' && !/^[A-Z]{2}$/.test(hospitalCode)) {
      toast.error('Hospital Code must be exactly 2 uppercase letters');
      return;
    }
    setSaving(true);
    try {
      const updated = await hospitalService.updateSettings(editValues);
      setSettings(updated);
      setEditValues(updated);
      setHasChanges(false);
      toast.success('System settings saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save settings');
    }
    setSaving(false);
  };

  const handleReset = () => {
    if (settings) { setEditValues(settings); setHasChanges(false); }
  };

  const getValue = (key: SettingKey) => editValues[key] ?? '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-amber-600 text-3xl">warning</span>
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Settings Not Found</h2>
        <p className="text-sm text-slate-500 mb-4">Hospital settings have not been configured. Complete the hospital setup first.</p>
        <a href="/hospital-setup" className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-base">settings</span>
          Go to Hospital Setup
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasChanges && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <p className="text-sm font-medium text-amber-800">You have unsaved changes</p>
          <div className="flex gap-2">
            <button onClick={handleReset} className="px-4 py-1.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Discard</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span className="material-symbols-outlined text-base">save</span>}
              Save
            </button>
          </div>
        </div>
      )}

      {settingGroups.map(group => (
        <div key={group.title} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 bg-slate-50/50 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-lg">{group.icon}</span>
            </div>
            <h2 className="font-bold text-slate-900">{group.title}</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {group.fields.map(field => {
              const value = getValue(field.key);
              const isBoolean = field.type === 'boolean';
              const isOn = value === true || value === 'true';
              return (
                <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm">{field.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{field.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isBoolean ? (
                      <button
                        onClick={() => handleChange(field.key, !isOn)}
                        disabled={!canEditSettings}
                        className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isOn ? 'bg-primary' : 'bg-slate-200'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${isOn ? 'left-[26px]' : 'left-0.5'}`} />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {field.suffix === '₹' && <span className="text-sm text-slate-500 font-medium">₹</span>}
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={value !== null && value !== undefined ? String(value) : ''}
                          onChange={e => handleChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                          disabled={!canEditSettings}
                          className={`px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 ${field.type === 'number' ? 'w-24 text-right' : 'w-40'}`}
                        />
                        {field.suffix && field.suffix !== '₹' && <span className="text-xs text-slate-400">{field.suffix}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Queue Display — eye-hospital feature pack only */}
      {isEyeHospital && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 bg-slate-50/50 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-lg">tv</span>
            </div>
            <h2 className="font-bold text-slate-900">Queue Display</h2>
          </div>

          {/* Public link — no login needed once copied to the display's browser */}
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="font-medium text-slate-900 text-sm mb-1">Public Display Link</p>
            <p className="text-xs text-slate-400 mb-3">
              Open this link on the waiting-room TV/monitor's browser (or set it as the homepage) — it
              needs no login and stays on screen permanently. Copy it once; you won't need to log in
              again on that device.
            </p>
            {publicQueueUrl ? (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={publicQueueUrl}
                  onFocus={e => e.target.select()}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-600 outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    linkCopied ? 'bg-emerald-100 text-emerald-700' : 'bg-primary text-white hover:bg-primary/90'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">{linkCopied ? 'check' : 'content_copy'}</span>
                  {linkCopied ? 'Copied' : 'Copy Link'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-amber-600">Hospital Code is not set yet — set it under ID Sequences above first.</p>
            )}
          </div>

          {/* Doctor columns */}
          <div className="px-5 py-4 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FormField label="Doctor 1 Column" hint="Shown as the first doctor column on the display">
              <select
                value={editValues.queue_display_doctor1_id || ''}
                onChange={e => handleChange('queue_display_doctor1_id', e.target.value || '')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white"
              >
                <option value="">Not set — shows "Doctor 1"</option>
                {doctors.map(d => <option key={d.doctor_id} value={d.doctor_id}>{d.name}</option>)}
              </select>
            </FormField>
            <FormField label="Doctor 2 Column" hint="Shown as the second doctor column, if enabled below">
              <select
                value={editValues.queue_display_doctor2_id || ''}
                onChange={e => handleChange('queue_display_doctor2_id', e.target.value || '')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white"
              >
                <option value="">Not set — shows "Doctor 2"</option>
                {doctors.map(d => <option key={d.doctor_id} value={d.doctor_id}>{d.name}</option>)}
              </select>
            </FormField>
          </div>

          {/* Toggles + refresh interval */}
          <div className="divide-y divide-slate-100">
            {([
              { key: 'queue_display_show_doctor2' as const, label: 'Show Doctor 2 Column', description: 'Display the second doctor\'s queue alongside the first' },
              { key: 'queue_display_show_pharmacy' as const, label: 'Show Pharmacy Column', description: 'Display the pharmacy dispensing queue' },
              { key: 'queue_display_show_opthal' as const, label: 'Show Opthal Column', description: 'Display the optical billing queue' },
            ]).map(field => {
              const isOn = editValues[field.key] !== false;
              return (
                <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm">{field.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{field.description}</p>
                  </div>
                  <button
                    onClick={() => handleChange(field.key, !isOn)}
                    className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${isOn ? 'bg-primary' : 'bg-slate-200'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${isOn ? 'left-[26px]' : 'left-0.5'}`} />
                  </button>
                </div>
              );
            })}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 text-sm">Refresh Interval</p>
                <p className="text-xs text-slate-400 mt-0.5">How often the display polls for updates (5–120 seconds)</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={editValues.queue_display_refresh_seconds ?? 10}
                  onChange={e => handleChange('queue_display_refresh_seconds', Math.max(5, Math.min(120, Number(e.target.value))))}
                  className="w-24 px-3 py-1.5 text-sm text-right border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
                <span className="text-xs text-slate-400">sec</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queue Display Screens (BRD-005) — multi-screen config, additive
          alongside the single legacy config above; not eye-hospital gated,
          since named-screen queue displays are generically useful. */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-slate-50/50 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-lg">dashboard_customize</span>
          </div>
          <h2 className="font-bold text-slate-900">Queue Display Screens</h2>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            Configure multiple named public queue displays — each with its own department, doctor,
            and token format, each with its own URL. Enabled only once all its mandatory settings are set.
          </p>
          <button
            onClick={() => navigate('/settings/queue-screens')}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-base">tune</span>
            Manage Screens
          </button>
        </div>
      </div>

      {/* Read-only counters */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-slate-400 text-lg">info</span>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sequence Counters (Read-only)</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {[
            { value: settings.patient_id_sequence, label: 'Patient IDs' },
            { value: settings.staff_id_sequence, label: 'Staff IDs' },
            { value: settings.invoice_sequence, label: 'Invoices' },
            { value: settings.prescription_sequence, label: 'Prescriptions' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-lg p-3 border border-slate-200">
              <p className="text-2xl font-bold text-slate-900">{c.value}</p>
              <p className="text-[10px] text-slate-400 uppercase font-medium mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────

const HospitalSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [brand, setBrand] = useState<{ name: string; logo_url: string | null }>({ name: '', logo_url: null });

  // Load the hospital brand (name + logo) once for the shared header so it shows
  // identically on both the Hospital Profile and System Settings tabs, and refresh
  // it live whenever the logo/profile is updated.
  const loadBrand = useCallback(() => {
    hospitalService.getHospitalDetails()
      .then(res => setBrand({ name: res.name || '', logo_url: res.logo_url || null }))
      .catch(() => {});
  }, []);

  useEffect(() => { loadBrand(); }, [loadBrand]);
  useEffect(() => {
    const handler = () => loadBrand();
    window.addEventListener('hospital:updated', handler);
    return () => window.removeEventListener('hospital:updated', handler);
  }, [loadBrand]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header with hospital brand — shown on both tabs */}
      <div className="flex items-center gap-4 mb-6">
        <HospitalLogo
          logoUrl={brand.logo_url}
          name={brand.name}
          className="w-14 h-14 rounded-2xl shrink-0"
          textClassName="text-xl"
        />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 truncate">{brand.name || 'Hospital Settings'}</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage your hospital profile, contact details, and system configuration
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 bg-slate-100 rounded-xl p-1.5 w-fit">
        <TabButton
          label="Hospital Profile"
          icon="local_hospital"
          active={activeTab === 'profile'}
          onClick={() => setActiveTab('profile')}
        />
        <TabButton
          label="System Settings"
          icon="settings"
          active={activeTab === 'system'}
          onClick={() => setActiveTab('system')}
        />
      </div>

      {/* Tab content */}
      {activeTab === 'profile' ? <ProfileTab /> : <SystemSettingsTab />}
    </div>
  );
};

export default HospitalSettings;
