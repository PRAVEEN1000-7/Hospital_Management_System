/**
 * TanStack Query hooks for all analytics endpoints.
 * staleTime: 5 min — data is relatively static for dashboard views.
 */
import { useQuery } from '@tanstack/react-query';
import reportsApi from '../services/reportsApi';
import type { DashboardFilters } from '../types/analytics.types';

const STALE = 5 * 60 * 1000; // 5 min

// ── Keys ─────────────────────────────────────────────────────────────────

export const analyticsKeys = {
  all: ['analytics'] as const,
  summary: (f: DashboardFilters) => [...analyticsKeys.all, 'summary', f] as const,
  opdSummary: (f: DashboardFilters) => [...analyticsKeys.all, 'opd-summary', f] as const,
  doctorWise: (f: DashboardFilters) => [...analyticsKeys.all, 'doctor-wise', f] as const,
  dailyRevenue: () => [...analyticsKeys.all, 'daily-revenue'] as const,
  monthlyRevenue: () => [...analyticsKeys.all, 'monthly-revenue'] as const,
  departmentRevenue: () => [...analyticsKeys.all, 'department-revenue'] as const,
  pharmacySales: (days: number) => [...analyticsKeys.all, 'pharmacy-sales', days] as const,
  topMedicines: (days: number, limit: number) => [...analyticsKeys.all, 'top-medicines', days, limit] as const,
  pharmacyDashboard: () => [...analyticsKeys.all, 'pharmacy-dashboard'] as const,
  stockStatus: (limit: number) => [...analyticsKeys.all, 'stock-status', limit] as const,
  inventoryAging: () => [...analyticsKeys.all, 'inventory-aging'] as const,
  inventoryDashboard: () => [...analyticsKeys.all, 'inventory-dashboard'] as const,
  opticalSales: () => [...analyticsKeys.all, 'optical-sales'] as const,
  collectionReport: () => [...analyticsKeys.all, 'collection-report'] as const,
  outstandingDues: () => [...analyticsKeys.all, 'outstanding-dues'] as const,
  taxSummary: () => [...analyticsKeys.all, 'tax-summary'] as const,
  scheduledReports: () => [...analyticsKeys.all, 'scheduled-reports'] as const,
  paymentStatusSummary: () => [...analyticsKeys.all, 'payment-status-summary'] as const,
};

// ── LIVE hooks ───────────────────────────────────────────────────────────

export function useDashboardSummary(filters: DashboardFilters) {
  return useQuery({
    queryKey: analyticsKeys.summary(filters),
    queryFn: () => reportsApi.getDashboardSummary(filters),
    staleTime: STALE,
  });
}

export function useOPDSummary(filters: DashboardFilters) {
  return useQuery({
    queryKey: analyticsKeys.opdSummary(filters),
    queryFn: () => reportsApi.getOPDSummary(filters),
    staleTime: STALE,
  });
}

export function useDoctorWiseReport(filters: DashboardFilters) {
  return useQuery({
    queryKey: analyticsKeys.doctorWise(filters),
    queryFn: () => reportsApi.getDoctorWiseReport(filters),
    staleTime: STALE,
  });
}

// ── LIVE: Pharmacy ────────────────────────────────────────────────────────

export function usePharmacySales(days = 30) {
  return useQuery({
    queryKey: analyticsKeys.pharmacySales(days),
    queryFn: () => reportsApi.getPharmacySales(days),
    staleTime: STALE,
  });
}

export function useTopMedicines(days = 30, limit = 10) {
  return useQuery({
    queryKey: analyticsKeys.topMedicines(days, limit),
    queryFn: () => reportsApi.getTopMedicines(days, limit),
    staleTime: STALE,
  });
}

export function usePharmacyDashboard() {
  return useQuery({
    queryKey: analyticsKeys.pharmacyDashboard(),
    queryFn: reportsApi.getPharmacyDashboard,
    staleTime: STALE,
  });
}

// ── LIVE: Inventory ──────────────────────────────────────────────────────

export function useStockStatus(limit = 50) {
  return useQuery({
    queryKey: analyticsKeys.stockStatus(limit),
    queryFn: () => reportsApi.getStockStatus(limit),
    staleTime: STALE,
  });
}

export function useInventoryAging() {
  return useQuery({
    queryKey: analyticsKeys.inventoryAging(),
    queryFn: reportsApi.getInventoryAging,
    staleTime: STALE,
  });
}

export function useInventoryDashboard() {
  return useQuery({
    queryKey: analyticsKeys.inventoryDashboard(),
    queryFn: reportsApi.getInventoryDashboard,
    staleTime: STALE,
  });
}

// ── DEV: Optical ─────────────────────────────────────────────────────────

export function useOpticalSales() {
  return useQuery({
    queryKey: analyticsKeys.opticalSales(),
    queryFn: reportsApi.getOpticalSales,
    staleTime: STALE,
  });
}

// ── DEV: Revenue ─────────────────────────────────────────────────────────

export function useDailyRevenue() {
  return useQuery({
    queryKey: analyticsKeys.dailyRevenue(),
    queryFn: reportsApi.getDailyRevenue,
    staleTime: STALE,
  });
}

export function useMonthlyRevenue() {
  return useQuery({
    queryKey: analyticsKeys.monthlyRevenue(),
    queryFn: reportsApi.getMonthlyRevenue,
    staleTime: STALE,
  });
}

export function useDepartmentRevenue() {
  return useQuery({
    queryKey: analyticsKeys.departmentRevenue(),
    queryFn: reportsApi.getDepartmentRevenue,
    staleTime: STALE,
  });
}

// ── DEV: Financial ───────────────────────────────────────────────────────

// BRD-001 — real (not mocked) payment-status summary.
export function usePaymentStatusSummary() {
  return useQuery({
    queryKey: analyticsKeys.paymentStatusSummary(),
    queryFn: reportsApi.getPaymentStatusSummary,
    staleTime: STALE,
  });
}

export function useCollectionReport() {
  return useQuery({
    queryKey: analyticsKeys.collectionReport(),
    queryFn: reportsApi.getCollectionReport,
    staleTime: STALE,
  });
}

export function useOutstandingDues() {
  return useQuery({
    queryKey: analyticsKeys.outstandingDues(),
    queryFn: reportsApi.getOutstandingDues,
    staleTime: STALE,
  });
}

export function useTaxSummary() {
  return useQuery({
    queryKey: analyticsKeys.taxSummary(),
    queryFn: reportsApi.getTaxSummary,
    staleTime: STALE,
  });
}

export function useScheduledReports() {
  return useQuery({
    queryKey: analyticsKeys.scheduledReports(),
    queryFn: reportsApi.getScheduledReports,
    staleTime: STALE,
  });
}
