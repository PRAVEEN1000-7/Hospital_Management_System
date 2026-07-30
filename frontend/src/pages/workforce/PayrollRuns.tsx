import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import payrollService from '../../services/payrollService';
import type { PayrollRun, Payslip } from '../../types/payroll';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ─── Generate Run Modal ─────────────────────────────────────────────────── */

const GenerateRunModal: React.FC<{ onClose: () => void; onGenerated: () => void }> = ({ onClose, onGenerated }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await payrollService.generateRun({ period_month: month, period_year: year });
      toast.success('Payroll generated');
      onGenerated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to generate payroll';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer';
  const labelClass = 'text-sm font-medium text-slate-700 mb-1.5 block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Generate Payroll</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-slate-500">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-500">Reads only verified attendance for the period — if any tracked employee has an unverified day, generation is blocked until it's verified.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Month</label>
              <select className={inputClass} value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Year</label>
              <select className={inputClass} value={year} onChange={e => setYear(Number(e.target.value))}>
                {Array.from({ length: 3 }, (_, i) => now.getFullYear() - 1 + i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-semibold text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Generate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Payroll Runs Page ──────────────────────────────────────────────────── */

const PayrollRuns: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [payslipsByRun, setPayslipsByRun] = useState<Map<string, Payslip[]>>(new Map());
  const [loadingPayslips, setLoadingPayslips] = useState(false);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      setRuns(await payrollService.listRuns());
    } catch {
      toast.error('Failed to load payroll runs');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  const toggleExpand = async (run: PayrollRun) => {
    if (expandedRunId === run.id) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(run.id);
    if (!payslipsByRun.has(run.id)) {
      setLoadingPayslips(true);
      try {
        const payslips = await payrollService.getRunPayslips(run.id);
        setPayslipsByRun(prev => new Map(prev).set(run.id, payslips));
      } catch {
        toast.error('Failed to load payslips');
      } finally {
        setLoadingPayslips(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payroll</h1>
          <p className="text-sm text-slate-500 mt-1">LOP/payable-days feed only — not salary disbursement or statutory filings</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-lg">add</span>
          Generate Payroll
        </button>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">payments</span>
            <p className="text-slate-500 mt-3 text-sm">No payroll runs generated yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {runs.map(run => (
              <div key={run.id}>
                <button
                  onClick={() => toggleExpand(run)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-400">{expandedRunId === run.id ? 'expand_less' : 'expand_more'}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{MONTH_NAMES[run.period_month - 1]} {run.period_year}</p>
                      <p className="text-xs text-slate-500">{run.payslip_count ?? 0} payslip(s)</p>
                    </div>
                  </div>
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${run.status === 'processed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {run.status}
                  </span>
                </button>
                {expandedRunId === run.id && (
                  <div className="bg-slate-50/50 px-4 py-2">
                    {loadingPayslips ? (
                      <div className="py-4 text-center"><div className="w-5 h-5 border-4 border-slate-200 border-t-primary rounded-full animate-spin mx-auto" /></div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-slate-500">
                              <th className="py-2 font-semibold">Employee</th>
                              <th className="py-2 text-center font-semibold">Present</th>
                              <th className="py-2 text-center font-semibold">LOP</th>
                              <th className="py-2 text-right font-semibold">Net Salary</th>
                              <th className="py-2 text-right font-semibold">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(payslipsByRun.get(run.id) || []).map(p => (
                              <tr key={p.id}>
                                <td className="py-2 font-medium text-slate-700">{p.employee_name || p.employee_id}</td>
                                <td className="py-2 text-center">{p.present_days}</td>
                                <td className="py-2 text-center text-red-600 font-semibold">{p.lop_days}</td>
                                <td className="py-2 text-right font-bold text-slate-800">₹{Number(p.net_salary).toLocaleString('en-IN')}</td>
                                <td className="py-2 text-right">
                                  <button onClick={() => navigate(`/workforce/payroll/payslips/${p.id}`)} className="text-primary font-semibold hover:underline">View</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <GenerateRunModal onClose={() => setModalOpen(false)} onGenerated={() => { setModalOpen(false); fetchRuns(); }} />
      )}
    </div>
  );
};

export default PayrollRuns;
