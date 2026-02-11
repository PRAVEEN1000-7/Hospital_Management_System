export interface Hospital {
  id?: number;
  hospital_name: string;
  hospital_code?: string;
  registration_number?: string;
  established_date?: string;
  hospital_type?: string;
  
  // Contact
  primary_phone: string;
  secondary_phone?: string;
  email: string;
  website?: string;
  emergency_hotline?: string;
  
  // Address
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  
  // Branding
  logo_path?: string;
  logo_filename?: string;
  
  // Legal & Tax
  gst_number?: string;
  pan_number?: string;
  drug_license_number?: string;
  medical_registration_number?: string;
  
  // Operations
  working_hours_start?: string;
  working_hours_end?: string;
  working_days?: string[];
  emergency_24_7?: boolean;
  
  // Metadata
  is_configured?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  updated_by?: number;
}

export interface HospitalCreate {
  hospital_name: string;
  hospital_code?: string;
  registration_number?: string;
  established_date?: string;
  hospital_type?: string;
  
  primary_phone: string;
  secondary_phone?: string;
  email: string;
  website?: string;
  emergency_hotline?: string;
  
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  
  gst_number?: string;
  pan_number?: string;
  drug_license_number?: string;
  medical_registration_number?: string;
  
  working_hours_start?: string;
  working_hours_end?: string;
  working_days?: string[];
  emergency_24_7?: boolean;
}

export interface HospitalUpdate {
  hospital_name?: string;
  hospital_code?: string;
  registration_number?: string;
  established_date?: string;
  hospital_type?: string;
  
  primary_phone?: string;
  secondary_phone?: string;
  email?: string;
  website?: string;
  emergency_hotline?: string;
  
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  pin_code?: string;
  
  gst_number?: string;
  pan_number?: string;
  drug_license_number?: string;
  medical_registration_number?: string;
  
  working_hours_start?: string;
  working_hours_end?: string;
  working_days?: string[];
  emergency_24_7?: boolean;
}

export interface HospitalStatus {
  is_configured: boolean;
  message: string;
}

export interface HospitalLogoUpload {
  logo_path: string;
  logo_filename: string;
  logo_size_kb: number;
  message: string;
}
