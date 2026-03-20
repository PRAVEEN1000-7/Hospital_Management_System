import React, { useEffect, useState } from 'react';
import { useDashboardSummary } from '../../hooks/useAnalyticsQueries';
import { useAnalyticsStore } from '../../stores/analyticsStore';

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
  const { data, isLoading } = useDashboardSummary(filters);

  const revenue = useCountUp(data?.total_revenue ?? 0);
  const opd = useCountUp(data?.opd_patients_today ?? 0);
  const rx = useCountUp(data?.pending_prescriptions ?? 0);
  const stock = useCountUp(data?.low_stock_items ?? 0);
  const dues = useCountUp(data?.outstanding_dues ?? 0);

  const cards: Omit<CardProps, 'isLoading'>[] = [
    {
      icon: 'payments',
      iconBg: 'bg-primary',
      label: 'Total Revenue',
      value: inr.format(revenue),
      change: data?.revenue_change_pct ?? 0,
    },
    {
      icon: 'groups',
      iconBg: 'bg-emerald-500',
      label: 'OPD Patients Today',
      value: String(opd),
      change: data?.opd_change_pct ?? 0,
    },
    {
      icon: 'prescriptions',
      iconBg: 'bg-amber-500',
      label: 'Pending Rx',
      value: String(rx),
      change: data?.prescriptions_change_pct ?? 0,
    },
    {
      icon: 'inventory_2',
      iconBg: 'bg-red-500',
      label: 'Low Stock Items',
      value: String(stock),
      change: data?.stock_change_pct ?? 0,
    },
    {
      icon: 'account_balance_wallet',
      iconBg: 'bg-violet-500',
      label: 'Outstanding Dues',
      value: inr.format(dues),
      change: data?.dues_change_pct ?? 0,
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
