import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import prescriptionService from '../services/prescriptionService';
import { opticalService } from '../services/opticalService';
import scheduleService from '../services/scheduleService';
import type { PrescriptionListItem, PaginatedResponse } from '../types/prescription';
import type { OpticalPrescription } from '../types/optical';
import type { DoctorOption } from '../types/appointment';
import DateRangeFilter from '../components/common/DateRangeFilter';
import { formatDateTime, formatLocalDateISO } from '../utils/calendarDate';
import { VISIT_REASON_OPTIONS } from '../utils/constants';
import VerifiedBadge from '../components/patients/VerifiedBadge';
import { hasAccess, canEdit } from '../config/modulePermissions';

const REFRESH_INTERVAL_MS = 15000;

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'dispensed', label: 'Dispensed' },
  { value: 'partially_dispensed', label: 'Partially Dispensed' },
];

const statusColor: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-700',
  finalized: 'bg-blue-100 text-blue-700',
  dispensed: 'bg-green-100 text-green-700',
  partially_dispensed: 'bg-orange-100 text-orange-700',
};

const dispensingStatusBadge = (status: string) => {
  const badges: Record<string, { label: string; color: string; icon: string }> = {
    draft: { label: 'Not Sent', color: 'bg-gray-100 text-gray-700', icon: '📝' },
    finalized: { label: 'Pending', color: 'bg-blue-100 text-blue-700', icon: '⏳' },
    dispensed: { label: 'Dispensed', color: 'bg-green-100 text-green-700', icon: '✅' },
    partially_dispensed: { label: 'Partial', color: 'bg-orange-100 text-orange-700', icon: '⚠️' },
  };
  const badge = badges[status] || badges.finalized;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
      <span>{badge.icon}</span>
      <span>{badge.label}</span>
    </span>
  );
};

const PrescriptionList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isModuleEnabled, isEyeHospitalFeatureEnabled } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  // Hospital-specialty/module checks alone aren't enough — the "optical"
  // permission key only grants admin/optical_staff any access at all (per
  // the shared matrix), so a doctor at an eye hospital was still trying to
  // fetch /optical/prescriptions and getting a 403. Gate the section on
  // actual role access too, matching Layout.tsx's canAccessOptical pattern.
  // Both sections render together (stacked, not tab-switched) — every
  // prescription for the hospital that the user can see is always visible
  // at once, with no category picker gating visibility.
  const showOpticalSection = (isModuleEnabled('optical') || isEyeHospitalFeatureEnabled) && hasAccess('optical', user?.roles);

  const [prescriptions, setPrescriptions] = useState<PrescriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState('');
  const today = formatLocalDateISO();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [doctorFilter, setDoctorFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => { scheduleService.getDoctors().then(setDoctors).catch(() => {}); }, []);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
    setPage(1);
  };
  const sortIcon = (col: string) => sortBy === col ? (sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more';

  // "Billed Tablets" can't be sorted server-side without a costly correlated
  // subquery over PharmacySaleItem per row (BRD §4 performance target), so it
  // sorts within the current page only — a documented trade-off from the dev
  // plan. Every other column sorts server-side across all pages.
  const displayedPrescriptions = React.useMemo(() => {
    if (sortBy !== 'billed') return prescriptions;
    const sorted = [...prescriptions].sort((a, b) => (a.billed_qty || 0) - (b.billed_qty || 0));
    return sortOrder === 'asc' ? sorted : sorted.reverse();
  }, [prescriptions, sortBy, sortOrder]);

  // Optical prescription state
  const [optRx, setOptRx] = useState<OpticalPrescription[]>([]);
  const [optLoading, setOptLoading] = useState(false);
  const [optPage, setOptPage] = useState(1);
  const [optTotalPages, setOptTotalPages] = useState(0);
  const [optTotal, setOptTotal] = useState(0);

  const role = user?.roles?.[0];

  // "All Prescription" means every prescription recorded for this hospital
  // that the caller's role has view/edit access to (rx.all) — not just the
  // ones a doctor personally wrote. Doctors previously got the narrower
  // /my-prescriptions endpoint here, which is what "categorized" the list by
  // doctor identity; the backend's GET /prescriptions already scopes by
  // hospital_id and is gated by the same rx.all permission, so every role
  // that can reach this page uses the same hospital-wide query.
  const fetchPrescriptions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await prescriptionService.getPrescriptions(page, 10, {
        status: statusFilter || undefined,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        doctor_id: doctorFilter || undefined,
        reason: reasonFilter || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      setPrescriptions(res.data);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch (err: any) {
      if (!silent) showToast('error', 'Failed to load prescriptions');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search, statusFilter, dateFrom, dateTo, doctorFilter, reasonFilter, sortBy, sortOrder]);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  // Near-real-time refresh (BRD_OP_1 §3.1.2) — poll matching the existing
  // WalkInQueue.tsx convention (no WebSocket infra exists in this repo).
  // Silent (no spinner/toast) so it doesn't flicker the table on every tick;
  // skipped while a manual fetch is already in flight. Both sections are
  // always mounted now, so this simply always runs.
  useEffect(() => {
    const interval = setInterval(() => { if (!loading) fetchPrescriptions(true); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loading, fetchPrescriptions]);

  const fetchOpticalRx = useCallback(async () => {
    if (!showOpticalSection) return;
    setOptLoading(true);
    try {
      const res = await opticalService.getPrescriptions(optPage, 15);
      setOptRx(res.data);
      setOptTotalPages(res.total_pages);
      setOptTotal(res.total);
    } catch {
      showToast('error', 'Failed to load eye prescriptions');
    } finally {
      setOptLoading(false);
    }
  }, [optPage, showOpticalSection]);

  useEffect(() => { fetchOpticalRx(); }, [fetchOpticalRx]);

  // Debounced search
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '');
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Sync from URL when global header search updates the query. Deliberately
  // depends only on `searchParams` — including `searchInput` here made this
  // fire on every keystroke and immediately revert the just-typed text back
  // to the last committed value before the URL had a chance to catch up.
  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    setSearchInput(urlSearch);
    setSearch(urlSearch);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keep URL in sync with table search state.
  useEffect(() => {
    if (search) {
      setSearchParams({ search }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [search, setSearchParams]);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete Prescription',
      message: 'Permanently delete this prescription? This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await prescriptionService.deletePrescription(id);
      showToast('success', 'Prescription deleted');
      fetchPrescriptions();
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Cannot delete');
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prescriptions</h1>
          <p className="text-sm text-slate-500 mt-1">
            {showOpticalSection
              ? `${total} prescription${total !== 1 ? 's' : ''} · ${optTotal} eye prescription${optTotal !== 1 ? 's' : ''} — all for this hospital`
              : `${total} prescription${total !== 1 ? 's' : ''} for this hospital`}
          </p>
        </div>
        {canEdit('rx.new', user?.roles) && (
          <button
            onClick={() => navigate('/prescriptions/new')}
            className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New Prescription
          </button>
        )}
      </div>

      {/* Every prescription for the hospital renders in one continuous page —
          no tab/category switch that hides one type behind a click. */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="material-symbols-outlined text-slate-400 text-sm">search</span>
            </span>
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search by patient name, Rx number, diagnosis..."
              className="input-field pl-10 pr-9"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>

            )}
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="input-field w-full sm:w-48"
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={doctorFilter}
            onChange={e => { setDoctorFilter(e.target.value); setPage(1); }}
            className="input-field w-full sm:w-48"
          >
            <option value="">All Doctors</option>
            {doctors.map(d => <option key={d.doctor_id} value={d.doctor_id}>{d.name}</option>)}
          </select>
          <select
            value={reasonFilter}
            onChange={e => { setReasonFilter(e.target.value); setPage(1); }}
            className="input-field w-full sm:w-48"
          >
            <option value="">All Reasons</option>
            {VISIT_REASON_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="mt-3">
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
          />
        </div>
      </div>

      {/* ── Eye / Optical Prescriptions — always visible alongside Medicine
          below when the hospital/role has access, never behind a tab ── */}
      {showOpticalSection && (
        <>
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-violet-500 text-base">visibility</span>
          Eye / Optical Prescriptions
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          {optLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
            </div>
          ) : optRx.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2">visibility_off</span>
              <p className="text-sm">No eye prescriptions found</p>
              <p className="text-xs text-slate-400 mt-1">Eye prescriptions are created from the Prescription Builder</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-violet-50 border-b border-violet-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-violet-600 uppercase tracking-wider">Rx No.</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-violet-600 uppercase tracking-wider">Patient</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-violet-600 uppercase tracking-wider">Doctor</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-violet-600 uppercase tracking-wider">RE (Sph/Cyl/Axis)</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-violet-600 uppercase tracking-wider">LE (Sph/Cyl/Axis)</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-violet-600 uppercase tracking-wider">Date</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-violet-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {optRx.map(rx => {
                    const fmt = (v: number | string | null) => { const n = Number(v); return (v === null || v === undefined) ? '—' : isNaN(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}`; };
                    return (
                      <tr key={rx.id} className="hover:bg-violet-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <button onClick={() => navigate(`/optical/prescriptions/${rx.id}`)} className="text-sm font-medium text-violet-600 hover:underline">
                            {rx.prescription_number}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{rx.patient_name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{rx.doctor_name || '—'}</td>
                        <td className="px-4 py-3 text-center text-xs text-slate-600 font-mono">
                          {fmt(rx.right_sph)} / {fmt(rx.right_cyl)} / {rx.right_axis ?? '—'}°
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-slate-600 font-mono">
                          {fmt(rx.left_sph)} / {fmt(rx.left_cyl)} / {rx.left_axis ?? '—'}°
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {formatDateTime(rx.created_at, 'MMM d, yyyy')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end items-center gap-1">
                            <button onClick={() => navigate(`/optical/prescriptions/${rx.id}`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors text-xs font-semibold" title="View">
                              <span className="material-symbols-outlined text-sm">visibility</span> View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {optTotalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
              <p className="text-xs text-slate-500">Page {optPage} of {optTotalPages} ({optTotal} total)</p>
              <div className="flex gap-1">
                <button onClick={() => setOptPage(p => Math.max(1, p - 1))} disabled={optPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium hover:bg-white disabled:opacity-50">Previous</button>
                <button onClick={() => setOptPage(p => Math.min(optTotalPages, p + 1))} disabled={optPage === optTotalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium hover:bg-white disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>
        </>
      )}

      {/* ── Medicine Prescriptions ── */}
      {showOpticalSection && (
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-base">medication</span>
          Medicine Prescriptions
        </h2>
      )}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : prescriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <span className="material-symbols-outlined text-4xl mb-2">medication</span>
            <p className="text-sm">No prescriptions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('prescription_number')}
                  >
                    <span className="inline-flex items-center gap-1">PRN <span className="material-symbols-outlined text-[13px]">{sortIcon('prescription_number')}</span></span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('patient_name')}
                  >
                    <span className="inline-flex items-center gap-1">Patient <span className="material-symbols-outlined text-[13px]">{sortIcon('patient_name')}</span></span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('doctor_name')}
                  >
                    <span className="inline-flex items-center gap-1">Doctor <span className="material-symbols-outlined text-[13px]">{sortIcon('doctor_name')}</span></span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('reason')}
                  >
                    <span className="inline-flex items-center gap-1">Reason for Visit <span className="material-symbols-outlined text-[13px]">{sortIcon('reason')}</span></span>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Past Prescribed Medicines</th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('billed')}
                    title="Sorts within the current page"
                  >
                    <span className="inline-flex items-center gap-1">Billed Tablets <span className="material-symbols-outlined text-[13px]">{sortIcon('billed')}</span></span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('diagnosis')}
                  >
                    <span className="inline-flex items-center gap-1">Diagnosis <span className="material-symbols-outlined text-[13px]">{sortIcon('diagnosis')}</span></span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('status')}
                  >
                    <span className="inline-flex items-center gap-1">Status <span className="material-symbols-outlined text-[13px]">{sortIcon('status')}</span></span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('created_at')}
                  >
                    <span className="inline-flex items-center gap-1">Date <span className="material-symbols-outlined text-[13px]">{sortIcon('created_at')}</span></span>
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedPrescriptions.map(rx => (
                  <tr key={rx.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/prescriptions/${rx.id}`)}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {rx.patient_reference_number || rx.prescription_number}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {rx.patient_id ? (
                        <button
                          onClick={() => navigate(`/patients/${rx.patient_id}`)}
                          className="font-medium text-primary hover:underline flex items-center gap-1"
                        >
                          {rx.patient_name || '—'}
                          <VerifiedBadge patient={rx} />
                        </button>
                      ) : (
                        <span className="flex items-center gap-1">{rx.patient_name || '—'}<VerifiedBadge patient={rx} /></span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{rx.doctor_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-[160px]">
                      <span className="truncate block" title={rx.chief_complaint || undefined}>{rx.chief_complaint || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px]">
                      {rx.medicine_names && rx.medicine_names.length > 0 ? (
                        <span title={rx.medicine_names.join(', ')}>
                          {rx.medicine_names.slice(0, 2).join(', ')}
                          {rx.medicine_names.length > 2 && (
                            <span className="text-slate-400"> +{rx.medicine_names.length - 2} more</span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {rx.billed_qty ? `${rx.billed_qty} tabs · ₹${(rx.billed_cost || 0).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{rx.diagnosis || '—'}</span>
                        {rx.is_opthal && (
                          <span
                            title="Ophthalmology format prescription"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary/10 text-primary flex-shrink-0"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>visibility</span>
                            OPTHAL
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[rx.status] || 'bg-slate-100 text-slate-600'}`}>
                        {rx.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDateTime(rx.created_at, 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => navigate(`/prescriptions/${rx.id}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors text-xs font-semibold"
                          title="View"
                        >
                          <span className="material-symbols-outlined text-sm">visibility</span> View
                        </button>
                        {!rx.is_finalized && canEdit('rx.all', user?.roles) && (
                          <>
                            <button
                              onClick={() => navigate(`/prescriptions/${rx.id}/edit`)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors"
                              title="Edit"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                            </button>
                            <button
                              onClick={() => handleDelete(rx.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages} ({total} total)
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrescriptionList;
