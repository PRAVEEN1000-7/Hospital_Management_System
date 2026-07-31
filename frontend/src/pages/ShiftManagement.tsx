import React, { useState, useEffect, useCallback } from 'react';
import userService from '../services/userService';
import shiftService, { type Shift } from '../services/shiftService';
import type { UserData } from '../types/user';
import { ROLE_LABELS } from '../utils/constants';
import { useToast } from '../contexts/ToastContext';

const SHIFT_BADGE_COLORS: Record<string, string> = {
  'Day Shift': 'bg-amber-100 text-amber-700',
  'Night Shift': 'bg-indigo-100 text-indigo-700',
};

const ShiftManagement: React.FC = () => {
  const toast = useToast();
  const [employees, setEmployees] = useState<UserData[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editForm, setEditForm] = useState({ name: '', start_time: '', end_time: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const loadEmployees = useCallback(() => {
    setLoading(true);
    // 100 is the backend's max allowed limit (Query(..., le=100) on GET
    // /users) — this page shows the full roster to allocate shifts against,
    // not a paginated slice, so we ask for as many as the API allows.
    userService.getUsers(1, 100)
      .then(res => setEmployees(res.data))
      .catch(() => toast.error('Failed to load employees'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadEmployees();
    shiftService.getShifts().then(setShifts).catch(() => toast.error('Failed to load shifts'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allSelected = employees.length > 0 && selected.size === employees.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(employees.map(e => e.id)));
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async (shift: Shift) => {
    if (selected.size === 0) return;
    setAssigning(shift.id);
    try {
      const { updated } = await shiftService.assignShift(Array.from(selected), shift.id);
      toast.success(`Assigned ${updated} employee${updated !== 1 ? 's' : ''} to ${shift.name}`);
      setSelected(new Set());
      loadEmployees();
    } catch {
      toast.error(`Failed to assign ${shift.name}`);
    } finally {
      setAssigning(null);
    }
  };

  const openEdit = (shift: Shift) => {
    setEditingShift(shift);
    setEditForm({
      name: shift.name,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
    });
  };

  const closeEdit = () => {
    setEditingShift(null);
    setSavingEdit(false);
  };

  const handleSaveEdit = async () => {
    if (!editingShift) return;
    setSavingEdit(true);
    try {
      const updated = await shiftService.updateShift(editingShift.id, {
        name: editForm.name,
        start_time: `${editForm.start_time}:00`,
        end_time: `${editForm.end_time}:00`,
      });
      setShifts(prev => prev.map(s => (s.id === updated.id ? updated : s)));
      toast.success(`${updated.name} timing updated`);
      closeEdit();
    } catch {
      toast.error('Failed to update shift timing');
      setSavingEdit(false);
    }
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(':');
    const hour = parseInt(h, 10);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:${m} ${suffix}`;
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Shift Management</h1>
        <p className="text-sm text-slate-500">Select employees, then assign them to Day or Night shift.</p>
      </header>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-wrap gap-3">
          <span className="text-sm font-semibold text-slate-600">
            {selected.size > 0 ? `${selected.size} employee${selected.size !== 1 ? 's' : ''} selected` : 'Select employees below'}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {shifts.map(shift => (
              <div key={shift.id} className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-1.5 py-1.5">
                <div className="flex flex-col leading-tight mr-1">
                  <span className="text-xs font-bold text-slate-700">{shift.name}</span>
                  <span className="text-[11px] text-slate-400">{formatTime(shift.start_time)} – {formatTime(shift.end_time)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(shift)}
                  title="Edit shift timing"
                  className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <span className="material-icons text-base">edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAssign(shift)}
                  disabled={selected.size === 0 || assigning !== null}
                  className="px-3 py-1.5 text-xs font-bold bg-primary hover:bg-primary/90 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <span className="material-icons text-sm">{assigning === shift.id ? 'hourglass_empty' : 'schedule'}</span>
                  {assigning === shift.id ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="w-12 px-5 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                />
              </th>
              <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Employee ID</th>
              <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Role</th>
              <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Current Shift</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr
                key={emp.id}
                className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer ${selected.has(emp.id) ? 'bg-primary/5' : ''}`}
                onClick={() => toggleOne(emp.id)}
              >
                <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(emp.id)}
                    onChange={() => toggleOne(emp.id)}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                  />
                </td>
                <td className="px-3 py-3 text-slate-500">{emp.reference_number || '—'}</td>
                <td className="px-3 py-3 font-semibold text-slate-800">{emp.first_name} {emp.last_name}</td>
                <td className="px-3 py-3 text-slate-600">{ROLE_LABELS[emp.roles?.[0] || ''] || emp.roles?.[0] || '—'}</td>
                <td className="px-3 py-3">
                  {emp.shift_name ? (
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${SHIFT_BADGE_COLORS[emp.shift_name] || 'bg-slate-100 text-slate-600'}`}>
                      {emp.shift_name}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Not assigned</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && employees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">No employees found.</td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <p className="text-xs text-slate-400 px-5 py-3">Loading…</p>}
      </div>

      {editingShift && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4" onClick={closeEdit}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-900 mb-4">Edit Shift Timing</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Shift Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Start Time</label>
                  <input
                    type="time"
                    value={editForm.start_time}
                    onChange={e => setEditForm(prev => ({ ...prev, start_time: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">End Time</label>
                  <input
                    type="time"
                    value={editForm.end_time}
                    onChange={e => setEditForm(prev => ({ ...prev, end_time: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingEdit}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit || !editForm.name || !editForm.start_time || !editForm.end_time}
                className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftManagement;
