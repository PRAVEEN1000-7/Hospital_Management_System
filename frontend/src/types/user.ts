export interface UserData {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: string[];
  reference_number?: string;
  phone_number?: string;
  phone_country_code?: string;
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
}

export interface UserCreateData {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: string;
  phone_number?: string;
  phone_country_code?: string;
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
  phone_country_code?: string;
  is_active?: boolean;
  // Doctor-specific fields
  specialization?: string;
  qualification?: string;
  registration_number?: string;
}

export interface PasswordResetData {
  new_password: string;
}
