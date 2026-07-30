import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import holidayService from '../../services/holidayService';
import HolidayMonthCalendar from '../../components/workforce/HolidayMonthCalendar';
import type { Holiday, HolidayType } from '../../types/holiday';
import { formatDateOnly } from '../../utils/calendarDate';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const HolidayCalendar: React.FC = () => {
  const toast = useToast();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Holiday form (mirrors DoctorSchedule.tsx's Add Slot modal)
  const [showForm, setShowForm] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];
  const [formDate, setFormDate] = useState(todayStr);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<HolidayType>('festival');

  // Recurring weekly-off form
  const [showWeeklyOffForm, setShowWeeklyOffForm] = useState(false);
  const [weeklyOffYear, setWeeklyOffYear] = useState(new Date().getFullYear());
  const [weeklyOffWeekday, setWeeklyOffWeekday] = useState(6); // Sunday
  const [weeklyOffName, setWeeklyOffName] = useState('Weekly Off');

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      setHolidays(await holidayService.list());
    } catch {
      toast.error('Failed to load holidays');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

  const resetAddForm = () => {
    setFormDate(todayStr);
    setFormName('');
    setFormType('festival');
  };

  // Opened from the Calendar view — pre-fill Add Holiday for the clicked date
  const openAddHolidayForDate = (iso: string) => {
    resetAddForm();
    setFormDate(iso);
    setShowForm(true);
  };

  const handleAddHoliday = async () => {
    if (!formDate || !formName.trim()) {
      toast.error('Date and name are required');
      return;
    }
    try {
      await holidayService.create({ date: formDate, name: formName.trim(), type: formType });
      toast.success('Holiday added');
      setShowForm(false);
      resetAddForm();
      fetchHolidays();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to add holiday';
      toast.error(msg);
    }
  };

  const handleDeleteHoliday = async (holiday: Holiday) => {
    if (!window.confirm(`Remove "${holiday.name}" (${holiday.date})?`)) return;
    try {
      await holidayService.remove(holiday.id);
      toast.success('Holiday removed');
      fetchHolidays();
    } catch {
      toast.error('Failed to remove holiday');
    }
  };

  const handleAddWeeklyOff = async () => {
    try {
      const rows = await holidayService.bulkCreateWeeklyOff({
        year: weeklyOffYear, weekday: weeklyOffWeekday, name: weeklyOffName.trim() || 'Weekly Off',
      });
      toast.success(`${rows.length} weekly-off date(s) added`);
      setShowWeeklyOffForm(false);
      fetchHolidays();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to create weekly offs';
      toast.error(msg);
    }
  };

  // Upcoming holidays list (today or later), for the side panel
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingHolidays = holidays
    .filter(h => new Date(h.date + 'T00:00:00') >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header — mirrors DoctorSchedule.tsx exactly */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Holiday Calendar</h1>
          <p className="text-slate-500 text-sm mt-1">Hospital holidays used by Attendance to auto-mark non-working days</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm">
            <span className="material-symbols-outlined text-lg">add</span> Add Holiday
          </button>
          <button onClick={() => setShowWeeklyOffForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-lg">event_repeat</span> Recurring Weekly Off
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Calendar</h2>
            <HolidayMonthCalendar
              holidays={holidays}
              onDeleteHoliday={handleDeleteHoliday}
              onAddHolidayForDate={openAddHolidayForDate}
            />
          </div>

          {/* Upcoming Holidays */}
          <div>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Upcoming Holidays</h2>
            {upcomingHolidays.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400">
                <span className="material-symbols-outlined text-3xl mb-2 block">event_available</span>
                <p className="text-xs">No upcoming holidays</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingHolidays.map(h => (
                  <div key={h.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between">
                    <div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${
                        h.type === 'festival' ? 'text-amber-700 bg-amber-50'
                          : h.type === 'weekly_off' ? 'text-blue-700 bg-blue-50'
                          : 'text-purple-700 bg-purple-50'
                      }`}>{h.type.replace('_', ' ')}</span>
                      <p className="text-sm font-semibold text-slate-700 mt-1">
                        {h.name}
                        <span className="ml-2 text-xs font-medium text-slate-400">
                          {formatDateOnly(h.date, 'd MMM')}
                        </span>
                      </p>
                    </div>
                    <button onClick={() => handleDeleteHoliday(h)}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Holiday Modal — mirrors DoctorSchedule.tsx's Add Slot modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowForm(false); resetAddForm(); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-xl">add_circle</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Holiday</h3>
                <p className="text-[11px] text-slate-400">Mark a date as a hospital holiday</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Date <span className="text-red-400">*</span></label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                {formDate && (
                  <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">calendar_today</span>
                    {formatDateOnly(formDate, 'EEEE, MMMM d, yyyy')}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Name <span className="text-red-400">*</span></label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Independence Day"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'festival' as const, label: 'Festival', icon: 'celebration' },
                    { key: 'weekly_off' as const, label: 'Weekly Off', icon: 'event_repeat' },
                    { key: 'other' as const, label: 'Other', icon: 'event' },
                  ].map(opt => (
                    <button key={opt.key} type="button" onClick={() => setFormType(opt.key)}
                      className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                        formType === opt.key
                          ? 'bg-primary/5 border-primary text-primary'
                          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}>
                      <span className="material-symbols-outlined text-base">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => { setShowForm(false); resetAddForm(); }}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleAddHoliday} disabled={!formDate || !formName.trim()}
                className="px-5 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-40">Add Holiday</button>
            </div>
          </div>
        </div>
      )}

      {/* Recurring Weekly Off Modal */}
      {showWeeklyOffForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowWeeklyOffForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-xl">event_repeat</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Recurring Weekly Off</h3>
                <p className="text-[11px] text-slate-400">Mark every occurrence of one weekday as a holiday for a year</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Year</label>
                <input type="number" value={weeklyOffYear} onChange={(e) => setWeeklyOffYear(Number(e.target.value))}
                  min={2000} max={2100}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Weekday</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d, i) => (
                    <button key={i} type="button" onClick={() => setWeeklyOffWeekday(i)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        weeklyOffWeekday === i
                          ? 'bg-primary/5 border-primary text-primary'
                          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}>
                      {d.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Name</label>
                <input type="text" value={weeklyOffName} onChange={(e) => setWeeklyOffName(e.target.value)}
                  placeholder="Weekly Off"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-500 text-lg mt-0.5">info</span>
                <p className="text-[11px] text-amber-700">Inserts one holiday row per occurrence of the chosen weekday for the whole year — dates that already have a holiday are skipped.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowWeeklyOffForm(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleAddWeeklyOff}
                className="px-5 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors shadow-sm">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HolidayCalendar;
