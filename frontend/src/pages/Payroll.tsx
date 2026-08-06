import React, { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import payrollService, { type PayrollRun, type PayrollItem } from '../services/payrollService';
import { htmlStringToPdf } from '../utils/pdf';
import { useToast } from '../contexts/ToastContext';

const today = new Date();

const ALLOWANCE_TYPE_LABELS: Record<string, string> = {
  added_to_salary: 'Added to Salary',
  in_hand: 'In Hand',
};

const ALLOWANCE_TYPE_BADGE: Record<string, string> = {
  added_to_salary: 'bg-emerald-100 text-emerald-700',
  in_hand: 'bg-slate-100 text-slate-600',
};

const Payroll: React.FC = () => {
  const toast = useToast();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [payroll, setPayroll] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeItem, setActiveItem] = useState<PayrollItem | null>(null);

  // Always the current numbers — no separate "generate" step. Entering an
  // allowance/incentive, or changing attendance, shows up here the next
  // time this loads (same month change, or navigating back to the page).
  const load = useCallback(() => {
    setLoading(true);
    payrollService
      .getPayroll(year, month)
      .then(setPayroll)
      .catch(() => { setPayroll(null); toast.error('Failed to load payroll'); })
      .finally(() => setLoading(false));
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const handleMonthChange = (value: string) => {
    const [y, m] = value.split('-').map(Number);
    if (y && m) { setYear(y); setMonth(m); }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const html = await payrollService.getPayrollPdfUrl(year, month);
      await htmlStringToPdf(html, `Payroll_${format(new Date(year, month - 1, 1), 'MMMM_yyyy')}.pdf`, 'landscape');
    } catch {
      toast.error('Failed to generate download');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <header className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Payroll</h1>
          <p className="text-sm text-slate-500">Live — base salary minus deductions, plus allowances and incentives, always up to date.</p>
        </div>
        {payroll && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <span className="material-icons text-sm">{downloading ? 'hourglass_empty' : 'picture_as_pdf'}</span>
            {downloading ? 'Generating...' : 'Download PDF'}
          </button>
        )}
      </header>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-wrap gap-3">
          <input
            type="month"
            value={`${year}-${String(month).padStart(2, '0')}`}
            onChange={e => handleMonthChange(e.target.value)}
            onClick={e => e.currentTarget.showPicker?.()}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {loading && <p className="text-xs text-slate-400 px-5 py-6 text-center">Loading…</p>}

        {!loading && payroll && (
          <div className="bg-white">
            <div className="px-5 py-3 text-sm font-bold text-slate-700 border-b border-slate-100 flex items-center justify-between">
              <span>Payroll — {format(new Date(year, month - 1, 1), 'MMMM yyyy')}</span>
              <span className="text-emerald-600">Total Payable ₹{payroll.total_net_payable.toLocaleString('en-IN')}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Employee</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-emerald-600 uppercase tracking-wide">Present</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-red-600 uppercase tracking-wide">Absent</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Paid Leave</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Base Salary</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-amber-600 uppercase tracking-wide">Deduction</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-emerald-600 uppercase tracking-wide">Allowance</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-emerald-600 uppercase tracking-wide">Incentive</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-amber-600 uppercase tracking-wide">Advance</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-emerald-700 uppercase tracking-wide">Net Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.items.map(item => (
                    <tr
                      key={item.user_id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer"
                      onClick={() => setActiveItem(item)}
                    >
                      <td className="px-5 py-2.5">
                        <div className="font-semibold text-slate-800">{item.first_name} {item.last_name}</div>
                        <div className="text-xs text-slate-400">{item.reference_number || '—'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-700 font-bold">{item.present_count}</td>
                      <td className="px-3 py-2.5 text-right text-red-700 font-bold">{item.absent_count}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{item.paid_leave_entitlement}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">₹{item.base_salary.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2.5 text-right text-amber-700 font-bold">
                        {item.deduction_amount ? `₹${item.deduction_amount.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-700 font-bold">
                        {item.allowance_added ? `₹${item.allowance_added.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-700 font-bold">
                        {item.incentive_added ? `₹${item.incentive_added.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-amber-700 font-bold">
                        {item.advance_deducted ? `−₹${item.advance_deducted.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-700 font-bold">₹{item.net_payable.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {payroll.items.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-5 py-10 text-center text-sm text-slate-400">No employees found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {activeItem && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4" onClick={() => setActiveItem(null)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{activeItem.first_name} {activeItem.last_name}</h2>
                <p className="text-xs text-slate-400">
                  {activeItem.designation || '—'} · {format(new Date(year, month - 1, 1), 'MMMM yyyy')}
                </p>
              </div>
              <button type="button" onClick={() => setActiveItem(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                <span className="material-icons text-lg">close</span>
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-4 flex-1">
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Present</p>
                  <p className="text-sm font-bold text-emerald-700">{activeItem.present_count} days</p>
                </div>
                <div className="px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Absent</p>
                  <p className="text-sm font-bold text-red-700">{activeItem.absent_count} days</p>
                </div>
              </div>

              <div className="space-y-2 mb-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Base Salary</span>
                  <span className="font-semibold text-slate-800">₹{activeItem.base_salary.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Deduction ({activeItem.deduction_days} day{activeItem.deduction_days === 1 ? '' : 's'})</span>
                  <span className="font-semibold text-amber-700">
                    {activeItem.deduction_amount ? `− ₹${activeItem.deduction_amount.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Allowance Added</span>
                  <span className="font-semibold text-emerald-700">
                    {activeItem.allowance_added ? `+ ₹${activeItem.allowance_added.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Incentive Added</span>
                  <span className="font-semibold text-emerald-700">
                    {activeItem.incentive_added ? `+ ₹${activeItem.incentive_added.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Advance Deducted</span>
                  <span className="font-semibold text-amber-700">
                    {activeItem.advance_deducted ? `− ₹${activeItem.advance_deducted.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100">
                  <span className="font-bold text-slate-800">Net Payable</span>
                  <span className="font-bold text-emerald-700 text-base">₹{activeItem.net_payable.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {activeItem.allowances.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Allowances this month</p>
                  <div className="space-y-2">
                    {activeItem.allowances.map((a, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-800">₹{a.amount.toLocaleString('en-IN')}</span>
                            <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${ALLOWANCE_TYPE_BADGE[a.allowance_type]}`}>
                              {ALLOWANCE_TYPE_LABELS[a.allowance_type]}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate">{a.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeItem.incentives.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Incentives this month</p>
                  <div className="space-y-2">
                    {activeItem.incentives.map((i, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-slate-800">₹{i.incentive_amount.toLocaleString('en-IN')}</span>
                          <p className="text-xs text-slate-500">
                            ₹{i.sales_amount.toLocaleString('en-IN')} sales × {i.incentive_percent}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeItem.advances.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Advance this month</p>
                  <div className="space-y-2">
                    {activeItem.advances.map((a, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-slate-800">−₹{a.this_month_deduction.toLocaleString('en-IN')}</span>
                          <p className="text-xs text-slate-500">
                            {a.reason} · ₹{a.remaining_after.toLocaleString('en-IN')} left of ₹{a.amount.toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payroll;
