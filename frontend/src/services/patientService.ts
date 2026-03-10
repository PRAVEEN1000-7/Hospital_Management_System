import api, { API_BASE_URL } from './api';
import type { Patient, PatientCreateData, PaginatedResponse } from '../types/patient';

export const patientService = {
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

  getPhotoUrl(photoUrl: string | null): string | null {
    if (!photoUrl) return null;
    return API_BASE_URL.replace('/api/v1', '') + photoUrl;
  },
};

export default patientService;
