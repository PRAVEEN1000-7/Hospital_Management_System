import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import scheduleService from '../services/scheduleService';
import type { DoctorSchedule, DoctorScheduleCreate, BlockedPeriod, DoctorOption } from '../types/appointment';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DoctorSchedulePage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<DoctorSchedule[]>([]);
  const [blockedPeriods, setBlockedPeriods] = useState<BlockedPeriod[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formWeekday, setFormWeekday] = useState(0);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('17:00');
  const [formSlotDuration, setFormSlotDuration] = useState(30);
  const [formConsType, setFormConsType] = useState('both');
  const [formMaxPatients, setFormMaxPatients] = useState(1);

  // Block form
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockStartDate, setBlockStartDate] = useState('');
  const [blockEndDate, setBlockEndDate] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockType, setBlockType] = useState('leave');

  useEffect(() => {
    if (isAdmin) {
      scheduleService.getDoctors().then(setDoctors).catch(() => {});
    } else if (user?.role === 'doctor') {
      setSelectedDoctorId(user.id);
    }
  }, [isAdmin, user]);

  const fetchData = useCallback(async () => {
    if (!selectedDoctorId) return;
    setLoading(true);
    try {
      const [sched, blocks] = await Promise.all([
        scheduleService.getSchedules(selectedDoctorId),
        scheduleService.getBlockedPeriods(selectedDoctorId),
      ]);
      setSchedules(sched);
      setBlockedPeriods(blocks);
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
        weekday: formWeekday,
        start_time: formStartTime,
        end_time: formEndTime,
        slot_duration: formSlotDuration,
        consultation_type: formConsType,
        max_patients_per_slot: formMaxPatients,
      };
      await scheduleService.createSchedule(selectedDoctorId, data);
      toast.success('Schedule slot added');
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to add schedule');
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    try {
      await scheduleService.deleteSchedule(id);
      toast.success('Schedule slot removed');
      fetchData();
    } catch {
      toast.error('Failed to delete schedule');
    }
  };

  const handleAddBlock = async () => {
    if (!blockStartDate || !blockEndDate) return;
    try {
      await scheduleService.createBlockedPeriod({
        doctor_id: selectedDoctorId,
        start_date: blockStartDate,
        end_date: blockEndDate,
        reason: blockReason || undefined,
        block_type: blockType,
      });
      toast.success('Period blocked');
      setShowBlockForm(false);
      setBlockStartDate(''); setBlockEndDate(''); setBlockReason('');
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to block period');
    }
  };

  const handleDeleteBlock = async (id: number) => {
    try {
      await scheduleService.deleteBlockedPeriod(id);
      toast.success('Block removed');
      fetchData();
    } catch {
      toast.error('Failed to remove block');
    }
  };

  // Group schedules by weekday
  const grouped = WEEKDAYS.map((day, i) => ({
    day,
    items: schedules.filter(s => s.weekday === i),
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
          <button onClick={() => setShowBlockForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-lg">block</span> Block Period
          </button>
        </div>
      </div>

      {/* Doctor Selector (admin) */}
      {isAdmin && (
        <div className="mb-6">
          <select value={selectedDoctorId || ''} onChange={(e) => setSelectedDoctorId(Number(e.target.value))}
            className="w-full sm:w-80 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white">
            <option value="">Select a doctor...</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name} — {d.department || 'N/A'}</option>)}
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
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold">{s.slot_duration} min</span>
                              <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-semibold capitalize">{s.consultation_type}</span>
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold">Max {s.max_patients_per_slot}</span>
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
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Blocked Periods</h2>
            {blockedPeriods.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400">
                <span className="material-symbols-outlined text-3xl mb-2 block">event_available</span>
                <p className="text-xs">No blocked periods</p>
              </div>
            ) : (
              <div className="space-y-2">
                {blockedPeriods.map(bp => (
                  <div key={bp.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between">
                    <div>
                      <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full uppercase">{bp.block_type}</span>
                      <p className="text-sm font-semibold text-slate-700 mt-1">{bp.start_date} → {bp.end_date}</p>
                      {bp.reason && <p className="text-xs text-slate-400 mt-0.5">{bp.reason}</p>}
                    </div>
                    <button onClick={() => handleDeleteBlock(bp.id)}
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
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Consultation Type</label>
                <select value={formConsType} onChange={(e) => setFormConsType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="both">Both (Online & Offline)</option>
                  <option value="online">Online Only</option>
                  <option value="offline">Offline Only</option>
                </select>
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

      {/* Block Period Modal */}
      {showBlockForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowBlockForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Block Period</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Start Date</label>
                  <input type="date" value={blockStartDate} onChange={(e) => setBlockStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">End Date</label>
                  <input type="date" value={blockEndDate} onChange={(e) => setBlockEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Block Type</label>
                <select value={blockType} onChange={(e) => setBlockType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  <option value="leave">Leave</option>
                  <option value="holiday">Holiday</option>
                  <option value="emergency">Emergency</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Reason (optional)</label>
                <input type="text" value={blockReason} onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="e.g. Annual leave"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowBlockForm(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleAddBlock}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors shadow-sm">Block Period</button>
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
