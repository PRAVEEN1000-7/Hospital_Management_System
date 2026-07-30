import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import holidayService from '../../services/holidayService';
import type { Holiday, HolidayType } from '../../types/holiday';

const HOLIDAY_TYPES: { value: HolidayType; label: string; color: string }[] = [
  { value: 'festival', label: 'Festival', color: 'bg-amber-100 text-amber-800' },
  { value: 'weekly_off', label: 'Weekly Off', color: 'bg-blue-100 text-blue-800' },
  { value: 'other', label: 'Other', color: 'bg-slate-100 text-slate-700' },
];

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const typeMeta = (type: string) => HOLIDAY_TYPES.find(t => t.value === type) || HOLIDAY_TYPES[2];

/* ─── Add Holiday Modal ─────────────────────────────────────────────────── */

const HolidayModal: React.FC<{ onClose: () => void; onSaved: () => void }> = ({ onClose, onSaved }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<HolidayType>('festival');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !name.trim()) {
      toast.error('Date and name are required');
      return;
    }
    setSaving(true);
    try {
      await holidayService.create({ date, name: name.trim(), type });
      toast.success('Holiday added');
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to add holiday';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all';
  const labelClass = 'text-sm font-medium text-slate-700 mb-1.5 block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Add Holiday</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-slate-500">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Date <span className="text-red-500">*</span></label>
            <input type="date" className={inputClass} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Name <span className="text-red-500">*</span></label>
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Independence Day" />
          </div>
          <div>
            <label className={labelClass}>Type</label>
            <select className={inputClass + ' cursor-pointer'} value={type} onChange={e => setType(e.target.value as HolidayType)}>
              {HOLIDAY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-semibold text-sm transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Add Holiday
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Bulk Weekly-Off Modal ──────────────────────────────────────────────── */

const WeeklyOffModal: React.FC<{ onClose: () => void; onSaved: (count: number) => void }> = ({ onClose, onSaved }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [weekday, setWeekday] = useState(6); // Sunday
  const [name, setName] = useState('Weekly Off');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const rows = await holidayService.bulkCreateWeeklyOff({ year, weekday, name: name.trim() || 'Weekly Off' });
      onSaved(rows.length);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to create weekly offs';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all';
  const labelClass = 'text-sm font-medium text-slate-700 mb-1.5 block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Mark Recurring Weekly Off</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-slate-500">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-500">Inserts one holiday row per occurrence of the chosen weekday for the whole year — dates that already have a holiday are skipped.</p>
          <div>
            <label className={labelClass}>Year</label>
            <input type="number" className={inputClass} value={year} onChange={e => setYear(Number(e.target.value))} min={2000} max={2100} />
          </div>
          <div>
            <label className={labelClass}>Weekday</label>
            <select className={inputClass + ' cursor-pointer'} value={weekday} onChange={e => setWeekday(Number(e.target.value))}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Name</label>
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Weekly Off" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-semibold text-sm transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Holiday Calendar Page ──────────────────────────────────────────────── */

const HolidayCalendar: React.FC = () => {
  const toast = useToast();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [addOpen, setAddOpen] = useState(false);
  const [weeklyOffOpen, setWeeklyOffOpen] = useState(false);

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await holidayService.list(`${year}-01-01`, `${year}-12-31`);
      setHolidays(rows);
    } catch {
      toast.error('Failed to load holidays');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

  const handleDelete = async (h: Holiday) => {
    if (!window.confirm(`Remove "${h.name}" (${h.date})?`)) return;
    try {
      await holidayService.remove(h.id);
      toast.success('Holiday removed');
      fetchHolidays();
    } catch {
      toast.error('Failed to remove holiday');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Holiday Calendar</h1>
          <p className="text-sm text-slate-500 mt-1">Hospital holidays used by Attendance to auto-mark non-working days ({holidays.length} in {year})</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeeklyOffOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-lg">event_repeat</span>
            Recurring Weekly Off
          </button>
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
            <span className="material-symbols-outlined text-lg">add</span>
            Add Holiday
          </button>
        </div>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : holidays.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">event_busy</span>
            <p className="text-slate-500 mt-3 text-sm">No holidays configured for {year}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Day</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidays.map(h => {
                  const meta = typeMeta(h.type);
                  const dayName = new Date(`${h.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
                  return (
                    <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">{h.date}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{dayName}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{h.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDelete(h)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                          <span className="material-symbols-outlined text-[15px]">delete</span> Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addOpen && (
        <HolidayModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); fetchHolidays(); }} />
      )}
      {weeklyOffOpen && (
        <WeeklyOffModal
          onClose={() => setWeeklyOffOpen(false)}
          onSaved={(count) => { setWeeklyOffOpen(false); toast.success(`${count} weekly-off date(s) added`); fetchHolidays(); }}
        />
      )}
    </div>
  );
};

export default HolidayCalendar;
