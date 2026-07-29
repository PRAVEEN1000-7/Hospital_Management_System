// ── Analytics Dashboard Types ─────────────────────────────────────────────

// ── Filters ──────────────────────────────────────────────────────────────

export type PeriodPreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface DashboardFilters {
  period: PeriodPreset;
  dateFrom: string;    // ISO date
  dateTo: string;      // ISO date
  departmentId?: string;
  doctorId?: string;
}

// ── Module Status ────────────────────────────────────────────────────────

// 'coming_soon' was defined but never actually used by any panel — dropped.
export type ModuleStatus = 'live' | 'development';

export interface ModuleConfig {
  key: string;
  label: string;
  status: ModuleStatus;
  description?: string;
}

// ── KPI / Dashboard Summary ──────────────────────────────────────────────

export interface DashboardSummary {
  total_revenue: number;
  opd_patients_today: number;
  pending_prescriptions: number;
  low_stock_items: number;
  outstanding_dues: number;
  revenue_change_pct: number;       // vs previous period
  opd_change_pct: number;
  prescriptions_change_pct: number;
  stock_change_pct: number;
  dues_change_pct: number;
}

// ── Revenue ──────────────────────────────────────────────────────────────

export interface DailyRevenue {
  date: string;
  opd: number;
  pharmacy: number;
  optical: number;
  total: number;
}

export interface MonthlyRevenue {
  month: string;       // "Jan", "Feb", ...
  opd: number;
  pharmacy: number;
  optical: number;
  total: number;
}

export interface DepartmentRevenue {
  department: string;
  revenue: number;
  percentage: number;
  color: string;
}

// ── OPD ──────────────────────────────────────────────────────────────────

export interface OPDSummary {
  total_today: number;
  walk_ins: number;
  scheduled: number;
  emergency: number;
  follow_ups: number;
  avg_wait_time: number;       // minutes
  completion_rate: number;     // 0-100
}

export interface DoctorWiseReport {
  doctor_id: string;
  doctor_name: string;
  department: string | null;
  specialization: string | null;
  patients_seen: number;
  avg_consultation_time: number;   // minutes — real, from consultation_start_at/end_at
  revenue: number;                 // real — collected payments against this doctor's appointments
}

// ── Pharmacy ─────────────────────────────────────────────────────────────

export interface PharmacySales {
  date: string;
  sales: number;
  prescriptions_filled: number;
}

export interface TopSellingMedicine {
  name: string;
  medicine_id: string;
  quantity_sold: number;
  revenue: number;
  category: string;
}

export interface PharmacyDashboard {
  total_medicines: number;
  low_stock_count: number;
  expiring_soon_count: number;
  expired_count: number;
  today_sales_count: number;
  today_sales_amount: number;
  pending_orders: number;
}

// ── Optical ──────────────────────────────────────────────────────────────
// Matches the real GET /optical/analytics/sales-trend response exactly —
// this endpoint doesn't break sales down by frames/lenses/contact-lenses
// (that granularity isn't tracked anywhere), so this is a total, not a
// per-category series.

export interface OpticalSales {
  date: string;
  total_sales: number;
  orders_count: number;
}

// ── Inventory ────────────────────────────────────────────────────────────

export interface StockStatus {
  item_name: string;
  item_id: string;
  category: string;
  current_stock: number;
  min_stock: number;
  max_stock: number;
  status: 'ok' | 'low' | 'critical' | 'overstock';
  last_restock_date: string | null;
}

export interface InventoryAging {
  range: string;          // "0-30 days", "31-60 days", etc.
  item_count: number;
  value: number;
}

export interface InventoryDashboard {
  total_suppliers: number;
  active_purchase_orders: number;
  pending_grns: number;
  pending_adjustments: number;
  low_stock_items: any[];
  expiring_items: any[];
  low_stock_count: number;
  expiring_count: number;
}

// ── Financial ────────────────────────────────────────────────────────────

export interface CollectionReport {
  method: string;          // "Cash", "Card", "UPI", "Insurance"
  amount: number;
  percentage: number;
  color: string;
}

export interface OutstandingDues {
  age_bracket: string;     // "0-30 days", "31-60 days", etc.
  amount: number;
  count: number;
}

export interface TaxSummary {
  tax_type: string;        // "CGST", "SGST", "IGST"
  taxable_amount: number;
  tax_amount: number;
  total: number;
}

// BRD-001 — real (not mocked) payment-status summary, from
// GET /invoices/stats/payment-status-summary.
export interface PaymentStatusBucketSummary {
  count: number;
  total_amount: number;
}

export interface PaymentStatusSummary {
  not_paid: PaymentStatusBucketSummary;
  partially_paid: PaymentStatusBucketSummary;
  paid: PaymentStatusBucketSummary;
}

// ── Generic API response wrapper ─────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  status: 'success' | 'error';
  message?: string;
}
