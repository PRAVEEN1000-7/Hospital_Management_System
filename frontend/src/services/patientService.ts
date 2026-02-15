import api, { API_BASE_URL } from './api';
import type { Patient, PatientCreateData, PaginatedResponse } from '../types/patient';

export const patientService = {
  async getPatients(page = 1, limit = 10, search = ''): Promise<PaginatedResponse<Patient>> {
    const params: Record<string, string | number> = { page, limit };
    if (search) params.search = search;
    const response = await api.get<PaginatedResponse<Patient>>('/patients', { params });
    return response.data;
  },

  async getPatient(id: number): Promise<Patient> {
    const response = await api.get<Patient>(`/patients/${id}`);
    return response.data;
  },

  async createPatient(data: PatientCreateData): Promise<Patient> {
    // Clean empty strings to null/undefined
    const cleaned: Record<string, unknown> = {};
    Object.entries(data).forEach(([key, value]) => {
      cleaned[key] = value === '' ? undefined : value;
    });
    const response = await api.post<Patient>('/patients', cleaned);
    return response.data;
  },

  async updatePatient(id: number, data: PatientCreateData): Promise<Patient> {
    const cleaned: Record<string, unknown> = {};
    Object.entries(data).forEach(([key, value]) => {
      cleaned[key] = value === '' ? undefined : value;
    });
    const response = await api.put<Patient>(`/patients/${id}`, cleaned);
    return response.data;
  },

  async deletePatient(id: number): Promise<void> {
    await api.delete(`/patients/${id}`);
  },

  async uploadPhoto(id: number, file: File): Promise<Patient> {
    const formData = new FormData();
    formData.append('photo', file);
    const response = await api.post<Patient>(`/patients/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async emailIdCard(id: number, pdfBlob?: Blob): Promise<{ message: string }> {
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
