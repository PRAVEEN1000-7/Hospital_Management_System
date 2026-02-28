import api from './api';

export interface HospitalDetails {
  id: string;
  name: string;
  code: string | null;
  phone: string;
  email: string;
  website: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state_province: string;
  country: string;
  postal_code: string;
  timezone: string;
  default_currency: string;
  tax_id: string | null;
  registration_number: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HospitalSettings {
  hospital_id: string;
  setting_key: string;
  setting_value: string;
  setting_type: string;
  description: string | null;
}

export const hospitalService = {
  async getHospitalDetails(): Promise<HospitalDetails> {
    try {
      const response = await api.get<HospitalDetails>('/hospital');
      return response.data;
    } catch (error) {
      return {
        id: '',
        name: 'HMS Core',
        code: null,
        phone: '',
        email: '',
        website: null,
        address_line_1: '',
        address_line_2: null,
        city: '',
        state_province: '',
        country: '',
        postal_code: '',
        timezone: 'Asia/Kolkata',
        default_currency: 'INR',
        tax_id: null,
        registration_number: null,
        logo_url: null,
        is_active: true,
        created_at: '',
        updated_at: '',
      };
    }
  },

  async getFullHospitalDetails(): Promise<HospitalDetails> {
    const response = await api.get<HospitalDetails>('/hospital/full');
    return response.data;
  },

  async updateHospitalDetails(data: Partial<HospitalDetails>): Promise<HospitalDetails> {
    const response = await api.put<HospitalDetails>('/hospital', data);
    return response.data;
  },

  async updateLogo(file: File): Promise<HospitalDetails> {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await api.put<HospitalDetails>('/hospital/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async deleteLogo(): Promise<void> {
    await api.delete('/hospital/logo');
  },

  async getSettings(): Promise<HospitalSettings[]> {
    const response = await api.get<HospitalSettings[]>('/hospital/settings');
    return response.data;
  },

  async updateSettings(settings: Record<string, string>): Promise<HospitalSettings[]> {
    const response = await api.put<HospitalSettings[]>('/hospital/settings', settings);
    return response.data;
  },
};

export default hospitalService;
