import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import scheduleService from '../services/scheduleService';
import doctorService from '../services/doctorService';
import type { DoctorSchedule, DoctorScheduleCreate, DoctorLeave, DoctorLeaveCreate, DoctorOption } from '../types/appointment';

// Backend uses 0=Sunday, 1=Monday ... 6=Saturday
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DoctorSchedulePage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.roles?.includes('admin') || user?.roles?.includes('super_admin');

  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<DoctorSchedule[]>([]);
  const [doctorLeaves, setDoctorLeaves] = useState<DoctorLeave[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formWeekday, setFormWeekday] = useState(1); // 1=Monday
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('17:00');
  const [formMaxPatients, setFormMaxPatients] = useState(20);

  // Leave form
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveType, setLeaveType] = useState('full_day');
  const [leaveCategory, setLeaveCategory] = useState('Personal');
  const [leaveReason, setLeaveReason] = useState('');

  // Edit schedule form
  const [editSlot, setEditSlot] = useState<DoctorSchedule | null>(null);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editMaxPatients, setEditMaxPatients] = useState(20);

  useEffect(() => {
    if (isAdmin) {
      scheduleService.getDoctors().then(setDoctors).catch(() => {});
    } else if (user?.roles?.includes('doctor')) {
      // Fetch doctor profile to get the Doctor.id (not User.id)
      doctorService.getMyProfile().then(profile => {
        setSelectedDoctorId(profile.id);
      }).catch(() => {
        toast.error('Could not load doctor profile');
      });
    }
  }, [isAdmin, user]);

  const fetchData = useCallback(async () => {
    if (!selectedDoctorId) return;
    setLoading(true);
    try {
      const [sched, leaves] = await Promise.all([
        scheduleService.getSchedules(selectedDoctorId),
        scheduleService.getDoctorLeaves(selectedDoctorId),
      ]);
      setSchedules(sched);
      setDoctorLeaves(leaves);
    } catch {
      toast.error('Failed to load schedule data');
    }
    setLoading(false);
  }, [selectedDoctorId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddSchedule = async () => {
    if (!selectedDoctorId) return;
    try {
      const data: DoctorScheduleCreate = {
        day_of_week: formWeekday,
        start_time: formStartTime,
        end_time: formEndTime,
        max_patients: formMaxPatients,
      };
      await scheduleService.createSchedule(selectedDoctorId, data);
      toast.success('Schedule slot added');
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to add schedule');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      await scheduleService.deleteSchedule(id);
      toast.success('Schedule slot removed');
      fetchData();
    } catch {
      toast.error('Failed to delete schedule');
    }
  };

  const openEditSlot = (s: DoctorSchedule) => {
    setEditSlot(s);
    setEditStartTime(s.start_time.slice(0, 5));
    setEditEndTime(s.end_time.slice(0, 5));
    setEditMaxPatients(s.max_patients ?? 20);
  };

  const handleUpdateSchedule = async () => {
    if (!editSlot) return;
    try {
      await scheduleService.updateSchedule(editSlot.id, {
        start_time: editStartTime,
        end_time: editEndTime,
        max_patients: editMaxPatients,
      });
      toast.success('Schedule slot updated');
      setEditSlot(null);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update schedule');
    }
  };

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
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to add leave');
    }
  };

  const handleDeleteBlock = async (id: string) => {
    try {
      await scheduleService.deleteDoctorLeave(id);
      toast.success('Leave removed');
      fetchData();
    } catch {
      toast.error('Failed to remove leave');
    }
  };

  // Group schedules by weekday
  const grouped = WEEKDAYS.map((day, i) => ({
    day,
    items: schedules.filter(s => s.day_of_week === i),
  }));

  // Build a set of weekday indices that have active leaves (today or future)
  const leaveDayIndices = new Set<number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  doctorLeaves.forEach(lv => {
    const lvDate = new Date(lv.leave_date + 'T00:00:00');
    if (lvDate >= today) {
      leaveDayIndices.add(lvDate.getDay()); // 0=Sun ... 6=Sat
    }
  });

  // Helper: get leave info for a weekday if any upcoming leave exists
  const getLeaveForDay = (dayIndex: number) =>
    doctorLeaves.find(lv => {
      const d = new Date(lv.leave_date + 'T00:00:00');
      return d >= today && d.getDay() === dayIndex;
    });

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Doctor Schedule</h1>
          <p className="text-slate-500 text-sm mt-1">Manage weekly availability and blocked periods</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm">
            <span className="material-symbols-outlined text-lg">add</span> Add Slot
          </button>
          <button onClick={() => setShowLeaveForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-lg">event_busy</span> Add Leave
          </button>
        </div>
      </div>

      {/* Doctor Selector (admin) */}
      {isAdmin && (
        <div className="mb-6">
          <select value={selectedDoctorId || ''} onChange={(e) => setSelectedDoctorId(e.target.value || null)}
            className="w-full sm:w-80 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white">
            <option value="">Select a doctor...</option>
            {doctors.map(d => <option key={d.doctor_id} value={d.doctor_id}>{d.name} — {d.specialization || 'N/A'}</option>)}
          </select>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Weekly Schedule */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Weekly Schedule</h2>
            {grouped.map(({ day, items }, idx) => {
              const dayLeave = getLeaveForDay(idx);
              const isBlocked = !!dayLeave;
              return (
              <div key={day} className={`bg-white rounded-xl border p-4 relative overflow-hidden ${isBlocked ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
                {/* Leave overlay badge */}
                {isBlocked && (
                  <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-bold uppercase px-2.5 py-1 rounded-bl-lg flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">event_busy</span>
                    On Leave — {dayLeave!.leave_date}
                  </div>
                )}
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-bold ${isBlocked ? 'text-red-400' : 'text-slate-900'}`}>{day}</span>
                  {!isBlocked && <span className="text-xs text-slate-400">{items.length} slot{items.length !== 1 ? 's' : ''}</span>}
                  {isBlocked && <span className="text-[10px] text-red-400 font-medium mr-20">Slots inaccessible</span>}
                </div>
                {items.length === 0 && !isBlocked ? (
                  <p className="text-xs text-slate-400 italic">No schedule set</p>
                ) : items.length === 0 && isBlocked ? (
                  <p className="text-xs text-red-300 italic">No slots — day is on leave</p>
                ) : (
                  <div className={`space-y-2 ${isBlocked ? 'opacity-40 pointer-events-none' : ''}`}>
                    {items.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className={`material-symbols-outlined text-lg ${isBlocked ? 'text-red-300' : 'text-primary'}`}>schedule</span>
                          <div>
                            <span className="text-sm font-semibold text-slate-700">{formatTimeStr(s.start_time)} – {formatTimeStr(s.end_time)}</span>
                            <div className="flex gap-2 mt-0.5">
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold">Max {s.max_patients} patients</span>
                            </div>
                          </div>
                        </div>
                        {!isBlocked && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditSlot(s)}
                            className="text-slate-400 hover:text-primary transition-colors p-1" title="Edit slot">
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button onClick={() => handleDeleteSchedule(s.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Delete slot">
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
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
                          {new Date(lv.leave_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
                        </span>
                      </p>
                      {lv.reason && <p className="text-xs text-slate-400 mt-0.5">[{lv.reason}]</p>}
                    </div>
                    <button onClick={() => handleDeleteBlock(lv.id)}
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

      {/* Add Schedule Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-xl">add_circle</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Schedule Slot</h3>
                <p className="text-[11px] text-slate-400">Set a recurring weekly time slot</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Weekday</label>
                <select value={formWeekday} onChange={(e) => setFormWeekday(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white">
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                {/* Warning if selected weekday has a leave */}
                {leaveDayIndices.has(formWeekday) && (
                  <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span className="material-symbols-outlined text-amber-500 text-base">warning</span>
                    <p className="text-[11px] text-amber-700 font-medium">This day has an upcoming leave. The slot will be inaccessible until the leave is removed.</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Start Time</label>
                  <input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">End Time</label>
                  <input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Max Patients</label>
                <input type="number" min={1} max={100} value={formMaxPatients} onChange={(e) => setFormMaxPatients(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleAddSchedule}
                className="px-5 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors shadow-sm">Add Slot</button>
            </div>
          </div>
        </div>
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
                    {new Date(leaveDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
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
                  <p className="text-[11px] text-amber-700">All schedule slots on this day will become inaccessible while the leave is active. Delete the leave to re-enable them.</p>
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
      {/* Edit Schedule Modal */}
      {editSlot && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditSlot(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-xl">edit_calendar</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Schedule Slot</h3>
                <p className="text-[11px] text-slate-400">{WEEKDAYS[editSlot.day_of_week]}</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Start Time</label>
                  <input type="time" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">End Time</label>
                  <input type="time" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Max Patients</label>
                <input type="number" min={1} max={100} value={editMaxPatients} onChange={(e) => setEditMaxPatients(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setEditSlot(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleUpdateSchedule}
                className="px-5 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors shadow-sm">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatTimeStr(t: string): string {
  const parts = t.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export default DoctorSchedulePage;
