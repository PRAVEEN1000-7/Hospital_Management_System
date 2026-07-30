export type AttendanceStatus = 'not_marked' | 'present' | 'absent' | 'holiday' | 'on_leave';

export interface AttendanceRecord {
  id: string;
  hospital_id: string;
  employee_id: string;
  date: string;
  status: AttendanceStatus;
  is_verified: boolean;
  marked_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  employee_name: string | null;
}

export interface AttendanceGridResponse {
  date_from: string;
  date_to: string;
  data: AttendanceRecord[];
}

export interface AttendanceMarkData {
  employee_id: string;
  date: string;
  status: AttendanceStatus;
}

export interface AttendanceBulkMarkResult {
  updated: AttendanceRecord[];
  skipped: { employee_id: string; date: string; reason: string }[];
}
