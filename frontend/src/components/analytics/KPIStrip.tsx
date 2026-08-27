import React, { useEffect, useState } from 'react';
import { useDashboardSummary, usePharmacyDashboard, useInventoryDashboard } from '../../hooks/useAnalyticsQueries';
import { useAnalyticsStore } from '../../stores/analyticsStore';
import appointmentService from '../../services/appointmentService';
import { formatLocalDateISO } from '../../utils/calendarDate';

// ── Currency formatter ───────────────────────────────────────────────────

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

// ── Animated count-up ────────────────────────────────────────────────────

function useCountUp(end: number, duration = 800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // ease-out quad
      setVal(Math.round(end * (1 - (1 - t) * (1 - t))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [end, duration]);
  return val;
}

// ── KPI card ─────────────────────────────────────────────────────────────

interface CardProps {
  icon: string;
  iconBg: string;
  label: string;
  value: string;
  change: number;
  isLoading: boolean;
}

const KPICard: React.FC<CardProps> = ({ icon, iconBg, label, value, change, isLoading }) => (
  <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
    >
      <span className="material-symbols-outlined text-xl text-white">{icon}</span>
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </p>
      {isLoading ? (
        <div className="mt-1 h-5 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      ) : (
        <p className="text-lg font-bold text-slate-800 dark:text-white">{value}</p>
      )}
    </div>
    {!isLoading && (
      <span
        className={`shrink-0 text-xs font-semibold ${
          change >= 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-500 dark:text-red-400'
        }`}
      >
        {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
      </span>
    )}
  </div>
);

// ── KPI Strip ────────────────────────────────────────────────────────────

const KPIStrip: React.FC = () => {
  const filters = useAnalyticsStore((s) => s.filters);
  const { data: dashboardData, isLoading } = useDashboardSummary(filters);
  const { data: pharmacyData } = usePharmacyDashboard();
  const { data: inventoryData } = useInventoryDashboard();

  // "OPD Patients Today" must always mean literally today, regardless of
  // whatever historical period (7d/30d/90d/custom) the rest of this strip is
  // scoped to — dashboardData.opd_patients_today is derived from that SAME
  // shared period filter (see reportsApi.getDashboardSummary), so with the
  // default 30-day period this card was silently showing a 30-day total
  // under a "Today" label. Fetched independently here so it's correct no
  // matter what the user has the period selector set to.
  const [opdToday, setOpdToday] = useState(0);
  // A real day-over-day change (today vs yesterday) — replaces
  // dashboardData.opd_change_pct, which was actually "how far the selected
  // period's completion rate sits from an assumed 80% baseline", not a
  // period-over-period trend, and doesn't apply once this card is pinned to
  // today regardless of the period filter.
  const [opdChangePct, setOpdChangePct] = useState(0);
  useEffect(() => {
    const today = formatLocalDateISO();
    const yesterday = formatLocalDateISO(new Date(Date.now() - 86400000));
    Promise.all([
      appointmentService.getStats(today, today),
      appointmentService.getStats(yesterday, yesterday),
    ]).then(([todayStats, yesterdayStats]) => {
      const todayCount = todayStats.total_completed + todayStats.total_pending;
      const yesterdayCount = yesterdayStats.total_completed + yesterdayStats.total_pending;
      setOpdToday(todayCount);
      setOpdChangePct(
        yesterdayCount > 0
          ? Number((((todayCount - yesterdayCount) / yesterdayCount) * 100).toFixed(1))
          : 0
      );
    }).catch(() => { setOpdToday(0); setOpdChangePct(0); });
  }, []);

  // Combine data from multiple sources
  const revenue = useCountUp(dashboardData?.total_revenue ?? 0);
  const opd = useCountUp(opdToday);
  // Real pending-orders count from the pharmacy dashboard, already fetched
  // here for Low Stock below — not from DashboardSummary, which no longer
  // carries a real value for this field.
  const rx = useCountUp(pharmacyData?.pending_orders ?? 0);
  const lowStock = useCountUp(pharmacyData?.low_stock_count ?? inventoryData?.low_stock_count ?? 0);
  const dues = useCountUp(dashboardData?.outstanding_dues ?? 0);

  const cards: Omit<CardProps, 'isLoading'>[] = [
    {
      icon: 'payments',
      iconBg: 'bg-primary',
      label: 'Total Revenue',
      value: inr.format(revenue),
      change: dashboardData?.revenue_change_pct ?? 0,
    },
    {
      icon: 'groups',
      iconBg: 'bg-emerald-500',
      label: 'OPD Patients Today',
      value: String(opd),
      change: opdChangePct,
    },
    {
      icon: 'prescriptions',
      iconBg: 'bg-amber-500',
      label: 'Pending Rx',
      value: String(rx),
      change: dashboardData?.prescriptions_change_pct ?? 0,
    },
    {
      icon: 'inventory_2',
      iconBg: 'bg-red-500',
      label: 'Low Stock Items',
      value: String(lowStock),
      change: 0, // No change tracking yet for inventory
    },
    {
      icon: 'account_balance_wallet',
      iconBg: 'bg-violet-500',
      label: 'Outstanding Dues',
      value: inr.format(dues),
      change: dashboardData?.dues_change_pct ?? 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((c) => (
        <KPICard key={c.label} {...c} isLoading={isLoading} />
      ))}
    </div>
  );
};

export default KPIStrip;
