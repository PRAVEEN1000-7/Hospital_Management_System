export interface UserData {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: string[];
  reference_number?: string;
  phone_number?: string;
  avatar_url?: string;
  hospital_id?: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCreateData {
  username: string;
  email: string;
  password: string;
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
}

export interface UserUpdateData {
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  phone_number?: string;
  is_active?: boolean;
}

export interface PasswordResetData {
  new_password: string;
}
