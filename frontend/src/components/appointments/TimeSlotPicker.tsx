import React from 'react';
import type { TimeSlot } from '../../types/appointment';

interface Props {
  slots: TimeSlot[];
  selectedTime: string | null;
  onSelect: (time: string) => void;
}

const TimeSlotPicker: React.FC<Props> = ({ slots, selectedTime, onSelect }) => {
  if (slots.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <span className="material-symbols-outlined text-4xl mb-2 block">event_busy</span>
        <p className="text-sm">No slots available for this date</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
      {slots.map((slot) => {
        const time24 = slot.time; // "HH:MM:SS" or "HH:MM"
        const display = formatTime(time24);
        const isSelected = selectedTime === time24;
        const isDisabled = !slot.available;

        return (
          <button
            key={time24}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelect(time24)}
            className={`
              px-3 py-2 rounded-lg text-xs font-semibold border transition-all
              ${isDisabled
                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                : isSelected
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-primary hover:text-primary'
              }
            `}
          >
            {display}
            {!isDisabled && (
              <span className="block text-[9px] font-normal mt-0.5 opacity-70">
                {slot.current_bookings}/{slot.max_bookings}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

function formatTime(t: string): string {
  const parts = t.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export default TimeSlotPicker;
