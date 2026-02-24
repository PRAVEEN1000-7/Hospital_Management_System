import api from './api';
import type { WaitlistEntry, WaitlistCreate, PaginatedResponse } from '../types/appointment';

const waitlistService = {
  async joinWaitlist(data: WaitlistCreate): Promise<WaitlistEntry> {
    const res = await api.post<WaitlistEntry>('/waitlist', data);
    return res.data;
  },

  async getWaitlist(
    page = 1, limit = 10, doctorId?: number, patientId?: number, status?: string,
  ): Promise<PaginatedResponse<WaitlistEntry>> {
    const params: Record<string, string | number> = { page, limit };
    if (doctorId) params.doctor_id = doctorId;
    if (patientId) params.patient_id = patientId;
    if (status) params.status = status;
    const res = await api.get<PaginatedResponse<WaitlistEntry>>('/waitlist', { params });
    return res.data;
  },

  async confirmEntry(entryId: number): Promise<WaitlistEntry> {
    const res = await api.post<WaitlistEntry>(`/waitlist/${entryId}/confirm`);
    return res.data;
  },

  async removeEntry(entryId: number): Promise<void> {
    await api.delete(`/waitlist/${entryId}`);
  },
};

export default waitlistService;
