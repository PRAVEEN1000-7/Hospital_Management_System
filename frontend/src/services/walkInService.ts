import api from './api';
import type { Appointment, WalkInRegister, QueueStatus, WalkInResponse } from '../types/appointment';

export interface UnassignedWalkIn {
  appointment_id: string;
  appointment_number: string;
  patient_id: string | null;
  patient_name: string | null;
  patient_reference_number: string | null;
  patient_phone: string | null;
  patient_gender: string | null;
  patient_age: number | null;
  priority: string;
  chief_complaint: string | null;
  check_in_at: string | null;
  created_at: string | null;
}

const walkInService = {
  async register(data: WalkInRegister): Promise<WalkInResponse> {
    const res = await api.post<WalkInResponse>('/walk-ins', data);
    return res.data;
  },

  async getQueueStatus(doctorId?: string): Promise<QueueStatus> {
    const params: Record<string, string> = {};
    if (doctorId) params.doctor_id = doctorId;
    const res = await api.get<QueueStatus>('/walk-ins/queue', { params });
    return res.data;
  },

  async callPatient(queueId: string): Promise<void> {
    await api.patch(`/walk-ins/queue/${queueId}/call`);
  },

  async startConsultation(queueId: string): Promise<void> {
    await api.patch(`/walk-ins/queue/${queueId}/start-consultation`);
  },

  async completePatient(queueId: string): Promise<void> {
    await api.patch(`/walk-ins/queue/${queueId}/complete`);
  },

  async skipPatient(queueId: string): Promise<void> {
    await api.patch(`/walk-ins/queue/${queueId}/skip`);
  },

  async saveConsultationNotes(queueId: string, data: {
    notes?: string;
    diagnosis?: string;
    prescription?: string;
    vitals_bp?: string;
    vitals_pulse?: string;
    vitals_temp?: string;
    vitals_weight?: string;
    vitals_spo2?: string;
    follow_up_date?: string;
  }): Promise<{ ok: boolean }> {
    const res = await api.patch<{ ok: boolean }>(`/walk-ins/queue/${queueId}/save-notes`, data);
    return res.data;
  },

  async getConsultationNotes(queueId: string): Promise<Record<string, unknown>> {
    const res = await api.get<Record<string, unknown>>(`/walk-ins/queue/${queueId}/notes`);
    return res.data;
  },

  async sendToDoctor(appointmentId: string, doctorId: string): Promise<Appointment> {
    const res = await api.post<Appointment>(`/walk-ins/${appointmentId}/assign-doctor`, {
      doctor_id: doctorId,
    });
    return res.data;
  },

  /** @deprecated Use sendToDoctor instead */
  async assignDoctor(appointmentId: string, doctorId: string): Promise<Appointment> {
    return this.sendToDoctor(appointmentId, doctorId);
  },

  async getDoctorLoads(): Promise<Record<string, number>> {
    const res = await api.get<Record<string, number>>('/walk-ins/queue/doctor-loads');
    return res.data;
  },

  async getTodayWalkIns(doctorId?: string): Promise<Appointment[]> {
    const params: Record<string, string> = {};
    if (doctorId) params.doctor_id = doctorId;
    const res = await api.get<Appointment[]>('/walk-ins/today', { params });
    return res.data;
  },

  async getUnassigned(): Promise<{ count: number; items: UnassignedWalkIn[] }> {
    const res = await api.get<{ count: number; items: UnassignedWalkIn[] }>('/walk-ins/unassigned');
    return res.data;
  },
};

export default walkInService;
