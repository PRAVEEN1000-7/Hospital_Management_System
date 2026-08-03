import api from './api';
import type { AttendanceGridResponse, AttendanceMarkData, AttendanceBulkMarkResult, AttendanceRecord } from '../types/attendance';

const attendanceService = {
  async getGrid(dateFrom: string, dateTo: string, employeeIds?: string[]): Promise<AttendanceGridResponse> {
    const res = await api.get<AttendanceGridResponse>('/attendance/grid', {
      params: { date_from: dateFrom, date_to: dateTo, employee_ids: employeeIds?.join(',') },
    });
    return res.data;
  },

  async mark(data: AttendanceMarkData): Promise<AttendanceRecord> {
    const res = await api.post<AttendanceRecord>('/attendance/mark', data);
    return res.data;
  },

  async bulkMark(marks: AttendanceMarkData[]): Promise<AttendanceBulkMarkResult> {
    const res = await api.post<AttendanceBulkMarkResult>('/attendance/mark/bulk', { marks });
    return res.data;
  },

  async verify(dateFrom: string, dateTo: string, employeeIds?: string[]): Promise<{ verified_count: number }> {
    const res = await api.post<{ verified_count: number }>('/attendance/verify', {
      date_from: dateFrom, date_to: dateTo, employee_ids: employeeIds,
    });
    return res.data;
  },
};

export default attendanceService;
