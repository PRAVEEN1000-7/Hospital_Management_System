import api from './api';
import type { Appointment, WalkInRegister, QueueStatus } from '../types/appointment';

const walkInService = {
  async register(data: WalkInRegister): Promise<Appointment> {
    const res = await api.post<Appointment>('/walk-ins', data);
    return res.data;
  },

  async getQueueStatus(doctorId?: string): Promise<QueueStatus> {
    const params: Record<string, string> = {};
    if (doctorId) params.doctor_id = doctorId;
    const res = await api.get<QueueStatus>('/walk-ins/queue', { params });
    return res.data;
  },

  async assignDoctor(appointmentId: string, doctorId: string): Promise<Appointment> {
    const res = await api.post<Appointment>(`/walk-ins/${appointmentId}/assign-doctor`, {
      doctor_id: doctorId,
    });
    return res.data;
  },

  async getTodayWalkIns(doctorId?: string): Promise<Appointment[]> {
    const params: Record<string, string> = {};
    if (doctorId) params.doctor_id = doctorId;
    const res = await api.get<Appointment[]>('/walk-ins/today', { params });
    return res.data;
  },
};

export default walkInService;
