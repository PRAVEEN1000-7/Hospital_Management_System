import api from './api';
import type { AllowanceType } from './allowanceService';

export interface PayrollAllowanceLine {
  amount: number;
  reason: string;
  allowance_type: AllowanceType;
}

export interface PayrollIncentiveLine {
  sales_amount: number;
  incentive_percent: number;
  incentive_amount: number;
}

export interface PayrollAdvanceLine {
  amount: number;
  emi_amount: number;
  this_month_deduction: number;
  remaining_after: number;
  reason: string;
}

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
  // Sum of this month's "Added to Salary" allowances — already folded into
  // net_payable below. Computed live on every fetch, so entering an
  // allowance/incentive shows up here immediately, no generate step.
  allowance_added: number;
  incentive_added: number;
  // This month's advance-payment EMI deduction(s) — already subtracted
  // from net_payable below.
  advance_deducted: number;
  net_payable: number;
  // Every allowance (both types) logged for this employee this month.
  allowances: PayrollAllowanceLine[];
  incentives: PayrollIncentiveLine[];
  advances: PayrollAdvanceLine[];
}

export interface PayrollRun {
  year: number;
  month: number;
  items: PayrollItem[];
  total_net_payable: number;
}

const payrollService = {
  getPayroll: (year: number, month: number) =>
    api.get<PayrollRun>(`/payroll/${year}/${month}`).then(res => res.data),

  getPayrollPdfUrl: async (year: number, month: number): Promise<string> => {
    const res = await api.get(`/payroll/${year}/${month}/pdf`, { responseType: 'text' });
    return res.data;
  },
};

export default payrollService;
