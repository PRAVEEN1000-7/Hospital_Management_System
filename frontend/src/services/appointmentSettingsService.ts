import api from './api';
import type { HospitalSettings } from './hospitalService';

const appointmentSettingsService = {
  async getSettings(): Promise<HospitalSettings[]> {
    const res = await api.get<HospitalSettings[]>('/hospital/settings');
    return res.data;
  },

  async updateSetting(key: string, value: string): Promise<HospitalSettings> {
    const res = await api.put<HospitalSettings>(`/hospital/settings/${key}`, {
      setting_value: value,
    });
    return res.data;
  },
};

export default appointmentSettingsService;
