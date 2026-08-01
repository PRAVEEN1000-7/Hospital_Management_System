export type PayrollRunStatus = 'draft' | 'processed';

export interface PayrollRun {
  id: string;
  hospital_id: string;
  period_month: number;
  period_year: number;
  status: PayrollRunStatus;
  generated_by: string;
  generated_at: string;
  payslip_count: number | null;
}

export interface PayrollRunGenerateData {
  period_month: number;
  period_year: number;
}

export interface Payslip {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  present_days: number;
  absent_days: number;
  leave_days_taken: number;
  holiday_days: number;
  lop_days: number;
  per_day_rate: number;
  deduction_amount: number;
  gross_salary: number;
  net_salary: number;
  generated_at: string;
  employee_name: string | null;
  designation: string | null;
}
