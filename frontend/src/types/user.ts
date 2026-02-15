export interface UserData {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  role: string;
  employee_id?: string;
  department?: string;
  phone_number?: string;
  photo_url?: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCreateData {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  role: string;
  employee_id?: string;
  department?: string;
  phone_number?: string;
}

export interface UserUpdateData {
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  role?: string;
  employee_id?: string;
  department?: string;
  phone_number?: string;
  is_active?: boolean;
}

export interface PasswordResetData {
  new_password: string;
}
