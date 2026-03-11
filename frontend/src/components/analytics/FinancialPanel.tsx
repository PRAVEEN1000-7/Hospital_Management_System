import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import PanelCard from './shared/PanelCard';
import {
  useCollectionReport,
  useOutstandingDues,
  useTaxSummary,
} from '../../hooks/useAnalyticsQueries';

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
      <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">
        {label || payload[0]?.name}
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey || p.name} style={{ color: p.payload?.color || p.color }}>
          {p.name}: {inr.format(p.value)}
        </p>
      ))}
    </div>
  );
};

// ── Panel ────────────────────────────────────────────────────────────────

const FinancialPanel: React.FC = () => {
  const collections = useCollectionReport();
  const outstanding = useOutstandingDues();
  const tax = useTaxSummary();

  const isLoading =
    collections.isLoading || outstanding.isLoading || tax.isLoading;

  return (
    <PanelCard title="Financial Overview" status="development" isLoading={isLoading}>
      <div className="grid gap-6 md:grid-cols-3">
        {/* ── Column 1: Collection Pie ── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Collections by Method
          </h4>
          {collections.data && (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={collections.data}
                    dataKey="amount"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={45}
                    paddingAngle={2}
                  >
                    {collections.data.map((c, i) => (
                      <Cell key={i} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                {collections.data.map((c) => (
                  <span key={c.method} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.method} ({c.percentage}%)
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Column 2: Outstanding Dues Bar ── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Outstanding Dues by Age
          </h4>
          {outstanding.data && (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={outstanding.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="age_bracket" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={shortInr} />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="amount"
                  name="Amount"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                  barSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Column 3: Tax Summary Table ── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Tax Summary
          </h4>
          {tax.data && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 text-right font-medium">Taxable</th>
                    <th className="pb-2 text-right font-medium">Tax</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {tax.data.map((t, i) => (
                    <tr
                      key={t.tax_type}
                      className={`border-b border-slate-50 dark:border-slate-800 ${
                        i % 2 === 0 ? '' : 'bg-slate-50/40 dark:bg-slate-800/20'
                      }`}
                    >
                      <td className="py-2 font-medium text-slate-700 dark:text-slate-200">
                        {t.tax_type}
                      </td>
                      <td className="py-2 text-right">{inr.format(t.taxable_amount)}</td>
                      <td className="py-2 text-right">{inr.format(t.tax_amount)}</td>
                      <td className="py-2 text-right font-semibold text-slate-700 dark:text-slate-200">
                        {inr.format(t.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300 font-semibold dark:border-slate-600">
                    <td className="pt-2">Total</td>
                    <td className="pt-2 text-right">
                      {inr.format(tax.data.reduce((s, t) => s + t.taxable_amount, 0))}
                    </td>
                    <td className="pt-2 text-right">
                      {inr.format(tax.data.reduce((s, t) => s + t.tax_amount, 0))}
                    </td>
                    <td className="pt-2 text-right">
                      {inr.format(tax.data.reduce((s, t) => s + t.total, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </PanelCard>
  );
};

export default FinancialPanel;
