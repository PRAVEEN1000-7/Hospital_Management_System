/* ── Products and Stock Management types ─────────────────────────────────── */

export const PRODUCT_CATEGORIES = [
  'medicine',
  'optical',
  'surgical',
  'equipment',
  'laboratory',
  'disposable',
  'other',
] as const;

export const ALERT_TYPES = [
  'low_stock',
  'expiring_soon',
  'expired',
  'overstocked',
  'near_expiry',
] as const;

export const SEVERITY_LEVELS = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[number];
export type AlertType = typeof ALERT_TYPES[number];
export type SeverityLevel = typeof SEVERITY_LEVELS[number];

export interface Product {
  id: string;
  hospital_id: string;
  product_name: string;
  generic_name: string | null;
  brand_name: string | null;
  category: ProductCategory;
  subcategory: string | null;
  sku: string | null;
  barcode: string | null;
  manufacturer: string | null;
  supplier_id: string | null;
  purchase_price: number;
  selling_price: number;
  mrp: number;
  tax_percentage: number;
  unit_type: string;
  pack_size: number;
  min_stock_level: number;
  max_stock_level: number;
  reorder_level: number;
  storage_conditions: string | null;
  shelf_life_days: number | null;
  requires_refrigeration: boolean;
  is_hazardous: boolean;
  is_narcotic: boolean;
  requires_prescription: boolean;
  is_active: boolean;
  is_deleted: boolean;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductWithStock extends Product {
  total_stock: number;
  available_stock: number;
  reserved_stock: number;
  total_value: number;
  is_low_stock: boolean;
  is_expiring_soon: boolean;
  earliest_expiry: string | null;
}

export interface ProductCreate {
  product_name: string;
  generic_name?: string;
  brand_name?: string;
  category: ProductCategory;
  subcategory?: string;
  sku?: string;
  barcode?: string;
  manufacturer?: string;
  supplier_id?: string;
  purchase_price?: number;
  selling_price?: number;
  mrp?: number;
  tax_percentage?: number;
  unit_type?: string;
  pack_size?: number;
  min_stock_level?: number;
  max_stock_level?: number;
  reorder_level?: number;
  storage_conditions?: string;
  shelf_life_days?: number;
  requires_refrigeration?: boolean;
  is_hazardous?: boolean;
  is_narcotic?: boolean;
  requires_prescription?: boolean;
}

export interface ProductUpdate extends Partial<ProductCreate> {
  is_active?: boolean;
}

export interface StockSummary {
  id: string;
  hospital_id: string;
  product_id: string;
  product_name: string | null;
  category: string | null;
  total_stock: number;
  available_stock: number;
  reserved_stock: number;
  damaged_stock: number;
  expired_stock: number;
  total_batches: number;
  earliest_expiry: string | null;
  avg_cost_price: number;
  total_value: number;
  is_low_stock: boolean;
  is_expiring_soon: boolean;
  last_movement_at: string | null;
  updated_at: string;
}

export interface StockAlert {
  id: string;
  hospital_id: string;
  product_id: string | null;
  product_name: string | null;
  alert_type: AlertType;
  severity: SeverityLevel;
  title: string;
  message: string;
  current_stock: number | null;
  threshold_stock: number | null;
  expiry_date: string | null;
  days_until_expiry: number | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by_name: string | null;
  acknowledged_at: string | null;
  acknowledged_by_name: string | null;
  created_at: string;
}

export interface StockDashboard {
  total_products: number;
  active_products: number;
  total_stock_value: number;
  low_stock_count: number;
  expiring_soon_count: number;
  expired_count: number;
  overstocked_count: number;
  total_alerts: number;
  critical_alerts: number;
}

export interface LowStockItem {
  product_id: string;
  product_name: string;
  category: string;
  sku: string | null;
  current_stock: number;
  min_stock_level: number;
  reorder_level: number;
  purchase_price: number;
  supplier_name: string | null;
}

export interface ExpiringItem {
  product_id: string;
  product_name: string;
  category: string;
  batch_number: string | null;
  expiry_date: string;
  days_until_expiry: number;
  quantity: number;
  unit_price: number;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: T[];
}
