import api, { API_BASE_URL } from './api';
import type { Patient, PatientCreateData, PaginatedResponse, PatientLastVisit } from '../types/patient';

export interface PatientTrendBucket {
  period_start: string;
  period_end: string;
  label: string;
  new_patients: number;
  returning_patients: number;
  /** Distinct patients with a still-booked (not completed/cancelled), not-yet-passed
   * appointment in this bucket — always 0 for a bucket entirely in the past. */
  upcoming_patients: number;
  /** Breakdown of returning_patients by follow-up chain position (see backend
   * appointment_service.compute_follow_up_label): mc1 = first within-a-month
   * return, mc2_plus = second-or-later consecutive within-a-month return,
   * mcr = "Renewal" (first return after a 30+ day gap). These three always
   * sum to returning_patients. */
  mc1_count: number;
  mc2_plus_count: number;
  mcr_count: number;
}

export type PatientTrendGranularity = 'day' | 'week' | 'month' | 'custom';

export interface PatientTrendResponse {
  granularity: PatientTrendGranularity;
  scope: 'hospital' | 'doctor';
  buckets: PatientTrendBucket[];
}

export const patientService = {
  /** Dashboard chart — New vs Returning patient trend (Doctor + Admin dashboards only).
   * Doctor callers automatically get their own patients only (resolved server-side from
   * the JWT's role — no doctor_id to pass); admin/super_admin get the whole hospital.
   * "day"/"week" are single-period snapshots (today only / this week only); "month" is a
   * 6-month trend; "custom" requires dateFrom/dateTo ("YYYY-MM-DD") and buckets by day
   * across that explicit range (server caps it at 92 days). */
  async getNewVsReturningTrend(
    granularity: PatientTrendGranularity = 'day',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<PatientTrendResponse> {
    const params: Record<string, string> = { granularity };
    if (granularity === 'custom' && dateFrom && dateTo) {
      params.date_from = dateFrom;
      params.date_to = dateTo;
    }
    const response = await api.get<PatientTrendResponse>('/patients/stats/new-vs-returning', { params });
    return response.data;
  },

  async getPatients(
    page = 1, limit = 10, search = '',
    filters?: { gender?: string; blood_group?: string; city?: string; status?: string },
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<PaginatedResponse<Patient>> {
    const params: Record<string, string | number> = { page, limit };
    if (search) params.search = search;
    if (filters?.gender) params.gender = filters.gender;
    if (filters?.blood_group) params.blood_group = filters.blood_group;
    if (filters?.city) params.city = filters.city;
    if (filters?.status) params.status = filters.status;
    if (sortBy) { params.sort_by = sortBy; params.sort_order = sortOrder; }
    const response = await api.get<PaginatedResponse<Patient>>('/patients', { params });
    return response.data;
  },

  async getPatient(id: string): Promise<Patient> {
    const response = await api.get<Patient>(`/patients/${id}`);
    return response.data;
  },

  async createPatient(data: PatientCreateData): Promise<Patient> {
    // Clean empty strings to null/undefined and map field names
    const cleaned: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      state: 'state_province',
      pin_code: 'postal_code',
    };
    Object.entries(data).forEach(([key, value]) => {
      const mappedKey = fieldMap[key] || key;
      cleaned[mappedKey] = value === '' ? undefined : value;
    });
    const response = await api.post<Patient>('/patients', cleaned);
    return response.data;
  },

  async updatePatient(id: string, data: PatientCreateData): Promise<Patient> {
    // Clean empty strings to null/undefined and map field names
    const cleaned: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      state: 'state_province',
      pin_code: 'postal_code',
    };
    Object.entries(data).forEach(([key, value]) => {
      const mappedKey = fieldMap[key] || key;
      cleaned[mappedKey] = value === '' ? undefined : value;
    });
    const response = await api.put<Patient>(`/patients/${id}`, cleaned);
    return response.data;
  },

  async deletePatient(id: string): Promise<void> {
    await api.delete(`/patients/${id}`);
  },

  async uploadPhoto(id: string, file: File): Promise<Patient> {
    const formData = new FormData();
    formData.append('photo', file);
    const response = await api.post<Patient>(`/patients/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async emailIdCard(id: string, pdfBlob?: Blob): Promise<{ message: string }> {
    if (pdfBlob) {
      const formData = new FormData();
      formData.append('pdf_file', pdfBlob, 'id-card.pdf');
      const response = await api.post(`/patients/${id}/email-id-card`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    }
    const response = await api.post(`/patients/${id}/email-id-card`);
    return response.data;
  },

  async sendEmailVerification(id: string): Promise<{ cooldown_seconds: number; message: string }> {
    const response = await api.post(`/patients/${id}/send-email-verification`);
    return response.data;
  },

  async verifyEmail(token: string): Promise<{ is_email_verified: boolean; is_phone_verified: boolean; is_verified: boolean }> {
    const response = await api.post('/patients/verify-email', { token });
    return response.data;
  },

  async verifyEmailCode(id: string, code: string): Promise<{ is_email_verified: boolean; is_phone_verified: boolean; is_verified: boolean }> {
    const response = await api.post(`/patients/${id}/verify-email-code`, { code });
    return response.data;
  },

  async sendPhoneOtp(id: string): Promise<{ cooldown_seconds: number; message: string }> {
    const response = await api.post(`/patients/${id}/send-phone-otp`);
    return response.data;
  },

  async verifyPhoneOtp(id: string, code: string): Promise<{ is_email_verified: boolean; is_phone_verified: boolean; is_verified: boolean }> {
    const response = await api.post(`/patients/${id}/verify-phone-otp`, { code });
    return response.data;
  },

  async getLastVisit(id: string): Promise<PatientLastVisit> {
    const response = await api.get<PatientLastVisit>(`/patients/${id}/last-visit`);
    return response.data;
  },

  getPhotoUrl(photoUrl: string | null): string | null {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) return photoUrl;
    
    let photoPath = photoUrl.startsWith('/') ? photoUrl.substring(1) : photoUrl;
    if (photoPath.startsWith('uploads/')) {
      photoPath = photoPath.substring(8);
    }
    return `${API_BASE_URL}/uploads/${photoPath}`;
  },
};

export default patientService;
