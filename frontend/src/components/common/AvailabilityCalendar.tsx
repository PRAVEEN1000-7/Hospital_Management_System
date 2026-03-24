import React, { useMemo } from 'react';
import { formatLocalDateISO, formatMonthKey } from '../../utils/calendarDate';

interface AvailabilityCalendarProps {
  monthKey: string;
  onMonthKeyChange: (nextMonthKey: string) => void;
  selectedDate: string;
  onSelectDate: (dateIso: string) => void;
  minDateISO: string;
  availabilityMap: Record<string, boolean>;
  loading?: boolean;
  selectedDateLabel?: string;
  unavailableHint?: string;
}

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({
  monthKey,
  onMonthKeyChange,
  selectedDate,
  onSelectDate,
  minDateISO,
  availabilityMap,
  loading = false,
  selectedDateLabel = 'Selected date',
  unavailableHint = 'No slot available on selected date. Please choose another date.',
}) => {
  const calendar = useMemo(() => {
    const [year, month] = monthKey.split('-').map(Number);
    const monthDate = new Date(year, (month || 1) - 1, 1);
    const firstWeekday = monthDate.getDay();
    const daysInMonth = new Date(year, month || 1, 0).getDate();

    const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const iso = formatLocalDateISO(new Date(year, (month || 1) - 1, day));
      return { day, iso };
    });

    return {
      label: monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      firstWeekday,
      dayCells,
    };
  }, [monthKey]);

  const selectedIsUnavailable = selectedDate ? availabilityMap[selectedDate] === false : false;

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/40">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => {
            const [y, m] = monthKey.split('-').map(Number);
            const prev = formatMonthKey(new Date(y, (m || 1) - 2, 1));
            if (prev >= minDateISO.slice(0, 7)) onMonthKeyChange(prev);
          }}
          disabled={monthKey <= minDateISO.slice(0, 7)}
          className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Previous month"
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
        </button>
        <p className="text-sm font-semibold text-slate-800">{calendar.label}</p>
        <button
          type="button"
          onClick={() => {
            const [y, m] = monthKey.split('-').map(Number);
            const next = formatMonthKey(new Date(y, m || 1, 1));
            onMonthKeyChange(next);
          }}
          className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
          title="Next month"
        >
          <span className="material-symbols-outlined text-base">chevron_right</span>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEK_DAYS.map((day) => (
          <div key={day} className="text-[10px] font-semibold text-slate-500 text-center py-1">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: calendar.firstWeekday }).map((_, i) => (
          <div key={`blank-${i}`} className="h-9" />
        ))}
        {calendar.dayCells.map((cell) => {
          const isBeforeMinDate = cell.iso < minDateISO;
          const isSelected = selectedDate === cell.iso;
          const availability = availabilityMap[cell.iso];
          const isAvailable = !isBeforeMinDate && availability === true;
          const isUnavailable = !isBeforeMinDate && availability === false;

          return (
            <button
              key={cell.iso}
              type="button"
              disabled={isBeforeMinDate}
              onClick={() => onSelectDate(cell.iso)}
              className={`h-9 rounded-lg text-xs font-semibold border transition-colors ${
                isSelected
                  ? 'bg-primary text-white border-primary'
                  : isBeforeMinDate
                  ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed'
                  : isAvailable
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : isUnavailable
                  ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title={isBeforeMinDate ? 'Date not selectable' : isAvailable ? 'Slots available' : isUnavailable ? 'No slot available' : 'Checking availability'}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-3 text-[11px]">
        <span className="inline-flex items-center gap-1 text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />Available</span>
        <span className="inline-flex items-center gap-1 text-red-700"><span className="w-2 h-2 rounded-full bg-red-500" />Unavailable</span>
        {loading && <span className="text-slate-500">Checking...</span>}
      </div>

      {selectedDate && (
        <p className="text-xs text-slate-500 mt-1.5">
          {selectedDateLabel}: <strong>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
        </p>
      )}

      {selectedIsUnavailable && <p className="text-xs text-red-600 mt-1.5">{unavailableHint}</p>}
    </div>
  );
};

export default AvailabilityCalendar;
