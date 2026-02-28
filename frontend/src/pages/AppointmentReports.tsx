import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import appointmentService from '../services/appointmentService';
import type { AppointmentStats, EnhancedAppointmentStats } from '../types/appointment';

const AppointmentReports: React.FC = () => {
  const toast = useToast();

  const [stats, setStats] = useState<AppointmentStats | null>(null);
  const [enhanced, setEnhanced] = useState<EnhancedAppointmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'overview' | 'doctors' | 'trends' | 'peak'>('overview');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [basic, enh] = await Promise.all([
        appointmentService.getStats(startDate, endDate),
        appointmentService.getEnhancedStats(startDate, endDate),
      ]);
      setStats(basic);
      setEnhanced(enh);
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

      {/* Section Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-6">
        {(['overview', 'doctors', 'trends', 'peak'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveSection(tab)}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors capitalize ${activeSection === tab ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {tab === 'peak' ? 'Peak Times' : tab === 'doctors' ? 'Doctor Utilization' : tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : stats ? (
        <>
          {/* Overview Section */}
          {activeSection === 'overview' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Total Appointments', value: stats.total_appointments, icon: 'calendar_month', lightColor: 'bg-blue-50 text-blue-600' },
                  { label: 'Completed', value: stats.total_completed, icon: 'task_alt', lightColor: 'bg-emerald-50 text-emerald-600' },
                  { label: 'Cancelled', value: stats.total_cancelled, icon: 'cancel', lightColor: 'bg-red-50 text-red-600' },
                  { label: 'No Shows', value: stats.total_no_shows, icon: 'person_off', lightColor: 'bg-slate-100 text-slate-600' },
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 mb-4">Cancellation Reasons</h3>
                  {enhanced?.cancellation_reasons && enhanced.cancellation_reasons.length > 0 ? (
                    <div className="space-y-2">
                      {enhanced.cancellation_reasons.map((cr, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                          <span className="text-sm text-slate-600 truncate flex-1">{cr.reason || 'No reason given'}</span>
                          <span className="text-sm font-bold text-slate-900 ml-2">{cr.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No cancellation data</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Doctor Utilization Section */}
          {activeSection === 'doctors' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Doctor Utilization</h3>
                <p className="text-xs text-slate-400 mt-0.5">Performance breakdown by doctor</p>
              </div>
              {enhanced?.doctor_utilization && enhanced.doctor_utilization.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {['Doctor', 'Total', 'Completed', 'Cancelled', 'No-Show', 'Completion %'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {enhanced.doctor_utilization.map((doc) => (
                        <tr key={doc.doctor_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-900">{doc.doctor_name}</td>
                          <td className="px-4 py-3 text-slate-700">{doc.total_appointments}</td>
                          <td className="px-4 py-3 text-emerald-600 font-semibold">{doc.completed}</td>
                          <td className="px-4 py-3 text-red-500">{doc.cancelled}</td>
                          <td className="px-4 py-3 text-slate-500">{doc.no_shows}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${doc.utilization_rate}%` }} />
                              </div>
                              <span className="text-xs font-bold text-slate-600">{doc.utilization_rate}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400"><p className="text-sm">No doctor utilization data</p></div>
              )}
            </div>
          )}

          {/* Trends Section */}
          {activeSection === 'trends' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Department Breakdown</h3>
                {enhanced?.department_breakdown && enhanced.department_breakdown.length > 0 ? (
                  <div className="space-y-3">
                    {enhanced.department_breakdown.map((dept, idx) => {
                      const maxCount = Math.max(...enhanced.department_breakdown.map(d => d.total));
                      const pct = maxCount > 0 ? Math.round((dept.total / maxCount) * 100) : 0;
                      return (
                        <div key={idx}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-slate-700">{dept.department || 'Unassigned'}</span>
                            <span className="text-sm font-bold text-slate-900">{dept.total}</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No department data</p>
                )}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Daily Appointment Trends</h3>
                {enhanced?.trends && enhanced.trends.length > 0 ? (
                  <div className="space-y-1 max-h-80 overflow-y-auto">
                    {enhanced.trends.map((t, idx) => {
                      const maxCount = Math.max(...enhanced.trends.map(d => d.total));
                      const pct = maxCount > 0 ? Math.round((t.total / maxCount) * 100) : 0;
                      return (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="text-[10px] text-slate-400 font-mono w-20 flex-shrink-0">{t.date}</span>
                          <div className="flex-1 h-5 bg-slate-50 rounded overflow-hidden">
                            <div className="h-full bg-primary/20 rounded" style={{ width: `${pct}%` }}>
                              <span className="text-[10px] font-bold text-primary px-2 leading-5">{t.total}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No trend data</p>
                )}
              </div>
            </div>
          )}

          {/* Peak Times Section */}
          {activeSection === 'peak' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Peak Booking Hours</h3>
              <p className="text-xs text-slate-400 mb-4">Appointment count by hour of day</p>
              {enhanced?.peak_times && enhanced.peak_times.length > 0 ? (
                <div className="grid grid-cols-12 gap-1 items-end" style={{ minHeight: '200px' }}>
                  {Array.from({ length: 12 }, (_, i) => i + 7).map(h => {
                    const slot = enhanced.peak_times.find(p => p.hour === h);
                    const count = slot?.count || 0;
                    const maxCount = Math.max(...enhanced.peak_times.map(p => p.count), 1);
                    const height = Math.max((count / maxCount) * 160, 4);
                    return (
                      <div key={h} className="flex flex-col items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-600">{count}</span>
                        <div className="w-full bg-primary/20 rounded-t" style={{ height: `${height}px` }}
                          title={`${h}:00 — ${count} appointments`} />
                        <span className="text-[10px] text-slate-400">{h % 12 || 12}{h >= 12 ? 'p' : 'a'}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No peak time data</p>
              )}
            </div>
          )}
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
