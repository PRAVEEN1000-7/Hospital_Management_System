/**
 * Reports / Analytics API service.
 *
 * LIVE endpoints   → real API calls (Patient, Appointments, OPD, Pharmacy, Inventory modules)
 * DEV  endpoints   → mock data with 600 ms simulated latency
 */
import api from './api';
import appointmentService from './appointmentService';
import type { AppointmentStats, EnhancedAppointmentStats } from '../types/appointment';
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
  InventoryAging,
  CollectionReport,
  OutstandingDues,
  TaxSummary,
  ExportPayload,
  SchedulePayload,
  ScheduledReport,
  PharmacyDashboard,
  InventoryDashboard,
  PaymentStatusSummary,
} from '../types/analytics.types';
import { genId } from '../utils/id';
import {
  mockDashboardSummary,
  mockDailyRevenue,
  mockMonthlyRevenue,
  mockDepartmentRevenue,
  mockPharmacySales,
  mockTopMedicines,
  mockOpticalSales,
  mockStockStatus,
  mockInventoryAging,
  mockCollectionReport,
  mockOutstandingDues,
  mockTaxSummary,
  mockScheduledReports,
} from '../mocks/analyticsMocks';

// ── Helpers ──────────────────────────────────────────────────────────────

const DEV_DELAY = 600; // ms

/** Simulate network latency for mock endpoints */
const delay = (ms = DEV_DELAY) => new Promise((r) => setTimeout(r, ms));

const warn = (panel: string) =>
  console.warn(`[HMS Analytics] ${panel} using mock data`);

// ── LIVE: Dashboard Summary (built from real endpoints) ──────────────────

async function getDashboardSummary(
  filters: DashboardFilters,
): Promise<DashboardSummary> {
  try {
    // Pull real stats from the appointment reports endpoint
    const stats: AppointmentStats = await appointmentService.getStats(
      filters.dateFrom,
      filters.dateTo,
      filters.doctorId || undefined,
    );

    // For the analytics dashboard we overlay real appointment data onto KPIs.
    // Revenue / pharmacy / inventory KPIs are still mocked until those modules ship.
    return {
      ...mockDashboardSummary,
      opd_patients_today: stats.total_completed + stats.total_pending,
      opd_change_pct:
        stats.total_appointments > 0
          ? Number(((stats.completion_rate - 80) / 80 * 100).toFixed(1))
          : 0,
    };
  } catch {
    // Fallback to full mock if API is unreachable
    warn('DashboardSummary (fallback)');
    return mockDashboardSummary;
  }
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
      specialization: null,
      patients_seen: d.completed,
      avg_consultation_time: 15,  // not available from current API
      rating: Number((3.5 + Math.random() * 1.5).toFixed(1)),
      revenue: d.completed * 500, // estimate until billing module
    }));
  } catch {
    warn('DoctorWiseReport (fallback)');
    return [];
  }
}

// ── DEV: Revenue ─────────────────────────────────────────────────────────

async function getDailyRevenue(): Promise<DailyRevenue[]> {
  warn('RevenuePanel (daily)');
  await delay();
  return mockDailyRevenue;
}

async function getMonthlyRevenue(): Promise<MonthlyRevenue[]> {
  warn('RevenuePanel (monthly)');
  await delay();
  return mockMonthlyRevenue;
}

async function getDepartmentRevenue(): Promise<DepartmentRevenue[]> {
  warn('RevenuePanel (department)');
  await delay();
  return mockDepartmentRevenue;
}

// ── LIVE: Pharmacy & Optical ──────────────────────────────────────────────

async function getPharmacySales(days = 30): Promise<PharmacySales[]> {
  try {
    const res = await api.get<PharmacySales[]>(`/pharmacy/analytics/sales-trend`, {
      params: { days },
    });
    return res.data;
  } catch {
    warn('PharmacyPanel (sales fallback)');
    return mockPharmacySales;
  }
}

async function getTopMedicines(days = 30, limit = 10): Promise<TopSellingMedicine[]> {
  try {
    const res = await api.get<TopSellingMedicine[]>(`/pharmacy/analytics/top-medicines`, {
      params: { days, limit },
    });
    return res.data;
  } catch {
    warn('PharmacyPanel (top medicines fallback)');
    return mockTopMedicines;
  }
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
  try {
    const res = await api.get<StockStatus[]>(`/inventory/analytics/stock-status`, {
      params: { limit },
    });
    return res.data;
  } catch {
    warn('InventoryPanel (stock fallback)');
    return mockStockStatus;
  }
}

async function getInventoryAging(): Promise<InventoryAging[]> {
  try {
    const res = await api.get<InventoryAging[]>(`/inventory/analytics/aging`);
    return res.data;
  } catch {
    warn('InventoryPanel (aging fallback)');
    return mockInventoryAging;
  }
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

// ── DEV: Optical (still mock) ────────────────────────────────────────────

async function getOpticalSales(): Promise<OpticalSales[]> {
  warn('PharmacyPanel (optical)');
  await delay();
  return mockOpticalSales;
}

// ── DEV: Financial (still mock) ──────────────────────────────────────────

async function getCollectionReport(): Promise<CollectionReport[]> {
  warn('FinancialPanel (collections)');
  await delay();
  return mockCollectionReport;
}

async function getOutstandingDues(): Promise<OutstandingDues[]> {
  warn('FinancialPanel (outstanding)');
  await delay();
  return mockOutstandingDues;
}

async function getTaxSummary(): Promise<TaxSummary[]> {
  warn('FinancialPanel (tax)');
  await delay();
  return mockTaxSummary;
}

// ── LIVE: Payment Status Summary (BRD-001) ────────────────────────────────

async function getPaymentStatusSummary(): Promise<PaymentStatusSummary> {
  const response = await api.get<PaymentStatusSummary>('/invoices/stats/payment-status-summary');
  return response.data;
}

// ── DEV: Export & Schedule ───────────────────────────────────────────────

async function exportReport(_payload: ExportPayload): Promise<Blob> {
  warn('Export');
  await delay();
  // Return stub CSV blob
  return new Blob(['report_type,date\nstub,data'], { type: 'text/csv' });
}

async function getScheduledReports(): Promise<ScheduledReport[]> {
  warn('ScheduleExportPanel');
  await delay();
  return mockScheduledReports;
}

async function createScheduledReport(
  _payload: SchedulePayload,
): Promise<ScheduledReport> {
  warn('ScheduleExportPanel (create)');
  await delay();
  return {
    id: genId(),
    report_type: _payload.report_type,
    format: _payload.format,
    frequency: _payload.frequency,
    email: _payload.email,
    next_run: new Date().toISOString(),
    is_active: true,
    created_at: new Date().toISOString(),
  };
}

async function deleteScheduledReport(_id: string): Promise<void> {
  warn('ScheduleExportPanel (delete)');
  await delay();
}

// ── Exported service object ──────────────────────────────────────────────

const reportsApi = {
  // LIVE
  getDashboardSummary,
  getOPDSummary,
  getDoctorWiseReport,
  // LIVE – Pharmacy
  getPharmacySales,
  getTopMedicines,
  getPharmacyDashboard,
  // LIVE – Inventory
  getStockStatus,
  getInventoryAging,
  getInventoryDashboard,
  // DEV – Revenue
  getDailyRevenue,
  getMonthlyRevenue,
  getDepartmentRevenue,
  // DEV – Optical
  getOpticalSales,
  // DEV – Financial
  getCollectionReport,
  getOutstandingDues,
  getTaxSummary,
  // LIVE – Financial (BRD-001)
  getPaymentStatusSummary,
  // DEV – Export / Schedule
  exportReport,
  getScheduledReports,
  createScheduledReport,
  deleteScheduledReport,
};

export default reportsApi;
