import api from './api';
import type { AppointmentSetting } from '../types/appointment';

const appointmentSettingsService = {
  async getSettings(doctorId?: number): Promise<AppointmentSetting[]> {
    const params: Record<string, number> = {};
    if (doctorId) params.doctor_id = doctorId;
    const res = await api.get<AppointmentSetting[]>('/appointment-settings', { params });
    return res.data;
  },

  async updateSetting(key: string, value: string): Promise<AppointmentSetting> {
    const res = await api.put<AppointmentSetting>(`/appointment-settings/${key}`, {
      setting_value: value,
    });
    return res.data;
  },
};

export default appointmentSettingsService;
