import api from './api';
import type {
  DoctorSchedule, DoctorScheduleCreate, DoctorLeave, DoctorLeaveCreate,
  AvailableSlots, DoctorOption,
} from '../types/appointment';

const scheduleService = {
  // ── Doctors list ─────────────────────────────────────────────────────
  async getDoctors(): Promise<DoctorOption[]> {
    const res = await api.get<DoctorOption[]>('/schedules/doctors');
    return res.data;
  },

  // ── Doctor schedules ─────────────────────────────────────────────────
  async getSchedules(doctorId: string): Promise<DoctorSchedule[]> {
    const res = await api.get<DoctorSchedule[]>(`/schedules/doctors/${doctorId}`);
    return res.data;
  },

  async createSchedule(doctorId: string, data: DoctorScheduleCreate): Promise<DoctorSchedule> {
    const res = await api.post<DoctorSchedule>(`/schedules/doctors/${doctorId}`, data);
    return res.data;
  },

  async bulkCreateSchedules(doctorId: string, schedules: DoctorScheduleCreate[]): Promise<DoctorSchedule[]> {
    const res = await api.post<DoctorSchedule[]>(`/schedules/doctors/${doctorId}/bulk`, {
      doctor_id: doctorId,
      schedules,
    });
    return res.data;
  },

  async updateSchedule(scheduleId: string, data: Partial<DoctorScheduleCreate>): Promise<DoctorSchedule> {
    const res = await api.put<DoctorSchedule>(`/schedules/${scheduleId}`, data);
    return res.data;
  },

  async deleteSchedule(scheduleId: string): Promise<void> {
    await api.delete(`/schedules/${scheduleId}`);
  },

  // ── Available slots ──────────────────────────────────────────────────
  async getAvailableSlots(doctorId: string, date: string): Promise<AvailableSlots> {
    const res = await api.get<AvailableSlots>('/schedules/available-slots', {
      params: { doctor_id: doctorId, date },
    });
    return res.data;
  },

  // ── Doctor leaves (replaces blocked periods) ─────────────────────────
  async getDoctorLeaves(doctorId?: string, dateFrom?: string, dateTo?: string): Promise<DoctorLeave[]> {
    const params: Record<string, string> = {};
    if (doctorId) params.doctor_id = doctorId;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const res = await api.get<DoctorLeave[]>('/schedules/doctor-leaves', { params });
    return res.data;
  },

  async createDoctorLeave(data: DoctorLeaveCreate): Promise<DoctorLeave> {
    const res = await api.post<DoctorLeave>('/schedules/doctor-leave', data);
    return res.data;
  },

  async deleteDoctorLeave(leaveId: string): Promise<void> {
    await api.delete(`/schedules/doctor-leaves/${leaveId}`);
  },
};

export default scheduleService;
