import api from './api';
import type { DoctorProfile } from '../types/doctor';

const doctorService = {
  /** Get the logged-in doctor's own profile */
  async getMyProfile(): Promise<DoctorProfile> {
    const res = await api.get<DoctorProfile>('/doctors/me');
    return res.data;
  },
};

export default doctorService;
