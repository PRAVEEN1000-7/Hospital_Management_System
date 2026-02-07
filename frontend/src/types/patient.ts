export interface Patient {
  id?: number;
  prn?: string;
  title: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'Male' | 'Female' | 'Other';
  blood_group?: string;
  country_code: string;
  mobile_number: string;
  email?: string;
  address_line1: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  country?: string;
  emergency_contact_name?: string;
  emergency_contact_country_code?: string;
  emergency_contact_mobile?: string;
  emergency_contact_relationship?: string;
  photo_url?: string;
  full_name?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PatientListItem {
  id: number;
  prn: string;
  title: string;
  first_name: string;
  last_name: string;
  country_code: string;
  mobile_number: string;
  email?: string;
  city?: string;
  blood_group?: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: T[];
}
