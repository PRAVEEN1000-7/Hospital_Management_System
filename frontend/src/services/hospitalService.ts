import api from './api';

export interface HospitalDetails {
  id: number;
  hospital_name: string;
  hospital_code: string | null;
  hospital_type: string;
  primary_phone: string;
  email: string;
  address_line1: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  logo_path: string | null;
  is_configured: boolean;
  is_active: boolean;
}

export const hospitalService = {
  // Public endpoint - works for all users
  async getHospitalDetails(): Promise<HospitalDetails> {
    try {
      const response = await api.get<HospitalDetails>('/hospital');
      return response.data;
    } catch (error) {
      // If endpoint fails, return default
      return {
        id: 0,
        hospital_name: 'HMS Core',
        hospital_code: null,
        hospital_type: 'General',
        primary_phone: '',
        email: '',
        address_line1: '',
        city: '',
        state: '',
        country: '',
        pin_code: '',
        logo_path: null,
        is_configured: false,
        is_active: true,
      };
    }
  },

  // Full details endpoint - requires admin/super_admin
  async getFullHospitalDetails(): Promise<HospitalDetails> {
    const response = await api.get<HospitalDetails>('/hospital/full');
    return response.data;
  },

  async updateHospitalDetails(data: Partial<HospitalDetails>): Promise<HospitalDetails> {
    const response = await api.put<HospitalDetails>('/hospital', data);
    return response.data;
  },
};

export default hospitalService;
