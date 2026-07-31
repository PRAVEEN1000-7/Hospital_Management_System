import api from './api';

export type DayStatus = 'present' | 'absent' | 'half_day' | 'holiday' | 'festival' | 'na' | 'unmarked';

export interface AttendanceEmployeeRow {
  user_id: string;
  reference_number: string | null;
  first_name: string;
  last_name: string;
  designation: string | null;
  emp_status: 'active' | 'ex_employee';
  shift_id: string | null;
  shift_name: string | null;
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
  locked_days: number[];
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
};

export default attendanceReportService;
