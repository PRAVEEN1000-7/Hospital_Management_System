export interface DoctorProfile {
  id: string;
  user_id: string;
  hospital_id: string;
  department_id: string | null;
  employee_id: string | null;
  specialization: string;
  qualification: string;
  registration_number: string;
  registration_authority: string | null;
  experience_years: number | null;
  bio: string | null;
  consultation_fee: number | null;
  follow_up_fee: number | null;
  is_available: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Enriched
  doctor_name: string | null;
  department_name: string | null;
}
