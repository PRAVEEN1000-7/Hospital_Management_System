import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import PanelCard from './shared/PanelCard';
import { useStockStatus, useInventoryAging } from '../../hooks/useAnalyticsQueries';

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

// ── Status badge colors ──────────────────────────────────────────────────

const statusStyles: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  low: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  overstock: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

const statusLabels: Record<string, string> = {
  ok: 'OK',
  low: 'Low',
  critical: 'Critical',
  overstock: 'Overstock',
};

// ── Progress bar fill colors ─────────────────────────────────────────────

const barColor: Record<string, string> = {
  ok: 'bg-emerald-500',
  low: 'bg-amber-500',
  critical: 'bg-red-500',
  overstock: 'bg-blue-500',
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
  const stock = useStockStatus();
  const aging = useInventoryAging();
  const isLoading = stock.isLoading || aging.isLoading;

  // Summary counts
  const summary = stock.data
    ? {
        total: stock.data.length,
        ok: stock.data.filter((s) => s.status === 'ok').length,
        low: stock.data.filter((s) => s.status === 'low').length,
        critical: stock.data.filter((s) => s.status === 'critical').length,
      }
    : null;

  return (
    <PanelCard title="Inventory Health" status="development" isLoading={isLoading}>
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
        {/* ── Stock Status Table (60%) ── */}
        <div className="md:col-span-3 overflow-x-auto">
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Stock Status
          </h4>
          {stock.data && (
            <table className="w-full text-xs">
              <thead>
                <tr className="sticky top-0 border-b border-slate-200 bg-white text-left text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 text-center font-medium">Stock Level</th>
                  <th className="pb-2 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {stock.data.map((s, i) => {
                  const pct = Math.min(
                    (s.current_stock / s.max_stock) * 100,
                    100,
                  );
                  return (
                    <tr
                      key={s.item_name}
                      className={`border-b border-slate-50 transition hover:bg-blue-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                        i % 2 === 0 ? '' : 'bg-slate-50/40 dark:bg-slate-800/20'
                      }`}
                    >
                      <td className="py-2 font-medium text-slate-700 dark:text-slate-200">
                        {s.item_name}
                      </td>
                      <td className="py-2 text-slate-500 dark:text-slate-400">
                        {s.category}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className={`h-full rounded-full ${barColor[s.status] || 'bg-slate-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-[10px] text-slate-500">
                            {s.current_stock.toLocaleString()}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            statusStyles[s.status] || ''
                          }`}
                        >
                          {statusLabels[s.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
