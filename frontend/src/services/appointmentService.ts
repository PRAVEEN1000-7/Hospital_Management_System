import api from './api';
import type {
  Appointment, AppointmentCreate, AppointmentUpdate,
  PaginatedResponse, AppointmentStats,
} from '../types/appointment';

interface AppointmentFilters {
  doctor_id?: number;
  patient_id?: number;
  status?: string;
  appointment_type?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

const appointmentService = {
  async getAppointments(
    page = 1, limit = 10, filters?: AppointmentFilters,
  ): Promise<PaginatedResponse<Appointment>> {
    const params: Record<string, string | number> = { page, limit };
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params[k] = v;
      });
    }
    const res = await api.get<PaginatedResponse<Appointment>>('/appointments', { params });
    return res.data;
  },

  async getMyAppointments(page = 1, limit = 10, status?: string): Promise<PaginatedResponse<Appointment>> {
    const params: Record<string, string | number> = { page, limit };
    if (status) params.status = status;
    const res = await api.get<PaginatedResponse<Appointment>>('/appointments/my-appointments', { params });
    return res.data;
  },

  async getDoctorToday(doctorId: number): Promise<Appointment[]> {
    const res = await api.get<Appointment[]>(`/appointments/doctor/${doctorId}/today`);
    return res.data;
  },

  async getAppointment(id: number): Promise<Appointment> {
    const res = await api.get<Appointment>(`/appointments/${id}`);
    return res.data;
  },

  async createAppointment(data: AppointmentCreate): Promise<Appointment> {
    const cleaned: Record<string, unknown> = {};
    Object.entries(data).forEach(([k, v]) => {
      cleaned[k] = v === '' ? undefined : v;
    });
    const res = await api.post<Appointment>('/appointments', cleaned);
    return res.data;
  },

  async updateAppointment(id: number, data: AppointmentUpdate): Promise<Appointment> {
    const cleaned: Record<string, unknown> = {};
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined) cleaned[k] = v === '' ? undefined : v;
    });
    const res = await api.put<Appointment>(`/appointments/${id}`, cleaned);
    return res.data;
  },

  async cancelAppointment(id: number, reason?: string): Promise<void> {
    const params: Record<string, string> = {};
    if (reason) params.reason = reason;
    await api.delete(`/appointments/${id}`, { params });
  },

  async rescheduleAppointment(id: number, newDate: string, newTime?: string, reason?: string): Promise<Appointment> {
    const res = await api.post<Appointment>(`/appointments/${id}/reschedule`, {
      new_date: newDate,
      new_time: newTime || null,
      reason: reason || null,
    });
    return res.data;
  },

  async updateStatus(id: number, status: string): Promise<Appointment> {
    const res = await api.patch<Appointment>(`/appointments/${id}/status`, { status });
    return res.data;
  },

  async getStats(dateFrom?: string, dateTo?: string, doctorId?: number): Promise<AppointmentStats> {
    const params: Record<string, string | number> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (doctorId) params.doctor_id = doctorId;
    const res = await api.get<AppointmentStats>('/reports/appointments/statistics', { params });
    return res.data;
  },
};

export default appointmentService;
