import React, { useMemo, useState } from 'react';
import type { DoctorLeave } from '../../types/appointment';
import { formatLocalDateISO, formatMonthKey, formatDateOnly } from '../../utils/calendarDate';
import { formatTimeStr } from '../../pages/DoctorSchedule';

interface ScheduleMonthCalendarProps {
  doctorLeaves: DoctorLeave[];
  onDeleteLeave: (id: string) => void;
  onAddLeaveForDate: (iso: string) => void;
  // Hospital's OPD Session Timings — get_available_slots() falls back to
  // these for every day, since there is no more per-day "Add Slot"
  // customization in this UI. A day is available by default; the only way
  // to block it is to mark it as Leave.
  sessionDefaults: { start: string; breakStart: string; breakEnd: string; end: string };
}

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DayStatus = 'blocked' | 'partial' | 'available';

interface DayInfo {
  day: number;
  iso: string;
  leave: DoctorLeave | undefined;
  status: DayStatus;
}

const STATUS_STYLES: Record<DayStatus, string> = {
  available: 'bg-sky-50 text-sky-600 border-sky-200 hover:bg-sky-100',
  partial: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  blocked: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
};

const ScheduleMonthCalendar: React.FC<ScheduleMonthCalendarProps> = ({
  doctorLeaves, onDeleteLeave, onAddLeaveForDate, sessionDefaults,
}) => {
  const [monthKey, setMonthKey] = useState(() => formatMonthKey());
  const [selectedIso, setSelectedIso] = useState(() => formatLocalDateISO());

  const calendar = useMemo(() => {
    const [year, month] = monthKey.split('-').map(Number);
    const monthDate = new Date(year, (month || 1) - 1, 1);
    const firstWeekday = monthDate.getDay();
    const daysInMonth = new Date(year, month || 1, 0).getDate();

    const dayCells: DayInfo[] = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const cellDate = new Date(year, (month || 1) - 1, day);
      const iso = formatLocalDateISO(cellDate);

      const leave = doctorLeaves.find(lv => lv.leave_date === iso);

      let status: DayStatus = 'available';
      if (leave?.leave_type === 'full_day') status = 'blocked';
      else if (leave) status = 'partial';

      return { day, iso, leave, status };
    });

    return {
      label: monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      firstWeekday,
      dayCells,
    };
  }, [monthKey, doctorLeaves]);

  const selectedDay = calendar.dayCells.find(c => c.iso === selectedIso);

  const goToMonth = (offset: number) => {
    const [y, m] = monthKey.split('-').map(Number);
    setMonthKey(formatMonthKey(new Date(y, (m || 1) - 1 + offset, 1)));
  };

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => goToMonth(-1)}
            className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
            title="Previous month">
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <p className="text-sm font-bold text-slate-800">{calendar.label}</p>
          <button type="button" onClick={() => goToMonth(1)}
            className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
            title="Next month">
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {WEEK_DAYS.map(d => (
            <div key={d} className="text-[10px] font-semibold text-slate-500 text-center py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: calendar.firstWeekday }).map((_, i) => (
            <div key={`blank-${i}`} className="h-16" />
          ))}
          {calendar.dayCells.map(cell => {
            const isSelected = cell.iso === selectedIso;
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedIso(cell.iso)}
                className={`h-16 rounded-lg border p-1.5 flex flex-col items-start justify-between text-left transition-colors ${
                  isSelected ? 'ring-2 ring-primary ring-offset-1' : ''
                } ${STATUS_STYLES[cell.status]}`}
                title={
                  cell.status === 'blocked' ? 'Full day leave'
                  : cell.status === 'partial' ? `${cell.leave?.leave_type} leave`
                  : `Available (default hours: ${formatTimeStr(sessionDefaults.start)} – ${formatTimeStr(sessionDefaults.end)})`
                }
              >
                <span className="text-xs font-bold">{cell.day}</span>
                {(cell.status === 'blocked' || cell.status === 'partial') && (
                  <span className="material-symbols-outlined text-xs leading-none">event_busy</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px]">
          <span className="inline-flex items-center gap-1 text-sky-600"><span className="w-2 h-2 rounded-full bg-sky-400" />Available</span>
          <span className="inline-flex items-center gap-1 text-amber-700"><span className="w-2 h-2 rounded-full bg-amber-500" />Partial leave</span>
          <span className="inline-flex items-center gap-1 text-red-700"><span className="w-2 h-2 rounded-full bg-red-500" />Full leave</span>
        </div>
      </div>

      {/* Day detail */}
      {selectedDay && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mt-4">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800">
              {formatDateOnly(selectedDay.iso, 'EEEE, MMMM d, yyyy')}
            </h3>
            {!selectedDay.leave && (
              <button onClick={() => onAddLeaveForDate(selectedDay.iso)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[11px] font-semibold hover:bg-slate-50 transition-colors">
                <span className="material-symbols-outlined text-sm">event_busy</span> Mark Leave
              </button>
            )}
          </div>

          {selectedDay.leave && (
            <div className={`flex items-start justify-between rounded-lg px-3 py-2 mb-3 ${
              selectedDay.leave.leave_type === 'full_day' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'
            }`}>
              <div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  selectedDay.leave.leave_type === 'full_day' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>{selectedDay.leave.leave_type?.replace('_', ' ')}</span>
                {selectedDay.leave.reason && <p className="text-xs text-slate-500 mt-1">{selectedDay.leave.reason}</p>}
              </div>
              <button onClick={() => onDeleteLeave(selectedDay.leave!.id)}
                className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Remove leave">
                <span className="material-symbols-outlined text-lg">delete</span>
              </button>
            </div>
          )}

          {selectedDay.status === 'blocked' ? (
            <p className="text-xs text-slate-400 italic">No slots — full day leave</p>
          ) : (
            <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-sky-600 text-lg">event_available</span>
              <div>
                <p className="text-xs font-semibold text-sky-700">Available by default</p>
                <p className="text-[11px] text-sky-600">
                  {formatTimeStr(sessionDefaults.start)} – {formatTimeStr(sessionDefaults.breakStart)}, {formatTimeStr(sessionDefaults.breakEnd)} – {formatTimeStr(sessionDefaults.end)} (Appointment Settings)
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScheduleMonthCalendar;
