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
import { useOPDSummary, useDoctorWiseReport } from '../../hooks/useAnalyticsQueries';
import { useAnalyticsStore } from '../../stores/analyticsStore';

// ── Currency ─────────────────────────────────────────────────────────────

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

// ── Mini stat card ───────────────────────────────────────────────────────

interface MiniStatProps {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}

const MiniStat: React.FC<MiniStatProps> = ({ label, value, icon, color }) => (
  <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
    <span className={`material-symbols-outlined text-xl ${color}`}>{icon}</span>
    <div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-800 dark:text-white">{value}</p>
    </div>
  </div>
);

// ── Star rating ──────────────────────────────────────────────────────────

const Stars: React.FC<{ rating: number }> = ({ rating }) => {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="inline-flex text-amber-400">
      {'★'.repeat(full)}
      {half && '½'}
      {'☆'.repeat(5 - full - (half ? 1 : 0))}
    </span>
  );
};

// ── Chart tooltip ────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
      <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

// ── Panel ────────────────────────────────────────────────────────────────

const OPDPanel: React.FC = () => {
  const filters = useAnalyticsStore((s) => s.filters);
  const opd = useOPDSummary(filters);
  const doctors = useDoctorWiseReport(filters);

  const isLoading = opd.isLoading || doctors.isLoading;
  const error = opd.error || doctors.error;

  return (
    <PanelCard
      title="OPD Statistics"
      status="live"
      isLoading={isLoading}
      error={error ? 'Failed to load OPD data' : null}
      onRetry={() => {
        opd.refetch();
        doctors.refetch();
      }}
    >
      {/* Mini stats grid */}
      {opd.data && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Total Today" value={opd.data.total_today} icon="groups" color="text-primary" />
          <MiniStat label="Walk-ins" value={opd.data.walk_ins} icon="directions_walk" color="text-amber-500" />
          <MiniStat label="Scheduled" value={opd.data.scheduled} icon="event" color="text-emerald-500" />
          <MiniStat
            label="Avg Wait"
            value={`${opd.data.avg_wait_time} min`}
            icon="schedule"
            color="text-violet-500"
          />
        </div>
      )}

      {/* Horizontal bar chart — patients by doctor */}
      {doctors.data && doctors.data.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Patients Seen by Doctor
          </h4>
          <ResponsiveContainer width="100%" height={Math.max(200, doctors.data.length * 40)}>
            <BarChart data={doctors.data} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="doctor_name"
                tick={{ fontSize: 11 }}
                width={90}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="patients_seen" name="Patients" fill="#137fec" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Doctor table */}
      {doctors.data && doctors.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="sticky top-0 bg-white text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <th className="pb-2 font-medium">Doctor</th>
                <th className="pb-2 font-medium">Department</th>
                <th className="pb-2 text-center font-medium">Patients</th>
                <th className="pb-2 text-center font-medium">Avg Time</th>
                <th className="pb-2 text-center font-medium">Rating</th>
                <th className="pb-2 text-right font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {doctors.data.map((d, i) => (
                <tr
                  key={d.doctor_id}
                  className={`border-b border-slate-50 transition hover:bg-blue-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                    i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/40 dark:bg-slate-800/20'
                  }`}
                >
                  <td className="py-2 font-medium text-slate-700 dark:text-slate-200">
                    {d.doctor_name}
                  </td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">
                    {d.department || '—'}
                  </td>
                  <td className="py-2 text-center font-semibold">{d.patients_seen}</td>
                  <td className="py-2 text-center">{d.avg_consultation_time} min</td>
                  <td className="py-2 text-center">
                    <Stars rating={d.rating} />
                    <span className="ml-1 text-slate-400">{d.rating}</span>
                  </td>
                  <td className="py-2 text-right font-medium text-slate-700 dark:text-slate-200">
                    {inr.format(d.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
};

export default OPDPanel;
