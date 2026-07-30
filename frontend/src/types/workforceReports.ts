export interface DailyAttendanceCountRow {
  date: string;
  present: number;
  absent: number;
  on_leave: number;
  holiday: number;
  not_marked: number;
}

export interface AbsenteeReportRow {
  employee_id: string;
  employee_name: string | null;
  absent_days: number;
  dates: string[];
}

export interface VerifiedAttendanceRow {
  employee_id: string;
  employee_name: string | null;
  date: string;
  status: string;
  verified_at: string | null;
}

export interface LopReportRow {
  employee_id: string;
  employee_name: string | null;
  year: number;
  allocated: number;
  leave_taken: number;
  lop_days: number;
}

export interface PaidLeaveBalanceRow {
  employee_id: string;
  employee_name: string | null;
  year: number;
  allocated: number;
  used: number;
  remaining: number;
}

export interface HeadcountReport {
  total: number;
  by_department: { department: string; count: number }[];
  by_employment_type: { employment_type: string; count: number }[];
}

export interface WorkforceReportsFilters {
  dateFrom: string;
  dateTo: string;
  year: number;
}
