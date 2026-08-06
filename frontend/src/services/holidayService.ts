import api from './api';

export interface HolidayMonth {
  hospital_id: string;
  year: number;
  month: number;
  holiday_days: number[];
  festival_days: number[];
  working_days: number;
  total_days: number;
  created_at: string | null;
  updated_at: string | null;
}

const holidayService = {
  getMonth: (year: number, month: number) =>
    api.get<HolidayMonth>(`/holidays/${year}/${month}`).then(res => res.data),

  getYear: (year: number) =>
    api.get<HolidayMonth[]>(`/holidays/${year}`).then(res => res.data),

  saveMonth: (year: number, month: number, holiday_days: number[], festival_days: number[]) =>
    api.put<HolidayMonth>(`/holidays/${year}/${month}`, { holiday_days, festival_days }).then(res => res.data),
};

export default holidayService;
