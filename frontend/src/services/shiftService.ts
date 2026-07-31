import api from './api';

export interface Shift {
  id: string;
  hospital_id: string;
  name: string;
  start_time: string;
  end_time: string;
  created_at: string | null;
  updated_at: string | null;
}

const shiftService = {
  getShifts: () => api.get<Shift[]>('/shifts').then(res => res.data),

  createShift: (data: { name: string; start_time: string; end_time: string }) =>
    api.post<Shift>('/shifts', data).then(res => res.data),

  updateShift: (id: string, data: Partial<{ name: string; start_time: string; end_time: string }>) =>
    api.put<Shift>(`/shifts/${id}`, data).then(res => res.data),

  deleteShift: (id: string) => api.delete(`/shifts/${id}`),

  assignShift: (userIds: string[], shiftId: string) =>
    api.post<{ updated: number }>('/shifts/assign', { user_ids: userIds, shift_id: shiftId }).then(res => res.data),
};

export default shiftService;
