import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import appointmentService from '../services/appointmentService';
import type { AppointmentStats } from '../types/appointment';

const AppointmentReports: React.FC = () => {
  const toast = useToast();

  const [stats, setStats] = useState<AppointmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await appointmentService.getStats(startDate, endDate);
      setStats(data);
    } catch {
      toast.error('Failed to load statistics');
    }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const presetPeriods = [
    { label: 'Today', fn: () => { const t = new Date().toISOString().split('T')[0]; setStartDate(t); setEndDate(t); } },
    { label: 'This Week', fn: () => { const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); d.setDate(diff); setStartDate(d.toISOString().split('T')[0]); setEndDate(new Date().toISOString().split('T')[0]); } },
    { label: 'This Month', fn: () => { const d = new Date(); d.setDate(1); setStartDate(d.toISOString().split('T')[0]); setEndDate(new Date().toISOString().split('T')[0]); } },
    { label: 'Last 30 Days', fn: () => { const d = new Date(); d.setDate(d.getDate() - 30); setStartDate(d.toISOString().split('T')[0]); setEndDate(new Date().toISOString().split('T')[0]); } },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Appointment Reports</h1>
        <p className="text-slate-500 text-sm mt-1">Analytics and statistics for appointments</p>
      </div>

      {/* Date Range */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">From</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">To</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {presetPeriods.map(p => (
              <button key={p.label} onClick={p.fn}
                className="px-3 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : stats ? (
        <>
          {/* Main Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Appointments', value: stats.total_appointments, icon: 'calendar_month', color: 'bg-blue-500', lightColor: 'bg-blue-50 text-blue-600' },
              { label: 'Completed', value: stats.total_completed, icon: 'task_alt', color: 'bg-emerald-500', lightColor: 'bg-emerald-50 text-emerald-600' },
              { label: 'Cancelled', value: stats.total_cancelled, icon: 'cancel', color: 'bg-red-500', lightColor: 'bg-red-50 text-red-600' },
              { label: 'No Shows', value: stats.total_no_shows, icon: 'person_off', color: 'bg-slate-500', lightColor: 'bg-slate-100 text-slate-600' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.lightColor}`}>
                    <span className="material-symbols-outlined">{s.icon}</span>
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Rates */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Completion Rate', value: stats.total_appointments > 0 ? Math.round((stats.total_completed / stats.total_appointments) * 100) : 0, color: 'emerald' },
              { label: 'Cancellation Rate', value: stats.total_appointments > 0 ? Math.round((stats.total_cancelled / stats.total_appointments) * 100) : 0, color: 'red' },
              { label: 'No-Show Rate', value: stats.total_appointments > 0 ? Math.round((stats.total_no_shows / stats.total_appointments) * 100) : 0, color: 'slate' },
            ].map(r => (
              <div key={r.label} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-slate-600">{r.label}</p>
                  <p className={`text-2xl font-bold text-${r.color}-600`}>{r.value}%</p>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full bg-${r.color}-500 rounded-full transition-all duration-500`} style={{ width: `${r.value}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Breakdown Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Type */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4">By Appointment Type</h3>
              <div className="space-y-3">
                {[
                  { label: 'Scheduled', value: stats.total_scheduled || 0, icon: 'event', color: 'text-blue-500 bg-blue-50' },
                  { label: 'Walk-in', value: stats.total_walk_ins || 0, icon: 'directions_walk', color: 'text-orange-500 bg-orange-50' },
                ].map(t => (
                  <div key={t.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.color}`}>
                        <span className="material-symbols-outlined text-lg">{t.icon}</span>
                      </div>
                      <span className="text-sm font-medium text-slate-700">{t.label}</span>
                    </div>
                    <span className="text-lg font-bold text-slate-900">{t.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Summary</h3>
              <div className="space-y-3">
                {[
                  { label: 'Pending', value: stats.total_pending || 0 },
                  { label: 'Confirmed', value: stats.total_completed || 0 },
                  { label: 'In Progress', value: 0 },
                  { label: 'Avg. Wait Time', value: stats.average_wait_time ? `${stats.average_wait_time} min` : 'N/A' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                    <span className="text-sm text-slate-500">{item.label}</span>
                    <span className="text-sm font-bold text-slate-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
          <span className="material-symbols-outlined text-5xl mb-3 block">analytics</span>
          <p className="text-sm font-medium">No data available</p>
        </div>
      )}
    </div>
  );
};

export default AppointmentReports;
