import React from 'react';
import type { TimeSlot } from '../../types/appointment';

interface Props {
  slots: TimeSlot[];
  selectedTime: string | null;
  onSelect: (time: string) => void;
  // OPD session boundaries (HH:MM). When provided, slots are split into
  // Morning / Evening sessions at the midpoint of the midday gap, so the
  // configured OPD timings are visible right in the slot selection.
  morningEndTime?: string;
  eveningStartTime?: string;
}

const toMinutes = (t: string): number => {
  const [h, m] = t.slice(0, 5).split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
};

const TimeSlotPicker: React.FC<Props> = ({
  slots, selectedTime, onSelect, morningEndTime, eveningStartTime,
}) => {
  if (slots.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <span className="material-symbols-outlined text-4xl mb-2 block">event_busy</span>
        <p className="text-sm">No slots available for this date</p>
      </div>
    );
  }

  const renderGrid = (list: TimeSlot[]) => (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
      {list.map((slot) => {
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

  // Group into Morning / Evening only when both session boundaries are known.
  // The divider is the midpoint of the configured midday gap, so a slot that
  // happens to fall inside the break lands on the nearer session.
  if (morningEndTime && eveningStartTime) {
    const divider = (toMinutes(morningEndTime) + toMinutes(eveningStartTime)) / 2;
    const morning = slots.filter((s) => toMinutes(s.time) < divider);
    const evening = slots.filter((s) => toMinutes(s.time) >= divider);

    // Only bother with the split if both sessions actually have slots — a
    // doctor with a single continuous session shouldn't see empty headers.
    if (morning.length > 0 && evening.length > 0) {
      return (
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-amber-500 text-base">wb_sunny</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Morning Session
              </span>
              <span className="text-[11px] text-slate-400">
                (till {formatTime(morningEndTime)})
              </span>
            </div>
            {renderGrid(morning)}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-indigo-500 text-base">wb_twilight</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Evening Session
              </span>
              <span className="text-[11px] text-slate-400">
                (from {formatTime(eveningStartTime)})
              </span>
            </div>
            {renderGrid(evening)}
          </div>
        </div>
      );
    }
  }

  return renderGrid(slots);
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
