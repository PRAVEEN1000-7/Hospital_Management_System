import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import userService from '../services/userService';
import allowanceService, { type Allowance, type AllowanceType } from '../services/allowanceService';
import incentiveService, { type Incentive } from '../services/incentiveService';
import advancePaymentService, { type AdvancePayment } from '../services/advancePaymentService';
import type { UserData } from '../types/user';
import { useToast } from '../contexts/ToastContext';

type Tab = 'allowance' | 'incentive' | 'advance';

const TYPE_LABELS: Record<AllowanceType, string> = {
  added_to_salary: 'Added to Salary',
  in_hand: 'In Hand',
};

const TYPE_BADGE: Record<AllowanceType, string> = {
  added_to_salary: 'bg-emerald-100 text-emerald-700',
  in_hand: 'bg-slate-100 text-slate-600',
};

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const today = new Date();

const AllowancePage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('allowance');

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [employees, setEmployees] = useState<UserData[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // --- Allowance tab ---
  const [monthAllowances, setMonthAllowances] = useState<Allowance[]>([]);
  const [loadingAllowances, setLoadingAllowances] = useState(false);
  const [activeEmployee, setActiveEmployee] = useState<UserData | null>(null);
  const [form, setForm] = useState<{ amount: string; reason: string; allowance_type: AllowanceType }>({
    amount: '', reason: '', allowance_type: 'added_to_salary',
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // --- Incentive tab ---
  const [monthIncentives, setMonthIncentives] = useState<Incentive[]>([]);
  const [loadingIncentives, setLoadingIncentives] = useState(false);
  const [activeIncentiveEmployee, setActiveIncentiveEmployee] = useState<UserData | null>(null);
  const [incentiveForm, setIncentiveForm] = useState<{ sales_amount: string; incentive_percent: string }>({
    sales_amount: '', incentive_percent: '',
  });
  const [savingIncentive, setSavingIncentive] = useState(false);
  const [deletingIncentiveId, setDeletingIncentiveId] = useState<string | null>(null);

  // --- Advance Payment tab — not month-scoped, an advance spans many months ---
  const [advances, setAdvances] = useState<AdvancePayment[]>([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);
  const [activeAdvanceEmployee, setActiveAdvanceEmployee] = useState<UserData | null>(null);
  const [advanceForm, setAdvanceForm] = useState<{ amount: string; installments: string; startMonth: string; reason: string }>({
    amount: '', installments: '', startMonth: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`, reason: '',
  });
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [deletingAdvanceId, setDeletingAdvanceId] = useState<string | null>(null);

  useEffect(() => {
    setLoadingEmployees(true);
    // 100 is the backend's max allowed limit (Query(..., le=100) on GET
    // /users) — this page shows the full roster, not a paginated slice.
    userService.getUsers(1, 100)
      .then(res => setEmployees(res.data))
      .catch(() => toast.error('Failed to load employees'))
      .finally(() => setLoadingEmployees(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMonth = useCallback(() => {
    setLoadingAllowances(true);
    allowanceService.list(year, month)
      .then(setMonthAllowances)
      .catch(() => toast.error('Failed to load allowances'))
      .finally(() => setLoadingAllowances(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const loadMonthIncentives = useCallback(() => {
    setLoadingIncentives(true);
    incentiveService.list(year, month)
      .then(setMonthIncentives)
      .catch(() => toast.error('Failed to load incentives'))
      .finally(() => setLoadingIncentives(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const loadAdvances = useCallback(() => {
    setLoadingAdvances(true);
    advancePaymentService.list()
      .then(setAdvances)
      .catch(() => toast.error('Failed to load advance payments'))
      .finally(() => setLoadingAdvances(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadMonth(); }, [loadMonth]);
  useEffect(() => { loadMonthIncentives(); }, [loadMonthIncentives]);
  useEffect(() => { loadAdvances(); }, [loadAdvances]);

  const handleMonthChange = (value: string) => {
    const [y, m] = value.split('-').map(Number);
    if (y && m) { setYear(y); setMonth(m); }
  };

  // Per-employee totals for this month, computed once from the already-
  // loaded list rather than a separate call per employee.
  const totalsByEmployee = useMemo(() => {
    const map: Record<string, { addedToSalary: number; inHand: number; count: number }> = {};
    for (const a of monthAllowances) {
      const bucket = map[a.user_id] || { addedToSalary: 0, inHand: 0, count: 0 };
      if (a.allowance_type === 'added_to_salary') bucket.addedToSalary += a.amount;
      else bucket.inHand += a.amount;
      bucket.count += 1;
      map[a.user_id] = bucket;
    }
    return map;
  }, [monthAllowances]);

  const incentiveTotalsByEmployee = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const i of monthIncentives) {
      const bucket = map[i.user_id] || { total: 0, count: 0 };
      bucket.total += i.incentive_amount;
      bucket.count += 1;
      map[i.user_id] = bucket;
    }
    return map;
  }, [monthIncentives]);

  // Outstanding balance per employee — sum of remaining_amount across every
  // active (not yet fully repaid) advance they have.
  const advanceTotalsByEmployee = useMemo(() => {
    const map: Record<string, { remaining: number; count: number }> = {};
    for (const a of advances) {
      if (a.is_completed) continue;
      const bucket = map[a.user_id] || { remaining: 0, count: 0 };
      bucket.remaining += a.remaining_amount;
      bucket.count += 1;
      map[a.user_id] = bucket;
    }
    return map;
  }, [advances]);

  const employeeAllowances = useMemo(
    () => (activeEmployee ? monthAllowances.filter(a => a.user_id === activeEmployee.id) : []),
    [monthAllowances, activeEmployee],
  );

  const employeeIncentives = useMemo(
    () => (activeIncentiveEmployee ? monthIncentives.filter(i => i.user_id === activeIncentiveEmployee.id) : []),
    [monthIncentives, activeIncentiveEmployee],
  );

  const employeeAdvances = useMemo(
    () => (activeAdvanceEmployee ? advances.filter(a => a.user_id === activeAdvanceEmployee.id) : []),
    [advances, activeAdvanceEmployee],
  );

  const openEmployee = (emp: UserData) => {
    setActiveEmployee(emp);
    setForm({ amount: '', reason: '', allowance_type: 'added_to_salary' });
  };

  const closeModal = () => {
    setActiveEmployee(null);
  };

  const openIncentiveEmployee = (emp: UserData) => {
    setActiveIncentiveEmployee(emp);
    setIncentiveForm({ sales_amount: '', incentive_percent: '' });
  };

  const closeIncentiveModal = () => {
    setActiveIncentiveEmployee(null);
  };

  const openAdvanceEmployee = (emp: UserData) => {
    setActiveAdvanceEmployee(emp);
    setAdvanceForm({ amount: '', installments: '', startMonth: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`, reason: '' });
  };

  const closeAdvanceModal = () => {
    setActiveAdvanceEmployee(null);
  };

  const handleAdd = async () => {
    if (!activeEmployee) return;
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0 || !form.reason.trim()) {
      toast.error('Enter a valid amount and reason');
      return;
    }
    setSaving(true);
    try {
      await allowanceService.create({
        user_id: activeEmployee.id,
        year,
        month,
        amount,
        reason: form.reason.trim(),
        allowance_type: form.allowance_type,
      });
      toast.success(`Allowance added for ${activeEmployee.first_name}`);
      setForm({ amount: '', reason: '', allowance_type: 'added_to_salary' });
      loadMonth();
    } catch {
      toast.error('Failed to add allowance');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await allowanceService.delete(id);
      loadMonth();
    } catch {
      toast.error('Failed to remove allowance');
    } finally {
      setDeletingId(null);
    }
  };

  const incentivePreview = useMemo(() => {
    const sales = parseFloat(incentiveForm.sales_amount);
    const pct = parseFloat(incentiveForm.incentive_percent);
    if (!sales || sales <= 0 || !pct || pct <= 0) return null;
    return Math.round((sales * pct / 100) * 100) / 100;
  }, [incentiveForm]);

  const handleAddIncentive = async () => {
    if (!activeIncentiveEmployee) return;
    const sales = parseFloat(incentiveForm.sales_amount);
    const pct = parseFloat(incentiveForm.incentive_percent);
    if (!sales || sales <= 0 || !pct || pct <= 0) {
      toast.error('Enter a valid sales amount and percentage');
      return;
    }
    setSavingIncentive(true);
    try {
      await incentiveService.create({
        user_id: activeIncentiveEmployee.id,
        year,
        month,
        sales_amount: sales,
        incentive_percent: pct,
      });
      toast.success(`Incentive added for ${activeIncentiveEmployee.first_name}`);
      setIncentiveForm({ sales_amount: '', incentive_percent: '' });
      loadMonthIncentives();
    } catch {
      toast.error('Failed to add incentive');
    } finally {
      setSavingIncentive(false);
    }
  };

  const handleDeleteIncentive = async (id: string) => {
    setDeletingIncentiveId(id);
    try {
      await incentiveService.delete(id);
      loadMonthIncentives();
    } catch {
      toast.error('Failed to remove incentive');
    } finally {
      setDeletingIncentiveId(null);
    }
  };

  const advancePreview = useMemo(() => {
    const amount = parseFloat(advanceForm.amount);
    const installments = parseInt(advanceForm.installments, 10);
    if (!amount || amount <= 0 || !installments || installments <= 0) return null;
    return Math.round((amount / installments) * 100) / 100;
  }, [advanceForm]);

  const handleAddAdvance = async () => {
    if (!activeAdvanceEmployee) return;
    const amount = parseFloat(advanceForm.amount);
    const installments = parseInt(advanceForm.installments, 10);
    const [startYear, startMonth] = advanceForm.startMonth.split('-').map(Number);
    if (!amount || amount <= 0 || !installments || installments <= 0 || !advanceForm.reason.trim()) {
      toast.error('Enter a valid amount, installments, and reason');
      return;
    }
    setSavingAdvance(true);
    try {
      await advancePaymentService.create({
        user_id: activeAdvanceEmployee.id,
        amount,
        installments,
        start_year: startYear,
        start_month: startMonth,
        reason: advanceForm.reason.trim(),
      });
      toast.success(`Advance added for ${activeAdvanceEmployee.first_name}`);
      setAdvanceForm({ amount: '', installments: '', startMonth: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`, reason: '' });
      loadAdvances();
    } catch {
      toast.error('Failed to add advance payment');
    } finally {
      setSavingAdvance(false);
    }
  };

  const handleDeleteAdvance = async (id: string) => {
    setDeletingAdvanceId(id);
    try {
      await advancePaymentService.delete(id);
      loadAdvances();
    } catch {
      toast.error('Failed to remove advance payment');
    } finally {
      setDeletingAdvanceId(null);
    }
  };

  const tabDescriptions: Record<Tab, string> = {
    allowance: 'One-off, event-tied payments — a campaign fee, a business trip. Click an employee to log one.',
    incentive: 'Sales-linked incentives — enter sales and a percentage, the amount is calculated. Click an employee to log one.',
    advance: 'A salary advance recovered as a fixed EMI from Payroll each month until fully repaid. Click an employee to log one.',
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Allowance, Incentive & Advance</h1>
        <p className="text-sm text-slate-500">{tabDescriptions[tab]}</p>
      </header>

      <div className="inline-flex bg-slate-100 rounded-lg p-1 mb-4">
        <button
          type="button"
          onClick={() => setTab('allowance')}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${tab === 'allowance' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Allowance
        </button>
        <button
          type="button"
          onClick={() => setTab('incentive')}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${tab === 'incentive' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Incentive
        </button>
        <button
          type="button"
          onClick={() => setTab('advance')}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${tab === 'advance' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Advance Payment
        </button>
      </div>

      {tab === 'allowance' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-wrap gap-3">
            <input
              type="month"
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={e => handleMonthChange(e.target.value)}
              onClick={e => e.currentTarget.showPicker?.()}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="text-xs text-slate-400">
              Amounts shown are for {format(new Date(year, month - 1, 1), 'MMMM yyyy')}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Employee ID</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Designation</th>
                <th className="text-right px-3 py-3 text-xs font-bold text-emerald-600 uppercase tracking-wide">Added to Salary</th>
                <th className="text-right px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">In Hand</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const totals = totalsByEmployee[emp.id];
                return (
                  <tr
                    key={emp.id}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer"
                    onClick={() => openEmployee(emp)}
                  >
                    <td className="px-5 py-3 text-slate-500">{emp.reference_number || '—'}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{emp.first_name} {emp.last_name}</td>
                    <td className="px-3 py-3 text-slate-600">{emp.designation || '—'}</td>
                    <td className="px-3 py-3 text-right text-emerald-700 font-bold">
                      {totals?.addedToSalary ? `₹${totals.addedToSalary.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {totals?.inHand ? `₹${totals.inHand.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      <span className="material-icons text-base">chevron_right</span>
                    </td>
                  </tr>
                );
              })}
              {!loadingEmployees && employees.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">No employees found.</td>
                </tr>
              )}
            </tbody>
          </table>
          {(loadingEmployees || loadingAllowances) && <p className="text-xs text-slate-400 px-5 py-3">Loading…</p>}
        </div>
      )}

      {tab === 'incentive' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-wrap gap-3">
            <input
              type="month"
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={e => handleMonthChange(e.target.value)}
              onClick={e => e.currentTarget.showPicker?.()}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="text-xs text-slate-400">
              Amounts shown are for {format(new Date(year, month - 1, 1), 'MMMM yyyy')}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Employee ID</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Designation</th>
                <th className="text-right px-3 py-3 text-xs font-bold text-emerald-600 uppercase tracking-wide">Incentive Earned</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const totals = incentiveTotalsByEmployee[emp.id];
                return (
                  <tr
                    key={emp.id}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer"
                    onClick={() => openIncentiveEmployee(emp)}
                  >
                    <td className="px-5 py-3 text-slate-500">{emp.reference_number || '—'}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{emp.first_name} {emp.last_name}</td>
                    <td className="px-3 py-3 text-slate-600">{emp.designation || '—'}</td>
                    <td className="px-3 py-3 text-right text-emerald-700 font-bold">
                      {totals?.total ? `₹${totals.total.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      <span className="material-icons text-base">chevron_right</span>
                    </td>
                  </tr>
                );
              })}
              {!loadingEmployees && employees.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">No employees found.</td>
                </tr>
              )}
            </tbody>
          </table>
          {(loadingEmployees || loadingIncentives) && <p className="text-xs text-slate-400 px-5 py-3">Loading…</p>}
        </div>
      )}

      {tab === 'advance' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-wrap gap-3">
            <span className="text-sm font-bold text-slate-700">Outstanding advances</span>
            <span className="text-xs text-slate-400">An advance is recovered automatically over its own schedule — not tied to one month.</span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Employee ID</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Designation</th>
                <th className="text-right px-3 py-3 text-xs font-bold text-amber-600 uppercase tracking-wide">Outstanding Balance</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const totals = advanceTotalsByEmployee[emp.id];
                return (
                  <tr
                    key={emp.id}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer"
                    onClick={() => openAdvanceEmployee(emp)}
                  >
                    <td className="px-5 py-3 text-slate-500">{emp.reference_number || '—'}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{emp.first_name} {emp.last_name}</td>
                    <td className="px-3 py-3 text-slate-600">{emp.designation || '—'}</td>
                    <td className="px-3 py-3 text-right text-amber-700 font-bold">
                      {totals?.remaining ? `₹${totals.remaining.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      <span className="material-icons text-base">chevron_right</span>
                    </td>
                  </tr>
                );
              })}
              {!loadingEmployees && employees.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">No employees found.</td>
                </tr>
              )}
            </tbody>
          </table>
          {(loadingEmployees || loadingAdvances) && <p className="text-xs text-slate-400 px-5 py-3">Loading…</p>}
        </div>
      )}

      {activeEmployee && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4" onClick={closeModal}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{activeEmployee.first_name} {activeEmployee.last_name}</h2>
                <p className="text-xs text-slate-400">{activeEmployee.reference_number || '—'} · {format(new Date(year, month - 1, 1), 'MMMM yyyy')}</p>
              </div>
              <button type="button" onClick={closeModal} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                <span className="material-icons text-lg">close</span>
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-4 flex-1">
              {employeeAllowances.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">This month's allowances</p>
                  <div className="space-y-2">
                    {employeeAllowances.map(a => (
                      <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-800">₹{a.amount.toLocaleString('en-IN')}</span>
                            <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${TYPE_BADGE[a.allowance_type]}`}>
                              {TYPE_LABELS[a.allowance_type]}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate">{a.reason}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(a.id)}
                          disabled={deletingId === a.id}
                          title="Remove"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 flex-shrink-0"
                        >
                          <span className="material-icons text-base">{deletingId === a.id ? 'hourglass_empty' : 'delete_outline'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Add new allowance</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="e.g. 2000"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Reason</label>
                  <input
                    type="text"
                    value={form.reason}
                    onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="e.g. Client campaign — Mumbai trip"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['added_to_salary', 'in_hand'] as AllowanceType[]).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, allowance_type: t }))}
                        className={`px-3 py-2.5 text-sm font-bold rounded-lg border transition-colors ${
                          form.allowance_type === t
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-primary/40'
                        }`}
                      >
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {form.allowance_type === 'added_to_salary'
                      ? 'Included in this employee’s Net Payable for this month.'
                      : 'Given to the employee, but not counted toward Net Payable.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving || !form.amount || !form.reason.trim()}
                className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Adding...' : 'Add Allowance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeIncentiveEmployee && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4" onClick={closeIncentiveModal}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{activeIncentiveEmployee.first_name} {activeIncentiveEmployee.last_name}</h2>
                <p className="text-xs text-slate-400">{activeIncentiveEmployee.reference_number || '—'} · {format(new Date(year, month - 1, 1), 'MMMM yyyy')}</p>
              </div>
              <button type="button" onClick={closeIncentiveModal} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                <span className="material-icons text-lg">close</span>
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-4 flex-1">
              {employeeIncentives.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">This month's incentives</p>
                  <div className="space-y-2">
                    {employeeIncentives.map(i => (
                      <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-slate-800">₹{i.incentive_amount.toLocaleString('en-IN')}</span>
                          <p className="text-xs text-slate-500">
                            ₹{i.sales_amount.toLocaleString('en-IN')} sales × {i.incentive_percent}%
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteIncentive(i.id)}
                          disabled={deletingIncentiveId === i.id}
                          title="Remove"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 flex-shrink-0"
                        >
                          <span className="material-icons text-base">{deletingIncentiveId === i.id ? 'hourglass_empty' : 'delete_outline'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Add new incentive</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Sales Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={incentiveForm.sales_amount}
                    onChange={e => setIncentiveForm(prev => ({ ...prev, sales_amount: e.target.value }))}
                    placeholder="e.g. 10000"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Incentive %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={incentiveForm.incentive_percent}
                    onChange={e => setIncentiveForm(prev => ({ ...prev, incentive_percent: e.target.value }))}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="px-3 py-2.5 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Calculated Incentive</span>
                  <span className="text-base font-bold text-emerald-700">
                    {incentivePreview !== null ? `₹${incentivePreview.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Always included in this employee's Net Payable for this month — there's no "In Hand" option for incentives.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
              <button
                type="button"
                onClick={closeIncentiveModal}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleAddIncentive}
                disabled={savingIncentive || !incentiveForm.sales_amount || !incentiveForm.incentive_percent}
                className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingIncentive ? 'Adding...' : 'Add Incentive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeAdvanceEmployee && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4" onClick={closeAdvanceModal}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{activeAdvanceEmployee.first_name} {activeAdvanceEmployee.last_name}</h2>
                <p className="text-xs text-slate-400">{activeAdvanceEmployee.reference_number || '—'}</p>
              </div>
              <button type="button" onClick={closeAdvanceModal} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                <span className="material-icons text-lg">close</span>
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-4 flex-1">
              {employeeAdvances.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Advances</p>
                  <div className="space-y-2">
                    {employeeAdvances.map(a => (
                      <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-800">₹{a.amount.toLocaleString('en-IN')}</span>
                            <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${a.is_completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {a.is_completed ? 'Paid Off' : `₹${a.remaining_amount.toLocaleString('en-IN')} left`}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate">
                            {a.reason} · ₹{a.emi_amount.toLocaleString('en-IN')}/mo × {a.installments} from {MONTH_NAMES[a.start_month]} {a.start_year}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAdvance(a.id)}
                          disabled={deletingAdvanceId === a.id}
                          title="Remove"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 flex-shrink-0"
                        >
                          <span className="material-icons text-base">{deletingAdvanceId === a.id ? 'hourglass_empty' : 'delete_outline'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Add new advance</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Amount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={advanceForm.amount}
                      onChange={e => setAdvanceForm(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="e.g. 50000"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Installments</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={advanceForm.installments}
                      onChange={e => setAdvanceForm(prev => ({ ...prev, installments: e.target.value }))}
                      placeholder="e.g. 10"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Start Month</label>
                  <input
                    type="month"
                    value={advanceForm.startMonth}
                    onChange={e => setAdvanceForm(prev => ({ ...prev, startMonth: e.target.value }))}
                    onClick={e => e.currentTarget.showPicker?.()}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Reason</label>
                  <input
                    type="text"
                    value={advanceForm.reason}
                    onChange={e => setAdvanceForm(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="e.g. Medical emergency"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Monthly EMI</span>
                  <span className="text-base font-bold text-amber-700">
                    {advancePreview !== null ? `₹${advancePreview.toLocaleString('en-IN')}/mo` : '—'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Deducted from Net Payable automatically each month, starting the selected month, until fully repaid.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
              <button
                type="button"
                onClick={closeAdvanceModal}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleAddAdvance}
                disabled={savingAdvance || !advanceForm.amount || !advanceForm.installments || !advanceForm.reason.trim()}
                className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingAdvance ? 'Adding...' : 'Add Advance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllowancePage;
