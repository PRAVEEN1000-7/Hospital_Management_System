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

export type ModuleStatus = 'live' | 'development' | 'coming_soon';

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
  avg_consultation_time: number;   // minutes
  rating: number;                  // 0-5
  revenue: number;
}

// ── Pharmacy ─────────────────────────────────────────────────────────────

export interface PharmacySales {
  date: string;
  sales: number;
  prescriptions_filled: number;
}

export interface TopSellingMedicine {
  name: string;
  quantity_sold: number;
  revenue: number;
  category: string;
}

// ── Optical ──────────────────────────────────────────────────────────────

export interface OpticalSales {
  date: string;
  frames: number;
  lenses: number;
  contact_lenses: number;
  total: number;
}

// ── Inventory ────────────────────────────────────────────────────────────

export interface StockStatus {
  item_name: string;
  category: string;
  current_stock: number;
  min_stock: number;
  max_stock: number;
  status: 'ok' | 'low' | 'critical' | 'overstock';
  last_restock_date: string;
}

export interface InventoryAging {
  range: string;          // "0-30 days", "31-60 days", etc.
  item_count: number;
  value: number;
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

// ── Export / Scheduling ──────────────────────────────────────────────────

export type ExportFormat = 'pdf' | 'csv' | 'xlsx';

export interface ExportPayload {
  report_type: string;
  format: ExportFormat;
  filters: DashboardFilters;
}

export interface SchedulePayload {
  report_type: string;
  format: ExportFormat;
  frequency: 'daily' | 'weekly' | 'monthly';
  email: string;
  filters: DashboardFilters;
}

export interface ScheduledReport {
  id: string;
  report_type: string;
  format: ExportFormat;
  frequency: 'daily' | 'weekly' | 'monthly';
  email: string;
  next_run: string;     // ISO datetime
  is_active: boolean;
  created_at: string;
}

// ── Generic API response wrapper ─────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  status: 'success' | 'error';
  message?: string;
}
