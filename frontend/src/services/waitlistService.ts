import api from './api';
import type {
  WaitlistEntry,
  WaitlistCreate,
  PaginatedWaitlist,
  WaitlistStats,
  Appointment,
} from '../types/appointment';

const waitlistService = {
  /** List waitlist entries with optional filters */
  async getWaitlist(params?: {
    doctor_id?: string;
    date?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedWaitlist> {
    const res = await api.get<PaginatedWaitlist>('/waitlist', { params });
    return res.data;
  },

  /** Get a single waitlist entry */
  async getEntry(entryId: string): Promise<WaitlistEntry> {
    const res = await api.get<WaitlistEntry>(`/waitlist/${entryId}`);
    return res.data;
  },

  /** Manually add a patient to the waitlist */
  async addToWaitlist(data: WaitlistCreate): Promise<WaitlistEntry> {
    const res = await api.post<WaitlistEntry>('/waitlist', data);
    return res.data;
  },

  /** Update a waitlist entry */
  async updateEntry(entryId: string, data: Partial<{
    status: string;
    preferred_date: string;
    preferred_time: string;
    priority: string;
    reason: string;
  }>): Promise<WaitlistEntry> {
    const res = await api.patch<WaitlistEntry>(`/waitlist/${entryId}`, data);
    return res.data;
  },

  /** Cancel a waitlist entry */
  async cancelEntry(entryId: string): Promise<{ detail: string; id: string }> {
    const res = await api.delete<{ detail: string; id: string }>(`/waitlist/${entryId}`);
    return res.data;
  },

  /** Promote a waitlist entry to a real appointment (book from waitlist) */
  async bookFromWaitlist(entryId: string): Promise<Appointment & { queue_number: number; queue_position: number; waitlist_id: string }> {
    const res = await api.post(`/waitlist/${entryId}/book`);
    return res.data;
  },

  /** Get waitlist summary stats */
  async getStats(params?: { doctor_id?: string; date?: string }): Promise<WaitlistStats> {
    const res = await api.get<WaitlistStats>('/waitlist/stats/summary', { params });
    return res.data;
  },
};

export default waitlistService;
