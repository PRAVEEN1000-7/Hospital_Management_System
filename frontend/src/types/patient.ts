export interface MedicalConditionEntry {
  condition: string;
  details: string | null;
  currently_in_treatment: boolean | null;
}

export interface Patient {
  id: string;
  hospital_id: string;
  patient_reference_number: string;
  title?: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  blood_group: string | null;
  phone_country_code: string;
  phone_number: string;
  email: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  pin_code: string | null;
  country: string | null;
  age_years: number | null;
  age_months: number | null;
  marital_status: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_country_code: string | null;
  emergency_contact_relation: string | null;
  photo_url: string | null;
  known_allergies: string | null;
  chronic_conditions: string | null;
  // Fixed "Condition / History" checklist (Prescription Builder, below
  // Prescription History) — distinct from the free-text chronic_conditions
  // above; one entry per condition in MEDICAL_CONDITIONS_CHECKLIST.
  medical_conditions: MedicalConditionEntry[] | null;
  // Patient History block (BRD v1.1 §2) — eye-hospital feature pack only
  reason_for_visit: string | null;
  symptoms: string[] | null;
  blood_sugar_value: number | null;
  blood_sugar_unit: string | null;
  // Verification (BRD_OP_1 §3.2) — checkmark requires BOTH true, see
  // utils/patientVerification.ts::isPatientVerified.
  is_email_verified: boolean;
  email_verified_at: string | null;
  is_phone_verified: boolean;
  phone_verified_at: string | null;
  is_verified: boolean;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientListItem {
  id: string;
  patient_reference_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string | null;
  age_years: number | null;
  age_months: number | null;
  gender: string;
  phone_country_code: string;
  phone_number: string;
  email: string | null;
  city: string | null;
  blood_group: string | null;
  known_allergies: string | null;
  chronic_conditions: string | null;
  is_email_verified: boolean;
  is_phone_verified: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientLastVisit {
  last_visit_date: string | null;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: T[];
}

export interface PatientCreateData {
  title?: string;
  first_name: string;
  last_name: string;
  // Optional to match backend/app/schemas/patient.py's PatientBase (both are
  // Optional server-side) — Register.tsx's own form still always supplies
  // both since its UI requires them; only the bulk-upload template (which
  // must tolerate a blank cell without failing the whole row) relies on the
  // optionality here.
  date_of_birth?: string;
  gender: string;
  blood_group?: string;
  phone_country_code: string;
  phone_number: string;
  email?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  country?: string;
  age_years?: number;
  age_months?: number;
  marital_status?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_country_code?: string;
  emergency_contact_relation?: string;
  reason_for_visit?: string;
  symptoms?: string[];
  blood_sugar_value?: number;
  blood_sugar_unit?: string;
}
