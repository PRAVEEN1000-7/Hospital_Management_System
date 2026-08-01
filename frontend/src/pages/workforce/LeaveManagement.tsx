import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import leaveService from '../../services/leaveService';
import employeeService from '../../services/employeeService';
import type { LeaveRecord, LeaveBalance } from '../../types/leave';
import type { EmployeeProfile } from '../../types/employee';

/* ─── Add Leave Modal ────────────────────────────────────────────────────── */

const LeaveModal: React.FC<{ employees: EmployeeProfile[]; onClose: () => void; onSaved: () => void }> = ({ employees, onClose, onSaved }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !startDate || !endDate) {
      toast.error('Employee, start date, and end date are required');
      return;
    }
    if (endDate < startDate) {
      toast.error('End date cannot be before start date');
      return;
    }
    setSaving(true);
    try {
      await leaveService.create({ employee_id: employeeId, start_date: startDate, end_date: endDate, reason: reason.trim() || undefined });
      toast.success('Leave recorded');
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to record leave';
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
          <h2 className="text-lg font-bold text-slate-900">Record Leave</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-slate-500">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-500">Leave entered here is recorded as approved immediately — this is HR data-entry, not a request queue.</p>
          <div>
            <label className={labelClass}>Employee <span className="text-red-500">*</span></label>
            <select className={inputClass + ' cursor-pointer'} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">Select employee</option>
              {employees.map(e => <option key={e.user_id} value={e.user_id}>{e.employee_name || e.user_id}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Start Date <span className="text-red-500">*</span></label>
              <input type="date" className={inputClass} value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>End Date <span className="text-red-500">*</span></label>
              <input type="date" className={inputClass} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Reason</label>
            <input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Fever, family function" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-semibold text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Record Leave
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Leave Management Page ──────────────────────────────────────────────── */

const LeaveManagement: React.FC = () => {
  const toast = useToast();
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [balances, setBalances] = useState<Map<string, LeaveBalance>>(new Map());
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, e] = await Promise.all([leaveService.list(), employeeService.list()]);
      setRecords(r);
      setEmployees(e);
      const balanceEntries = await Promise.all(
        e.map(async (emp) => {
          try {
            const b = await leaveService.getBalance(emp.user_id, year);
            return [emp.user_id, b] as const;
          } catch {
            return null;
          }
        })
      );
      const map = new Map<string, LeaveBalance>();
      balanceEntries.forEach(entry => { if (entry) map.set(entry[0], entry[1]); });
      setBalances(map);
    } catch {
      toast.error('Failed to load leave data');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave Management</h1>
          <p className="text-sm text-slate-500 mt-1">HR-entered leave records and per-employee balances</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-lg">add</span>
          Record Leave
        </button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-200 flex items-center gap-3">
              <h2 className="text-sm font-bold text-slate-700">Leave Balances</h2>
              <select value={year} onChange={e => setYear(Number(e.target.value))} className="ml-auto px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
                {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {employees.length === 0 ? (
              <div className="text-center py-10">
                <span className="material-symbols-outlined text-4xl text-slate-300">group_off</span>
                <p className="text-slate-500 mt-2 text-sm">No employees found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Employee</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Allocated</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Used</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map(emp => {
                      const bal = balances.get(emp.user_id);
                      return (
                        <tr key={emp.user_id}>
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">{emp.employee_name || emp.user_id}</td>
                          <td className="px-4 py-3 text-sm text-center text-slate-600">{bal?.allocated ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-center text-slate-600">{bal?.used ?? 0}</td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${(bal?.remaining ?? 0) > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {bal?.remaining ?? 0}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-700">Leave Records</h2>
            </div>
            {records.length === 0 ? (
              <div className="text-center py-10">
                <span className="material-symbols-outlined text-4xl text-slate-300">event_note</span>
                <p className="text-slate-500 mt-2 text-sm">No leave recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Employee</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Dates</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Days</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Reason</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map(r => (
                      <tr key={r.id}>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{r.employee_name || r.employee_id}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{r.start_date} – {r.end_date}</td>
                        <td className="px-4 py-3 text-sm text-center text-slate-600">{r.days_taken ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{r.reason || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 capitalize">{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <LeaveModal employees={employees} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchAll(); }} />
      )}
    </div>
  );
};

export default LeaveManagement;
