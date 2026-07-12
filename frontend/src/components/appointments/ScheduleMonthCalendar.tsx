import React, { useMemo, useState } from 'react';
import type { DoctorSchedule, DoctorLeave } from '../../types/appointment';
import { formatLocalDateISO, formatMonthKey, formatDateOnly } from '../../utils/calendarDate';
import { formatTimeStr } from '../../pages/DoctorSchedule';

interface ScheduleMonthCalendarProps {
  schedules: DoctorSchedule[];
  doctorLeaves: DoctorLeave[];
  onEditSlotForDate: (s: DoctorSchedule, iso: string) => void;
  onDeleteSlotForDate: (s: DoctorSchedule, iso: string) => void;
  onDeleteLeave: (id: string) => void;
  onAddSlotForDate: (iso: string) => void;
  onAddLeaveForDate: (iso: string) => void;
}

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DayStatus = 'blocked' | 'partial' | 'scheduled' | 'empty';

interface DayInfo {
  day: number;
  iso: string;
  slots: DoctorSchedule[];
  leave: DoctorLeave | undefined;
  status: DayStatus;
}

const STATUS_STYLES: Record<DayStatus, string> = {
  scheduled: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  partial: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  blocked: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  empty: 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50',
};

const ScheduleMonthCalendar: React.FC<ScheduleMonthCalendarProps> = ({
  schedules, doctorLeaves, onEditSlotForDate, onDeleteSlotForDate, onDeleteLeave, onAddSlotForDate, onAddLeaveForDate,
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
      const weekday = cellDate.getDay();

      const slots = schedules.filter(s =>
        s.is_active &&
        s.day_of_week === weekday &&
        (!s.effective_from || iso >= s.effective_from) &&
        (!s.effective_to || iso <= s.effective_to)
      );
      const leave = doctorLeaves.find(lv => lv.leave_date === iso);

      let status: DayStatus = 'empty';
      if (leave?.leave_type === 'full_day') status = 'blocked';
      else if (leave) status = 'partial';
      else if (slots.length > 0) status = 'scheduled';

      return { day, iso, slots, leave, status };
    });

    return {
      label: monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      firstWeekday,
      dayCells,
    };
  }, [monthKey, schedules, doctorLeaves]);

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
                  : cell.status === 'scheduled' ? `${cell.slots.length} shift(s)`
                  : 'No schedule'
                }
              >
                <span className="text-xs font-bold">{cell.day}</span>
                {cell.status === 'scheduled' && (
                  <span className="text-[9px] font-semibold">{cell.slots.length} shift{cell.slots.length !== 1 ? 's' : ''}</span>
                )}
                {(cell.status === 'blocked' || cell.status === 'partial') && (
                  <span className="material-symbols-outlined text-xs leading-none">event_busy</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px]">
          <span className="inline-flex items-center gap-1 text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />Scheduled</span>
          <span className="inline-flex items-center gap-1 text-amber-700"><span className="w-2 h-2 rounded-full bg-amber-500" />Partial leave</span>
          <span className="inline-flex items-center gap-1 text-red-700"><span className="w-2 h-2 rounded-full bg-red-500" />Full leave</span>
          <span className="inline-flex items-center gap-1 text-slate-400"><span className="w-2 h-2 rounded-full bg-slate-300" />No schedule</span>
        </div>
      </div>

      {/* Day detail */}
      {selectedDay && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mt-4">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800">
              {formatDateOnly(selectedDay.iso, 'EEEE, MMMM d, yyyy')}
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={() => onAddSlotForDate(selectedDay.iso)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg text-[11px] font-semibold hover:bg-primary/20 transition-colors">
                <span className="material-symbols-outlined text-sm">add_circle</span> Add Slot
              </button>
              {!selectedDay.leave && (
                <button onClick={() => onAddLeaveForDate(selectedDay.iso)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[11px] font-semibold hover:bg-slate-50 transition-colors">
                  <span className="material-symbols-outlined text-sm">event_busy</span> Mark Leave
                </button>
              )}
            </div>
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

          {selectedDay.slots.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No schedule slots on this date</p>
          ) : (
            <div className={`space-y-2 ${selectedDay.status === 'blocked' ? 'opacity-40 pointer-events-none' : ''}`}>
              {selectedDay.slots.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-lg text-primary">schedule</span>
                    <div>
                      <span className="text-sm font-semibold text-slate-700">{formatTimeStr(s.start_time)} – {formatTimeStr(s.end_time)}</span>
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold">Max {s.max_patients} patients</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onEditSlotForDate(s, selectedDay.iso)}
                      className="text-slate-400 hover:text-primary transition-colors p-1" title="Edit this date only">
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button onClick={() => onDeleteSlotForDate(s, selectedDay.iso)}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Remove this date only">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScheduleMonthCalendar;
