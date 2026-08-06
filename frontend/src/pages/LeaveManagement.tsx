import React, { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import attendanceReportService, { type LeaveRecord } from '../services/attendanceReportService';
import { htmlStringToPdf } from '../utils/pdf';
import { useToast } from '../contexts/ToastContext';

const today = new Date();

const STATUS_BADGE: Record<LeaveRecord['status'], string> = {
  absent: 'bg-red-100 text-red-700',
  half_day: 'bg-amber-100 text-amber-700',
};

const STATUS_TEXT: Record<LeaveRecord['status'], string> = {
  absent: 'Absent',
  half_day: 'Half Day',
};

const LeaveManagement: React.FC = () => {
  const toast = useToast();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    attendanceReportService
      .getLeaves(year, month)
      .then(setRecords)
      .catch(() => toast.error('Failed to load leave records'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const handleMonthChange = (value: string) => {
    const [y, m] = value.split('-').map(Number);
    if (y && m) { setYear(y); setMonth(m); }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const html = await attendanceReportService.getLeavesPdfUrl(year, month);
      await htmlStringToPdf(html, `Leave_Management_${format(new Date(year, month - 1, 1), 'MMMM_yyyy')}.pdf`);
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
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Leave Management</h1>
          <p className="text-sm text-slate-500">Every Absent / Half Day mark with its reason, sourced from Attendance Marking.</p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={records.length === 0 || downloading}
          className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          <span className="material-icons text-sm">{downloading ? 'hourglass_empty' : 'picture_as_pdf'}</span>
          {downloading ? 'Generating...' : 'Download PDF'}
        </button>
      </header>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center px-5 py-4 border-b border-slate-200">
          <input
            type="month"
            value={`${year}-${String(month).padStart(2, '0')}`}
            onChange={e => handleMonthChange(e.target.value)}
            onClick={e => e.currentTarget.showPicker?.()}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="bg-white">
          <div className="px-5 py-3 text-sm font-bold text-slate-700 border-b border-slate-100">
            Leave Management — {format(new Date(year, month - 1, 1), 'MMMM yyyy')}
          </div>
          <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Employee</th>
              <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Designation</th>
              <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Date</th>
              <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Type</th>
              <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Reason</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, idx) => (
              <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                <td className="px-5 py-3">
                  <div className="font-semibold text-slate-800">{r.first_name} {r.last_name}</div>
                  <div className="text-xs text-slate-400">{r.reference_number || '—'}</div>
                </td>
                <td className="px-3 py-3 text-slate-600">{r.designation || '—'}</td>
                <td className="px-3 py-3 text-slate-600">{format(new Date(r.date), 'dd MMM yyyy')}</td>
                <td className="px-3 py-3">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${STATUS_BADGE[r.status]}`}>
                    {STATUS_TEXT[r.status]}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-600">{r.reason || <span className="text-slate-300">—</span>}</td>
              </tr>
            ))}
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">No leave records for this month.</td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
        {loading && <p className="text-xs text-slate-400 px-5 py-3">Loading…</p>}
      </div>
    </div>
  );
};

export default LeaveManagement;
