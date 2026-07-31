import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, addWeeks, subWeeks, isSameMonth, format, getMonth, getYear,
} from 'date-fns';
import holidayService from '../services/holidayService';
import { useToast } from '../contexts/ToastContext';

type ViewMode = 'month' | 'week' | 'year';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const defaultSundays = (y: number, m: number): number[] => {
  const days: number[] = [];
  const total = new Date(y, m, 0).getDate();
  for (let d = 1; d <= total; d++) {
    if (new Date(y, m - 1, d).getDay() === 0) days.push(d);
  }
  return days;
};

const Attendance: React.FC = () => {
  const toast = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [holidayDays, setHolidayDays] = useState<number[]>([]);
  const [festivalDays, setFestivalDays] = useState<number[]>([]);
  // No saved row for this month yet — Sundays are pre-marked as a starting
  // default, but nothing is persisted until Save is clicked.
  const [isNewMonth, setIsNewMonth] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [yearData, setYearData] = useState<Record<number, { holiday: number[]; festival: number[] }>>({});

  const year = getYear(currentDate);
  const month = getMonth(currentDate) + 1; // 1-12
  const totalDays = endOfMonth(currentDate).getDate();

  // Load the current month's holiday allocation whenever year/month changes
  // (shared by Month and Week views — they edit the same underlying data).
  useEffect(() => {
    if (viewMode === 'year') return;
    setLoading(true);
    holidayService.getMonth(year, month)
      .then(res => {
        if (res.created_at) {
          setHolidayDays(res.holiday_days);
          setFestivalDays(res.festival_days);
          setIsNewMonth(false);
        } else {
          setHolidayDays(defaultSundays(year, month));
          setFestivalDays([]);
          setIsNewMonth(true);
        }
        setIsDirty(false);
      })
      .catch(() => {
        setHolidayDays(defaultSundays(year, month));
        setFestivalDays([]);
        setIsNewMonth(true);
      })
      .finally(() => setLoading(false));
  }, [year, month, viewMode]);

  // Year view is read-only — an overview of all 12 months, click one to edit.
  useEffect(() => {
    if (viewMode !== 'year') return;
    setLoading(true);
    holidayService.getYear(year)
      .then(rows => {
        const map: Record<number, { holiday: number[]; festival: number[] }> = {};
        rows.forEach(r => { map[r.month] = { holiday: r.holiday_days, festival: r.festival_days }; });
        setYearData(map);
      })
      .catch(() => setYearData({}))
      .finally(() => setLoading(false));
  }, [year, viewMode]);

  // Click cycles: Working -> Red (weekly-off, e.g. Sunday) -> Green (festival
  // holiday) -> back to Working. Red reduces payroll working_days; Green does not.
  const toggleDay = (day: number) => {
    if (holidayDays.includes(day)) {
      setHolidayDays(prev => prev.filter(d => d !== day));
      setFestivalDays(prev => [...prev, day].sort((a, b) => a - b));
    } else if (festivalDays.includes(day)) {
      setFestivalDays(prev => prev.filter(d => d !== day));
    } else {
      setHolidayDays(prev => [...prev, day].sort((a, b) => a - b));
    }
    setIsDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await holidayService.saveMonth(year, month, holidayDays, festivalDays);
      setIsDirty(false);
      setIsNewMonth(false);
      toast.success('Holiday calendar saved');
    } catch {
      toast.error('Failed to save holiday calendar');
    } finally {
      setSaving(false);
    }
  };

  const monthGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const weekGrid = useMemo(() => {
    const start = startOfWeek(currentDate);
    const end = endOfWeek(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const workingDays = totalDays - holidayDays.length;

  const navigate = (dir: -1 | 1) => {
    if (viewMode === 'month') setCurrentDate(prev => (dir === 1 ? addMonths(prev, 1) : subMonths(prev, 1)));
    else if (viewMode === 'week') setCurrentDate(prev => (dir === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1)));
    else setCurrentDate(prev => new Date(prev.getFullYear() + dir, prev.getMonth(), 1));
  };

  const renderDayCell = useCallback((date: Date) => {
    const inMonth = isSameMonth(date, currentDate);
    const dayNum = date.getDate();
    const isHoliday = inMonth && holidayDays.includes(dayNum);
    const isFestival = inMonth && festivalDays.includes(dayNum);
    return (
      <button
        key={date.toISOString()}
        type="button"
        disabled={!inMonth}
        onClick={() => inMonth && toggleDay(dayNum)}
        title={isHoliday ? 'Weekly-off (click to make Festival)' : isFestival ? 'Festival holiday (click to clear)' : inMonth ? 'Working day (click to mark Weekly-off)' : undefined}
        className={`aspect-square flex items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
          !inMonth
            ? 'text-slate-200 cursor-default'
            : isHoliday
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : isFestival
            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            : 'bg-white text-slate-700 hover:bg-primary/5 border border-slate-100'
        }`}
      >
        {dayNum}
      </button>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, holidayDays, festivalDays]);

  return (
    <div>
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Attendance</h1>
          <p className="text-sm text-slate-500">Click a date to cycle Working → Weekly-off (red) → Festival holiday (green).</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(['month', 'week', 'year'] as ViewMode[]).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setViewMode(v)}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-colors ${
                viewMode === v ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <span className="material-icons text-lg">chevron_left</span>
            </button>
            <h2 className="text-base font-bold text-slate-800 min-w-[160px] text-center">
              {viewMode === 'year'
                ? year
                : viewMode === 'week'
                ? `${format(weekGrid[0], 'dd MMM')} – ${format(weekGrid[6], 'dd MMM yyyy')}`
                : format(currentDate, 'MMMM yyyy')}
            </h2>
            <button type="button" onClick={() => navigate(1)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <span className="material-icons text-lg">chevron_right</span>
            </button>
          </div>
          {viewMode !== 'year' && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-500">
                {holidayDays.length} weekly-off · {festivalDays.length} festival · {workingDays} working day{workingDays !== 1 ? 's' : ''} of {totalDays}
              </span>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <span className="material-icons text-sm">{saving ? 'hourglass_empty' : 'save'}</span>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {isNewMonth && viewMode !== 'year' && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            <span className="material-icons text-sm">info</span>
            No saved calendar for this month yet — Sundays are pre-marked as weekly-off by default. Adjust and click Save.
          </div>
        )}

        {(viewMode === 'month' || viewMode === 'week') && (
          <>
            <div className="grid grid-cols-7 gap-2 mb-2">
              {WEEKDAY_LABELS.map(d => (
                <div key={d} className="text-center text-[11px] font-bold text-slate-400 uppercase tracking-wide">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {(viewMode === 'month' ? monthGrid : weekGrid).map(renderDayCell)}
            </div>
          </>
        )}

        {viewMode === 'year' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
              const mDate = new Date(year, m - 1, 1);
              const data = yearData[m] || { holiday: [], festival: [] };
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setCurrentDate(mDate); setViewMode('month'); }}
                  className="text-left p-3 border border-slate-200 rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  <p className="text-sm font-bold text-slate-800 mb-1">{format(mDate, 'MMMM')}</p>
                  <p className="text-xs text-slate-500">{data.holiday.length} weekly-off · {data.festival.length} festival</p>
                </button>
              );
            })}
          </div>
        )}

        {loading && <p className="text-xs text-slate-400 mt-3">Loading…</p>}
      </div>
    </div>
  );
};

export default Attendance;
