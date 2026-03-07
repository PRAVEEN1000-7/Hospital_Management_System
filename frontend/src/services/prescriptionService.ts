import api from './api';
import type {
  Prescription,
  PrescriptionListItem,
  PrescriptionCreate,
  PrescriptionUpdate,
  Medicine,
  MedicineCreate,
  PrescriptionTemplate,
  PrescriptionTemplateCreate,
  PrescriptionVersion,
  PaginatedResponse,
} from '../types/prescription';

interface PrescriptionFilters {
  doctor_id?: string;
  patient_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

const prescriptionService = {
  // —— Prescriptions ————————————————————————————————————————————

  async getPrescriptions(
    page = 1, limit = 10, filters?: PrescriptionFilters,
  ): Promise<PaginatedResponse<PrescriptionListItem>> {
    const params: Record<string, string | number> = { page, limit };
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params[k] = v;
      });
    }
    const res = await api.get<PaginatedResponse<PrescriptionListItem>>('/prescriptions', { params });
    return res.data;
  },

  async getMyPrescriptions(
    page = 1, limit = 10, status?: string,
  ): Promise<PaginatedResponse<PrescriptionListItem>> {
    const params: Record<string, string | number> = { page, limit };
    if (status) params.status = status;
    const res = await api.get<PaginatedResponse<PrescriptionListItem>>('/prescriptions/my-prescriptions', { params });
    return res.data;
  },

  async getPatientPrescriptions(
    patientId: string, page = 1, limit = 10,
  ): Promise<PaginatedResponse<PrescriptionListItem>> {
    const params: Record<string, string | number> = { page, limit };
    const res = await api.get<PaginatedResponse<PrescriptionListItem>>(`/prescriptions/patient/${patientId}`, { params });
    return res.data;
  },

  async getPrescription(id: string): Promise<Prescription> {
    const res = await api.get<Prescription>(`/prescriptions/${id}`);
    return res.data;
  },

  async createPrescription(data: PrescriptionCreate): Promise<Prescription> {
    const cleaned: Record<string, unknown> = {};
    Object.entries(data).forEach(([k, v]) => {
      cleaned[k] = v === '' ? undefined : v;
    });
    const res = await api.post<Prescription>('/prescriptions', cleaned);
    return res.data;
  },

  async updatePrescription(id: string, data: PrescriptionUpdate): Promise<Prescription> {
    const cleaned: Record<string, unknown> = {};
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined) cleaned[k] = v === '' ? undefined : v;
    });
    const res = await api.put<Prescription>(`/prescriptions/${id}`, cleaned);
    return res.data;
  },

  async finalizePrescription(id: string): Promise<Prescription> {
    const res = await api.post<Prescription>(`/prescriptions/${id}/finalize`);
    return res.data;
  },

  async finalizeAndComplete(id: string): Promise<Prescription> {
    const res = await api.post<Prescription>(`/prescriptions/${id}/finalize-and-complete`);
    return res.data;
  },

  async deletePrescription(id: string): Promise<void> {
    await api.delete(`/prescriptions/${id}`);
  },

  async getPrescriptionVersions(id: string): Promise<PrescriptionVersion[]> {
    const res = await api.get<PrescriptionVersion[]>(`/prescriptions/${id}/versions`);
    return res.data;
  },

  async getPrescriptionPdfUrl(id: string, lang = 'en'): Promise<string> {
    const res = await api.get(`/prescriptions/${id}/pdf`, { responseType: 'text', params: { lang } });
    return res.data;
  },

  async getPrescriptionLanguages(): Promise<{ code: string; name: string }[]> {
    const res = await api.get<{ code: string; name: string }[]>('/prescriptions/languages');
    return res.data;
  },

  // —— Medicines ————————————————————————————————————————————————

  async getMedicines(
    page = 1, limit = 50, search?: string, category?: string,
  ): Promise<PaginatedResponse<Medicine>> {
    const params: Record<string, string | number> = { page, limit };
    if (search) params.search = search;
    if (category) params.category = category;
    const res = await api.get<PaginatedResponse<Medicine>>('/medicines', { params });
    return res.data;
  },

  async createMedicine(data: MedicineCreate): Promise<Medicine> {
    const res = await api.post<Medicine>('/medicines', data);
    return res.data;
  },

  async updateMedicine(id: string, data: Partial<MedicineCreate>): Promise<Medicine> {
    const res = await api.put<Medicine>(`/medicines/${id}`, data);
    return res.data;
  },

  // —— Templates ————————————————————————————————————————————————

  async getTemplates(): Promise<PrescriptionTemplate[]> {
    const res = await api.get<PrescriptionTemplate[]>('/prescription-templates');
    return res.data;
  },

  async createTemplate(data: PrescriptionTemplateCreate): Promise<PrescriptionTemplate> {
    const res = await api.post<PrescriptionTemplate>('/prescription-templates', data);
    return res.data;
  },

  async updateTemplate(id: string, data: Partial<PrescriptionTemplateCreate>): Promise<PrescriptionTemplate> {
    const res = await api.put<PrescriptionTemplate>(`/prescription-templates/${id}`, data);
    return res.data;
  },

  async deleteTemplate(id: string): Promise<void> {
    await api.delete(`/prescription-templates/${id}`);
  },

  async useTemplate(id: string): Promise<void> {
    await api.post(`/prescription-templates/${id}/use`);
  },
};

export default prescriptionService;
