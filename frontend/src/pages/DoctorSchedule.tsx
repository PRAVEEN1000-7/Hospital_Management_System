import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import scheduleService from '../services/scheduleService';
import doctorService from '../services/doctorService';
import appointmentSettingsService from '../services/appointmentSettingsService';
import ScheduleMonthCalendar from '../components/appointments/ScheduleMonthCalendar';
import type { DoctorLeave, DoctorOption } from '../types/appointment';
import { formatDateOnly } from '../utils/calendarDate';
import { getErrorMessage } from '../utils/errorMessage';
import SearchableSelect, { type SuggestionOption } from '../components/common/SearchableSelect';
import { useConfirm } from '../contexts/ConfirmContext';

// Backend uses 0=Sunday, 1=Monday ... 6=Saturday
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Every day is available by default, using the hospital's configured OPD
// Session Timings — get_available_slots() on the backend already falls back
// to these whenever a doctor has no schedule override for a date, so a
// doctor is bookable every day out of the box. Marking a date as Leave
// (below) is the only way to make it unavailable — there is no more
// per-day "Add Slot" customization in this UI.
const DoctorSchedulePage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.roles?.includes('admin') || user?.roles?.includes('super_admin');
  // Receptionist manages doctor schedules from the front desk too (BUG-17) —
  // like admin, they pick from any doctor rather than only seeing their own.
  const canPickAnyDoctor = isAdmin || Boolean(user?.roles?.includes('receptionist'));

  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [doctorLabel, setDoctorLabel] = useState('');
  const [doctorLeaves, setDoctorLeaves] = useState<DoctorLeave[]>([]);
  const [loading, setLoading] = useState(false);
  const [scheduleView, setScheduleView] = useState<'weekly' | 'calendar'>('weekly');

  const confirm = useConfirm();

  // OPD session timings (Appointment Settings → OPD Session Timings) — the
  // default hours shown for every day. Fallbacks match the standard
  // 10:00–14:00 / 17:00–20:30 clinic hours.
  const [sessionDefaults, setSessionDefaults] = useState({
    start: '10:00', breakStart: '14:00', breakEnd: '17:00', end: '20:30',
  });
  useEffect(() => {
    appointmentSettingsService.getSettings().then(s => {
      setSessionDefaults({
        start: (s.opd_morning_start_time || '10:00').slice(0, 5),
        breakStart: (s.opd_morning_end_time || '14:00').slice(0, 5),
        breakEnd: (s.opd_evening_start_time || '17:00').slice(0, 5),
        end: (s.opd_evening_end_time || '20:30').slice(0, 5),
      });
    }).catch(() => {});
  }, []);

  // Leave form
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveType, setLeaveType] = useState('full_day');
  const [leaveCategory, setLeaveCategory] = useState('Personal');
  const [leaveReason, setLeaveReason] = useState('');

  // Opened from the Calendar view — pre-fill Add Leave for the clicked date
  const openAddLeaveForDate = (iso: string) => {
    setLeaveDate(iso);
    setLeaveType('full_day');
    setLeaveCategory('Personal');
    setLeaveReason('');
    setShowLeaveForm(true);
  };

  useEffect(() => {
    if (canPickAnyDoctor) {
      scheduleService.getDoctors().then(setDoctors).catch(() => {});
    } else if (user?.roles?.includes('doctor')) {
      // Fetch doctor profile to get the Doctor.id (not User.id)
      doctorService.getMyProfile().then(profile => {
        setSelectedDoctorId(profile.id);
      }).catch(() => {
        toast.error('Could not load doctor profile');
      });
    }
  }, [canPickAnyDoctor, user]);

  const fetchData = useCallback(async () => {
    if (!selectedDoctorId) return;
    setLoading(true);
    try {
      const leaves = await scheduleService.getDoctorLeaves(selectedDoctorId);
      setDoctorLeaves(leaves);
    } catch {
      toast.error('Failed to load schedule data');
    }
    setLoading(false);
  }, [selectedDoctorId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddBlock = async () => {
    if (!leaveDate || !selectedDoctorId) return;
    try {
      await scheduleService.createDoctorLeave({
        doctor_id: selectedDoctorId,
        leave_date: leaveDate,
        leave_type: leaveType,
        reason: [leaveCategory, leaveReason].filter(Boolean).join(' — ') || undefined,
      });
      toast.success('Leave added');
      setShowLeaveForm(false);
      setLeaveDate(''); setLeaveReason(''); setLeaveCategory('Personal'); setLeaveType('full_day');
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add leave'));
    }
  };

  const handleDeleteBlock = async (lv: DoctorLeave) => {
    const ok = await confirm({
      title: 'Remove Leave?',
      message: `Remove the ${lv.leave_type?.replace('_', ' ')} leave on ${lv.leave_date}? This cannot be undone.`,
    });
    if (!ok) return;
    try {
      await scheduleService.deleteDoctorLeave(lv.id);
      toast.success('Leave removed');
      fetchData();
    } catch {
      toast.error('Failed to remove leave');
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Doctor Schedule</h1>
          <p className="text-slate-500 text-sm mt-1">Every day is available by default — mark a date as Leave to block it</p>
        </div>
        <button onClick={() => setShowLeaveForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
          <span className="material-symbols-outlined text-lg">event_busy</span> Add Leave
        </button>
      </div>

      {/* Doctor Selector (admin / receptionist) */}
      {canPickAnyDoctor && (
        <div className="mb-6 w-full sm:w-80">
          <SearchableSelect
            value={doctorLabel}
            onChange={(value, metadata) => {
              setDoctorLabel(value);
              setSelectedDoctorId(metadata?.id ? (metadata.id as string) : null);
            }}
            suggestions={doctors.map((d): SuggestionOption => ({
              id: d.doctor_id,
              label: d.name,
              sublabel: d.specialization || undefined,
              metadata: { id: d.doctor_id },
            }))}
            placeholder="Search doctor..."
            allowManualEntry={false}
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : !selectedDoctorId ? (
        <div className="text-center py-20 text-slate-400">
          <span className="material-symbols-outlined text-5xl mb-3 block">stethoscope</span>
          <p className="text-sm">Select a doctor to manage their schedule</p>
        </div>
      ) : (
        <>
        <div className="flex items-center gap-2 mb-4">
          {(['weekly', 'calendar'] as const).map(v => (
            <button key={v} type="button" onClick={() => setScheduleView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${
                scheduleView === v
                  ? 'bg-primary/5 border-primary text-primary'
                  : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
              }`}>
              {v}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Weekly / Calendar Schedule */}
          <div className="lg:col-span-2 space-y-3">
          {scheduleView === 'calendar' ? (
            <ScheduleMonthCalendar
              doctorLeaves={doctorLeaves}
              onDeleteLeave={(id) => {
                const leave = doctorLeaves.find(lv => lv.id === id);
                if (leave) handleDeleteBlock(leave);
              }}
              onAddLeaveForDate={openAddLeaveForDate}
              sessionDefaults={sessionDefaults}
            />
          ) : (
            <>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Weekly Schedule</h2>
            {WEEKDAYS.map((day, idx) => {
              // Informational only — a leave blocks its own specific date (see Calendar
              // view for exact dates), it does NOT disable every occurrence of this
              // weekday, so this weekday stays available by default regardless of
              // this count. Includes leaves on ANY future date matching this weekday —
              // not just ones in the current week — so a leave marked weeks ahead
              // still shows here.
              const dayLeaves = doctorLeaves
                .filter(lv => {
                  const d = new Date(lv.leave_date + 'T00:00:00');
                  return d >= today && d.getDay() === idx;
                })
                .sort((a, b) => a.leave_date.localeCompare(b.leave_date));
              const hasLeave = dayLeaves.length > 0;
              return (
              <div key={day} className={`rounded-xl border p-4 relative overflow-hidden ${hasLeave ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-900">{day}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-600 font-semibold">Available</span>
                    {dayLeaves.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold"
                        title={dayLeaves.map(lv => formatDateOnly(lv.leave_date)).join(', ') + ' — see Calendar view for details'}>
                        <span className="material-symbols-outlined text-xs">event_busy</span>
                        Leave: {formatDateOnly(dayLeaves[0].leave_date, 'd MMM')}
                        {dayLeaves.length > 1 ? ` +${dayLeaves.length - 1} more` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <span className="material-symbols-outlined text-emerald-600 text-lg">event_available</span>
                  <div>
                    <p className="text-xs font-semibold text-emerald-700">Available by default</p>
                    <p className="text-[11px] text-emerald-600">
                      {formatTimeStr(sessionDefaults.start)} – {formatTimeStr(sessionDefaults.breakStart)}, {formatTimeStr(sessionDefaults.breakEnd)} – {formatTimeStr(sessionDefaults.end)} (Appointment Settings)
                    </p>
                  </div>
                </div>
              </div>
              );
            })}
            </>
          )}
          </div>

          {/* Blocked Periods */}
          <div>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Doctor Leaves</h2>
            {doctorLeaves.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400">
                <span className="material-symbols-outlined text-3xl mb-2 block">event_available</span>
                <p className="text-xs">No leaves scheduled</p>
              </div>
            ) : (
              <div className="space-y-2">
                {doctorLeaves.map(lv => (
                  <div key={lv.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between">
                    <div>
                      <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full uppercase">{lv.leave_type?.replace('_', ' ')}</span>
                      <p className="text-sm font-semibold text-slate-700 mt-1">
                        {lv.leave_date}
                        <span className="ml-2 text-xs font-medium text-slate-400">
                          {formatDateOnly(lv.leave_date, 'EEEE')}
                        </span>
                      </p>
                      {lv.reason && <p className="text-xs text-slate-400 mt-0.5">[{lv.reason}]</p>}
                    </div>
                    <button onClick={() => handleDeleteBlock(lv)}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        </>
      )}

      {/* Add Leave Modal */}
      {showLeaveForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowLeaveForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-xl">event_busy</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Doctor Leave</h3>
                <p className="text-[11px] text-slate-400">Block a date from accepting appointments</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Leave Date <span className="text-red-400">*</span></label>
                <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                {leaveDate && (
                  <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">calendar_today</span>
                    {formatDateOnly(leaveDate, 'EEEE, MMMM d, yyyy')}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Leave Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'full_day', label: 'Full Day', icon: 'event_busy' },
                    { key: 'morning', label: 'Morning', icon: 'wb_sunny' },
                    { key: 'afternoon', label: 'Afternoon', icon: 'wb_twilight' },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => setLeaveType(opt.key)}
                      className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                        leaveType === opt.key
                          ? 'bg-primary/5 border-primary text-primary'
                          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}>
                      <span className="material-symbols-outlined text-base">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Category</label>
                <select value={leaveCategory} onChange={(e) => setLeaveCategory(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white">
                  <option value="Personal">Personal</option>
                  <option value="Sick">Sick</option>
                  <option value="Holiday">Holiday</option>
                  <option value="Conference">Conference</option>
                  <option value="Emergency">Emergency</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Reason <span className="text-slate-300">(optional)</span></label>
                <input type="text" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="e.g. Annual leave, medical conference..."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              {leaveDate && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-lg mt-0.5">info</span>
                  <p className="text-[11px] text-amber-700">This day will become inaccessible for booking while the leave is active. Delete the leave to re-enable it.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowLeaveForm(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleAddBlock} disabled={!leaveDate}
                className="px-5 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-40 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">event_busy</span>
                Add Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export function formatTimeStr(t: string): string {
  const parts = t.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export default DoctorSchedulePage;
