// Laboratory module types — mirrors the backend schemas/lab.py shapes.

export interface LabTest {
  id: string;
  hospital_id: string;
  name: string;
  code: string;
  category?: string | null;
  sample_type?: string | null;
  price: number;
  unit?: string | null;
  reference_range?: string | null;
  turnaround_hours?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LabTestCreateData {
  name: string;
  code: string;
  category?: string;
  sample_type?: string;
  price: number;
  unit?: string;
  reference_range?: string;
  turnaround_hours?: number;
  is_active?: boolean;
}

export interface LabTestListResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: LabTest[];
}

export type LabResultFlag = 'normal' | 'high' | 'low' | 'abnormal';
export type LabItemStatus = 'ordered' | 'sample_collected' | 'in_progress' | 'completed' | 'cancelled';
export type LabQueueStatus = 'waiting' | 'being_served' | 'collected';

export interface LabOrderItem {
  id: string;
  lab_order_id: string;
  lab_test_id: string;
  test_name: string;
  price: number;
  status: LabItemStatus;
  result_value?: string | null;
  result_unit?: string | null;
  reference_range?: string | null;
  result_flag?: LabResultFlag | null;
  result_notes?: string | null;
  resulted_at?: string | null;
  resulted_by?: string | null;
  created_at: string;
}

export interface LabOrder {
  id: string;
  hospital_id: string;
  order_number: string;
  patient_id: string;
  doctor_id: string;
  appointment_id?: string | null;
  prescription_id?: string | null;
  notes?: string | null;
  is_finalized: boolean;
  status: string;
  queue_token?: number | null;
  queue_status?: LabQueueStatus | null;
  queue_called_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  // Enriched
  patient_name?: string | null;
  doctor_name?: string | null;
  total_amount?: number | null;
  payment_status?: string | null;
  sale_id?: string | null;
  items: LabOrderItem[];
}

export interface LabOrderCreateData {
  patient_id: string;
  doctor_id?: string;
  appointment_id?: string;
  prescription_id?: string;
  test_ids: string[];
  notes?: string;
}

export interface LabResultEntryData {
  result_value: string;
  result_unit?: string;
  reference_range?: string;
  result_flag?: LabResultFlag;
  result_notes?: string;
}

export interface LabQueueEntry {
  id: string;
  order_number: string;
  patient_name?: string | null;
  queue_token?: number | null;
  queue_status: LabQueueStatus;
  status: string;
  total_amount: number;
  payment_status: string;
  created_at: string;
  queue_called_at?: string | null;
}

export interface LabSale {
  id: string;
  hospital_id: string;
  sale_number: string;
  lab_order_id: string;
  patient_id: string;
  invoice_id?: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  amount_tendered: number;
  advance_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: string;
  created_at: string;
  updated_at?: string | null;
}

export interface LabDashboard {
  total_tests: number;
  today_orders_count: number;
  waiting_count: number;
  pending_results_count: number;
  today_revenue: number;
}

export interface PatientLabResultItem {
  id: string;
  test_name: string;
  status: LabItemStatus;
  result_value?: string | null;
  result_unit?: string | null;
  reference_range?: string | null;
  result_flag?: LabResultFlag | null;
  result_notes?: string | null;
  resulted_at?: string | null;
}

export interface PatientLabResult {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  doctor_name?: string | null;
  items: PatientLabResultItem[];
}
