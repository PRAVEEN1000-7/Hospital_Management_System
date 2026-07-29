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
  usePaymentStatusSummary,
} from '../../hooks/useAnalyticsQueries';
import { useAnalyticsStore } from '../../stores/analyticsStore';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '../../utils/paymentStatus';
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
  const filters = useAnalyticsStore((s) => s.filters);
  const collections = useCollectionReport(filters);
  const outstanding = useOutstandingDues();
  const tax = useTaxSummary(filters);
  const paymentStatus = usePaymentStatusSummary();

  const isLoading =
    collections.isLoading || outstanding.isLoading || tax.isLoading;
  const error = collections.error || outstanding.error || tax.error;

  return (
    <PanelCard
      title="Financial Overview"
      status="live"
      isLoading={isLoading}
      error={error ? 'Failed to load financial data' : null}
      onRetry={() => {
        collections.refetch();
        outstanding.refetch();
        tax.refetch();
      }}
      onExport={
        (paymentStatus.data || collections.data?.length || outstanding.data?.length || tax.data?.length)
          ? () => downloadCsvSections('financial-overview', [
              {
                title: 'Payment Status Summary',
                rows: paymentStatus.data
                  ? (['not_paid', 'partially_paid', 'paid'] as const).map((bucket) => ({
                      status: PAYMENT_STATUS_LABELS[bucket],
                      count: paymentStatus.data[bucket].count,
                      total_amount: paymentStatus.data[bucket].total_amount,
                    }))
                  : [],
              },
              { title: 'Collections by Method', rows: (collections.data ?? []) as unknown as Record<string, unknown>[] },
              { title: 'Outstanding Dues by Age', rows: (outstanding.data ?? []) as unknown as Record<string, unknown>[] },
              { title: 'Tax Summary', rows: (tax.data ?? []) as unknown as Record<string, unknown>[] },
            ])
          : undefined
      }
    >
      {paymentStatus.data && (
        <div className="mb-6">
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Payment Status Summary
          </h4>
          <div className="grid grid-cols-3 gap-3">
            {(['not_paid', 'partially_paid', 'paid'] as const).map((bucket) => {
              const b = paymentStatus.data[bucket];
              return (
                <div key={bucket} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${PAYMENT_STATUS_COLORS[bucket]}`}>
                    {PAYMENT_STATUS_LABELS[bucket]}
                  </span>
                  <p className="mt-2 text-lg font-bold text-slate-800 dark:text-slate-100">{b.count}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{inr.format(b.total_amount)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* ── Column 1: Collection Pie ── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Collections by Method
          </h4>
          {collections.data && collections.data.length > 0 ? (
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
          ) : collections.data && (
            <p className="py-10 text-center text-xs text-slate-400">No collections for this period.</p>
          )}
        </div>

        {/* ── Column 2: Outstanding Dues Bar ── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Outstanding Dues by Age
          </h4>
          {outstanding.data && outstanding.data.some((d) => d.amount > 0) ? (
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
          ) : outstanding.data && (
            <p className="py-10 text-center text-xs text-slate-400">No outstanding dues — fully collected.</p>
          )}
        </div>

        {/* ── Column 3: Tax Summary — a single real total for the period (see
             backend get_tax_summary: no invoice in this system attributes tax
             to a specific CGST/SGST/IGST type, so a per-type breakdown would
             just be fabricated) ── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Tax Summary
          </h4>
          {tax.data && tax.data[0] && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/50">
                <span className="text-xs text-slate-500 dark:text-slate-400">Taxable Amount</span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{inr.format(tax.data[0].taxable_amount)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/50">
                <span className="text-xs text-slate-500 dark:text-slate-400">Tax Collected</span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{inr.format(tax.data[0].tax_amount)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <span className="text-xs font-medium text-primary">Total</span>
                <span className="text-sm font-bold text-primary">{inr.format(tax.data[0].total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </PanelCard>
  );
};

export default FinancialPanel;
