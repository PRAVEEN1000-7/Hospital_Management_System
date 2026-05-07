import api from './api';
import type { DoctorProfile } from '../types/doctor';

const doctorService = {
  /** Get the logged-in doctor's own profile */
  async getMyProfile(): Promise<DoctorProfile> {
    const res = await api.get<DoctorProfile>('/doctors/me');
    return res.data;
  },

  /** Get available specializations */
  async getSpecializations(): Promise<string[]> {
    const res = await api.get<string[]>('/doctors/specializations');
    return res.data;
  },
};

export default doctorService;
