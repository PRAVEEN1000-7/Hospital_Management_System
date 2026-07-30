import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import attendanceService from '../../services/attendanceService';
import employeeService from '../../services/employeeService';
import type { AttendanceRecord, AttendanceStatus } from '../../types/attendance';
import type { EmployeeProfile } from '../../types/employee';

// Cycle order for a grid-cell click. Verified cells are locked (no cycling).
const STATUS_CYCLE: AttendanceStatus[] = ['not_marked', 'present', 'absent', 'on_leave', 'holiday'];

const STATUS_META: Record<AttendanceStatus, { label: string; className: string }> = {
  not_marked: { label: '—', className: 'bg-white text-slate-300 border-slate-200' },
  present: { label: 'P', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  absent: { label: 'A', className: 'bg-red-100 text-red-700 border-red-200' },
  holiday: { label: 'H', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  on_leave: { label: 'L', className: 'bg-blue-100 text-blue-700 border-blue-200' },
};

function daysInMonth(year: number, month: number): string[] {
  const days: string[] = [];
  const count = new Date(year, month, 0).getDate();
  for (let d = 1; d <= count; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

const AttendanceGrid: React.FC = () => {
  const toast = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const dates = useMemo(() => daysInMonth(year, month), [year, month]);
  const dateFrom = dates[0];
  const dateTo = dates[dates.length - 1];

  const key = (employeeId: string, date: string) => `${employeeId}|${date}`;

  const fetchGrid = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, grid] = await Promise.all([
        employeeService.list(),
        attendanceService.getGrid(dateFrom, dateTo),
      ]);
      setEmployees(emps);
      const map = new Map<string, AttendanceRecord>();
      grid.data.forEach(r => map.set(key(r.employee_id, r.date), r));
      setRecords(map);
    } catch {
      toast.error('Failed to load attendance grid');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchGrid(); }, [fetchGrid]);

  const handleCellClick = async (employeeId: string, date: string) => {
    const existing = records.get(key(employeeId, date));
    if (existing?.is_verified) {
      toast.warning('This date is verified and locked');
      return;
    }
    const currentStatus = existing?.status || 'not_marked';
    const nextIndex = (STATUS_CYCLE.indexOf(currentStatus) + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIndex];
    try {
      const updated = await attendanceService.mark({ employee_id: employeeId, date, status: nextStatus });
      setRecords(prev => new Map(prev).set(key(employeeId, date), updated));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to mark attendance';
      toast.error(msg);
    }
  };

  const handleVerifyMonth = async () => {
    if (!window.confirm(`Verify and lock all attendance for ${dateFrom} to ${dateTo}? Locked rows can no longer be changed.`)) return;
    setVerifying(true);
    try {
      const res = await attendanceService.verify(dateFrom, dateTo);
      toast.success(`${res.verified_count} row(s) verified and locked`);
      fetchGrid();
    } catch {
      toast.error('Failed to verify attendance');
    } finally {
      setVerifying(false);
    }
  };

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
          <p className="text-sm text-slate-500 mt-1">Click a cell to cycle: not marked → present → absent → on leave → holiday</p>
        </div>
        <button
          onClick={handleVerifyMonth}
          disabled={verifying || loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-lg">verified</span>
          Verify {monthLabel}
        </button>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: 'long' })}</option>
            ))}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
            {Array.from({ length: 3 }, (_, i) => now.getFullYear() - 1 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div className="flex items-center gap-3 ml-auto text-xs">
            {(Object.keys(STATUS_META) as AttendanceStatus[]).filter(s => s !== 'not_marked').map(s => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded border text-[10px] font-bold ${STATUS_META[s].className}`}>{STATUS_META[s].label}</span>
                <span className="text-slate-500 capitalize">{s.replace('_', ' ')}</span>
              </span>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">groups</span>
            <p className="text-slate-500 mt-3 text-sm">No employees found — add employee details from Staff Directory first</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase min-w-[160px]">Employee</th>
                  {dates.map(d => (
                    <th key={d} className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-1 py-2 text-center text-[10px] font-semibold text-slate-500 min-w-[32px]">
                      {Number(d.slice(8, 10))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.user_id} className="hover:bg-slate-50/50">
                    <td className="sticky left-0 z-10 bg-white border-r border-b border-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 whitespace-nowrap">
                      {emp.employee_name || emp.user_id}
                    </td>
                    {dates.map(d => {
                      const rec = records.get(key(emp.user_id, d));
                      const status = rec?.status || 'not_marked';
                      const meta = STATUS_META[status];
                      const locked = rec?.is_verified;
                      return (
                        <td key={d} className="border-b border-slate-100 p-0.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleCellClick(emp.user_id, d)}
                            title={locked ? `${status} (verified — locked)` : status.replace('_', ' ')}
                            className={`w-7 h-7 rounded border text-[10px] font-bold flex items-center justify-center transition-colors ${meta.className} ${locked ? 'cursor-not-allowed opacity-80 ring-1 ring-slate-400' : 'cursor-pointer hover:brightness-95'}`}
                          >
                            {locked ? <span className="material-symbols-outlined text-[12px]">lock</span> : meta.label}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceGrid;
