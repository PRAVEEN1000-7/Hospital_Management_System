export type EmploymentType = 'full_time' | 'part_time' | 'contract';

export interface EmployeeProfile {
  id: string;
  user_id: string;
  hospital_id: string;
  department_id: string | null;
  designation: string | null;
  date_of_joining: string | null;
  date_of_leaving: string | null;
  employment_type: EmploymentType;
  bank_account_holder_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  pf_number: string | null;
  pan_number: string | null;
  reporting_manager_id: string | null;
  paid_leave_entitlement: number;
  include_in_payroll: boolean;
  created_at: string;
  updated_at: string;
  // Enriched
  employee_name: string | null;
  department_name: string | null;
  reporting_manager_name: string | null;
}

export interface EmployeeProfileCreateData {
  user_id: string;
  department_id?: string;
  designation?: string;
  date_of_joining?: string;
  date_of_leaving?: string;
  employment_type?: EmploymentType;
  bank_account_holder_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  pf_number?: string;
  pan_number?: string;
  reporting_manager_id?: string;
  paid_leave_entitlement?: number;
  include_in_payroll?: boolean;
}

export type EmployeeProfileUpdateData = Partial<Omit<EmployeeProfileCreateData, 'user_id'>>;

export interface EmployeeSalary {
  id: string;
  employee_id: string;
  hospital_id: string;
  basic_salary: number;
  per_day_salary: number;
  flexi_allowance: number;
  pf_contribution_employee: number;
  effective_from: string;
  created_at: string;
  updated_at: string;
}

export interface EmployeeSalaryCreateData {
  basic_salary: number;
  flexi_allowance?: number;
  pf_contribution_employee?: number;
  effective_from: string;
}
