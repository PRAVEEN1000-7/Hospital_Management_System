import React from 'react';
import { useWorkforceReportsStore, type WorkforcePeriodPreset } from '../../stores/workforceReportsStore';
import {
  useDailyAttendanceCount, useAbsenteeReport, useVerifiedAttendanceSheet,
  useLopReport, usePaidLeaveBalanceReport, useHeadcount,
} from '../../hooks/useWorkforceReportsQueries';

const PERIOD_LABELS: Record<WorkforcePeriodPreset, string> = {
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  month: 'This Month',
  custom: 'Custom',
};

const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
    <div className="px-4 py-3 border-b border-slate-200">
      <h2 className="text-sm font-bold text-slate-700">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="text-center py-8 text-sm text-slate-400">{label}</div>
);

const WorkforceReports: React.FC = () => {
  const { period, dateFrom, dateTo, year, setPeriod, setYear } = useWorkforceReportsStore();
  const filters = { dateFrom, dateTo, year };

  const headcount = useHeadcount();
  const dailyAttendance = useDailyAttendanceCount(filters);
  const absentees = useAbsenteeReport(filters);
  const verifiedSheet = useVerifiedAttendanceSheet(filters);
  const lop = useLopReport(year);
  const paidLeaveBalance = usePaidLeaveBalanceReport(year);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Workforce Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Attendance, absenteeism, verification, and leave/LOP reports across your workforce</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(Object.keys(PERIOD_LABELS) as WorkforcePeriodPreset[]).filter(p => p !== 'custom').map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${period === p ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">{dateFrom} to {dateTo}</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Leave Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
            {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Headcount */}
      <SectionCard title="Headcount">
        {headcount.isLoading ? (
          <div className="py-8 text-center"><div className="w-5 h-5 border-4 border-slate-200 border-t-primary rounded-full animate-spin mx-auto" /></div>
        ) : headcount.data && headcount.data.total > 0 ? (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-500">Total Employees</p>
              <p className="text-lg font-bold text-primary">{headcount.data.total}</p>
            </div>
            {headcount.data.by_employment_type.map(t => (
              <div key={t.employment_type} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] text-slate-500 capitalize">{t.employment_type.replace('_', ' ')}</p>
                <p className="text-lg font-bold text-slate-800">{t.count}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState label="No employee records yet" />
        )}
      </SectionCard>

      {/* Daily Attendance Count */}
      <SectionCard title="Daily Attendance Count" subtitle="Present / absent / on leave / holiday / not marked, per day">
        {dailyAttendance.data && dailyAttendance.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left font-bold text-slate-600 uppercase">Date</th>
                  <th className="px-4 py-2.5 text-center font-bold text-emerald-600 uppercase">Present</th>
                  <th className="px-4 py-2.5 text-center font-bold text-red-600 uppercase">Absent</th>
                  <th className="px-4 py-2.5 text-center font-bold text-blue-600 uppercase">On Leave</th>
                  <th className="px-4 py-2.5 text-center font-bold text-amber-600 uppercase">Holiday</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyAttendance.data.map(row => (
                  <tr key={row.date}>
                    <td className="px-4 py-2 font-medium text-slate-700">{row.date}</td>
                    <td className="px-4 py-2 text-center">{row.present}</td>
                    <td className="px-4 py-2 text-center">{row.absent}</td>
                    <td className="px-4 py-2 text-center">{row.on_leave}</td>
                    <td className="px-4 py-2 text-center">{row.holiday}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState label="No attendance marked in this period" />
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Absentee Report */}
        <SectionCard title="Absentee Report" subtitle="Employees with absences in this period">
          {absentees.data && absentees.data.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {absentees.data.map(row => (
                <div key={row.employee_id} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{row.employee_name || row.employee_id}</span>
                  <span className="text-xs font-bold text-red-600">{row.absent_days} day(s)</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No absences in this period" />
          )}
        </SectionCard>

        {/* Verified Attendance Sheet */}
        <SectionCard title="Verified Attendance Sheet" subtitle="Locked rows Payroll will read from">
          {verifiedSheet.data && verifiedSheet.data.length > 0 ? (
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {verifiedSheet.data.map((row, i) => (
                <div key={i} className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-slate-700">{row.employee_name || row.employee_id}</span>
                  <span className="text-slate-500">{row.date}</span>
                  <span className="text-xs font-semibold capitalize text-slate-600">{row.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No verified attendance in this period" />
          )}
        </SectionCard>

        {/* LOP Report */}
        <SectionCard title="LOP Report" subtitle={`Leave-without-pay days for ${year}`}>
          {lop.data && lop.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-bold text-slate-600 uppercase">Employee</th>
                    <th className="px-4 py-2.5 text-center font-bold text-slate-600 uppercase">Allocated</th>
                    <th className="px-4 py-2.5 text-center font-bold text-slate-600 uppercase">Taken</th>
                    <th className="px-4 py-2.5 text-center font-bold text-red-600 uppercase">LOP Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lop.data.map(row => (
                    <tr key={row.employee_id}>
                      <td className="px-4 py-2 font-medium text-slate-700">{row.employee_name || row.employee_id}</td>
                      <td className="px-4 py-2 text-center">{row.allocated}</td>
                      <td className="px-4 py-2 text-center">{row.leave_taken}</td>
                      <td className="px-4 py-2 text-center font-bold text-red-600">{row.lop_days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState label={`No leave-without-pay for ${year}`} />
          )}
        </SectionCard>

        {/* Paid Leave Balance Report */}
        <SectionCard title="Paid Leave Balance Report" subtitle={`Entitlement vs. usage for ${year}`}>
          {paidLeaveBalance.data && paidLeaveBalance.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-bold text-slate-600 uppercase">Employee</th>
                    <th className="px-4 py-2.5 text-center font-bold text-slate-600 uppercase">Allocated</th>
                    <th className="px-4 py-2.5 text-center font-bold text-slate-600 uppercase">Used</th>
                    <th className="px-4 py-2.5 text-center font-bold text-emerald-600 uppercase">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paidLeaveBalance.data.map(row => (
                    <tr key={row.employee_id}>
                      <td className="px-4 py-2 font-medium text-slate-700">{row.employee_name || row.employee_id}</td>
                      <td className="px-4 py-2 text-center">{row.allocated}</td>
                      <td className="px-4 py-2 text-center">{row.used}</td>
                      <td className="px-4 py-2 text-center font-bold text-emerald-600">{row.remaining}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState label={`No employee leave balances for ${year}`} />
          )}
        </SectionCard>
      </div>
    </div>
  );
};

export default WorkforceReports;
