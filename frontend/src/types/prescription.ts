// —— Prescription Types ——————————————————————————————————————————

export type PrescriptionStatus = 'draft' | 'finalized' | 'dispensed' | 'partially_dispensed';
export type PrescriptionType = 'general' | 'optical';
export type DurationUnit = 'days' | 'weeks' | 'months';
export type MedicineRoute = 'oral' | 'topical' | 'injection' | 'inhalation' | 'sublingual' | 'rectal' | 'nasal' | 'ophthalmic' | 'otic';
export type MedicineCategory = 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops' | 'ointment' | 'inhaler' | 'powder' | 'suspension';
export type LensType = 'single_vision' | 'bifocal' | 'progressive' | 'contact';

// —— Prescription Item ——————————————————————————————————————————

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  medicine_id: string | null;
  medicine_name: string;
  generic_name: string | null;
  dosage: string;
  frequency: string;
  duration_value: number | null;
  duration_unit: DurationUnit | null;
  route: MedicineRoute | null;
  instructions: string | null;
  quantity: number | null;
  allow_substitution: boolean;
  is_dispensed: boolean;
  dispensed_quantity: number;
  display_order: number;
  created_at: string;
}

export interface PrescriptionItemCreate {
  medicine_id?: string | null;
  medicine_name: string;
  generic_name?: string | null;
  dosage: string;
  frequency: string;
  duration_value?: number | null;
  duration_unit?: DurationUnit | null;
  route?: MedicineRoute | null;
  instructions?: string | null;
  quantity?: number | null;
  allow_substitution?: boolean;
  display_order?: number;
}

// —— Prescription ———————————————————————————————————————————————

export interface Prescription {
  id: string;
  hospital_id: string;
  prescription_number: string;
  prescription_type: PrescriptionType;
  appointment_id: string | null;
  patient_id: string;
  doctor_id: string;
  diagnosis: string | null;
  clinical_notes: string | null;
  advice: string | null;
  vitals_bp: string | null;
  vitals_pulse: string | null;
  vitals_temp: string | null;
  vitals_weight: string | null;
  vitals_spo2: string | null;
  follow_up_date: string | null;
  // Optical fields
  right_sphere: string | null;
  right_cylinder: string | null;
  right_axis: string | null;
  right_add: string | null;
  right_va: string | null;
  right_ipd: string | null;
  left_sphere: string | null;
  left_cylinder: string | null;
  left_axis: string | null;
  left_add: string | null;
  left_va: string | null;
  left_ipd: string | null;
  lens_type: LensType | null;
  lens_material: string | null;
  lens_coating: string | null;
  optical_notes: string | null;
  queue_id: string | null;
  version: number;
  status: PrescriptionStatus;
  is_finalized: boolean;
  finalized_at: string | null;
  valid_until: string | null;
  created_by: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  // Enriched fields
  patient_name?: string | null;
  patient_reference_number?: string | null;
  patient_gender?: string | null;
  patient_date_of_birth?: string | null;
  patient_age?: number | null;
  patient_blood_group?: string | null;
  patient_phone?: string | null;
  patient_email?: string | null;
  patient_known_allergies?: string | null;
  patient_chronic_conditions?: string | null;
  appointment_number?: string | null;
  doctor_name?: string | null;
  items: PrescriptionItem[];
}

export interface PrescriptionListItem {
  id: string;
  prescription_number: string;
  prescription_type: PrescriptionType;
  patient_id: string;
  doctor_id: string;
  diagnosis: string | null;
  status: PrescriptionStatus;
  is_finalized: boolean;
  item_count: number;
  created_at: string;
  updated_at: string;
  patient_name?: string | null;
  patient_reference_number?: string | null;
  appointment_number?: string | null;
  doctor_name?: string | null;
}

export interface PrescriptionCreate {
  patient_id: string;
  doctor_id?: string | null;
  appointment_id?: string | null;
  prescription_type?: PrescriptionType;
  diagnosis?: string | null;
  clinical_notes?: string | null;
  advice?: string | null;
  vitals_bp?: string | null;
  vitals_pulse?: string | null;
  vitals_temp?: string | null;
  vitals_weight?: string | null;
  vitals_spo2?: string | null;
  follow_up_date?: string | null;
  // Optical fields
  right_sphere?: string | null;
  right_cylinder?: string | null;
  right_axis?: string | null;
  right_add?: string | null;
  right_va?: string | null;
  right_ipd?: string | null;
  left_sphere?: string | null;
  left_cylinder?: string | null;
  left_axis?: string | null;
  left_add?: string | null;
  left_va?: string | null;
  left_ipd?: string | null;
  lens_type?: LensType | null;
  lens_material?: string | null;
  lens_coating?: string | null;
  optical_notes?: string | null;
  queue_id?: string | null;
  valid_until?: string | null;
  items: PrescriptionItemCreate[];
}

export interface PrescriptionUpdate {
  diagnosis?: string | null;
  clinical_notes?: string | null;
  advice?: string | null;
  vitals_bp?: string | null;
  vitals_pulse?: string | null;
  vitals_temp?: string | null;
  vitals_weight?: string | null;
  vitals_spo2?: string | null;
  follow_up_date?: string | null;
  valid_until?: string | null;
  items?: PrescriptionItemCreate[] | null;
  // Optical fields
  right_sphere?: string | null;
  right_cylinder?: string | null;
  right_axis?: string | null;
  right_add?: string | null;
  right_va?: string | null;
  right_ipd?: string | null;
  left_sphere?: string | null;
  left_cylinder?: string | null;
  left_axis?: string | null;
  left_add?: string | null;
  left_va?: string | null;
  left_ipd?: string | null;
  lens_type?: LensType | null;
  lens_material?: string | null;
  lens_coating?: string | null;
  optical_notes?: string | null;
}

// —— Medicine ———————————————————————————————————————————————————

export interface Medicine {
  id: string;
  hospital_id: string;
  name: string;
  generic_name: string;
  category: MedicineCategory | null;
  manufacturer: string | null;
  composition: string | null;
  strength: string | null;
  unit_of_measure: string;
  units_per_pack: number;
  requires_prescription: boolean;
  is_controlled: boolean;
  selling_price: number;
  purchase_price: number | null;
  reorder_level: number;
  storage_instructions: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedicineCreate {
  name: string;
  generic_name: string;
  category?: MedicineCategory | null;
  manufacturer?: string | null;
  composition?: string | null;
  strength?: string | null;
  unit_of_measure?: string;
  units_per_pack?: number;
  requires_prescription?: boolean;
  is_controlled?: boolean;
  selling_price: number;
  purchase_price?: number | null;
  reorder_level?: number;
  storage_instructions?: string | null;
}

// —— Prescription Template ——————————————————————————————————————

export interface PrescriptionTemplate {
  id: string;
  doctor_id: string;
  name: string;
  diagnosis: string | null;
  items: TemplateItem[];
  advice: string | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateItem {
  medicine_name: string;
  generic_name?: string | null;
  dosage: string;
  frequency: string;
  duration_value?: number | null;
  duration_unit?: DurationUnit | null;
  route?: MedicineRoute | null;
  instructions?: string | null;
}

export interface PrescriptionTemplateCreate {
  name: string;
  diagnosis?: string | null;
  items: TemplateItem[];
  advice?: string | null;
}

// —— Prescription Version ——————————————————————————————————————

export interface PrescriptionVersion {
  id: string;
  prescription_id: string;
  version: number;
  snapshot: Record<string, unknown>;
  changed_by: string | null;
  change_reason: string | null;
  created_at: string;
}

// —— Generic Paginated (reuse pattern) ————————————————————————

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: T[];
}
