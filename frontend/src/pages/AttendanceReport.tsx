import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, addWeeks, subWeeks, isSameMonth, format, getMonth, getYear,
} from 'date-fns';
import attendanceReportService, { type AttendanceReport as AttendanceReportData, type DayStatus } from '../services/attendanceReportService';
import { downloadElementAsImage } from '../utils/screenshot';
import { useToast } from '../contexts/ToastContext';

type Tab = 'marking' | 'report';
type MarkingView = 'month' | 'week';

const STATUS_LABEL: Record<DayStatus, string> = {
  present: 'P',
  absent: 'A',
  half_day: 'H',
  holiday: 'WO',
  festival: 'F',
  na: 'NA',
  unmarked: '',
};

const STATUS_COLOR: Record<DayStatus, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-700',
  half_day: 'bg-amber-100 text-amber-700',
  holiday: 'bg-rose-100 text-rose-700',
  festival: 'bg-teal-100 text-teal-700',
  na: 'bg-slate-100 text-slate-400',
  unmarked: 'bg-white border border-slate-200',
};

const EDITABLE_STATUSES: { value: 'present' | 'absent' | 'half_day'; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'half_day', label: 'Half Day' },
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const AttendanceReportPage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('marking');
  const [downloadingMarking, setDownloadingMarking] = useState(false);
  const [downloadingModal, setDownloadingModal] = useState(false);
  const markingCardRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // ── Attendance Marking tab ──────────────────────────────────────────────
  const [markingView, setMarkingView] = useState<MarkingView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const [report, setReport] = useState<AttendanceReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const year = getYear(currentDate);
  const month = getMonth(currentDate) + 1;

  const loadMarking = useCallback(() => {
    setLoading(true);
    attendanceReportService
      .getReport(year, month, shiftFilter === 'all' ? undefined : shiftFilter)
      .then(setReport)
      .catch(() => toast.error('Failed to load attendance report'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, shiftFilter]);

  useEffect(() => {
    if (tab === 'marking') loadMarking();
  }, [tab, loadMarking]);

  const navigate = (dir: -1 | 1) => {
    if (markingView === 'month') setCurrentDate(prev => (dir === 1 ? addMonths(prev, 1) : subMonths(prev, 1)));
    else setCurrentDate(prev => (dir === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1)));
  };

  const weekGrid = useMemo(() => {
    const start = startOfWeek(currentDate);
    const end = endOfWeek(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  // Custom date-range filter — takes over from Month/Week when a "From"
  // date is set. "From" alone = just that one date. "From" + "To" = every
  // date in between, inclusive (swapped automatically if entered backwards).
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const hasCustomRange = !!customFrom;

  const customRangeDates = useMemo(() => {
    if (!customFrom) return null;
    const from = new Date(`${customFrom}T00:00:00`);
    const to = customTo ? new Date(`${customTo}T00:00:00`) : from;
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    return eachDayOfInterval({ start, end });
  }, [customFrom, customTo]);

  const handleFromChange = (value: string) => {
    setCustomFrom(value);
    if (value) {
      const d = new Date(`${value}T00:00:00`);
      if (getYear(d) !== year || getMonth(d) + 1 !== month) setCurrentDate(d);
    }
  };

  const clearCustomRange = () => {
    setCustomFrom('');
    setCustomTo('');
  };

  // Columns actually rendered: the custom range if one is set, else every
  // day-of-month for Month view, or the 7 dates of the selected week for
  // Week view (days that spill into an adjacent month — or outside the
  // currently loaded month for a custom range — show as blank, since only
  // one month's report is ever fetched at a time).
  const columns: { day: number | null; date: Date }[] = useMemo(() => {
    if (customRangeDates) {
      return customRangeDates.map(date => ({
        day: isSameMonth(date, currentDate) ? date.getDate() : null,
        date,
      }));
    }
    if (markingView === 'month' && report) {
      return Array.from({ length: report.total_days }, (_, i) => ({
        day: i + 1,
        date: new Date(year, month - 1, i + 1),
      }));
    }
    if (markingView === 'week') {
      return weekGrid.map(date => ({
        day: isSameMonth(date, currentDate) ? date.getDate() : null,
        date,
      }));
    }
    return [];
  }, [customRangeDates, markingView, report, weekGrid, currentDate, year, month]);

  const dateRangeLabel = hasCustomRange && customRangeDates
    ? customRangeDates.length === 1
      ? format(customRangeDates[0], 'dd MMM yyyy')
      : `${format(customRangeDates[0], 'dd MMM')} – ${format(customRangeDates[customRangeDates.length - 1], 'dd MMM yyyy')}`
    : markingView === 'week'
    ? `${format(weekGrid[0], 'dd MMM')} – ${format(weekGrid[6], 'dd MMM yyyy')}`
    : format(currentDate, 'MMMM yyyy');

  const shiftLabel = shiftFilter === 'all' ? 'All Shifts' : report?.shifts.find(s => s.id === shiftFilter)?.name || 'All Shifts';

  // Absent/Half Day need a reason first — the click opens this popup instead
  // of marking immediately; clearing back to Present needs no reason.
  // Clicking a cell opens this selector with all 3 options up front. Picking
  // Present applies immediately (no reason needed); picking Absent/Half Day
  // reveals a reason field in the same popup before saving.
  const [activeCell, setActiveCell] = useState<{ userId: string; day: number } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<'absent' | 'half_day' | null>(null);
  const [pendingReason, setPendingReason] = useState('');
  const [savingReason, setSavingReason] = useState(false);

  const applyMark = async (userId: string, day: number, next: DayStatus, reason?: string) => {
    const cellKey = `${userId}-${day}`;
    setSavingCell(cellKey);

    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    try {
      await attendanceReportService.markDay(userId, isoDate, next as 'present' | 'absent' | 'half_day', reason);
      setReport(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          employees: prev.employees.map(emp => {
            if (emp.user_id !== userId) return emp;
            const days = [...emp.days];
            days[day - 1] = next;
            const counts = { present: 0, absent: 0, half_day: 0, holiday: 0, festival: 0, na: 0, unmarked: 0 };
            days.forEach(d => { counts[d]++; });
            const presentCount = counts.present + counts.unmarked + counts.festival + 0.5 * counts.half_day;
            const absentCount = counts.absent + 0.5 * counts.half_day;
            const deductionDays = Math.max(0, absentCount - emp.paid_leave_entitlement);
            return {
              ...emp,
              days,
              present_count: presentCount,
              absent_count: absentCount,
              half_day_count: counts.half_day,
              holiday_count: counts.holiday,
              festival_count: counts.festival,
              na_count: counts.na,
              unmarked_count: counts.unmarked,
              deduction_days: deductionDays,
              deduction_amount: Math.round(deductionDays * emp.per_day_salary * 100) / 100,
            };
          }),
        };
      });
    } catch {
      toast.error('Failed to update attendance');
    } finally {
      setSavingCell(null);
    }
  };

  const isLocked = (day: number) => !!report?.locked_days.includes(day);

  const handleCellClick = (userId: string, day: number, current: DayStatus) => {
    if (current === 'holiday' || current === 'festival' || current === 'na' || !report) return;
    if (isLocked(day)) return;
    setActiveCell({ userId, day });
    setPendingStatus(null);
    setPendingReason('');
  };

  const closeSelector = () => {
    setActiveCell(null);
    setPendingStatus(null);
  };

  const chooseStatus = (status: 'present' | 'absent' | 'half_day') => {
    if (!activeCell) return;
    if (status === 'present') {
      applyMark(activeCell.userId, activeCell.day, status);
      closeSelector();
    } else {
      setPendingStatus(status);
    }
  };

  const confirmPendingMark = async () => {
    if (!activeCell || !pendingStatus) return;
    setSavingReason(true);
    await applyMark(activeCell.userId, activeCell.day, pendingStatus, pendingReason.trim() || undefined);
    setSavingReason(false);
    closeSelector();
  };

  // Downloads exactly what's on screen right now — whichever Month/Week view,
  // shift filter, and navigation position is active — as a PNG image. No CSV.
  const downloadMarkingScreenshot = async () => {
    if (!markingCardRef.current) return;
    setDownloadingMarking(true);
    try {
      const label = markingView === 'week'
        ? `${format(weekGrid[0], 'dd-MMM')}_${format(weekGrid[6], 'dd-MMM-yyyy')}`
        : `${year}-${String(month).padStart(2, '0')}`;
      await downloadElementAsImage(markingCardRef.current, `attendance-${label}`);
    } catch {
      toast.error('Failed to generate download');
    } finally {
      setDownloadingMarking(false);
    }
  };

  // ── Attendance Report tab (month list -> summary popup) ────────────────
  const [reportYear, setReportYear] = useState(getYear(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [modalReport, setModalReport] = useState<AttendanceReportData | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const openMonth = (m: number) => {
    setSelectedMonth(m);
    setModalLoading(true);
    setModalReport(null);
    attendanceReportService
      .getReport(reportYear, m)
      .then(setModalReport)
      .catch(() => toast.error('Failed to load monthly report'))
      .finally(() => setModalLoading(false));
  };

  const closeModal = () => {
    setSelectedMonth(null);
    setModalReport(null);
  };

  const handleDownload = async (data: AttendanceReportData) => {
    if (!modalRef.current) return;
    setDownloadingModal(true);
    try {
      await downloadElementAsImage(modalRef.current, `attendance-report-${data.year}-${String(data.month).padStart(2, '0')}`);
    } catch {
      toast.error('Failed to generate download');
    } finally {
      setDownloadingModal(false);
    }
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Attendance</h1>
        <p className="text-sm text-slate-500">Mark daily attendance, or pull a monthly present/absent report.</p>
      </header>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 mb-5 w-fit">
        <button
          type="button"
          onClick={() => setTab('marking')}
          className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${tab === 'marking' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Attendance Marking
        </button>
        <button
          type="button"
          onClick={() => setTab('report')}
          className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${tab === 'report' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Attendance Report
        </button>
      </div>

      {tab === 'marking' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => navigate(-1)} disabled={hasCustomRange} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed">
                  <span className="material-icons text-lg">chevron_left</span>
                </button>
                <h2 className="text-sm font-bold text-slate-800 min-w-[140px] text-center">
                  {dateRangeLabel}
                </h2>
                <button type="button" onClick={() => navigate(1)} disabled={hasCustomRange} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed">
                  <span className="material-icons text-lg">chevron_right</span>
                </button>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {(['month', 'week'] as MarkingView[]).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMarkingView(v)}
                    disabled={hasCustomRange}
                    className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${markingView === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => handleFromChange(e.target.value)}
                  title="From date"
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  disabled={!customFrom}
                  title="To date (optional — leave blank to show only the From date)"
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
                {hasCustomRange && (
                  <button type="button" onClick={clearCustomRange} title="Clear date filter" className="p-1.5 text-slate-400 hover:text-slate-700">
                    <span className="material-icons text-base">close</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setShiftFilter('all')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${shiftFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  All
                </button>
                {report?.shifts.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setShiftFilter(s.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${shiftFilter === s.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {report && report.employees.length > 0 && (
              <button
                type="button"
                onClick={downloadMarkingScreenshot}
                disabled={downloadingMarking}
                className="px-3 py-1.5 text-xs font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <span className="material-icons text-sm">{downloadingMarking ? 'hourglass_empty' : 'photo_camera'}</span>
                {downloadingMarking ? 'Generating...' : 'Download'}
              </button>
            )}
          </div>

          <div ref={markingCardRef} className="overflow-x-auto bg-white">
            <div className="px-5 py-3 text-sm font-bold text-slate-700 border-b border-slate-100">
              Attendance — {dateRangeLabel} · {shiftLabel}
            </div>
            <table className="text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="sticky left-0 bg-slate-50/50 text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">Employee</th>
                  <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">Designation</th>
                  <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">Emp Status</th>
                  {columns.map((c, idx) => (
                    <th key={idx} className="px-2 py-2 text-center text-[10px] font-bold text-slate-400 whitespace-nowrap min-w-[42px]">
                      <div>{c.day ?? '—'}</div>
                      <div className="font-normal normal-case">{c.day ? WEEKDAY_SHORT[c.date.getDay()] : ''}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report?.employees.map(emp => (
                  <tr key={emp.user_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="sticky left-0 bg-white px-4 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-800">{emp.first_name} {emp.last_name}</div>
                      <div className="text-xs text-slate-400">{emp.reference_number || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{emp.designation || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${emp.emp_status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {emp.emp_status === 'active' ? 'Active' : 'Ex-Employee'}
                      </span>
                    </td>
                    {columns.map((c, idx) => {
                      if (c.day === null) {
                        return <td key={idx} className="px-1 py-1.5 text-center text-slate-200">—</td>;
                      }
                      const status = emp.days[c.day - 1];
                      const cellKey = `${emp.user_id}-${c.day}`;
                      const editable = status === 'present' || status === 'absent' || status === 'half_day' || status === 'unmarked';
                      const locked = isLocked(c.day);
                      const clickable = editable && !locked;
                      return (
                        <td key={idx} className="px-1 py-1.5 text-center">
                          <button
                            type="button"
                            disabled={!clickable || savingCell === cellKey}
                            onClick={() => handleCellClick(emp.user_id, c.day as number, status)}
                            title={locked ? 'This day has passed and is locked' : clickable ? 'Click to mark attendance' : undefined}
                            className={`w-8 h-7 text-[11px] font-bold rounded-md transition-colors ${STATUS_COLOR[status]} ${clickable ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'} ${locked ? 'opacity-60' : ''} ${savingCell === cellKey ? 'opacity-50' : ''}`}
                          >
                            {STATUS_LABEL[status]}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!loading && report && report.employees.length === 0 && (
                  <tr>
                    <td colSpan={3 + columns.length} className="px-5 py-10 text-center text-sm text-slate-400">No employees found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {loading && <p className="text-xs text-slate-400 px-5 py-3">Loading…</p>}
        </div>
      )}

      {tab === 'report' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <button type="button" onClick={() => setReportYear(y => y - 1)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <span className="material-icons text-lg">chevron_left</span>
            </button>
            <h2 className="text-base font-bold text-slate-800 min-w-[80px] text-center">{reportYear}</h2>
            <button type="button" onClick={() => setReportYear(y => y + 1)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <span className="material-icons text-lg">chevron_right</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
              const mDate = new Date(reportYear, m - 1, 1);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => openMonth(m)}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  <span className="material-icons text-slate-400 mb-1">fact_check</span>
                  <p className="text-sm font-bold text-slate-800">{format(mDate, 'MMMM')}</p>
                  <p className="text-xs text-slate-400">View report</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedMonth !== null && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4" onClick={closeModal}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                {format(new Date(reportYear, selectedMonth - 1, 1), 'MMMM yyyy')} Report
              </h2>
              <div className="flex items-center gap-2">
                {modalReport && (
                  <button
                    type="button"
                    onClick={() => handleDownload(modalReport)}
                    disabled={downloadingModal}
                    className="px-3 py-1.5 text-xs font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <span className="material-icons text-sm">{downloadingModal ? 'hourglass_empty' : 'photo_camera'}</span>
                    {downloadingModal ? 'Generating...' : 'Download'}
                  </button>
                )}
                <button type="button" onClick={closeModal} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                  <span className="material-icons text-lg">close</span>
                </button>
              </div>
            </div>

            <div ref={modalRef} className="overflow-y-auto px-6 py-4 bg-white">
              {modalLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
              {!modalLoading && modalReport && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Employee ID</th>
                      <th className="text-left py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Name</th>
                      <th className="text-right py-2 text-xs font-bold text-emerald-600 uppercase tracking-wide">Present</th>
                      <th className="text-right py-2 text-xs font-bold text-red-600 uppercase tracking-wide">Absent</th>
                      <th className="text-right py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Paid Leave</th>
                      <th className="text-right py-2 text-xs font-bold text-amber-600 uppercase tracking-wide">Deduction (days)</th>
                      <th className="text-right py-2 text-xs font-bold text-amber-600 uppercase tracking-wide">Deduction (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalReport.employees.map(emp => (
                      <tr key={emp.user_id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2 text-slate-500">{emp.reference_number || '—'}</td>
                        <td className="py-2 font-semibold text-slate-800">{emp.first_name} {emp.last_name}</td>
                        <td className="py-2 text-right text-emerald-700 font-bold">{emp.present_count}</td>
                        <td className="py-2 text-right text-red-700 font-bold">{emp.absent_count}</td>
                        <td className="py-2 text-right text-slate-600">{emp.paid_leave_entitlement}</td>
                        <td className="py-2 text-right text-amber-700 font-bold">{emp.deduction_days || '—'}</td>
                        <td className="py-2 text-right text-amber-700 font-bold">{emp.deduction_amount ? `₹${emp.deduction_amount.toLocaleString('en-IN')}` : '—'}</td>
                      </tr>
                    ))}
                    {modalReport.employees.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-sm text-slate-400">No employees found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {activeCell && (() => {
        const emp = report?.employees.find(e => e.user_id === activeCell.userId);
        const current = emp?.days[activeCell.day - 1];
        return (
          <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4" onClick={() => !savingReason && closeSelector()}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-slate-900 mb-1">
                {emp ? `${emp.first_name} ${emp.last_name}` : 'Mark Attendance'} — Day {activeCell.day}
              </h2>
              <p className="text-sm text-slate-500 mb-4">Choose a status.</p>

              <div className="grid grid-cols-3 gap-2 mb-1">
                {EDITABLE_STATUSES.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => chooseStatus(opt.value)}
                    disabled={savingReason}
                    className={`px-3 py-2.5 text-sm font-bold rounded-lg border transition-colors disabled:opacity-50 ${
                      current === opt.value
                        ? `${STATUS_COLOR[opt.value]} border-transparent`
                        : 'bg-white border-slate-200 text-slate-600 hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {pendingStatus && (
                <div className="mt-4">
                  <p className="text-sm text-slate-500 mb-2">Give a reason — it'll show up in Leave Management.</p>
                  <input
                    type="text"
                    autoFocus
                    value={pendingReason}
                    onChange={e => setPendingReason(e.target.value)}
                    placeholder="e.g. Fever, Emergency"
                    maxLength={255}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    onKeyDown={e => { if (e.key === 'Enter') confirmPendingMark(); }}
                  />
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => setPendingStatus(null)}
                      disabled={savingReason}
                      className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={confirmPendingMark}
                      disabled={savingReason}
                      className="px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {savingReason ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default AttendanceReportPage;
