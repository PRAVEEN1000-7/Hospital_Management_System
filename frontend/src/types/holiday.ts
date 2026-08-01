export type HolidayType = 'festival' | 'weekly_off' | 'other';

export interface Holiday {
  id: string;
  hospital_id: string;
  date: string;
  name: string;
  type: HolidayType;
  created_at: string;
}

export interface HolidayCreateData {
  date: string;
  name: string;
  type?: HolidayType;
}

export type HolidayUpdateData = Partial<HolidayCreateData>;

export interface BulkWeeklyOffCreateData {
  year: number;
  /** 0=Monday .. 6=Sunday, matches Python date.weekday() */
  weekday: number;
  name?: string;
}
