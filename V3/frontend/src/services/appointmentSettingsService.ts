import api from './api';
import type { HospitalSettings } from './hospitalService';

const appointmentSettingsService = {
  async getSettings(): Promise<HospitalSettings> {
    const res = await api.get<HospitalSettings>('/hospital-settings');
    return res.data;
  },

  async updateSettings(data: Partial<HospitalSettings>): Promise<HospitalSettings> {
    const res = await api.put<HospitalSettings>('/hospital-settings', data);
    return res.data;
  },
};

export default appointmentSettingsService;
