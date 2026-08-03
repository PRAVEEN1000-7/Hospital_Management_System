import api from './api';
import type {
  DailyAttendanceCountRow, AbsenteeReportRow, VerifiedAttendanceRow,
  LopReportRow, PaidLeaveBalanceRow, HeadcountReport, WorkforceReportsFilters,
} from '../types/workforceReports';

async function getDailyAttendanceCount(filters: WorkforceReportsFilters): Promise<DailyAttendanceCountRow[]> {
  const res = await api.get<{ data: DailyAttendanceCountRow[] }>('/workforce-reports/daily-attendance-count', {
    params: { date_from: filters.dateFrom, date_to: filters.dateTo },
  });
  return res.data.data;
}

async function getAbsenteeReport(filters: WorkforceReportsFilters): Promise<AbsenteeReportRow[]> {
  const res = await api.get<{ data: AbsenteeReportRow[] }>('/workforce-reports/absentee-report', {
    params: { date_from: filters.dateFrom, date_to: filters.dateTo },
  });
  return res.data.data;
}

async function getVerifiedAttendanceSheet(filters: WorkforceReportsFilters): Promise<VerifiedAttendanceRow[]> {
  const res = await api.get<{ data: VerifiedAttendanceRow[] }>('/workforce-reports/verified-attendance-sheet', {
    params: { date_from: filters.dateFrom, date_to: filters.dateTo },
  });
  return res.data.data;
}

async function getLopReport(year: number): Promise<LopReportRow[]> {
  const res = await api.get<{ data: LopReportRow[] }>('/workforce-reports/lop-report', { params: { year } });
  return res.data.data;
}

async function getPaidLeaveBalanceReport(year: number): Promise<PaidLeaveBalanceRow[]> {
  const res = await api.get<{ data: PaidLeaveBalanceRow[] }>('/workforce-reports/paid-leave-balance-report', { params: { year } });
  return res.data.data;
}

async function getHeadcount(): Promise<HeadcountReport> {
  const res = await api.get<HeadcountReport>('/workforce-reports/headcount');
  return res.data;
}

export default {
  getDailyAttendanceCount,
  getAbsenteeReport,
  getVerifiedAttendanceSheet,
  getLopReport,
  getPaidLeaveBalanceReport,
  getHeadcount,
};
