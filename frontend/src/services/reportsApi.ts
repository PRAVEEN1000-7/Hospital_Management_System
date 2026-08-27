/**
 * Reports / Analytics API service — every function here now calls a real
 * backend endpoint. (Previously some panels rendered mock/random data behind
 * a "development" banner; see the 29-Jul-2026 Analytics cleanup.)
 */
import api from './api';
import appointmentService from './appointmentService';
import type { EnhancedAppointmentStats } from '../types/appointment';
import type {
  DashboardFilters,
  DashboardSummary,
  DailyRevenue,
  MonthlyRevenue,
  DepartmentRevenue,
  OPDSummary,
  DoctorWiseReport,
  PharmacySales,
  TopSellingMedicine,
  OpticalSales,
  StockStatus,
  StockStatusSummary,
  InventoryAging,
  CollectionReport,
  OutstandingDues,
  TaxSummary,
  PharmacyDashboard,
  InventoryDashboard,
  PaymentStatusSummary,
} from '../types/analytics.types';

const warn = (panel: string) =>
  console.warn(`[HMS Analytics] ${panel}: API unreachable, showing empty state`);

// ── LIVE: Dashboard Summary (built from real endpoints) ──────────────────

async function getDashboardSummary(
  filters: DashboardFilters,
): Promise<DashboardSummary> {
  const revenue = await api.get('/invoices/stats/revenue-summary', {
    params: { date_from: filters.dateFrom, date_to: filters.dateTo },
  }).then((r) => r.data).catch(() => {
    warn('DashboardSummary (revenue)');
    return { total_revenue: 0, revenue_change_pct: 0, outstanding_dues: 0, dues_change_pct: 0 };
  });

  return {
    total_revenue: revenue.total_revenue,
    revenue_change_pct: revenue.revenue_change_pct,
    // OPD Patients Today is fetched directly by KPIStrip, always scoped to
    // literally today — it used to be computed here from this same
    // period-filtered `stats` (7d/30d/90d/custom), which showed under a
    // "Today" label regardless of the selected period. Left at 0 here since
    // nothing reads them from DashboardSummary anymore.
    opd_patients_today: 0,
    opd_change_pct: 0,
    // Pending Rx / Low Stock are read directly from usePharmacyDashboard /
    // useInventoryDashboard by KPIStrip, not from this object — left at 0
    // here since nothing reads them from DashboardSummary anymore.
    pending_prescriptions: 0,
    prescriptions_change_pct: 0,
    low_stock_items: 0,
    stock_change_pct: 0,
    outstanding_dues: revenue.outstanding_dues,
    dues_change_pct: revenue.dues_change_pct,
  };
}

// ── LIVE: OPD Summary ────────────────────────────────────────────────────

async function getOPDSummary(
  filters: DashboardFilters,
): Promise<OPDSummary> {
  try {
    const stats = await appointmentService.getStats(
      filters.dateFrom,
      filters.dateTo,
    );

    return {
      total_today: stats.total_appointments,
      walk_ins: stats.total_walk_ins,
      scheduled: stats.total_scheduled,
      emergency: 0,
      follow_ups: 0,
      avg_wait_time: stats.average_wait_time,
      completion_rate: stats.completion_rate,
    };
  } catch {
    warn('OPDSummary (fallback)');
    return {
      total_today: 0,
      walk_ins: 0,
      scheduled: 0,
      emergency: 0,
      follow_ups: 0,
      avg_wait_time: 0,
      completion_rate: 0,
    };
  }
}

// ── LIVE: Doctor-wise Report ─────────────────────────────────────────────

async function getDoctorWiseReport(
  filters: DashboardFilters,
): Promise<DoctorWiseReport[]> {
  try {
    const enhanced: EnhancedAppointmentStats =
      await appointmentService.getEnhancedStats(filters.dateFrom, filters.dateTo);

    return enhanced.doctor_utilization.map((d) => ({
      doctor_id: d.doctor_id,
      doctor_name: d.doctor_name,
      department: d.department,
      specialization: d.specialization,
      patients_seen: d.completed,
      avg_consultation_time: d.avg_consultation_minutes,
      revenue: d.revenue,
    }));
  } catch {
    warn('DoctorWiseReport (fallback)');
    return [];
  }
}

// ── LIVE: Revenue (RevenuePanel — real, period-scoped) ──────────────────────

async function getDailyRevenue(filters: DashboardFilters): Promise<DailyRevenue[]> {
  const res = await api.get<DailyRevenue[]>('/invoices/stats/revenue-trend', {
    params: { granularity: 'daily', date_from: filters.dateFrom, date_to: filters.dateTo },
  });
  return res.data;
}

async function getMonthlyRevenue(filters: DashboardFilters): Promise<MonthlyRevenue[]> {
  const res = await api.get<MonthlyRevenue[]>('/invoices/stats/revenue-trend', {
    params: { granularity: 'monthly', date_from: filters.dateFrom, date_to: filters.dateTo },
  });
  return res.data;
}

async function getDepartmentRevenue(filters: DashboardFilters): Promise<DepartmentRevenue[]> {
  const res = await api.get<DepartmentRevenue[]>('/invoices/stats/revenue-by-module', {
    params: { date_from: filters.dateFrom, date_to: filters.dateTo },
  });
  return res.data;
}

// ── LIVE: Pharmacy & Optical ──────────────────────────────────────────────

async function getPharmacySales(days = 30): Promise<PharmacySales[]> {
  const res = await api.get<PharmacySales[]>(`/pharmacy/analytics/sales-trend`, {
    params: { days },
  });
  return res.data;
}

async function getTopMedicines(days = 30, limit = 10): Promise<TopSellingMedicine[]> {
  const res = await api.get<TopSellingMedicine[]>(`/pharmacy/analytics/top-medicines`, {
    params: { days, limit },
  });
  return res.data;
}

async function getPharmacyDashboard(): Promise<PharmacyDashboard> {
  try {
    const res = await api.get<PharmacyDashboard>('/pharmacy/dashboard');
    return res.data;
  } catch {
    warn('PharmacyDashboard (fallback)');
    return {
      total_medicines: 0,
      low_stock_count: 0,
      expiring_soon_count: 0,
      expired_count: 0,
      today_sales_count: 0,
      today_sales_amount: 0,
      pending_orders: 0,
    };
  }
}

// ── LIVE: Inventory ──────────────────────────────────────────────────────

async function getStockStatus(limit = 50): Promise<StockStatus[]> {
  const res = await api.get<StockStatus[]>(`/inventory/analytics/stock-status`, {
    params: { limit },
  });
  return res.data;
}

/** True counts (critical/low/overstock/ok/total) across the whole active
 * medicine catalog — for the Inventory Health panel's summary tiles and pie
 * chart, which must never be derived from the limit-capped list above. */
async function getStockStatusSummary(): Promise<StockStatusSummary> {
  const res = await api.get<StockStatusSummary>(`/inventory/analytics/stock-status-summary`);
  return res.data;
}

async function getInventoryAging(): Promise<InventoryAging[]> {
  const res = await api.get<InventoryAging[]>(`/inventory/analytics/aging`);
  return res.data;
}

async function getInventoryDashboard(): Promise<InventoryDashboard> {
  try {
    const res = await api.get<InventoryDashboard>('/inventory/dashboard');
    return res.data;
  } catch {
    warn('InventoryDashboard (fallback)');
    return {
      total_suppliers: 0,
      active_purchase_orders: 0,
      pending_grns: 0,
      pending_adjustments: 0,
      low_stock_items: [],
      expiring_items: [],
      low_stock_count: 0,
      expiring_count: 0,
    };
  }
}

// ── LIVE: Optical (already-real endpoint, just never wired) ────────────────

async function getOpticalSales(days = 30): Promise<OpticalSales[]> {
  const res = await api.get<OpticalSales[]>('/optical/analytics/sales-trend', {
    params: { days },
  });
  return res.data;
}

// ── LIVE: Financial (FinancialPanel — real, period-scoped) ─────────────────

async function getCollectionReport(filters: DashboardFilters): Promise<CollectionReport[]> {
  const res = await api.get<CollectionReport[]>('/invoices/stats/collections-by-mode', {
    params: { date_from: filters.dateFrom, date_to: filters.dateTo },
  });
  return res.data;
}

async function getOutstandingDues(): Promise<OutstandingDues[]> {
  // A running snapshot (see backend get_outstanding_aging) — not period-scoped.
  const res = await api.get<OutstandingDues[]>('/invoices/stats/outstanding-aging');
  return res.data;
}

async function getTaxSummary(filters: DashboardFilters): Promise<TaxSummary[]> {
  const res = await api.get<TaxSummary[]>('/invoices/stats/tax-summary', {
    params: { date_from: filters.dateFrom, date_to: filters.dateTo },
  });
  return res.data;
}

// ── LIVE: Payment Status Summary (BRD-001) ────────────────────────────────

async function getPaymentStatusSummary(): Promise<PaymentStatusSummary> {
  const response = await api.get<PaymentStatusSummary>('/invoices/stats/payment-status-summary');
  return response.data;
}

// ── Exported service object ──────────────────────────────────────────────

const reportsApi = {
  getDashboardSummary,
  getOPDSummary,
  getDoctorWiseReport,
  // Pharmacy
  getPharmacySales,
  getTopMedicines,
  getPharmacyDashboard,
  // Inventory
  getStockStatus,
  getStockStatusSummary,
  getInventoryAging,
  getInventoryDashboard,
  // Revenue
  getDailyRevenue,
  getMonthlyRevenue,
  getDepartmentRevenue,
  // Optical
  getOpticalSales,
  // Financial
  getCollectionReport,
  getOutstandingDues,
  getTaxSummary,
  getPaymentStatusSummary,
};

export default reportsApi;
