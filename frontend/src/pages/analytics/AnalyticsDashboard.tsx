import React, { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useAnalyticsStore } from '../../stores/analyticsStore';
import type { PeriodPreset } from '../../types/analytics.types';

// ── Lazy-loaded panels ───────────────────────────────────────────────────

const KPIStrip = React.lazy(() => import('../../components/analytics/KPIStrip'));
const RevenuePanel = React.lazy(() => import('../../components/analytics/RevenuePanel'));
const OPDPanel = React.lazy(() => import('../../components/analytics/OPDPanel'));
const PharmacyPanel = React.lazy(() => import('../../components/analytics/PharmacyPanel'));
const FinancialPanel = React.lazy(() => import('../../components/analytics/FinancialPanel'));
const InventoryPanel = React.lazy(() => import('../../components/analytics/InventoryPanel'));

// ── Query client (scoped to analytics) ───────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// ── Period pills ─────────────────────────────────────────────────────────

const periods: { key: PeriodPreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'custom', label: 'Custom' },
];

// ── Skeleton fallback ────────────────────────────────────────────────────

const PanelSkeleton = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
    <div className="mb-4 h-4 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
    <div className="h-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
  </div>
);

// ── Role → visible panels ────────────────────────────────────────────────
// Only admin/doctor/report_viewer can ever reach this component at all —
// MODULE_ROLES['general.analytics'] (frontend/src/config/modulePermissions.ts)
// grants no other role access, so ProtectedRoute blocks everyone else before
// AnalyticsDashboard ever mounts. Cases for other roles used to live here as
// dead code (receptionist/pharmacist/cashier/inventory_manager can never
// actually see this).

type Panel = 'kpi' | 'revenue' | 'opd' | 'pharmacy' | 'financial' | 'inventory';

function getVisiblePanels(role: string): Panel[] {
  switch (role) {
    case 'super_admin':
    case 'admin':
    case 'report_viewer':
    // Doctor now sees the same full set an admin does — the underlying
    // endpoints (revenue/financial stats in routers/invoices.py, pharmacy
    // dashboard/analytics in routers/pharmacy.py, inventory dashboard/
    // analytics in routers/inventory.py) were widened with a narrow
    // doctor-inclusive view guard on just those read-only aggregate
    // endpoints — general billing/pharmacy/inventory management access is
    // untouched and stays admin/cashier/pharmacist/inventory_manager-only.
    case 'doctor':
      return ['kpi', 'revenue', 'opd', 'pharmacy', 'financial', 'inventory'];
    default:
      return ['kpi'];
  }
}

// ── Inner page (needs QueryClientProvider above it) ──────────────────────

const AnalyticsDashboardInner: React.FC = () => {
  const { user } = useAuth();
  const role = user?.roles?.[0] || '';
  const { filters, setPeriod, setCustomRange } = useAnalyticsStore();

  const visible = getVisiblePanels(role);
  const show = (p: Panel) => visible.includes(p);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            Analytics Dashboard
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Hospital performance insights &amp; reports
          </p>
        </div>

        {/* Period pills + date pickers */}
        <div className="flex flex-wrap items-center gap-2">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                filters.period === p.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {p.label}
            </button>
          ))}

          {filters.period === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setCustomRange(e.target.value, filters.dateTo)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setCustomRange(filters.dateFrom, e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Strip ── */}
      {show('kpi') && (
        <Suspense fallback={<PanelSkeleton />}>
          <KPIStrip />
        </Suspense>
      )}

      {/* ── Revenue + OPD row ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {show('revenue') && (
          <Suspense fallback={<PanelSkeleton />}>
            <RevenuePanel />
          </Suspense>
        )}
        {show('opd') && (
          <Suspense fallback={<PanelSkeleton />}>
            <OPDPanel />
          </Suspense>
        )}
      </div>

      {/* ── Pharmacy & Optical ── */}
      {show('pharmacy') && (
        <Suspense fallback={<PanelSkeleton />}>
          <PharmacyPanel />
        </Suspense>
      )}

      {/* ── Financial + Inventory row ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {show('financial') && (
          <Suspense fallback={<PanelSkeleton />}>
            <FinancialPanel />
          </Suspense>
        )}
        {show('inventory') && (
          <Suspense fallback={<PanelSkeleton />}>
            <InventoryPanel />
          </Suspense>
        )}
      </div>

    </div>
  );
};

// ── Exported page (wraps with QueryClientProvider) ───────────────────────

const AnalyticsDashboard: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AnalyticsDashboardInner />
  </QueryClientProvider>
);

export default AnalyticsDashboard;
