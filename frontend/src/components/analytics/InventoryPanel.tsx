import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import PanelCard from './shared/PanelCard';
import { useStockStatusSummary, useInventoryAging } from '../../hooks/useAnalyticsQueries';
import { downloadCsvSections } from '../../utils/csv';

// ── Currency ─────────────────────────────────────────────────────────────

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const shortInr = (v: number) => {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
};

// ── Stock status labels/colors (for the distribution chart) ──────────────

const statusLabels: Record<string, string> = {
  ok: 'Healthy',
  low: 'Low Stock',
  critical: 'Critical',
  overstock: 'Overstock',
};

const statusChartColors: Record<string, string> = {
  ok: '#10b981',
  low: '#f59e0b',
  critical: '#ef4444',
  overstock: '#3b82f6',
};

// ── Tooltip ──────────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
      <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.dataKey === 'value' ? inr.format(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

// ── Panel ────────────────────────────────────────────────────────────────

const InventoryPanel: React.FC = () => {
  // True catalog-wide counts — previously this panel derived its summary
  // tiles and pie chart from useStockStatus()'s display-limited list
  // (default 50, max 200), so both silently capped out for any hospital
  // with more medicines than that. This endpoint returns the real totals.
  const stock = useStockStatusSummary();
  const aging = useInventoryAging();
  const isLoading = stock.isLoading || aging.isLoading;
  const error = stock.error || aging.error;

  // Summary counts — aggregate only, no per-item breakdown shown in this panel.
  const summary = stock.data;

  const distribution = summary
    ? (['ok', 'low', 'critical', 'overstock'] as const)
        .map((status) => ({ status, label: statusLabels[status], count: summary[status], color: statusChartColors[status] }))
        .filter((d) => d.count > 0)
    : [];

  return (
    <PanelCard
      title="Inventory Health"
      status="live"
      isLoading={isLoading}
      error={error ? 'Failed to load inventory data' : null}
      onRetry={() => { stock.refetch(); aging.refetch(); }}
      onExport={
        (summary || distribution.length > 0 || aging.data?.length)
          ? () => downloadCsvSections('inventory-health', [
              {
                title: 'Summary',
                rows: summary ? [summary as unknown as Record<string, unknown>] : [],
              },
              { title: 'Stock Status Distribution', rows: distribution as unknown as Record<string, unknown>[] },
              { title: 'Inventory Aging', rows: (aging.data ?? []) as unknown as Record<string, unknown>[] },
            ])
          : undefined
      }
    >
      {/* Summary cards */}
      {summary && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Items', value: summary.total, color: 'text-primary' },
            { label: 'Healthy', value: summary.ok, color: 'text-emerald-500' },
            { label: 'Low Stock', value: summary.low, color: 'text-amber-500' },
            { label: 'Critical', value: summary.critical, color: 'text-red-500' },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/50"
            >
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.label}</p>
              <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-5">
        {/* ── Stock Status Distribution (aggregate — no per-item list) ── */}
        <div className="md:col-span-3">
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Stock Status Distribution
          </h4>
          {summary && summary.total === 0 && (
            <p className="py-10 text-center text-xs text-slate-400">No inventory items yet.</p>
          )}
          {distribution.length > 0 && (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <ResponsiveContainer width="100%" height={220} className="max-w-xs">
                <PieChart>
                  <Pie
                    data={distribution}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={45}
                    paddingAngle={2}
                  >
                    {distribution.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-1 flex-col gap-2">
                {distribution.map((d) => (
                  <div key={d.status} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/50">
                    <span className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.label}
                    </span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Aging Chart (40%) ── */}
        <div className="md:col-span-2">
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Inventory Aging
          </h4>
          {aging.data && (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={aging.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={shortInr} />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="value"
                  name="Value"
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                  barSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </PanelCard>
  );
};

export default InventoryPanel;
