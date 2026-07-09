export interface LoginCredentials {
  username: string;
  password: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: string[];
  /** module:action:resource permission strings (e.g. "billing:read:invoice") */
  permissions: string[];
  hospital_id?: string;
  hospital_name?: string;
  hospital_code?: string;
  hospital_specialty?: string; // 'general' | 'eye_hospital' | 'multi_specialty'
  hospital_timezone?: string; // IANA timezone, e.g. "Asia/Kolkata" — display timestamps in this zone, not the browser's
  reference_number?: string;
  avatar_url?: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}
