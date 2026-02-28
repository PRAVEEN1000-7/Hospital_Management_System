import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import appointmentSettingsService from '../services/appointmentSettingsService';
import type { HospitalSettings } from '../services/hospitalService';

const settingLabels: Record<string, { label: string; description: string; icon: string; type: 'number' | 'text' | 'boolean' }> = {
  default_slot_duration: { label: 'Default Slot Duration (min)', description: 'Default duration for appointment time slots', icon: 'timer', type: 'number' },
  max_patients: { label: 'Max Patients Per Slot', description: 'Maximum number of patients per time slot', icon: 'group', type: 'number' },
  auto_confirm_appointments: { label: 'Auto-Confirm Appointments', description: 'Automatically confirm new appointment bookings', icon: 'check_circle', type: 'boolean' },
  allow_walk_ins: { label: 'Allow Walk-ins', description: 'Enable walk-in patient registration', icon: 'directions_walk', type: 'boolean' },
  walk_in_queue_enabled: { label: 'Walk-in Queue', description: 'Enable queue management for walk-in patients', icon: 'queue', type: 'boolean' },
  advance_booking_days: { label: 'Advance Booking Days', description: 'How far in advance patients can book (days)', icon: 'date_range', type: 'number' },
  cancellation_notice_hours: { label: 'Cancellation Notice (hrs)', description: 'Minimum hours before appointment for free cancellation', icon: 'event_busy', type: 'number' },
  default_consultation_fee: { label: 'Default Consultation Fee', description: 'Default fee for consultations', icon: 'payments', type: 'number' },
  waitlist_enabled: { label: 'Enable Waitlist', description: 'Allow patients to join waitlist for full slots', icon: 'playlist_add', type: 'boolean' },
  reminder_hours_before: { label: 'Reminder Hours Before', description: 'Hours before appointment to send reminder', icon: 'notifications', type: 'number' },
  walk_in_enabled: { label: 'Walk-in Enabled', description: 'Master toggle for walk-in functionality', icon: 'directions_walk', type: 'boolean' },
  max_queue_length: { label: 'Max Queue Length', description: 'Maximum number of patients in walk-in queue', icon: 'format_list_numbered', type: 'number' },
  max_walk_ins_per_doctor_per_day: { label: 'Max Walk-ins Per Doctor/Day', description: 'Daily walk-in limit per doctor', icon: 'person', type: 'number' },
  walk_in_priority: { label: 'Walk-in Priority Mode', description: 'Queue priority: "fifo" or "urgent-first"', icon: 'sort', type: 'text' },
  buffer_time_minutes: { label: 'Buffer Time (min)', description: 'Buffer minutes between appointment slots', icon: 'more_time', type: 'number' },
  cancellation_deadline_hours: { label: 'Cancel Deadline (hrs)', description: 'Minimum hours before appointment to allow cancellation', icon: 'event_busy', type: 'number' },
  walk_in_wait_estimate_enabled: { label: 'Show Wait Estimate', description: 'Display estimated wait time for walk-in patients', icon: 'timer', type: 'boolean' },
  default_waiting_area: { label: 'Default Waiting Area', description: 'Default waiting area name for appointments', icon: 'meeting_room', type: 'text' },
  per_doctor_walk_in_enabled: { label: 'Per-Doctor Walk-in Toggle', description: 'Allow enabling/disabling walk-ins per doctor', icon: 'toggle_on', type: 'boolean' },
  email_notifications_enabled: { label: 'Email Notifications', description: 'Send email notifications for appointments', icon: 'mail', type: 'boolean' },
  appointment_pdf_enabled: { label: 'Appointment PDF', description: 'Enable printable appointment documents', icon: 'picture_as_pdf', type: 'boolean' },
};

const AppointmentSettings: React.FC = () => {
  const toast = useToast();

  const [settings, setSettings] = useState<HospitalSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await appointmentSettingsService.getSettings();
      setSettings(data);
      const values: Record<string, string> = {};
      data.forEach(s => { values[s.setting_key] = s.setting_value; });
      setEditValues(values);
    } catch {
      toast.error('Failed to load settings');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      await appointmentSettingsService.updateSetting(key, editValues[key]);
      toast.success('Setting saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    }
    setSaving(null);
  };

  const handleToggle = async (key: string) => {
    const newVal = editValues[key] === 'true' ? 'false' : 'true';
    setEditValues(prev => ({ ...prev, [key]: newVal }));
    setSaving(key);
    try {
      await appointmentSettingsService.updateSetting(key, newVal);
      toast.success('Setting updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update');
      setEditValues(prev => ({ ...prev, [key]: editValues[key] }));
    }
    setSaving(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Appointment Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Configure appointment booking preferences and policies</p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : (
        <div className="space-y-4">
          {settings.map(setting => {
            const meta = settingLabels[setting.setting_key] || {
              label: setting.setting_key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              description: setting.description || '',
              icon: 'settings',
              type: 'text' as const,
            };
            const isToggle = meta.type === 'boolean';
            const isOn = editValues[setting.setting_key] === 'true';
            const hasChanged = editValues[setting.setting_key] !== setting.setting_value;
            const isSaving = saving === setting.setting_key;

            return (
              <div key={setting.setting_key} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Icon */}
                  <div className="flex-shrink-0 w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary">{meta.icon}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm">{meta.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{meta.description}</p>
                  </div>
                  {/* Control */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {isToggle ? (
                      <button onClick={() => handleToggle(setting.setting_key)} disabled={isSaving}
                        className={`relative w-12 h-6 rounded-full transition-colors ${isOn ? 'bg-primary' : 'bg-slate-200'} ${isSaving ? 'opacity-50' : ''}`}>
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${isOn ? 'left-[26px]' : 'left-0.5'}`} />
                      </button>
                    ) : (
                      <>
                        <input type={meta.type === 'number' ? 'number' : 'text'}
                          value={editValues[setting.setting_key] || ''}
                          onChange={(e) => setEditValues(prev => ({ ...prev, [setting.setting_key]: e.target.value }))}
                          className="w-32 px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-right focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                        {hasChanged && (
                          <button onClick={() => handleSave(setting.setting_key)} disabled={isSaving}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm disabled:opacity-50">
                            {isSaving ? '...' : 'Save'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AppointmentSettings;
