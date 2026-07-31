import api from './api';

export interface PayrollItem {
  user_id: string;
  reference_number: string | null;
  first_name: string;
  last_name: string;
  designation: string | null;
  present_count: number;
  absent_count: number;
  paid_leave_entitlement: number;
  working_days: number;
  base_salary: number;
  per_day_salary: number;
  deduction_days: number;
  deduction_amount: number;
  net_payable: number;
}

export interface PayrollRun {
  year: number;
  month: number;
  generated_at: string | null;
  items: PayrollItem[];
  total_net_payable: number;
}

const payrollService = {
  getPayroll: (year: number, month: number) =>
    api.get<PayrollRun>(`/payroll/${year}/${month}`).then(res => res.data),

  generatePayroll: (year: number, month: number) =>
    api.post<PayrollRun>(`/payroll/${year}/${month}/generate`).then(res => res.data),
};

export default payrollService;
