/* ═══════════════════════════════════════════════
   Pharmacy module TypeScript types
   ═══════════════════════════════════════════════ */

// ── Medicine ──
/**
 * Medicine interface aligned with backend model (models/prescription.py)
 * Backend fields: id, hospital_id, name, generic_name, category, manufacturer,
 * composition, strength, unit_of_measure, units_per_pack, hsn_code, sku, barcode,
 * requires_prescription, is_controlled, selling_price, purchase_price, tax_config_id,
 * reorder_level, max_stock_level, storage_instructions, is_active
 */
export interface Medicine {
  id: string;
  hospital_id: string;
  name: string;
  generic_name: string | null;
  category: string | null;
  manufacturer: string | null;
  composition?: string | null;
  strength: string | null;
  unit_of_measure: string;  // Changed from 'unit' to match backend
  units_per_pack?: number;
  hsn_code: string | null;
  sku: string | null;
  barcode: string | null;
  requires_prescription?: boolean;
  is_controlled?: boolean;
  selling_price?: number;
  purchase_price?: number;
  tax_config_id?: string | null;
  reorder_level?: number;
  max_stock_level?: number | null;
  storage_instructions?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  total_stock?: number | null;  // Computed via stock_map in API response
  // Legacy/optional fields for backward compatibility (may be undefined)
  brand?: string | null;
  dosage_form?: string | null;
  unit?: string;  // Legacy alias for unit_of_measure
  description?: string | null;
  schedule_type?: string | null;
  rack_location?: string | null;
  storage_conditions?: string | null;
  drug_interaction_notes?: string | null;
  side_effects?: string | null;
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
  item_type?: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_price: number | string;
  total_price: number | string;
  batch_number: string | null;
  expiry_date: string | null;
  medicine_name?: string;
  medicine_strength?: string;
  medicine_generic_name?: string;
}

export type PurchaseOrderStatus = 'draft' | 'submitted' | 'approved' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  hospital_id: string;
  supplier_id: string;
  order_number: string;
  order_date: string;
  expected_delivery: string | null;
  status: PurchaseOrderStatus;
  total_amount: number | string;
  notes: string | null;
  created_by?: string;
  submitted_by?: string;
  approved_by?: string;
  placed_by?: string;
  received_by?: string;
  created_at: string;
  updated_at: string;
  supplier_name?: string;
  supplier_contact_person?: string;
  supplier_phone?: string;
  supplier_email?: string;
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

export interface PurchaseOrderUpdateData {
  supplier_id?: string;
  expected_delivery?: string;
  notes?: string;
  items?: PurchaseOrderItemCreate[];
}

export interface PurchaseOrderReceiveItemData {
  purchase_order_item_id: string;
  quantity_received: number;
  batch_number?: string;
  manufactured_date?: string;
  expiry_date?: string;
  unit_price?: number;
  selling_price?: number;
}

export interface PurchaseOrderReceiveData {
  items: PurchaseOrderReceiveItemData[];
  notes?: string;
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
