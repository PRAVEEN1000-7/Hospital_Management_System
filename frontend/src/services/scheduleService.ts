import api from './api';
import type {
  DoctorSchedule, DoctorScheduleCreate, BlockedPeriod, BlockedPeriodCreate,
  AvailableSlots, DoctorOption,
} from '../types/appointment';

const scheduleService = {
  // ── Doctors list ─────────────────────────────────────────────────────
  async getDoctors(): Promise<DoctorOption[]> {
    const res = await api.get<DoctorOption[]>('/schedules/doctors');
    return res.data;
  },

  // ── Doctor schedules ─────────────────────────────────────────────────
  async getSchedules(doctorId: number): Promise<DoctorSchedule[]> {
    const res = await api.get<DoctorSchedule[]>(`/schedules/doctors/${doctorId}`);
    return res.data;
  },

  async createSchedule(doctorId: number, data: DoctorScheduleCreate): Promise<DoctorSchedule> {
    const res = await api.post<DoctorSchedule>(`/schedules/doctors/${doctorId}`, data);
    return res.data;
  },

  async bulkCreateSchedules(doctorId: number, schedules: DoctorScheduleCreate[]): Promise<DoctorSchedule[]> {
    const res = await api.post<DoctorSchedule[]>(`/schedules/doctors/${doctorId}/bulk`, {
      doctor_id: doctorId,
      schedules,
    });
    return res.data;
  },

  async updateSchedule(scheduleId: number, data: Partial<DoctorScheduleCreate>): Promise<DoctorSchedule> {
    const res = await api.put<DoctorSchedule>(`/schedules/${scheduleId}`, data);
    return res.data;
  },

  async deleteSchedule(scheduleId: number): Promise<void> {
    await api.delete(`/schedules/${scheduleId}`);
  },

  // ── Available slots ──────────────────────────────────────────────────
  async getAvailableSlots(doctorId: number, date: string): Promise<AvailableSlots> {
    const res = await api.get<AvailableSlots>('/schedules/available-slots', {
      params: { doctor_id: doctorId, date },
    });
    return res.data;
  },

  // ── Blocked periods ──────────────────────────────────────────────────
  async getBlockedPeriods(doctorId?: number): Promise<BlockedPeriod[]> {
    const res = await api.get<BlockedPeriod[]>('/schedules/blocked-periods', {
      params: doctorId ? { doctor_id: doctorId } : {},
    });
    return res.data;
  },

  async createBlockedPeriod(data: BlockedPeriodCreate): Promise<BlockedPeriod> {
    const res = await api.post<BlockedPeriod>('/schedules/block-period', data);
    return res.data;
  },

  async deleteBlockedPeriod(periodId: number): Promise<void> {
    await api.delete(`/schedules/blocked-periods/${periodId}`);
  },
};

export default scheduleService;
