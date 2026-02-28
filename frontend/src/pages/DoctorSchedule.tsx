import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import scheduleService from '../services/scheduleService';
import type { DoctorSchedule, DoctorScheduleCreate, DoctorLeave, DoctorLeaveCreate, DoctorOption } from '../types/appointment';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
  const [formWeekday, setFormWeekday] = useState(0);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('17:00');
  const [formSlotDuration, setFormSlotDuration] = useState(30);
  const [formMaxPatients, setFormMaxPatients] = useState(1);

  // Leave form
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveType, setLeaveType] = useState('personal');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveIsHalfDay, setLeaveIsHalfDay] = useState(false);
  const [leaveHalfDayPeriod, setLeaveHalfDayPeriod] = useState('morning');

  useEffect(() => {
    if (isAdmin) {
      scheduleService.getDoctors().then(setDoctors).catch(() => {});
    } else if (user?.roles?.includes('doctor')) {
      setSelectedDoctorId(String(user.id));
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
        slot_duration_minutes: formSlotDuration,
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

  const handleAddBlock = async () => {
    if (!leaveDate || !selectedDoctorId) return;
    try {
      await scheduleService.createDoctorLeave({
        doctor_id: selectedDoctorId,
        leave_date: leaveDate,
        leave_type: leaveType,
        reason: leaveReason || undefined,
        is_half_day: leaveIsHalfDay,
        half_day_period: leaveIsHalfDay ? leaveHalfDayPeriod : undefined,
      });
      toast.success('Leave added');
      setShowLeaveForm(false);
      setLeaveDate(''); setLeaveReason('');
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
            {grouped.map(({ day, items }, idx) => (
              <div key={day} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-900">{day}</span>
                  <span className="text-xs text-slate-400">{items.length} slot{items.length !== 1 ? 's' : ''}</span>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No schedule set</p>
                ) : (
                  <div className="space-y-2">
                    {items.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-primary text-lg">schedule</span>
                          <div>
                            <span className="text-sm font-semibold text-slate-700">{formatTimeStr(s.start_time)} – {formatTimeStr(s.end_time)}</span>
                            <div className="flex gap-2 mt-0.5">
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold">{s.slot_duration_minutes} min</span>
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold">Max {s.max_patients}</span>
                            </div>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteSchedule(s.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1">
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
                      <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full uppercase">{lv.leave_type}</span>
                      {lv.is_half_day && <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase ml-1">{lv.half_day_period}</span>}
                      <p className="text-sm font-semibold text-slate-700 mt-1">{lv.leave_date}</p>
                      {lv.reason && <p className="text-xs text-slate-400 mt-0.5">{lv.reason}</p>}
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Add Schedule Slot</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Weekday</label>
                <select value={formWeekday} onChange={(e) => setFormWeekday(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Start Time</label>
                  <input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">End Time</label>
                  <input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Slot Duration (min)</label>
                  <select value={formSlotDuration} onChange={(e) => setFormSlotDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                    {[10, 15, 20, 30, 45, 60].map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Max Patients/Slot</label>
                  <input type="number" min={1} max={10} value={formMaxPatients} onChange={(e) => setFormMaxPatients(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleAddSchedule}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-sm">Add Slot</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Leave Modal */}
      {showLeaveForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowLeaveForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Add Doctor Leave</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Leave Date</label>
                <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Leave Type</label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="personal">Personal</option>
                  <option value="sick">Sick</option>
                  <option value="holiday">Holiday</option>
                  <option value="conference">Conference</option>
                  <option value="emergency">Emergency</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-slate-500">Half Day?</label>
                <button onClick={() => setLeaveIsHalfDay(!leaveIsHalfDay)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${leaveIsHalfDay ? 'bg-primary' : 'bg-slate-200'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${leaveIsHalfDay ? 'left-[26px]' : 'left-0.5'}`} />
                </button>
              </div>
              {leaveIsHalfDay && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Half Day Period</label>
                  <select value={leaveHalfDayPeriod} onChange={(e) => setLeaveHalfDayPeriod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Reason (optional)</label>
                <input type="text" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="e.g. Annual leave"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowLeaveForm(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleAddBlock} disabled={!leaveDate}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors shadow-sm disabled:opacity-50">Add Leave</button>
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
