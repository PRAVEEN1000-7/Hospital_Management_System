import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import PanelCard from './shared/PanelCard';
import {
  usePharmacySales,
  useTopMedicines,
  useOpticalSales,
} from '../../hooks/useAnalyticsQueries';
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

// ── Tooltip ──────────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
      <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? inr.format(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

// ── Panel ────────────────────────────────────────────────────────────────

const PharmacyPanel: React.FC = () => {
  const sales = usePharmacySales();
  const meds = useTopMedicines();
  const optical = useOpticalSales();

  const isLoading = sales.isLoading || meds.isLoading || optical.isLoading;
  const error = sales.error || meds.error || optical.error;

  return (
    <PanelCard
      title="Pharmacy & Optical"
      status="live"
      isLoading={isLoading}
      error={error ? 'Failed to load pharmacy data' : null}
      onRetry={() => { sales.refetch(); meds.refetch(); optical.refetch(); }}
      onExport={
        (sales.data?.length || meds.data?.length || optical.data?.length)
          ? () => downloadCsvSections('pharmacy-and-optical', [
              { title: 'Pharmacy Sales Trend', rows: (sales.data ?? []) as unknown as Record<string, unknown>[] },
              { title: 'Top Selling Medicines', rows: (meds.data ?? []) as unknown as Record<string, unknown>[] },
              { title: 'Optical Sales Trend', rows: (optical.data ?? []) as unknown as Record<string, unknown>[] },
            ])
          : undefined
      }
    >
      <div className="grid gap-6 md:grid-cols-5">
        {/* ── Left 60%: Pharmacy ── */}
        <div className="md:col-span-3 space-y-5">
          {/* Pharmacy sales line chart */}
          <div>
            <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Pharmacy Sales Trend
            </h4>
            {sales.data && sales.data.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-400">No pharmacy sales for this period.</p>
            )}
            {sales.data && sales.data.length > 0 && (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={sales.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={shortInr} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    dataKey="sales"
                    name="Sales"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top medicines table */}
          {meds.data && meds.data.length === 0 && (
            <p className="py-4 text-center text-xs text-slate-400">No pharmacy sales for this period.</p>
          )}
          {meds.data && meds.data.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                Top Selling Medicines
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                      <th className="pb-2 font-medium">Medicine</th>
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 text-right font-medium">Qty</th>
                      <th className="pb-2 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meds.data.map((m, i) => (
                      <tr
                        key={m.name}
                        className={`border-b border-slate-50 dark:border-slate-800 ${
                          i % 2 === 0 ? '' : 'bg-slate-50/40 dark:bg-slate-800/20'
                        }`}
                      >
                        <td className="py-1.5 font-medium text-slate-700 dark:text-slate-200">
                          {m.name}
                        </td>
                        <td className="py-1.5 text-slate-500 dark:text-slate-400">
                          {m.category}
                        </td>
                        <td className="py-1.5 text-right">{m.quantity_sold.toLocaleString()}</td>
                        <td className="py-1.5 text-right font-medium text-slate-700 dark:text-slate-200">
                          {inr.format(m.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Right 40%: Optical ── */}
        <div className="md:col-span-2">
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Optical Sales Trend
          </h4>
          {optical.data && optical.data.length === 0 && (
            <p className="py-10 text-center text-xs text-slate-400">No optical sales for this period.</p>
          )}
          {optical.data && optical.data.length > 0 && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={optical.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(8)} // DD
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={shortInr} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total_sales" name="Sales" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </PanelCard>
  );
};

export default PharmacyPanel;
