/* ═══════════════════════════════════════════════
   Pharmacy module TypeScript types
   ═══════════════════════════════════════════════ */

// ── Medicine ──
export interface Medicine {
  id: string;
  hospital_id: string;
  name: string;
  generic_name: string | null;
  brand: string | null;
  category: string | null;
  dosage_form: string | null;
  strength: string | null;
  manufacturer: string | null;
  hsn_code: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string;
  description: string | null;
  requires_prescription: boolean;
  schedule_type: string | null;
  rack_location: string | null;
  reorder_level: number;
  max_stock_level: number | null;
  storage_conditions: string | null;
  drug_interaction_notes: string | null;
  side_effects: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  total_stock?: number | null;
}

export interface MedicineCreateData {
  name: string;
  generic_name?: string;
  brand?: string;
  category?: string;
  dosage_form?: string;
  strength?: string;
  manufacturer?: string;
  hsn_code?: string;
  sku?: string;
  barcode?: string;
  unit?: string;
  description?: string;
  requires_prescription?: boolean;
  schedule_type?: string;
  rack_location?: string;
  reorder_level?: number;
  max_stock_level?: number;
  storage_conditions?: string;
  drug_interaction_notes?: string;
  side_effects?: string;
}

export interface MedicineListResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: Medicine[];
}

// ── Batch ──
export interface MedicineBatch {
  id: string;
  medicine_id: string;
  batch_number: string;
  mfg_date: string | null;
  expiry_date: string;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  mrp: number | null;
  tax_percent: number;
  discount_percent: number;
  location: string | null;
  supplier_id: string | null;
  purchase_order_id: string | null;
  received_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  medicine_name?: string;
  supplier_name?: string;
}

export interface BatchCreateData {
  medicine_id: string;
  batch_number: string;
  mfg_date?: string;
  expiry_date: string;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  mrp?: number;
  tax_percent?: number;
  discount_percent?: number;
  location?: string;
  supplier_id?: string;
}

// ── Supplier ──
export interface Supplier {
  id: string;
  hospital_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  drug_license_number: string | null;
  payment_terms: string | null;
  credit_limit: number | null;
  lead_time_days: number | null;
  website: string | null;
  pan_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierCreateData {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  gst_number?: string;
  drug_license_number?: string;
  payment_terms?: string;
  credit_limit?: number;
  lead_time_days?: number;
  website?: string;
  pan_number?: string;
}

export interface SupplierListResponse {
  total: number;
  data: Supplier[];
}

// ── Purchase Order ──
export interface PurchaseOrderItem {
  id: string;
  medicine_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_price: number;
  total_price: number;
  batch_number: string | null;
  expiry_date: string | null;
  medicine_name?: string;
}

export interface PurchaseOrder {
  id: string;
  hospital_id: string;
  supplier_id: string;
  order_number: string;
  order_date: string;
  expected_delivery: string | null;
  status: string;
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  supplier_name?: string;
  items: PurchaseOrderItem[];
}

export interface PurchaseOrderItemCreate {
  medicine_id: string;
  quantity_ordered: number;
  unit_price: number;
  batch_number?: string;
  expiry_date?: string;
}

export interface PurchaseOrderCreateData {
  supplier_id: string;
  expected_delivery?: string;
  notes?: string;
  items: PurchaseOrderItemCreate[];
}

export interface PurchaseOrderListResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: PurchaseOrder[];
}

// ── Sale ──
export interface SaleItem {
  id: string;
  medicine_id: string;
  batch_id: string | null;
  medicine_name: string;
  batch_number: string | null;
  mfg_date: string | null;
  expiry_date: string | null;
  mrp: number | null;
  supplier_name: string | null;
  quantity: number;
  unit_price: number;
  dosage_instructions: string | null;
  duration_days: number | null;
  discount_percent: number;
  tax_percent: number;
  total_price: number;
}

export interface Sale {
  id: string;
  hospital_id: string;
  invoice_number: string;
  sale_date: string;
  patient_id: string | null;
  patient_name: string | null;
  doctor_name: string | null;
  prescription_number: string | null;
  prescription_date: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: SaleItem[];
}

export interface SaleItemCreate {
  medicine_id: string;
  batch_id?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  tax_percent?: number;
  dosage_instructions?: string;
  duration_days?: number;
}

export interface SaleCreateData {
  patient_id?: string;
  patient_name?: string;
  doctor_name?: string;
  prescription_number?: string;
  prescription_date?: string;
  discount_amount?: number;
  payment_method?: string;
  notes?: string;
  items: SaleItemCreate[];
}

export interface SaleListResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: Sale[];
}

// ── Stock Adjustment ──
export interface StockAdjustment {
  id: string;
  hospital_id: string;
  medicine_id: string;
  batch_id: string | null;
  adjustment_type: string;
  quantity: number;
  reason: string | null;
  adjusted_by: string | null;
  created_at: string;
  medicine_name?: string;
}

export interface StockAdjustmentCreate {
  medicine_id: string;
  batch_id?: string;
  adjustment_type: 'damage' | 'expired' | 'correction' | 'return';
  quantity: number;
  reason?: string;
}

// ── Dashboard ──
export interface PharmacyDashboard {
  total_medicines: number;
  low_stock_count: number;
  expiring_soon_count: number;
  expired_count: number;
  today_sales_count: number;
  today_sales_amount: number;
  pending_orders: number;
}
