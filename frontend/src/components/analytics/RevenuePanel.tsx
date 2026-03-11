import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import PanelCard from './shared/PanelCard';
import {
  useDailyRevenue,
  useMonthlyRevenue,
  useDepartmentRevenue,
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

// ── Custom tooltip ───────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
      <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {inr.format(p.value)}
        </p>
      ))}
    </div>
  );
};

// ── Tabs ─────────────────────────────────────────────────────────────────

type Tab = 'daily' | 'monthly' | 'department';

const tabs: { key: Tab; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'department', label: 'By Department' },
];

// ── Panel ────────────────────────────────────────────────────────────────

const RevenuePanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>('daily');

  const daily = useDailyRevenue();
  const monthly = useMonthlyRevenue();
  const dept = useDepartmentRevenue();

  const isLoading =
    (tab === 'daily' && daily.isLoading) ||
    (tab === 'monthly' && monthly.isLoading) ||
    (tab === 'department' && dept.isLoading);

  return (
    <PanelCard title="Revenue Overview" status="development" isLoading={isLoading}>
      {/* Tab bar */}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === t.key
                ? 'bg-white text-primary shadow-sm dark:bg-slate-700 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      {tab === 'daily' && daily.data && (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={daily.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)} // MM-DD
            />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={shortInr} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="opd" name="OPD" fill="#137fec" radius={[3, 3, 0, 0]} />
            <Bar dataKey="pharmacy" name="Pharmacy" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="optical" name="Optical" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            <Line
              dataKey="total"
              name="Total"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {tab === 'monthly' && monthly.data && (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={monthly.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={shortInr} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="opd" name="OPD" fill="#137fec" radius={[3, 3, 0, 0]} />
            <Bar dataKey="pharmacy" name="Pharmacy" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="optical" name="Optical" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            <Line
              dataKey="total"
              name="Total"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {tab === 'department' && dept.data && (
        <div className="flex flex-col items-center gap-4 md:flex-row">
          <ResponsiveContainer width="100%" height={300} className="max-w-xs">
            <PieChart>
              <Pie
                data={dept.data}
                dataKey="revenue"
                nameKey="department"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={55}
                paddingAngle={2}
                label={(props: any) => `${props.department}: ${props.percentage}%`}
                labelLine={false}
              >
                {dept.data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => inr.format(Number(v))}
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend table */}
          <div className="flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                  <th className="pb-2 font-medium">Department</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                  <th className="pb-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {dept.data.map((d) => (
                  <tr
                    key={d.department}
                    className="border-b border-slate-50 dark:border-slate-800"
                  >
                    <td className="py-2 flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                      {d.department}
                    </td>
                    <td className="py-2 text-right font-medium text-slate-700 dark:text-slate-200">
                      {inr.format(d.revenue)}
                    </td>
                    <td className="py-2 text-right text-slate-500">{d.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PanelCard>
  );
};

export default RevenuePanel;
