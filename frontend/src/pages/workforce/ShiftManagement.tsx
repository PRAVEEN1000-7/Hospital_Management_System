import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import shiftService from '../../services/shiftService';
import employeeService from '../../services/employeeService';
import type { Shift, ShiftAssignment } from '../../types/shift';
import type { EmployeeProfile } from '../../types/employee';

/* ─── Shift Modal ────────────────────────────────────────────────────────── */

const ShiftModal: React.FC<{ shift: Shift | null; onClose: () => void; onSaved: () => void }> = ({ shift, onClose, onSaved }) => {
  const toast = useToast();
  const isEdit = !!shift;
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(shift?.name || '');
  const [startTime, setStartTime] = useState(shift?.start_time?.slice(0, 5) || '09:00');
  const [endTime, setEndTime] = useState(shift?.end_time?.slice(0, 5) || '17:00');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Shift name is required'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), start_time: `${startTime}:00`, end_time: `${endTime}:00` };
      if (isEdit) await shiftService.update(shift!.id, payload);
      else await shiftService.create(payload);
      toast.success(isEdit ? 'Shift updated' : 'Shift created');
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to save shift';
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
          <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Shift' : 'Add Shift'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-slate-500">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Name <span className="text-red-500">*</span></label>
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Day Shift" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Start Time</label>
              <input type="time" className={inputClass} value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>End Time</label>
              <input type="time" className={inputClass} value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-semibold text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Assign Shift Modal ─────────────────────────────────────────────────── */

const AssignShiftModal: React.FC<{
  shifts: Shift[];
  employees: EmployeeProfile[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ shifts, employees, onClose, onSaved }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !shiftId || !reason.trim()) {
      toast.error('Employee, shift, and reason are required');
      return;
    }
    setSaving(true);
    try {
      await shiftService.createAssignment({ employee_id: employeeId, shift_id: shiftId, effective_from: effectiveFrom, reason: reason.trim() });
      toast.success('Shift assigned');
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to assign shift';
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
          <h2 className="text-lg font-bold text-slate-900">Assign Shift</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-slate-500">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Employee <span className="text-red-500">*</span></label>
            <select className={inputClass + ' cursor-pointer'} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">Select employee</option>
              {employees.map(e => <option key={e.user_id} value={e.user_id}>{e.employee_name || e.user_id}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Shift <span className="text-red-500">*</span></label>
            <select className={inputClass + ' cursor-pointer'} value={shiftId} onChange={e => setShiftId(e.target.value)}>
              <option value="">Select shift</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Effective From</label>
            <input type="date" className={inputClass} value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Reason <span className="text-red-500">*</span></label>
            <input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. New joiner, department transfer" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-semibold text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Assign
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Shift Management Page ──────────────────────────────────────────────── */

const ShiftManagement: React.FC = () => {
  const toast = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a, e] = await Promise.all([
        shiftService.list(),
        shiftService.listAssignments(),
        employeeService.list(),
      ]);
      setShifts(s);
      setAssignments(a);
      setEmployees(e);
    } catch {
      toast.error('Failed to load shift data');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDeleteShift = async (s: Shift) => {
    if (!window.confirm(`Delete shift "${s.name}"?`)) return;
    try {
      await shiftService.remove(s.id);
      toast.success('Shift deleted');
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to delete shift';
      toast.error(msg);
    }
  };

  // Only currently-active assignments (no effective_to, or still in the future)
  const activeAssignments = assignments.filter(a => !a.effective_to || a.effective_to >= new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Shift Management</h1>
          <p className="text-sm text-slate-500 mt-1">Define shifts and assign employees to them</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAssignModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-lg">person_add</span>
            Assign Shift
          </button>
          <button onClick={() => { setEditShift(null); setShiftModalOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
            <span className="material-symbols-outlined text-lg">add</span>
            Add Shift
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-700">Shifts</h2>
            </div>
            {shifts.length === 0 ? (
              <div className="text-center py-10">
                <span className="material-symbols-outlined text-4xl text-slate-300">schedule</span>
                <p className="text-slate-500 mt-2 text-sm">No shifts defined yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {shifts.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => { setEditShift(s); setShiftModalOpen(true); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-[15px]">edit</span> Edit
                      </button>
                      <button onClick={() => handleDeleteShift(s)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-[15px]">delete</span> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-700">Current Assignments</h2>
            </div>
            {activeAssignments.length === 0 ? (
              <div className="text-center py-10">
                <span className="material-symbols-outlined text-4xl text-slate-300">group_off</span>
                <p className="text-slate-500 mt-2 text-sm">No active shift assignments</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Employee</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Shift</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Since</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeAssignments.map(a => (
                      <tr key={a.id}>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{a.employee_name || a.employee_id}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{a.shift_name || a.shift_id}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{a.effective_from}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{a.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {shiftModalOpen && (
        <ShiftModal shift={editShift} onClose={() => setShiftModalOpen(false)} onSaved={() => { setShiftModalOpen(false); fetchAll(); }} />
      )}
      {assignModalOpen && (
        <AssignShiftModal shifts={shifts} employees={employees} onClose={() => setAssignModalOpen(false)} onSaved={() => { setAssignModalOpen(false); fetchAll(); }} />
      )}
    </div>
  );
};

export default ShiftManagement;
