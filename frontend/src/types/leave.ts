export type LeaveStatus = 'approved' | 'pending' | 'rejected';

export interface LeaveRecord {
  id: string;
  hospital_id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: LeaveStatus;
  entered_by: string;
  created_at: string;
  employee_name: string | null;
  days_taken: number | null;
}

export interface LeaveRecordCreateData {
  employee_id: string;
  start_date: string;
  end_date: string;
  reason?: string;
  status?: LeaveStatus;
}

export interface LeaveBalance {
  id: string;
  employee_id: string;
  year: number;
  allocated: number;
  used: number;
  remaining: number;
  employee_name: string | null;
}
