/**
 * TanStack Query hooks for Workforce Reports — mirrors useAnalyticsQueries.ts
 * (5-min staleTime, dashboard-style read-heavy data).
 */
import { useQuery } from '@tanstack/react-query';
import workforceReportsApi from '../services/workforceReportsApi';
import type { WorkforceReportsFilters } from '../types/workforceReports';

const STALE = 5 * 60 * 1000; // 5 min

export const workforceReportsKeys = {
  all: ['workforce-reports'] as const,
  dailyAttendance: (f: WorkforceReportsFilters) => [...workforceReportsKeys.all, 'daily-attendance', f.dateFrom, f.dateTo] as const,
  absentee: (f: WorkforceReportsFilters) => [...workforceReportsKeys.all, 'absentee', f.dateFrom, f.dateTo] as const,
  verifiedAttendance: (f: WorkforceReportsFilters) => [...workforceReportsKeys.all, 'verified-attendance', f.dateFrom, f.dateTo] as const,
  lop: (year: number) => [...workforceReportsKeys.all, 'lop', year] as const,
  paidLeaveBalance: (year: number) => [...workforceReportsKeys.all, 'paid-leave-balance', year] as const,
  headcount: () => [...workforceReportsKeys.all, 'headcount'] as const,
};

export function useDailyAttendanceCount(filters: WorkforceReportsFilters) {
  return useQuery({
    queryKey: workforceReportsKeys.dailyAttendance(filters),
    queryFn: () => workforceReportsApi.getDailyAttendanceCount(filters),
    staleTime: STALE,
  });
}

export function useAbsenteeReport(filters: WorkforceReportsFilters) {
  return useQuery({
    queryKey: workforceReportsKeys.absentee(filters),
    queryFn: () => workforceReportsApi.getAbsenteeReport(filters),
    staleTime: STALE,
  });
}

export function useVerifiedAttendanceSheet(filters: WorkforceReportsFilters) {
  return useQuery({
    queryKey: workforceReportsKeys.verifiedAttendance(filters),
    queryFn: () => workforceReportsApi.getVerifiedAttendanceSheet(filters),
    staleTime: STALE,
  });
}

export function useLopReport(year: number) {
  return useQuery({
    queryKey: workforceReportsKeys.lop(year),
    queryFn: () => workforceReportsApi.getLopReport(year),
    staleTime: STALE,
  });
}

export function usePaidLeaveBalanceReport(year: number) {
  return useQuery({
    queryKey: workforceReportsKeys.paidLeaveBalance(year),
    queryFn: () => workforceReportsApi.getPaidLeaveBalanceReport(year),
    staleTime: STALE,
  });
}

export function useHeadcount() {
  return useQuery({
    queryKey: workforceReportsKeys.headcount(),
    queryFn: () => workforceReportsApi.getHeadcount(),
    staleTime: STALE,
  });
}
