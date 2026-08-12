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
import { patientService, type PatientTrendResponse, type PatientTrendGranularity } from '../../services/patientService';
import { formatLocalDateISO } from '../../utils/calendarDate';

const GRANULARITY_TABS: { key: PatientTrendGranularity; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Custom' },
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

/** New vs Returning vs Upcoming patient trend — Doctor + Admin dashboards only.
 * "New" = patients whose registration falls in the same period as their visit;
 * "Returning" = patients who already existed before that period and visited again;
 * "Upcoming" = distinct patients with a still-booked, not-yet-happened appointment
 * in that bucket — always 0 for a bucket entirely in the past (e.g. last month),
 * since nothing there can still be upcoming.
 * Day/Week are single-period snapshots (today only / this week only); Month is a
 * 6-month trend; Custom lets the user pick an explicit date range. */
const PatientTrendChart: React.FC = () => {
  const [granularity, setGranularity] = useState<PatientTrendGranularity>('day');
  const [data, setData] = useState<PatientTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = formatLocalDateISO();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  // Only set once "Apply" is clicked — the graph for Custom mode stays hidden
  // until then, rather than re-fetching on every date-picker keystroke.
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);

  const fetchTrend = useCallback(async (g: PatientTrendGranularity, from?: string, to?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await patientService.getNewVsReturningTrend(g, from, to);
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load patient trend.');
    }
    setLoading(false);
  }, []);

  // Day / Week / Month fetch immediately on tab switch.
  useEffect(() => {
    if (granularity === 'custom') return;
    fetchTrend(granularity);
  }, [granularity, fetchTrend]);

  // Custom fetches only when a range has been explicitly applied.
  useEffect(() => {
    if (granularity !== 'custom' || !appliedRange) return;
    fetchTrend('custom', appliedRange.from, appliedRange.to);
  }, [granularity, appliedRange, fetchTrend]);

  const handleTabClick = (g: PatientTrendGranularity) => {
    setGranularity(g);
    if (g !== 'custom') setAppliedRange(null);
  };

  const rangeInvalid = customFrom > customTo;

  const handleApplyRange = () => {
    if (!customFrom || !customTo || rangeInvalid) return;
    setAppliedRange({ from: customFrom, to: customTo });
  };

  const showingCustomPrompt = granularity === 'custom' && !appliedRange;

  const chartData = data?.buckets.map(b => ({
    label: b.label,
    New: b.new_patients,
    Returning: b.returning_patients,
    Upcoming: b.upcoming_patients,
  })) ?? [];

  const totalNew = data?.buckets.reduce((s, b) => s + b.new_patients, 0) ?? 0;
  const totalReturning = data?.buckets.reduce((s, b) => s + b.returning_patients, 0) ?? 0;
  const totalUpcoming = data?.buckets.reduce((s, b) => s + b.upcoming_patients, 0) ?? 0;
  const hasData = totalNew > 0 || totalReturning > 0 || totalUpcoming > 0;

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
              onClick={() => handleTabClick(tab.key)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                granularity === tab.key ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom range picker */}
      {granularity === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 mt-4 mb-1 p-3 bg-slate-50 rounded-lg border border-slate-100">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">From</label>
            <input
              type="date"
              value={customFrom}
              max={today}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To</label>
            <input
              type="date"
              value={customTo}
              max={today}
              onChange={e => setCustomTo(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleApplyRange}
            disabled={!customFrom || !customTo || rangeInvalid}
            className="px-4 py-1.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply
          </button>
          {rangeInvalid && (
            <p className="text-xs text-red-500 font-medium">"From" date must not be after "To" date.</p>
          )}
        </div>
      )}

      {/* Summary chips */}
      {!loading && !error && !showingCustomPrompt && (
        <div className="flex items-center gap-4 mb-4 mt-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />
            New: {totalNew.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
            Returning: {totalReturning.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
            Upcoming: {totalUpcoming.toLocaleString()}
          </span>
        </div>
      )}

      {showingCustomPrompt && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <span className="material-symbols-outlined text-slate-300 text-3xl">date_range</span>
          <p className="text-sm text-slate-400">Pick a date range above and click Apply to see the graph.</p>
        </div>
      )}

      {!showingCustomPrompt && loading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
        </div>
      )}

      {!showingCustomPrompt && !loading && error && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
          <p className="text-sm text-slate-500">{error}</p>
          <button
            onClick={() => granularity === 'custom' && appliedRange
              ? fetchTrend('custom', appliedRange.from, appliedRange.to)
              : fetchTrend(granularity)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {!showingCustomPrompt && !loading && !error && !hasData && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <span className="material-symbols-outlined text-slate-300 text-3xl">bar_chart</span>
          <p className="text-sm text-slate-400">No patient visits in this period yet.</p>
        </div>
      )}

      {!showingCustomPrompt && !loading && !error && hasData && (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="New" fill="#2563eb" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Returning" fill="#34d399" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Upcoming" fill="#fbbf24" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default PatientTrendChart;
