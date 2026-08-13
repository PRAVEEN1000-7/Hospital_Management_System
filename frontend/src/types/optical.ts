/* ═══════════════════════════════════════════════
   Optical Store module TypeScript types
   ═══════════════════════════════════════════════ */

// ── Optical Product ──
export interface OpticalProduct {
  id: string;
  hospital_id: string;
  name: string;
  category: string; // 'frame' | 'lens' | 'contact_lens' | 'solution' | 'accessory'
  brand: string | null;
  model_number: string | null;
  color: string | null;
  material: string | null;
  size: string | null;
  gender: string | null;
  sku: string | null;
  barcode: string | null;
  selling_price: number;
  purchase_price: number | null;
  tax_config_id: string | null;
  reorder_level: number;
  lens_type: string | null;
  lens_index: string | null;
  lens_coating: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  total_stock?: number | null; // Computed via stock_map in API response
}

export interface OpticalProductCreateData {
  name: string;
  category: string;
  brand?: string;
  model_number?: string;
  color?: string;
  material?: string;
  size?: string;
  gender?: string;
  sku?: string;
  barcode?: string;
  selling_price?: number;
  purchase_price?: number;
  tax_config_id?: string;
  reorder_level?: number;
  lens_type?: string;
  lens_index?: string;
  lens_coating?: string;
  image_url?: string;
}

export interface OpticalProductListResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: OpticalProduct[];
}

// ── Optical Batch ──
export interface OpticalBatch {
  id: string;
  product_id: string;
  batch_number: string;
  mfg_date: string | null;
  expiry_date: string | null; // nullable — only contact lenses meaningfully expire
  quantity: number;
  purchase_price: number;
  selling_price: number;
  mrp: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_name?: string;
}

export interface OpticalBatchCreateData {
  product_id: string;
  batch_number: string;
  mfg_date?: string;
  expiry_date?: string;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  mrp?: number;
}

// ── Optical Prescription (eye prescription, not the clinical Prescription module) ──
export interface OpticalPrescription {
  id: string;
  hospital_id: string;
  prescription_number: string;
  patient_id: string;
  doctor_id: string | null;
  appointment_id: string | null;
  right_sph: number | null;
  right_cyl: number | null;
  right_axis: number | null;
  right_add: number | null;
  right_va: string | null;
  left_sph: number | null;
  left_cyl: number | null;
  left_axis: number | null;
  left_add: number | null;
  left_va: string | null;
  pd_distance: number | null;
  pd_near: number | null;
  pd_right: number | null;
  pd_left: number | null;
  notes: string | null;
  is_finalized: boolean;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
  patient_name?: string;
  doctor_name?: string;
  has_sale?: boolean | null;
}

export interface OpticalPrescriptionCreateData {
  patient_id: string;
  /** Optional — omit to resolve server-side from the logged-in doctor. */
  doctor_id?: string;
  appointment_id?: string;
  right_sph?: number;
  right_cyl?: number;
  right_axis?: number;
  right_add?: number;
  right_va?: string;
  left_sph?: number;
  left_cyl?: number;
  left_axis?: number;
  left_add?: number;
  left_va?: string;
  pd_distance?: number;
  pd_near?: number;
  pd_right?: number;
  pd_left?: number;
  notes?: string;
  valid_until?: string;
}

export interface OpticalPrescriptionListResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: OpticalPrescription[];
}

// ── Optical Sale ──
export interface OpticalSaleItem {
  id: string;
  product_id: string;
  batch_id: string | null;
  product_name: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  total_price: number;
}

export interface OpticalSale {
  id: string;
  hospital_id: string;
  invoice_number: string;
  patient_id: string;
  prescription_id: string | null;
  sale_type: string;
  status: string;
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
  queue_token: number | null;
  queue_status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  patient_name?: string | null;
  item_count?: number;
  items: OpticalSaleItem[];
}

export interface OpticalSaleItemCreate {
  product_id: string;
  batch_id?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  tax_percent?: number;
}

export interface OpticalSaleCreateData {
  patient_id: string;
  prescription_id?: string;
  sale_type?: 'new' | 'replacement' | 'repair_order';
  frame_product_id?: string;
  right_lens_product_id?: string;
  left_lens_product_id?: string;
  discount_amount?: number;
  payment_method?: string;
  amount_tendered?: number;
  advance_amount?: number;
  notes?: string;
  items: OpticalSaleItemCreate[];
}

// ── Dispensing Queue (same shape as Pharmacy's) ──
export type OpticalQueueStatus = 'waiting' | 'being_served' | 'ready' | 'collected';

export interface OpticalQueueEntry {
  id: string;
  invoice_number: string;
  patient_name: string | null;
  queue_token: number | null;
  queue_status: OpticalQueueStatus;
  total_amount: number;
  payment_status: string;
  created_at: string;
  queue_called_at: string | null;
}

export interface OpticalSaleListResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: OpticalSale[];
}

// ── Stock Adjustment ──
export interface OpticalStockAdjustment {
  id: string;
  hospital_id: string;
  item_id: string; // product_id
  batch_id: string | null;
  adjustment_type: string;
  quantity: number;
  reason: string | null;
  status: string;
  approved_by: string | null;
  created_by: string | null;
  created_at: string;
  product_name?: string;
}

export interface OpticalStockAdjustmentCreate {
  product_id: string;
  batch_id?: string;
  adjustment_type: 'increase' | 'decrease' | 'write_off' | 'damage' | 'expired' | 'correction' | 'return';
  quantity: number;
  reason?: string;
}

// ── Dashboard ──
export interface OutOfStockProductPreview {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  reorder_level: number | null;
}

export interface OpticalDashboard {
  total_products: number;
  low_stock_count: number;
  /** True count across the whole catalog — never derived from a paginated list. */
  out_of_stock_count: number;
  out_of_stock_items: OutOfStockProductPreview[];
  expiring_soon_count: number;
  expired_count: number;
  today_sales_count: number;
  today_sales_amount: number;
  pending_prescriptions: number;
}
