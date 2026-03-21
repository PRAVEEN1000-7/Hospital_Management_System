/* ── Inventory module types ─────────────────────────────────────────────── */

// Valid product categories for suppliers
export const VALID_PRODUCT_CATEGORIES = [
  'medicine',
  'optical',
  'surgical',
  'equipment',
  'laboratory',
  'disposable',
  'other',
] as const;

export type ProductCategory = typeof VALID_PRODUCT_CATEGORIES[number];

export interface Supplier {
  id: string;
  name: string;
  code: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  payment_terms: string | null;
  lead_time_days: number | null;
  rating: number | null;
  product_categories: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierCreate {
  name: string;
  code: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_id?: string;
  payment_terms?: string;
  lead_time_days?: number;
  rating?: number;
  product_categories?: string[];
}

export interface SupplierUpdate {
  name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_id?: string;
  payment_terms?: string;
  lead_time_days?: number;
  rating?: number;
  is_active?: boolean;
  product_categories?: string[];
}

/* ── Purchase Orders ───────────────────────────────────────────────────── */

export interface PurchaseOrderItem {
  id: string;
  item_type: string;
  item_id: string;
  item_name: string | null;
  quantity_ordered: number;
  quantity_received: number;
  unit_price: number;
  total_price: number;
}

export interface PurchaseOrderItemCreate {
  item_type: string;
  item_id: string;
  item_name?: string;
  quantity_ordered: number;
  unit_price: number;
  total_price: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string | null;
  order_date: string;
  expected_delivery_date: string | null;
  status: string;
  total_amount: number;
  tax_amount: number;
  notes: string | null;
  items: PurchaseOrderItem[];
  created_by_name: string | null;
  approved_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderCreate {
  supplier_id: string;
  order_date: string;
  expected_delivery_date?: string;
  status?: string;
  notes?: string;
  items: PurchaseOrderItemCreate[];
}

/* ── GRN ───────────────────────────────────────────────────────────────── */

export interface GRNItem {
  id: string;
  item_type: string;
  item_id: string;
  item_name: string | null;
  batch_number: string | null;
  manufactured_date: string | null;
  expiry_date: string | null;
  quantity_received: number;
  quantity_accepted: number | null;
  quantity_rejected: number;
  unit_price: number;
  total_price: number;
  rejection_reason: string | null;
}

export interface GRNItemCreate {
  item_type: string;
  item_id?: string;
  item_name?: string;
  batch_number?: string;
  manufactured_date?: string;
  expiry_date?: string;
  quantity_received: number;
  quantity_accepted?: number;
  quantity_rejected?: number;
  unit_price: number;
  total_price: number;
  rejection_reason?: string;
}

export interface GoodsReceiptNote {
  id: string;
  grn_number: string;
  purchase_order_id: string | null;
  po_number: string | null;
  supplier_id: string;
  supplier_name: string | null;
  receipt_date: string;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number;
  status: string;
  notes: string | null;
  items: GRNItem[];
  created_by_name: string | null;
  verified_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface GRNCreate {
  purchase_order_id?: string;
  supplier_id: string;
  receipt_date: string;
  invoice_number?: string;
  invoice_date?: string;
  notes?: string;
  items: GRNItemCreate[];
}

/* ── Stock Movement ────────────────────────────────────────────────────── */

export interface StockMovement {
  id: string;
  item_type: string;
  item_id: string;
  item_name: string | null;
  batch_id: string | null;
  movement_type: string;
  reference_type: string | null;
  reference_id: string | null;
  quantity: number;
  balance_after: number;
  unit_cost: number | null;
  notes: string | null;
  performed_by_name: string | null;
  created_at: string;
}

/* ── Stock Adjustment ──────────────────────────────────────────────────── */

export interface StockAdjustment {
  id: string;
  adjustment_number: string;
  item_type: string;
  item_id: string;
  item_name: string | null;
  batch_id: string | null;
  adjustment_type: string;
  quantity: number;
  reason: string;
  status: string;
  approved_by_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface StockAdjustmentCreate {
  item_type: string;
  item_id: string;
  batch_id?: string;
  adjustment_type: string;
  quantity: number;
  reason: string;
}

/* ── Cycle Count ───────────────────────────────────────────────────────── */

export interface CycleCountItem {
  id: string;
  item_type: string;
  item_id: string;
  item_name: string | null;
  batch_id: string | null;
  system_quantity: number;
  counted_quantity: number;
  variance: number;
  variance_reason: string | null;
}

export interface CycleCountItemCreate {
  item_type: string;
  item_id: string;
  item_name?: string;
  batch_id?: string;
  system_quantity: number;
  counted_quantity: number;
  variance_reason?: string;
}

export interface CycleCount {
  id: string;
  count_number: string;
  count_date: string;
  status: string;
  notes: string | null;
  items: CycleCountItem[];
  counted_by_name: string | null;
  verified_by_name: string | null;
  created_at: string;
}

export interface CycleCountCreate {
  count_date: string;
  notes?: string;
  items: CycleCountItemCreate[];
}

/* ── Low Stock / Expiring ──────────────────────────────────────────────── */

export interface LowStockItem {
  item_id: string;
  item_type: string;
  item_name: string;
  current_stock: number;
  reorder_level: number;
  max_stock_level?: number | null;
  purchase_price?: number | null;
}

export interface ExpiringItem {
  item_id: string;
  item_type: string;
  item_name: string | null;
  batch_number: string | null;
  expiry_date: string;
  quantity: number;
}

export interface InventoryDashboardData {
  total_suppliers: number;
  active_purchase_orders: number;
  pending_grns: number;
  pending_adjustments: number;
  low_stock_items: LowStockItem[];
  expiring_items: ExpiringItem[];
  low_stock_count: number;
  expiring_count: number;
}

/* ── Paginated Response ────────────────────────────────────────────────── */

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: T[];
}
