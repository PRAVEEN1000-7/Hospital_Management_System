import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import payrollService, { type PayrollRun } from '../services/payrollService';
import { downloadElementAsImage } from '../utils/screenshot';
import { useToast } from '../contexts/ToastContext';

const today = new Date();

const Payroll: React.FC = () => {
  const toast = useToast();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [payroll, setPayroll] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    setNotFound(false);
    payrollService
      .getPayroll(year, month)
      .then(setPayroll)
      .catch(() => { setPayroll(null); setNotFound(true); })
      .finally(() => setLoading(false));
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const handleMonthChange = (value: string) => {
    const [y, m] = value.split('-').map(Number);
    if (y && m) { setYear(y); setMonth(m); }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const run = await payrollService.generatePayroll(year, month);
      setPayroll(run);
      setNotFound(false);
      toast.success('Payroll generated');
    } catch {
      toast.error('Failed to generate payroll');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      await downloadElementAsImage(cardRef.current, `payroll-${year}-${String(month).padStart(2, '0')}`);
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
          <p className="text-sm text-slate-500">Generated from the Attendance Report — base salary minus attendance-based deductions.</p>
        </div>
        {payroll && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <span className="material-icons text-sm">{downloading ? 'hourglass_empty' : 'photo_camera'}</span>
            {downloading ? 'Generating...' : 'Download'}
          </button>
        )}
      </header>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={e => handleMonthChange(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {payroll?.generated_at && (
              <span className="text-xs text-slate-400">
                Generated {format(new Date(payroll.generated_at), 'dd MMM yyyy, HH:mm')}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <span className="material-icons text-sm">{generating ? 'hourglass_empty' : 'calculate'}</span>
            {generating ? 'Generating...' : payroll ? 'Regenerate Payroll' : 'Generate Payroll'}
          </button>
        </div>

        {loading && <p className="text-xs text-slate-400 px-5 py-6 text-center">Loading…</p>}

        {!loading && notFound && (
          <div className="px-5 py-16 text-center">
            <span className="material-icons text-4xl text-slate-300 mb-2">receipt_long</span>
            <p className="text-sm text-slate-500">No payroll generated for {format(new Date(year, month - 1, 1), 'MMMM yyyy')} yet.</p>
            <p className="text-xs text-slate-400 mt-1">Click "Generate Payroll" to pull this month's attendance data.</p>
          </div>
        )}

        {!loading && payroll && (
          <div ref={cardRef} className="bg-white">
            <div className="px-5 py-3 text-sm font-bold text-slate-700 border-b border-slate-100 flex items-center justify-between">
              <span>Payroll — {format(new Date(year, month - 1, 1), 'MMMM yyyy')}</span>
              <span className="text-emerald-600">Total Payable ₹{payroll.total_net_payable.toLocaleString('en-IN')}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Employee</th>
                    <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Designation</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-emerald-600 uppercase tracking-wide">Present</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-red-600 uppercase tracking-wide">Absent</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Paid Leave</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Base Salary</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-amber-600 uppercase tracking-wide">Deduction</th>
                    <th className="text-right px-3 py-3 text-xs font-bold text-emerald-700 uppercase tracking-wide">Net Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.items.map(item => (
                    <tr key={item.user_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-5 py-2.5">
                        <div className="font-semibold text-slate-800">{item.first_name} {item.last_name}</div>
                        <div className="text-xs text-slate-400">{item.reference_number || '—'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{item.designation || '—'}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-700 font-bold">{item.present_count}</td>
                      <td className="px-3 py-2.5 text-right text-red-700 font-bold">{item.absent_count}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{item.paid_leave_entitlement}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">₹{item.base_salary.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2.5 text-right text-amber-700 font-bold">
                        {item.deduction_amount ? `₹${item.deduction_amount.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-700 font-bold">₹{item.net_payable.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {payroll.items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">No employees found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Payroll;
