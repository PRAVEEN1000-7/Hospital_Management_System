import api from './api';
import type { Shift, ShiftCreateData, ShiftUpdateData, ShiftAssignment, ShiftAssignmentCreateData } from '../types/shift';

interface ShiftListResponse {
  total: number;
  data: Shift[];
}

const shiftService = {
  async list(): Promise<Shift[]> {
    const res = await api.get<ShiftListResponse>('/shifts');
    return res.data.data;
  },

  async create(data: ShiftCreateData): Promise<Shift> {
    const res = await api.post<Shift>('/shifts', data);
    return res.data;
  },

  async update(shiftId: string, data: ShiftUpdateData): Promise<Shift> {
    const res = await api.put<Shift>(`/shifts/${shiftId}`, data);
    return res.data;
  },

  async remove(shiftId: string): Promise<void> {
    await api.delete(`/shifts/${shiftId}`);
  },

  async listAssignments(employeeId?: string): Promise<ShiftAssignment[]> {
    const res = await api.get<ShiftAssignment[]>('/shifts/assignments', { params: { employee_id: employeeId } });
    return res.data;
  },

  async createAssignment(data: ShiftAssignmentCreateData): Promise<ShiftAssignment> {
    const res = await api.post<ShiftAssignment>('/shifts/assignments', data);
    return res.data;
  },
};

export default shiftService;
