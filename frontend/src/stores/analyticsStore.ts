/**
 * Zustand store for analytics dashboard filters.
 * Syncs period preset + custom date range.
 */
import { create } from 'zustand';
import { format, subDays, startOfDay } from 'date-fns';
import type { DashboardFilters, PeriodPreset } from '../types/analytics.types';

const today = () => format(startOfDay(new Date()), 'yyyy-MM-dd');

function datesForPreset(preset: PeriodPreset): { dateFrom: string; dateTo: string } {
  const to = today();
  switch (preset) {
    case 'today':
      return { dateFrom: to, dateTo: to };
    case '7d':
      return { dateFrom: format(subDays(new Date(), 6), 'yyyy-MM-dd'), dateTo: to };
    case '30d':
      return { dateFrom: format(subDays(new Date(), 29), 'yyyy-MM-dd'), dateTo: to };
    case '90d':
      return { dateFrom: format(subDays(new Date(), 89), 'yyyy-MM-dd'), dateTo: to };
    case 'custom':
      return { dateFrom: format(subDays(new Date(), 29), 'yyyy-MM-dd'), dateTo: to };
  }
}

interface AnalyticsStore {
  filters: DashboardFilters;
  setPeriod: (preset: PeriodPreset) => void;
  setCustomRange: (from: string, to: string) => void;
  setDepartment: (id?: string) => void;
  setDoctor: (id?: string) => void;
  reset: () => void;
}

const defaultFilters: DashboardFilters = {
  period: '30d',
  ...datesForPreset('30d'),
};

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  filters: { ...defaultFilters },

  setPeriod: (preset) =>
    set(() => ({
      filters: {
        ...defaultFilters,
        period: preset,
        ...datesForPreset(preset),
      },
    })),

  setCustomRange: (dateFrom, dateTo) =>
    set((s) => ({
      filters: { ...s.filters, period: 'custom', dateFrom, dateTo },
    })),

  setDepartment: (id) =>
    set((s) => ({
      filters: { ...s.filters, departmentId: id },
    })),

  setDoctor: (id) =>
    set((s) => ({
      filters: { ...s.filters, doctorId: id },
    })),

  reset: () => set({ filters: { ...defaultFilters } }),
}));
