export interface UserData {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: string[];
  reference_number?: string;
  phone_number?: string;
  phone?: string;
  avatar_url?: string;
  hospital_id?: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  specialization?: string | null;
  qualification?: string | null;
  registration_number?: string | null;
  consultation_fee?: number | null;
  follow_up_fee?: number | null;
  analytics_enabled?: boolean | null;
  // Employee / HR fields
  designation?: string | null;
  date_of_joining?: string | null;
  date_of_leaving?: string | null;
  employment_type?: string | null;
  bank_account_holder_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_branch?: string | null;
  pf_number?: string | null;
  pan_number?: string | null;
  paid_leave_entitlement?: number | null;
  include_in_payroll?: boolean | null;
  base_salary?: number | null;
  shift_id?: string | null;
  shift_name?: string | null;
}

export interface UserCreateData {
  // Optional only because role 'staff' (attendance-only, no login) omits
  // them entirely — the backend auto-generates all three for that role.
  // Every other role must still supply them (enforced by staffCreateSchema).
  username?: string;
  email?: string;
  password?: string;
  first_name: string;
  last_name: string;
  role: string;
  phone_number?: string;
  hospital_id?: string;
  // Doctor-specific fields
  specialization?: string;
  qualification?: string;
  registration_number?: string;
  registration_authority?: string;
  experience_years?: number;
  consultation_fee?: number;
  follow_up_fee?: number;
  bio?: string;
  department_id?: string;
  analytics_enabled?: boolean;
  // Employee / HR fields — apply to every role
  designation?: string;
  date_of_joining?: string;
  date_of_leaving?: string;
  employment_type?: string;
  bank_account_holder_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  pf_number?: string;
  pan_number?: string;
  paid_leave_entitlement?: number;
  include_in_payroll?: boolean;
  base_salary?: number;
}

export interface UserUpdateData {
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  phone_number?: string;
  is_active?: boolean;
  // Doctor-specific fields
  specialization?: string;
  qualification?: string;
  registration_number?: string;
  consultation_fee?: number;
  follow_up_fee?: number;
  analytics_enabled?: boolean;
  // Employee / HR fields — apply to every role
  designation?: string;
  date_of_joining?: string;
  date_of_leaving?: string;
  employment_type?: string;
  bank_account_holder_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  pf_number?: string;
  pan_number?: string;
  paid_leave_entitlement?: number;
  include_in_payroll?: boolean;
  base_salary?: number;
}

export interface PasswordResetData {
  new_password: string;
}
