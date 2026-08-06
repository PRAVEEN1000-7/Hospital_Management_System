import React, { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { patientService, type PatientTrendResponse } from '../../services/patientService';

type Granularity = 'day' | 'week' | 'month';

const GRANULARITY_TABS: { key: Granularity; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

/** New vs Returning patient trend — Doctor + Admin dashboards only.
 * "New" = patients whose registration falls in the same period as their visit;
 * "Returning" = patients who already existed before that period and visited again. */
const PatientTrendChart: React.FC = () => {
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [data, setData] = useState<PatientTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchTrend = useCallback(async (g: Granularity) => {
    setLoading(true);
    setError(false);
    try {
      const res = await patientService.getNewVsReturningTrend(g);
      setData(res);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTrend(granularity); }, [granularity, fetchTrend]);

  const chartData = data?.buckets.map(b => ({
    label: b.label,
    New: b.new_patients,
    Returning: b.returning_patients,
  })) ?? [];

  const totalNew = data?.buckets.reduce((s, b) => s + b.new_patients, 0) ?? 0;
  const totalReturning = data?.buckets.reduce((s, b) => s + b.returning_patients, 0) ?? 0;
  const hasData = totalNew > 0 || totalReturning > 0;

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <h3 className="font-bold text-slate-900">Patient Registrations</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            New vs returning patients{data?.scope === 'doctor' ? ' seen by you' : ' hospital-wide'}
          </p>
        </div>
        <div className="flex items-center bg-slate-100 rounded-lg p-1 text-xs font-semibold">
          {GRANULARITY_TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setGranularity(tab.key)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                granularity === tab.key ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary chips */}
      {!loading && !error && (
        <div className="flex items-center gap-4 mb-4 mt-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />
            New: {totalNew.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
            Returning: {totalReturning.toLocaleString()}
          </span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
          <p className="text-sm text-slate-500">Failed to load patient trend.</p>
          <button
            onClick={() => fetchTrend(granularity)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && !hasData && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <span className="material-symbols-outlined text-slate-300 text-3xl">bar_chart</span>
          <p className="text-sm text-slate-400">No patient visits in this period yet.</p>
        </div>
      )}

      {!loading && !error && hasData && (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="New" fill="#2563eb" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Returning" fill="#34d399" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default PatientTrendChart;
