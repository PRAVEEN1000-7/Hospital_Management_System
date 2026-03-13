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
  id: string;
  hospital_id: string;
  hospital_code: string;
  patient_id_start_number: number;
  patient_id_sequence: number;
  staff_id_start_number: number;
  staff_id_sequence: number;
  invoice_prefix: string;
  invoice_sequence: number;
  prescription_prefix: string;
  prescription_sequence: number;
  appointment_slot_duration_minutes: number;
  appointment_buffer_minutes: number;
  max_daily_appointments_per_doctor: number;
  allow_walk_in: boolean;
  allow_emergency_bypass: boolean;
  enable_sms_notifications: boolean;
  enable_email_notifications: boolean;
  enable_whatsapp_notifications: boolean;
  consultation_fee_default: string;
  follow_up_validity_days: number;
  data_retention_years: number;
  branding_primary_color: string;
  branding_secondary_color: string;
  print_header_text: string | null;
  print_footer_text: string | null;
  created_at: string;
  updated_at: string;
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

  async getSettings(): Promise<HospitalSettings> {
    const response = await api.get<HospitalSettings>('/hospital-settings');
    return response.data;
  },

  async updateSettings(settings: Partial<HospitalSettings>): Promise<HospitalSettings> {
    const response = await api.put<HospitalSettings>('/hospital-settings', settings);
    return response.data;
  },
};

export default hospitalService;
