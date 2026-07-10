import React, { useMemo } from 'react';

export interface DateRangeFilterProps {
  dateFrom: string; // 'YYYY-MM-DD' or '' (empty = no filter)
  dateTo: string;
  onChange: (from: string, to: string) => void;
  className?: string;
  maxDate?: string; // defaults to today
  /** Hide this component's own inline "Clear" link — set when the parent
   * page already has its own single Clear button, to avoid two controls
   * with slightly different behavior sitting next to each other. */
  hideClear?: boolean;
}

interface Preset {
  key: string;
  label: string;
}

const PRESETS: Preset[] = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: 'Last 7 days' },
  { key: '30d',   label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
];

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function resolvePreset(key: string): { from: string; to: string } {
  const today = new Date();
  const to = toISO(today);
  if (key === 'today') return { from: to, to };
  if (key === '7d') {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: toISO(from), to };
  }
  if (key === '30d') {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: toISO(from), to };
  }
  if (key === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toISO(from), to };
  }
  return { from: '', to: '' };
}

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  dateFrom,
  dateTo,
  onChange,
  className = '',
  maxDate,
  hideClear = false,
}) => {
  const today = toISO(new Date());
  const max = maxDate ?? today;

  // Detect which preset (if any) matches the current from/to values.
  // Recalculated whenever dateFrom / dateTo change — stable, no glitch.
  const activePreset = useMemo<string | null>(() => {
    if (!dateFrom && !dateTo) return null;
    const match = PRESETS.find(p => {
      const r = resolvePreset(p.key);
      return r.from === dateFrom && r.to === dateTo;
    });
    return match?.key ?? 'custom';
  }, [dateFrom, dateTo]);

  const handlePreset = (key: string) => {
    const r = resolvePreset(key);
    onChange(r.from, r.to);
  };

  const handleClear = () => onChange('', '');

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* Preset buttons — always rendered, only CSS changes for active state */}
      {PRESETS.map(p => (
        <button
          key={p.key}
          type="button"
          onClick={() => handlePreset(p.key)}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap ${
            activePreset === p.key
              ? 'bg-primary text-white border-primary shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:border-primary/40 hover:text-primary'
          }`}
        >
          {p.label}
        </button>
      ))}

      {/* Divider */}
      <span className="text-slate-300 select-none">|</span>

      {/* Always-visible From → To date inputs — never mount/unmount */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={dateFrom}
          max={dateTo || max}
          onChange={e => onChange(e.target.value, dateTo)}
          className={`px-3 py-2 border rounded-lg text-sm bg-white outline-none transition-colors
            focus:ring-2 focus:ring-primary/20 focus:border-primary
            ${activePreset === 'custom' || (!activePreset && dateFrom) ? 'border-primary/50' : 'border-slate-200'}
            w-[145px]`}
          placeholder="From date"
        />
        <span className="text-slate-400 text-sm select-none">→</span>
        <input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          max={max}
          onChange={e => onChange(dateFrom, e.target.value)}
          className={`px-3 py-2 border rounded-lg text-sm bg-white outline-none transition-colors
            focus:ring-2 focus:ring-primary/20 focus:border-primary
            ${activePreset === 'custom' || (!activePreset && dateTo) ? 'border-primary/50' : 'border-slate-200'}
            w-[145px]`}
          placeholder="To date"
        />
      </div>

      {/* Clear link — only visible when a date is set */}
      {!hideClear && (dateFrom || dateTo) && (
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5 transition-colors"
          title="Clear date filter"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
          Clear
        </button>
      )}
    </div>
  );
};

export default DateRangeFilter;
