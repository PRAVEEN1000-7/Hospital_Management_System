import api from './api';
import { Patient, PatientListItem, PaginatedResponse } from '../types/patient';

export const patientService = {
  async createPatient(patient: Omit<Patient, 'id' | 'created_at' | 'updated_at' | 'is_active'>): Promise<Patient> {
    const response = await api.post<Patient>('/patients', patient);
    return response.data;
  },

  async getPatient(id: number): Promise<Patient> {
    const response = await api.get<Patient>(`/patients/${id}`);
    return response.data;
  },

  async listPatients(
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<PaginatedResponse<PatientListItem>> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (search) {
      params.append('search', search);
    }

    const response = await api.get<PaginatedResponse<PatientListItem>>(
      `/patients?${params.toString()}`
    );
    return response.data;
  },

  async updatePatient(id: number, patient: Patient): Promise<Patient> {
    const response = await api.put<Patient>(`/patients/${id}`, patient);
    return response.data;
  },

  async deletePatient(id: number): Promise<void> {
    await api.delete(`/patients/${id}`);
  },

  async emailIdCard(id: number): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>(`/patients/${id}/email-id-card`);
    return response.data;
  },
};
