export interface UserData {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCreateData {
  username: string;
  email: string;
  password: string;
  full_name: string;
  role: string;
}

export interface UserUpdateData {
  email?: string;
  full_name?: string;
  role?: string;
  is_active?: boolean;
}

export interface PasswordResetData {
  new_password: string;
}
