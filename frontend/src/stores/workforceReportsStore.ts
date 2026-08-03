/**
 * Zustand store for Workforce Reports filters — mirrors analyticsStore.ts's
 * shape (period preset + custom range), plus a `year` for the leave-based
 * reports (LOP / Paid Leave Balance), which are inherently annual.
 */
import { create } from 'zustand';
import { format, subDays, startOfMonth, startOfDay } from 'date-fns';

const today = () => format(startOfDay(new Date()), 'yyyy-MM-dd');

export type WorkforcePeriodPreset = '7d' | '30d' | 'month' | 'custom';

function datesForPreset(preset: WorkforcePeriodPreset): { dateFrom: string; dateTo: string } {
  const to = today();
  switch (preset) {
    case '7d':
      return { dateFrom: format(subDays(new Date(), 6), 'yyyy-MM-dd'), dateTo: to };
    case 'month':
      return { dateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'), dateTo: to };
    case 'custom':
      return { dateFrom: format(subDays(new Date(), 29), 'yyyy-MM-dd'), dateTo: to };
    case '30d':
    default:
      return { dateFrom: format(subDays(new Date(), 29), 'yyyy-MM-dd'), dateTo: to };
  }
}

interface WorkforceReportsStore {
  period: WorkforcePeriodPreset;
  dateFrom: string;
  dateTo: string;
  year: number;
  setPeriod: (preset: WorkforcePeriodPreset) => void;
  setCustomRange: (from: string, to: string) => void;
  setYear: (year: number) => void;
}

export const useWorkforceReportsStore = create<WorkforceReportsStore>((set) => ({
  period: '30d',
  ...datesForPreset('30d'),
  year: new Date().getFullYear(),

  setPeriod: (preset) =>
    set((s) => ({
      period: preset,
      ...(preset === 'custom' ? {} : datesForPreset(preset)),
      ...(preset === 'custom' ? { dateFrom: s.dateFrom, dateTo: s.dateTo } : {}),
    })),

  setCustomRange: (dateFrom, dateTo) => set({ period: 'custom', dateFrom, dateTo }),

  setYear: (year) => set({ year }),
}));
