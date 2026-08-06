import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, addWeeks, subWeeks, isSameMonth, format, getMonth, getYear,
} from 'date-fns';
import * as XLSX from 'xlsx';
import attendanceReportService, { type AttendanceReport as AttendanceReportData, type AttendanceEmployeeRow, type DayStatus } from '../services/attendanceReportService';
import { htmlStringToPdf } from '../utils/pdf';
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

// 'inactive' is never actually rendered — deactivated employees are excluded
// from this report server-side — but kept here so the map stays exhaustive
// against AttendanceEmployeeRow['emp_status'].
const EMP_STATUS_LABEL: Record<AttendanceEmployeeRow['emp_status'], string> = {
  active: 'Active',
  notice_period: 'Notice Period',
  relieved: 'Relieved',
  inactive: 'Inactive',
};

// Replaces the old separate "Emp Status" column — a small status dot plus a
// left accent border on the employee's name cell instead, so it reads at a
// glance without a full-cell color wash or costing a column.
const EMP_STATUS_DOT: Record<AttendanceEmployeeRow['emp_status'], string> = {
  active: 'bg-emerald-500',
  notice_period: 'bg-amber-500',
  relieved: 'bg-slate-400',
  inactive: 'bg-slate-400',
};

const EMP_STATUS_BORDER: Record<AttendanceEmployeeRow['emp_status'], string> = {
  active: 'border-emerald-400',
  notice_period: 'border-amber-400',
  relieved: 'border-slate-300',
  inactive: 'border-slate-300',
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
  const [downloadingAnnual, setDownloadingAnnual] = useState(false);

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
    cancelBulk();
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

  const handleCellClick = (userId: string, day: number, current: DayStatus) => {
    if (current === 'holiday' || current === 'festival' || current === 'na' || !report) return;
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

  // ── Bulk marking (one day, many employees at once) ─────────────────────
  // e.g. "20/20 present today" — instead of clicking each employee's cell,
  // check the day column's header to enter bulk mode for that day (every
  // eligible employee starts pre-selected, since "everyone present" is the
  // common case); uncheck anyone who needs an individual Absent/Half Day
  // instead, then apply one status (with one shared reason for Absent/Half
  // Day) to everyone still checked.
  const [bulkDay, setBulkDay] = useState<number | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkPendingStatus, setBulkPendingStatus] = useState<'absent' | 'half_day' | null>(null);
  const [bulkPendingReason, setBulkPendingReason] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const eligibleForDay = useCallback((day: number): string[] => {
    if (!report) return [];
    return report.employees
      .filter(emp => {
        const status = emp.days[day - 1];
        return status === 'present' || status === 'absent' || status === 'half_day' || status === 'unmarked';
      })
      .map(emp => emp.user_id);
  }, [report]);

  const cancelBulk = () => {
    setBulkDay(null);
    setBulkSelected(new Set());
    setBulkPendingStatus(null);
    setBulkPendingReason('');
  };

  const toggleColumnBulk = (day: number) => {
    const eligible = eligibleForDay(day);
    if (bulkDay !== day) {
      setBulkDay(day);
      setBulkSelected(new Set(eligible));
      setBulkPendingStatus(null);
      setBulkPendingReason('');
      return;
    }
    const allSelected = eligible.length > 0 && eligible.every(id => bulkSelected.has(id));
    setBulkSelected(allSelected ? new Set() : new Set(eligible));
  };

  const toggleBulkEmployee = (userId: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const applyBulkMark = async (status: 'present' | 'absent' | 'half_day', reason?: string) => {
    if (bulkDay === null || bulkSelected.size === 0) return;
    setBulkSaving(true);
    const day = bulkDay;
    const ids = Array.from(bulkSelected);
    await Promise.all(ids.map(userId => applyMark(userId, day, status, reason)));
    setBulkSaving(false);
    const statusLabel = status === 'present' ? 'Present' : status === 'absent' ? 'Absent' : 'Half Day';
    toast.success(`Marked ${ids.length} employee${ids.length !== 1 ? 's' : ''} ${statusLabel} for Day ${day}`);
    cancelBulk();
  };

  // Mirrors whatever's actually on screen: Month view -> the whole month,
  // Week view -> just those 7 days, a custom From/To range -> exactly that
  // range. `columns` already holds exactly the visible days (day: null for
  // any that spill outside the loaded month), so its min/max day-of-month
  // is the range to send — see get_marking_pdf's from_day/to_day.
  const downloadMarkingScreenshot = async () => {
    setDownloadingMarking(true);
    try {
      const visibleDays = columns.map(c => c.day).filter((d): d is number => d !== null);
      const fromDay = visibleDays.length ? Math.min(...visibleDays) : undefined;
      const toDay = visibleDays.length ? Math.max(...visibleDays) : undefined;
      const html = await attendanceReportService.getMarkingPdfUrl(
        year, month, shiftFilter === 'all' ? undefined : shiftFilter, fromDay, toDay,
      );
      const filenameLabel = dateRangeLabel.replace(/[^\w]+/g, '_');
      await htmlStringToPdf(html, `Attendance_Marking_${filenameLabel}.pdf`, 'landscape');
    } catch {
      toast.error('Failed to generate download');
    } finally {
      setDownloadingMarking(false);
    }
  };

  // Download-only reference sheet — grid-shaped (employee rows x day
  // columns), matching the on-screen Attendance Marking grid and this
  // module's PDF export, so it's filled in the same shape it's read. Week
  // Off/Festival days come pre-filled since those are calendar-controlled,
  // not something anyone marks; every working-day cell is left blank on
  // purpose, regardless of whatever's already marked on screen, so the
  // admin can type P/A/H straight into it in Excel. No upload/import is
  // wired to this — it's a manual, offline reference, not a round trip.
  // Sliced to whatever's currently visible (Month/Week/custom range), same
  // as downloadMarkingScreenshot.
  const downloadAttendanceTemplate = () => {
    if (!report) return;
    try {
      const visibleColumns = columns.filter((c): c is { day: number; date: Date } => c.day !== null);
      const PREFILLED_LABEL: Partial<Record<DayStatus, string>> = {
        holiday: 'WO',
        festival: 'F',
      };

      const header = ['Employee Name', ...visibleColumns.map(c => format(c.date, 'dd-MMM'))];
      const rows = report.employees.map(emp => [
        `${emp.first_name} ${emp.last_name}`,
        ...visibleColumns.map(c => PREFILLED_LABEL[emp.days[c.day - 1]] || ''),
      ]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws['!cols'] = [{ wch: 22 }, ...visibleColumns.map(() => ({ wch: 6 }))];
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

      const guide = [
        ['Code', 'Meaning'],
        ['(blank)', 'Working day — mark Present / Absent / Half Day here'],
        ['WO', 'Week Off — set from the Holiday Calendar, leave as is'],
        ['F', 'Festival — set from the Holiday Calendar, leave as is'],
      ];
      const guideWs = XLSX.utils.aoa_to_sheet(guide);
      guideWs['!cols'] = [{ wch: 10 }, { wch: 46 }];
      XLSX.utils.book_append_sheet(wb, guideWs, 'Field Guide');

      const filenameLabel = dateRangeLabel.replace(/[^\w]+/g, '_');
      XLSX.writeFile(wb, `Attendance_Template_${filenameLabel}.xlsx`);
    } catch {
      toast.error('Failed to generate template');
    }
  };

  // Bulk Upload isn't wired up yet — placeholder button so the download/
  // upload pair reads as a complete round trip, same layout as Medicines.
  const handleBulkUploadClick = () => {
    toast.info('Bulk upload is coming soon');
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
    setDownloadingModal(true);
    try {
      const html = await attendanceReportService.getReportPdfUrl(data.year, data.month);
      await htmlStringToPdf(html, `Attendance_Report_${format(new Date(data.year, data.month - 1, 1), 'MMMM_yyyy')}.pdf`, 'landscape');
    } catch {
      toast.error('Failed to generate download');
    } finally {
      setDownloadingModal(false);
    }
  };

  // One row per employee, Present/Absent/Paid Leave Taken/Attendance % for
  // each of the 12 months plus a Year Total — built server-side by looping
  // get_month_report across the year (see get_annual_report_pdf).
  const handleDownloadAnnual = async () => {
    setDownloadingAnnual(true);
    try {
      const html = await attendanceReportService.getAnnualReportPdfUrl(reportYear);
      await htmlStringToPdf(html, `Annual_Attendance_Report_${reportYear}.pdf`, 'landscape');
    } catch {
      toast.error('Failed to generate download');
    } finally {
      setDownloadingAnnual(false);
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
                  onClick={e => e.currentTarget.showPicker?.()}
                  min="2020-01-01"
                  title="From date"
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  onClick={e => e.currentTarget.showPicker?.()}
                  min="2020-01-01"
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadAttendanceTemplate}
                  className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1"
                >
                  <span className="material-icons text-sm">grid_on</span>
                  Download Template
                </button>
                <button
                  type="button"
                  onClick={handleBulkUploadClick}
                  className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1"
                >
                  <span className="material-icons text-sm">upload_file</span>
                  Bulk Upload
                </button>
                <button
                  type="button"
                  onClick={downloadMarkingScreenshot}
                  disabled={downloadingMarking}
                  className="px-3 py-1.5 text-xs font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <span className="material-icons text-sm">{downloadingMarking ? 'hourglass_empty' : 'picture_as_pdf'}</span>
                  {downloadingMarking ? 'Generating...' : 'Download PDF'}
                </button>
              </div>
            )}
          </div>

          {bulkDay !== null && (
            <div className="flex items-center justify-between px-5 py-3 bg-primary/5 border-b border-primary/20 flex-wrap gap-3">
              <span className="text-sm font-semibold text-slate-700">
                {bulkSelected.size} employee{bulkSelected.size !== 1 ? 's' : ''} selected for Day {bulkDay} — uncheck anyone who needs Absent/Half Day marked individually
              </span>
              {!bulkPendingStatus ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={bulkSelected.size === 0 || bulkSaving}
                    onClick={() => applyBulkMark('present')}
                    className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {bulkSaving ? 'Marking…' : 'Mark Present'}
                  </button>
                  <button
                    type="button"
                    disabled={bulkSelected.size === 0 || bulkSaving}
                    onClick={() => setBulkPendingStatus('absent')}
                    className="px-3 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    Mark Absent
                  </button>
                  <button
                    type="button"
                    disabled={bulkSelected.size === 0 || bulkSaving}
                    onClick={() => setBulkPendingStatus('half_day')}
                    className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    Mark Half Day
                  </button>
                  <button
                    type="button"
                    onClick={cancelBulk}
                    disabled={bulkSaving}
                    className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={bulkPendingReason}
                    onChange={e => setBulkPendingReason(e.target.value)}
                    placeholder="Reason (shown in Leave Management)"
                    maxLength={255}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 w-64"
                    onKeyDown={e => { if (e.key === 'Enter') applyBulkMark(bulkPendingStatus, bulkPendingReason.trim() || undefined); }}
                  />
                  <button
                    type="button"
                    onClick={() => setBulkPendingStatus(null)}
                    disabled={bulkSaving}
                    className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBulkMark(bulkPendingStatus, bulkPendingReason.trim() || undefined)}
                    disabled={bulkSaving}
                    className="px-3 py-1.5 text-xs font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {bulkSaving ? 'Saving...' : 'Confirm'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto bg-white">
            <div className="px-5 py-3 text-sm font-bold text-slate-700 border-b border-slate-100">
              Attendance — {dateRangeLabel} · {shiftLabel}
            </div>
            <table className="text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="sticky left-0 bg-slate-50/50 text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">Employee</th>
                  {columns.map((c, idx) => (
                    <th key={idx} className="px-2 py-2 text-center text-[10px] font-bold text-slate-400 whitespace-nowrap min-w-[42px]">
                      <div className="flex items-center justify-center gap-1">
                        {c.day !== null && eligibleForDay(c.day).length > 0 && (
                          <input
                            type="checkbox"
                            title={bulkDay === c.day ? 'Select/deselect all for this day' : 'Bulk-mark this day'}
                            checked={bulkDay === c.day && eligibleForDay(c.day).every(id => bulkSelected.has(id))}
                            onChange={() => toggleColumnBulk(c.day as number)}
                            className="w-3 h-3 rounded border-slate-300 text-primary focus:ring-primary/30"
                          />
                        )}
                        <span>{c.day ?? '—'}</span>
                      </div>
                      <div className="font-normal normal-case">{c.day ? WEEKDAY_SHORT[c.date.getDay()] : ''}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report?.employees.map(emp => (
                  <tr key={emp.user_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td
                      className={`sticky left-0 bg-white px-4 py-2.5 whitespace-nowrap border-l-4 ${EMP_STATUS_BORDER[emp.emp_status]}`}
                      title={
                        emp.emp_status === 'notice_period' && emp.date_of_leaving
                          ? `Notice period · leaving ${format(new Date(emp.date_of_leaving), 'dd MMM yyyy')}`
                          : EMP_STATUS_LABEL[emp.emp_status]
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EMP_STATUS_DOT[emp.emp_status]}`} />
                        <span className="font-semibold text-slate-800">{emp.first_name} {emp.last_name}</span>
                      </div>
                    </td>
                    {columns.map((c, idx) => {
                      if (c.day === null) {
                        return <td key={idx} className="px-1 py-1.5 text-center text-slate-200">—</td>;
                      }
                      const status = emp.days[c.day - 1];
                      const cellKey = `${emp.user_id}-${c.day}`;
                      const clickable = status === 'present' || status === 'absent' || status === 'half_day' || status === 'unmarked';

                      if (bulkDay === c.day && clickable) {
                        const checked = bulkSelected.has(emp.user_id);
                        return (
                          <td key={idx} className="px-1 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => toggleBulkEmployee(emp.user_id)}
                              title="Toggle selection for bulk marking"
                              className={`w-8 h-7 rounded-md border-2 flex items-center justify-center transition-colors ${checked ? 'bg-primary/10 border-primary' : 'bg-white border-slate-200 hover:border-primary/40'}`}
                            >
                              {checked && <span className="material-icons text-primary text-base">check</span>}
                            </button>
                          </td>
                        );
                      }

                      return (
                        <td key={idx} className="px-1 py-1.5 text-center">
                          <button
                            type="button"
                            disabled={!clickable || savingCell === cellKey || bulkDay !== null}
                            onClick={() => handleCellClick(emp.user_id, c.day as number, status)}
                            title={clickable ? 'Click to mark attendance' : undefined}
                            className={`w-8 h-7 text-[11px] font-bold rounded-md transition-colors ${STATUS_COLOR[status]} ${clickable && bulkDay === null ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'} ${savingCell === cellKey ? 'opacity-50' : ''}`}
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
                    <td colSpan={1 + columns.length} className="px-5 py-10 text-center text-sm text-slate-400">No employees found.</td>
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
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setReportYear(y => y - 1)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                <span className="material-icons text-lg">chevron_left</span>
              </button>
              <h2 className="text-base font-bold text-slate-800 min-w-[80px] text-center">{reportYear}</h2>
              <button type="button" onClick={() => setReportYear(y => y + 1)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                <span className="material-icons text-lg">chevron_right</span>
              </button>
            </div>
            <button
              type="button"
              onClick={handleDownloadAnnual}
              disabled={downloadingAnnual}
              className="px-3 py-1.5 text-xs font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <span className="material-icons text-sm">{downloadingAnnual ? 'hourglass_empty' : 'picture_as_pdf'}</span>
              {downloadingAnnual ? 'Generating...' : `Download Annual Report (${reportYear})`}
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
                    <span className="material-icons text-sm">{downloadingModal ? 'hourglass_empty' : 'picture_as_pdf'}</span>
                    {downloadingModal ? 'Generating...' : 'Download PDF'}
                  </button>
                )}
                <button type="button" onClick={closeModal} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                  <span className="material-icons text-lg">close</span>
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-4 bg-white">
              {modalLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
              {!modalLoading && modalReport && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Name</th>
                      <th className="text-left py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Shift</th>
                      <th className="text-right py-2 text-xs font-bold text-emerald-600 uppercase tracking-wide">Present</th>
                      <th className="text-right py-2 text-xs font-bold text-red-600 uppercase tracking-wide">Absent</th>
                      <th className="text-right py-2 text-xs font-bold text-slate-500 uppercase tracking-wide">Paid Leave</th>
                      <th className="text-right py-2 text-xs font-bold text-amber-600 uppercase tracking-wide">Deduction (days)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalReport.employees.map(emp => (
                      <tr key={emp.user_id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2 font-semibold text-slate-800">{emp.first_name} {emp.last_name}</td>
                        <td className="py-2 text-slate-500">
                          {Object.keys(emp.shift_days).length === 0
                            ? '—'
                            : Object.entries(emp.shift_days)
                                .map(([name, count]) => `${name} (${count})`)
                                .join(', ')}
                        </td>
                        <td className="py-2 text-right text-emerald-700 font-bold">{emp.present_count}</td>
                        <td className="py-2 text-right text-red-700 font-bold">{emp.absent_count}</td>
                        <td className="py-2 text-right text-slate-600">{emp.paid_leave_entitlement}</td>
                        <td className="py-2 text-right text-amber-700 font-bold">{emp.deduction_days || '—'}</td>
                      </tr>
                    ))}
                    {modalReport.employees.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-sm text-slate-400">No employees found.</td>
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
