import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import payrollService from '../../services/payrollService';
import { htmlStringToPdf } from '../../utils/pdf';
import type { Payslip } from '../../types/payroll';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

const StatRow: React.FC<{ label: string; value: React.ReactNode; emphasis?: boolean }> = ({ label, value, emphasis }) => (
  <div className={`flex items-center justify-between py-2 ${emphasis ? '' : 'border-b border-slate-100'}`}>
    <span className={`text-sm ${emphasis ? 'font-bold text-slate-800' : 'text-slate-500'}`}>{label}</span>
    <span className={`text-sm ${emphasis ? 'font-bold text-lg text-primary' : 'font-medium text-slate-700'}`}>{value}</span>
  </div>
);

const PayslipDetail: React.FC = () => {
  const { payslipId } = useParams<{ payslipId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const fetchPayslip = useCallback(async () => {
    if (!payslipId) return;
    setLoading(true);
    try {
      setPayslip(await payrollService.getPayslip(payslipId));
    } catch {
      toast.error('Failed to load payslip');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payslipId]);

  useEffect(() => { fetchPayslip(); }, [fetchPayslip]);

  const handleDownload = async () => {
    if (!payslipId || downloading) return;
    setDownloading(true);
    try {
      const html = await payrollService.getPayslipPrintHtml(payslipId);
      await htmlStringToPdf(html, `Payslip_${payslip?.employee_name || payslipId}.pdf`);
      toast.success('Payslip downloaded');
    } catch {
      toast.error('Failed to download payslip');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!payslip) {
    return <div className="text-center py-16 text-sm text-slate-400">Payslip not found</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-slate-500">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{payslip.employee_name || payslip.employee_id}</h1>
            <p className="text-sm text-slate-500">{payslip.designation || '—'}</p>
          </div>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {downloading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span className="material-symbols-outlined text-lg">download</span>}
          Download PDF
        </button>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Attendance Summary (verified)</h2>
        <StatRow label="Present Days" value={payslip.present_days} />
        <StatRow label="Absent Days" value={payslip.absent_days} />
        <StatRow label="Leave Days Taken" value={payslip.leave_days_taken} />
        <StatRow label="Holiday Days" value={payslip.holiday_days} />
        <StatRow label="Loss of Pay (LOP) Days" value={<span className="text-red-600">{payslip.lop_days}</span>} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Payment Summary</h2>
        <StatRow label="Gross Salary" value={inr.format(payslip.gross_salary)} />
        <StatRow label="Per-Day Rate" value={inr.format(payslip.per_day_rate)} />
        <StatRow label="LOP Deduction" value={<span className="text-red-600">−{inr.format(payslip.deduction_amount)}</span>} />
        <div className="pt-2 mt-2 border-t-2 border-slate-200">
          <StatRow label="Net Salary" value={inr.format(payslip.net_salary)} emphasis />
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">Feed-only payslip — does not represent salary disbursement or a statutory filing.</p>
    </div>
  );
};

export default PayslipDetail;
