// —— Prescription Types ——————————————————————————————————————————

export type PrescriptionStatus = 'draft' | 'finalized' | 'partially_dispensed' | 'dispensed';
export type DurationUnit = 'days' | 'weeks' | 'months';
export type MedicineRoute = 'oral' | 'topical' | 'injection' | 'inhalation' | 'sublingual' | 'rectal' | 'nasal' | 'ophthalmic' | 'otic';
export type MedicineCategory = 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops' | 'ointment' | 'inhaler' | 'powder' | 'suspension';
/** Eye Hospital Drug Prescription format — which eye a medicine applies to. */
export type EyeSide = 'RE' | 'LE' | 'Both';

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
  eye_side?: EyeSide | null;
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
  eye_side?: EyeSide | null;
}

// —— Prescription ———————————————————————————————————————————————

export interface Prescription {
  id: string;
  hospital_id: string;
  prescription_number: string;
  appointment_id: string | null;
  patient_id: string;
  doctor_id: string | null;
  diagnosis: string | null;
  clinical_notes: string | null;
  advice: string | null;
  vitals_bp: string | null;
  vitals_pulse: string | null;
  vitals_temp: string | null;
  vitals_weight: string | null;
  vitals_spo2: string | null;
  vitals_blood_sugar: string | null;
  follow_up_date: string | null;
  queue_id: string | null;
  institution_id: string | null;
  institution_name?: string | null;
  is_opthal: boolean | null;
  opthal_notes: string | null;
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
  consultation_invoice_id?: string | null;
  consultation_invoice_number?: string | null;
  consultation_invoice_status?: string | null;
  final_amount?: number | null;
  dispensed_at?: string | null;
  items: PrescriptionItem[];
}

export interface PrescriptionListItem {
  id: string;
  prescription_number: string;
  patient_id: string;
  doctor_id: string | null;
  appointment_id?: string | null;
  diagnosis: string | null;
  status: PrescriptionStatus;
  is_finalized: boolean;
  is_opthal?: boolean | null;
  item_count: number;
  created_at: string;
  updated_at: string;
  patient_name?: string | null;
  patient_reference_number?: string | null;
  appointment_number?: string | null;
  doctor_name?: string | null;
  // Prescription Dashboard (BRD_OP_1 §3.1)
  chief_complaint?: string | null;
  medicine_names?: string[];
  dispensed_medicine_names?: string[];
  billed_qty?: number;
  billed_cost?: number;
  is_email_verified?: boolean;
  is_phone_verified?: boolean;
  is_verified?: boolean;
}

export interface PrescriptionCreate {
  patient_id: string;
  doctor_id?: string | null;
  appointment_id?: string | null;
  diagnosis?: string | null;
  clinical_notes?: string | null;
  advice?: string | null;
  vitals_bp?: string | null;
  vitals_pulse?: string | null;
  vitals_temp?: string | null;
  vitals_weight?: string | null;
  vitals_spo2?: string | null;
  vitals_blood_sugar?: string | null;
  follow_up_date?: string | null;
  queue_id?: string | null;
  valid_until?: string | null;
  institution_id?: string | null;
  is_opthal?: boolean | null;
  opthal_notes?: string | null;
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
  vitals_blood_sugar?: string | null;
  follow_up_date?: string | null;
  valid_until?: string | null;
  institution_id?: string | null;
  is_opthal?: boolean | null;
  opthal_notes?: string | null;
  items?: PrescriptionItemCreate[] | null;
}

// Narrow, vitals-only write — backs PUT /prescriptions/draft-vitals, used by
// the nurse's Vitals entry screen (NurseVitals.tsx). No diagnosis/items/
// finalize field exists here on purpose — see PrescriptionVitalsUpdate on
// the backend.
export interface PrescriptionVitalsUpdate {
  patient_id: string;
  appointment_id: string;
  vitals_bp?: string;
  vitals_pulse?: string;
  vitals_temp?: string;
  vitals_weight?: string;
  vitals_spo2?: string;
  vitals_blood_sugar?: string;
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
  total_stock?: number | null;
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
