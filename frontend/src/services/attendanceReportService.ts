import api from './api';

export type DayStatus = 'present' | 'absent' | 'half_day' | 'holiday' | 'festival' | 'na' | 'unmarked';

export interface AttendanceEmployeeRow {
  user_id: string;
  reference_number: string | null;
  first_name: string;
  last_name: string;
  designation: string | null;
  // 'inactive' never actually reaches the frontend — the backend excludes
  // deactivated employees from this report entirely (see
  // attendance_service.get_month_report / User.employment_status) — but the
  // full type is kept here so callers don't silently mishandle it if that
  // filter ever moves.
  emp_status: 'active' | 'notice_period' | 'relieved' | 'inactive';
  date_of_joining: string | null;
  date_of_leaving: string | null;
  // Days worked per shift name this month, e.g. { "Day Shift": 12, "Night Shift": 10 } —
  // an employee can appear under more than one shift because of weekly rotation.
  shift_days: Record<string, number>;
  days: DayStatus[];
  present_count: number;
  absent_count: number;
  half_day_count: number;
  holiday_count: number;
  festival_count: number;
  na_count: number;
  unmarked_count: number;
  paid_leave_entitlement: number;
  working_days: number;
  per_day_salary: number;
  deduction_days: number;
  deduction_amount: number;
}

export interface AttendanceReport {
  year: number;
  month: number;
  total_days: number;
  shifts: { id: string; name: string }[];
  employees: AttendanceEmployeeRow[];
  summary: { present: number; absent: number; half_day: number; holiday: number; festival: number; na: number; unmarked: number };
  // Headcount per shift name for this month (e.g. { "Day Shift": 6, "Night Shift": 2 }),
  // resolved as of month-end so a later reassignment doesn't change past reports.
  shift_summary: Record<string, number>;
}

export interface LeaveRecord {
  user_id: string;
  reference_number: string | null;
  first_name: string;
  last_name: string;
  designation: string | null;
  shift_name: string | null;
  date: string;
  status: 'absent' | 'half_day';
  reason: string | null;
}

const attendanceReportService = {
  getReport: (year: number, month: number, shiftId?: string) =>
    api
      .get<AttendanceReport>('/attendance-records/report', {
        params: { year, month, shift_id: shiftId || undefined },
      })
      .then(res => res.data),

  markDay: (userId: string, isoDate: string, status: 'present' | 'absent' | 'half_day', reason?: string) =>
    api.put(`/attendance-records/${userId}/${isoDate}`, { status, reason: reason || undefined }),

  getLeaves: (year: number, month: number, shiftId?: string) =>
    api
      .get<LeaveRecord[]>('/attendance-records/leaves', {
        params: { year, month, shift_id: shiftId || undefined },
      })
      .then(res => res.data),

  getReportPdfUrl: async (year: number, month: number, shiftId?: string): Promise<string> => {
    const res = await api.get('/attendance-records/report/pdf', {
      params: { year, month, shift_id: shiftId || undefined },
      responseType: 'text',
    });
    return res.data;
  },

  getMarkingPdfUrl: async (
    year: number, month: number, shiftId?: string, fromDay?: number, toDay?: number,
  ): Promise<string> => {
    const res = await api.get('/attendance-records/marking-pdf', {
      params: { year, month, shift_id: shiftId || undefined, from_day: fromDay, to_day: toDay },
      responseType: 'text',
    });
    return res.data;
  },

  getLeavesPdfUrl: async (year: number, month: number, shiftId?: string): Promise<string> => {
    const res = await api.get('/attendance-records/leaves/pdf', {
      params: { year, month, shift_id: shiftId || undefined },
      responseType: 'text',
    });
    return res.data;
  },

  getAnnualReportPdfUrl: async (year: number): Promise<string> => {
    const res = await api.get('/attendance-records/annual-report/pdf', {
      params: { year },
      responseType: 'text',
    });
    return res.data;
  },
};

export default attendanceReportService;
