export interface Patient {
  id: number;
  prn: string;
  title: string;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  blood_group: string | null;
  country_code: string;
  mobile_number: string;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pin_code: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_country_code: string | null;
  emergency_contact_mobile: string | null;
  emergency_contact_relationship: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface PatientListItem {
  id: number;
  prn: string;
  title: string;
  first_name: string;
  last_name: string;
  full_name: string;
  gender: string;
  country_code: string;
  mobile_number: string;
  email: string | null;
  city: string | null;
  blood_group: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: T[];
}

export interface PatientCreateData {
  title: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
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
}
