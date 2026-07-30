import React, { useMemo, useState } from 'react';
import type { Holiday } from '../../types/holiday';
import { formatLocalDateISO, formatMonthKey, formatDateOnly } from '../../utils/calendarDate';

interface HolidayMonthCalendarProps {
  holidays: Holiday[];
  onDeleteHoliday: (holiday: Holiday) => void;
  onAddHolidayForDate: (iso: string) => void;
  /** Called whenever the visible month changes, so the page can refetch that month's data. */
  onMonthChange?: (monthKey: string) => void;
}

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DayStatus = 'festival' | 'weekly_off' | 'other' | 'empty';

interface DayInfo {
  day: number;
  iso: string;
  holiday: Holiday | undefined;
  status: DayStatus;
}

const STATUS_STYLES: Record<DayStatus, string> = {
  festival: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  weekly_off: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  other: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
  empty: 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50',
};

const HolidayMonthCalendar: React.FC<HolidayMonthCalendarProps> = ({
  holidays, onDeleteHoliday, onAddHolidayForDate, onMonthChange,
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
      const holiday = holidays.find(h => h.date === iso);
      const status: DayStatus = holiday ? holiday.type : 'empty';
      return { day, iso, holiday, status };
    });

    return {
      label: monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      firstWeekday,
      dayCells,
    };
  }, [monthKey, holidays]);

  const selectedDay = calendar.dayCells.find(c => c.iso === selectedIso);

  const goToMonth = (offset: number) => {
    const [y, m] = monthKey.split('-').map(Number);
    const next = formatMonthKey(new Date(y, (m || 1) - 1 + offset, 1));
    setMonthKey(next);
    onMonthChange?.(next);
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
                title={cell.holiday ? `${cell.holiday.name} (${cell.holiday.type.replace('_', ' ')})` : 'No holiday'}
              >
                <span className="text-xs font-bold">{cell.day}</span>
                {cell.holiday && (
                  <span className="text-[9px] font-semibold truncate w-full flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-xs leading-none">event_busy</span>
                    {cell.holiday.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px]">
          <span className="inline-flex items-center gap-1 text-amber-700"><span className="w-2 h-2 rounded-full bg-amber-500" />Festival</span>
          <span className="inline-flex items-center gap-1 text-blue-700"><span className="w-2 h-2 rounded-full bg-blue-500" />Weekly Off</span>
          <span className="inline-flex items-center gap-1 text-purple-700"><span className="w-2 h-2 rounded-full bg-purple-500" />Other</span>
          <span className="inline-flex items-center gap-1 text-slate-400"><span className="w-2 h-2 rounded-full bg-slate-300" />No holiday</span>
        </div>
      </div>

      {/* Day detail */}
      {selectedDay && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mt-4">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800">
              {formatDateOnly(selectedDay.iso, 'EEEE, MMMM d, yyyy')}
            </h3>
            {!selectedDay.holiday && (
              <button onClick={() => onAddHolidayForDate(selectedDay.iso)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg text-[11px] font-semibold hover:bg-primary/20 transition-colors">
                <span className="material-symbols-outlined text-sm">add_circle</span> Add Holiday
              </button>
            )}
          </div>

          {selectedDay.holiday ? (
            <div className={`flex items-start justify-between rounded-lg px-3 py-2 ${
              selectedDay.holiday.type === 'festival' ? 'bg-amber-50 border border-amber-200'
                : selectedDay.holiday.type === 'weekly_off' ? 'bg-blue-50 border border-blue-200'
                : 'bg-purple-50 border border-purple-200'
            }`}>
              <div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  selectedDay.holiday.type === 'festival' ? 'bg-amber-100 text-amber-700'
                    : selectedDay.holiday.type === 'weekly_off' ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>{selectedDay.holiday.type.replace('_', ' ')}</span>
                <p className="text-sm font-semibold text-slate-700 mt-1">{selectedDay.holiday.name}</p>
              </div>
              <button onClick={() => onDeleteHoliday(selectedDay.holiday!)}
                className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Remove holiday">
                <span className="material-symbols-outlined text-lg">delete</span>
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No holiday on this date</p>
          )}
        </div>
      )}
    </div>
  );
};

export default HolidayMonthCalendar;
