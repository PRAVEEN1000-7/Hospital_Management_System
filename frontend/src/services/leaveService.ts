import api from './api';
import type { LeaveRecord, LeaveRecordCreateData, LeaveBalance } from '../types/leave';

interface LeaveRecordListResponse {
  total: number;
  data: LeaveRecord[];
}

const leaveService = {
  async list(employeeId?: string): Promise<LeaveRecord[]> {
    const res = await api.get<LeaveRecordListResponse>('/leave', { params: { employee_id: employeeId } });
    return res.data.data;
  },

  async create(data: LeaveRecordCreateData): Promise<LeaveRecord> {
    const res = await api.post<LeaveRecord>('/leave', data);
    return res.data;
  },

  async getBalance(employeeId: string, year?: number): Promise<LeaveBalance> {
    const res = await api.get<LeaveBalance>(`/leave/balance/${employeeId}`, { params: { year } });
    return res.data;
  },
};

export default leaveService;
