import api from './api';
import type { Holiday, HolidayCreateData, HolidayUpdateData, BulkWeeklyOffCreateData } from '../types/holiday';

interface HolidayListResponse {
  total: number;
  data: Holiday[];
}

const holidayService = {
  async list(dateFrom?: string, dateTo?: string): Promise<Holiday[]> {
    const res = await api.get<HolidayListResponse>('/holidays', {
      params: { date_from: dateFrom, date_to: dateTo },
    });
    return res.data.data;
  },

  async create(data: HolidayCreateData): Promise<Holiday> {
    const res = await api.post<Holiday>('/holidays', data);
    return res.data;
  },

  async update(holidayId: string, data: HolidayUpdateData): Promise<Holiday> {
    const res = await api.put<Holiday>(`/holidays/${holidayId}`, data);
    return res.data;
  },

  async remove(holidayId: string): Promise<void> {
    await api.delete(`/holidays/${holidayId}`);
  },

  async bulkCreateWeeklyOff(data: BulkWeeklyOffCreateData): Promise<Holiday[]> {
    const res = await api.post<Holiday[]>('/holidays/bulk-weekly-off', data);
    return res.data;
  },
};

export default holidayService;
