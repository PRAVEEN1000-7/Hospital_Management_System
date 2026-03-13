import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import appointmentSettingsService from '../services/appointmentSettingsService';
import type { HospitalSettings } from '../services/hospitalService';

type SettingGroup = {
  title: string;
  icon: string;
  fields: {
    key: keyof HospitalSettings;
    label: string;
    description: string;
    type: 'number' | 'text' | 'boolean';
    suffix?: string;
  }[];
};

const settingGroups: SettingGroup[] = [
  {
    title: 'Appointment Configuration',
    icon: 'event',
    fields: [
      { key: 'appointment_slot_duration_minutes', label: 'Slot Duration', description: 'Duration of each appointment slot (5-120)', type: 'number', suffix: 'min' },
      { key: 'appointment_buffer_minutes', label: 'Buffer Time', description: 'Buffer time between appointments (0-60)', type: 'number', suffix: 'min' },
      { key: 'max_daily_appointments_per_doctor', label: 'Max Daily Appointments', description: 'Maximum appointments per doctor per day (1-100)', type: 'number' },
      { key: 'consultation_fee_default', label: 'Default Consultation Fee', description: 'Default consultation fee amount (numeric)', type: 'number', suffix: '₹' },
      { key: 'follow_up_validity_days', label: 'Follow-up Validity', description: 'Days within which follow-up is valid (1-365)', type: 'number', suffix: 'days' },
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
      { key: 'data_retention_years', label: 'Data Retention', description: 'Years to retain patient data (1-99)', type: 'number', suffix: 'years' },
    ],
  },
];

const AppointmentSettings: React.FC = () => {
  const toast = useToast();

  const [settings, setSettings] = useState<HospitalSettings | null>(null);
  const [editValues, setEditValues] = useState<Partial<HospitalSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await appointmentSettingsService.getSettings();
      setSettings(data);
      setEditValues(data);
      setHasChanges(false);
    } catch {
      toast.error('Failed to load settings');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleChange = (key: keyof HospitalSettings, value: string | number | boolean) => {
    // Validate hospital_code: must be 2 uppercase letters
    if (key === 'hospital_code' && typeof value === 'string') {
      value = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    }
    // Validate data_retention_years: minimum 1
    if (key === 'data_retention_years' && typeof value === 'number') {
      value = Math.max(1, Math.min(99, value));
    }
    // Validate appointment_slot_duration_minutes: 5-120
    if (key === 'appointment_slot_duration_minutes' && typeof value === 'number') {
      value = Math.max(5, Math.min(120, value));
    }
    // Validate appointment_buffer_minutes: 0-60
    if (key === 'appointment_buffer_minutes' && typeof value === 'number') {
      value = Math.max(0, Math.min(60, value));
    }
    // Validate max_daily_appointments_per_doctor: 1-100
    if (key === 'max_daily_appointments_per_doctor' && typeof value === 'number') {
      value = Math.max(1, Math.min(100, value));
    }
    // Validate follow_up_validity_days: 1-365
    if (key === 'follow_up_validity_days' && typeof value === 'number') {
      value = Math.max(1, Math.min(365, value));
    }
    // Validate consultation_fee_default: must be numeric
    if (key === 'consultation_fee_default' && typeof value === 'number') {
      value = Math.max(0, value);
    }
    // Validate invoice_prefix and prescription_prefix: max 10 chars
    if ((key === 'invoice_prefix' || key === 'prescription_prefix') && typeof value === 'string') {
      value = value.slice(0, 10);
    }
    setEditValues(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    // Pre-save validation
    const hospitalCode = editValues.hospital_code;
    if (typeof hospitalCode === 'string' && !/^[A-Z]{2}$/.test(hospitalCode)) {
      toast.error('Hospital Code must be exactly 2 uppercase letters');
      return;
    }
    const dataRetention = editValues.data_retention_years;
    if (typeof dataRetention === 'number' && (dataRetention < 1 || dataRetention > 99)) {
      toast.error('Data Retention must be between 1 and 99 years');
      return;
    }
    const slotDuration = editValues.appointment_slot_duration_minutes;
    if (typeof slotDuration === 'number' && (slotDuration < 5 || slotDuration > 120)) {
      toast.error('Slot Duration must be between 5 and 120 minutes');
      return;
    }

    setSaving(true);
    try {
      const updated = await appointmentSettingsService.updateSettings(editValues);
      setSettings(updated);
      setEditValues(updated);
      setHasChanges(false);
      toast.success('Settings saved successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save settings');
    }
    setSaving(false);
  };

  const handleReset = () => {
    if (settings) {
      setEditValues(settings);
      setHasChanges(false);
    }
  };

  const getValue = (key: keyof HospitalSettings) => {
    return editValues[key] ?? '';
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hospital Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Configure appointment, notification, and system preferences</p>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-3">
            <button onClick={handleReset}
              className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              Reset
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2">
              {saving ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-base">save</span>
              )}
              Save Changes
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
        </div>
      ) : !settings ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-amber-600 text-3xl">warning</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Settings Not Found</h2>
          <p className="text-sm text-slate-500 mb-4">Hospital settings have not been configured. Please complete the hospital setup first.</p>
          <a href="/hospital-setup" className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
            <span className="material-symbols-outlined text-base">settings</span>
            Go to Hospital Setup
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {settingGroups.map(group => (
            <div key={group.title} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Group Header */}
              <div className="flex items-center gap-3 px-5 py-4 bg-slate-50/50 border-b border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-lg">{group.icon}</span>
                </div>
                <h2 className="font-bold text-slate-900">{group.title}</h2>
              </div>
              {/* Fields */}
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
                            className={`relative w-12 h-6 rounded-full transition-colors ${isOn ? 'bg-primary' : 'bg-slate-200'}`}
                          >
                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${isOn ? 'left-[26px]' : 'left-0.5'}`} />
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {field.suffix === '₹' && (
                              <span className="text-sm text-slate-500 font-medium">₹</span>
                            )}
                            <input
                              type={field.type === 'number' ? 'number' : 'text'}
                              value={String(value || '')}
                              onChange={(e) => handleChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                              className={`px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none ${
                                field.type === 'number' ? 'w-24 text-right' : 'w-40'
                              }`}
                            />
                            {field.suffix && field.suffix !== '₹' && (
                              <span className="text-xs text-slate-400">{field.suffix}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Read-only info */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-slate-400 text-lg">info</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sequence Counters (Read-only)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-2xl font-bold text-slate-900">{settings.patient_id_sequence}</p>
                <p className="text-[10px] text-slate-400 uppercase font-medium mt-1">Patient IDs</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-2xl font-bold text-slate-900">{settings.staff_id_sequence}</p>
                <p className="text-[10px] text-slate-400 uppercase font-medium mt-1">Staff IDs</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-2xl font-bold text-slate-900">{settings.invoice_sequence}</p>
                <p className="text-[10px] text-slate-400 uppercase font-medium mt-1">Invoices</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-2xl font-bold text-slate-900">{settings.prescription_sequence}</p>
                <p className="text-[10px] text-slate-400 uppercase font-medium mt-1">Prescriptions</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentSettings;
