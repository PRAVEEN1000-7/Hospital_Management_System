import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import prescriptionService from '../services/prescriptionService';
import { opticalService } from '../services/opticalService';
import { htmlStringToPdf } from '../utils/pdf';
import type { PrescriptionListItem, PaginatedResponse } from '../types/prescription';
import type { OpticalPrescription } from '../types/optical';
import DateRangeFilter from '../components/common/DateRangeFilter';

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

  const showOpticalTab = isModuleEnabled('optical') || isEyeHospitalFeatureEnabled;
  const canDispenseOptical = user?.roles?.some(r => ['super_admin', 'admin', 'optical_staff'].includes(r)) ?? false;
  const [activeTab, setActiveTab] = useState<'medicine' | 'optical'>('medicine');

  const [prescriptions, setPrescriptions] = useState<PrescriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Optical prescription state
  const [optRx, setOptRx] = useState<OpticalPrescription[]>([]);
  const [optLoading, setOptLoading] = useState(false);
  const [optPage, setOptPage] = useState(1);
  const [optTotalPages, setOptTotalPages] = useState(0);
  const [optTotal, setOptTotal] = useState(0);
  const [optDownloadingId, setOptDownloadingId] = useState<string | null>(null);

  const role = user?.roles?.[0];

  const fetchPrescriptions = useCallback(async () => {
    setLoading(true);
    try {
      const isDoctor = role === 'doctor';
      let res: PaginatedResponse<PrescriptionListItem>;

      if (isDoctor) {
        res = await prescriptionService.getMyPrescriptions(page, 10, statusFilter || undefined);
      } else {
        res = await prescriptionService.getPrescriptions(page, 10, {
          status: statusFilter || undefined,
          search: search || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        });
      }

      setPrescriptions(res.data);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch (err: any) {
      showToast('error', 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, dateFrom, dateTo, role]);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  const fetchOpticalRx = useCallback(async () => {
    if (!showOpticalTab) return;
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
  }, [optPage, showOpticalTab]);

  useEffect(() => { fetchOpticalRx(); }, [fetchOpticalRx]);

  const handleOptDownload = async (id: string, rxNum: string) => {
    if (optDownloadingId) return;
    setOptDownloadingId(id);
    try {
      const html = await opticalService.getPrescriptionPdfUrl(id);
      await htmlStringToPdf(html, `EyePrescription_${rxNum || id}.pdf`);
      showToast('success', 'Eye prescription downloaded');
    } catch {
      showToast('error', 'Failed to download eye prescription');
    } finally {
      setOptDownloadingId(null);
    }
  };

  const handleOptPrint = async (id: string) => {
    const win = window.open('', '_blank');
    if (!win) { showToast('error', 'Pop-ups are blocked — allow pop-ups for this site to print.'); return; }
    try {
      const html = await opticalService.getPrescriptionPdfUrl(id);
      win.document.open();
      win.document.write(html);
      win.document.close();
      setTimeout(() => { try { win.print(); } catch { /* window may have been closed */ } }, 800);
    } catch {
      win.close();
      showToast('error', 'Failed to print eye prescription');
    }
  };

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

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (id: string, rxNumber: string) => {
    if (downloadingId) return;
    setDownloadingId(id);
    try {
      const html = await prescriptionService.getPrescriptionPdfUrl(id, 'en');
      await htmlStringToPdf(html, `Prescription_${rxNumber || id}.pdf`);
      showToast('success', 'Prescription downloaded');
    } catch {
      showToast('error', 'Failed to download prescription');
    } finally {
      setDownloadingId(null);
    }
  };

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
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prescriptions</h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeTab === 'medicine'
              ? `${total} medicine prescription${total !== 1 ? 's' : ''}`
              : `${optTotal} eye prescription${optTotal !== 1 ? 's' : ''}`}
          </p>
        </div>
        {(role === 'doctor' || role === 'super_admin' || role === 'admin') && (
          <button
            onClick={() => navigate('/prescriptions/new')}
            className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New Prescription
          </button>
        )}
      </div>

      {/* Tab switcher — shown only for eye hospitals / optical enabled */}
      {showOpticalTab && (
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-5">
          <button
            onClick={() => setActiveTab('medicine')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'medicine' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <span className="material-symbols-outlined text-base">medication</span>
            Medicine
            <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'medicine' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'}`}>{total}</span>
          </button>
          <button
            onClick={() => setActiveTab('optical')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'optical' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <span className="material-symbols-outlined text-base">visibility</span>
            Eye / Optical
            <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'optical' ? 'bg-violet-100 text-violet-600' : 'bg-slate-200 text-slate-500'}`}>{optTotal}</span>
          </button>
        </div>
      )}

      {/* ── Medicine Prescription Filters (only on medicine tab) ── */}
      {activeTab === 'medicine' && (
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
        </div>
        <div className="mt-3">
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
          />
        </div>
      </div>
      )}

      {/* ── Optical Prescription Table ── */}
      {activeTab === 'optical' && showOpticalTab && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
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
                          {new Date(rx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end items-center gap-1">
                            <button onClick={() => navigate(`/optical/prescriptions/${rx.id}`)}
                              className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors" title="View">
                              <span className="material-symbols-outlined text-sm">visibility</span>
                            </button>
                            <button onClick={() => handleOptPrint(rx.id)}
                              className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors" title="Print">
                              <span className="material-symbols-outlined text-sm">print</span>
                            </button>
                            <button onClick={() => handleOptDownload(rx.id, rx.prescription_number)}
                              disabled={optDownloadingId === rx.id}
                              className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors disabled:opacity-50" title="Download PDF">
                              <span className={`material-symbols-outlined text-sm ${optDownloadingId === rx.id ? 'animate-spin' : ''}`}>
                                {optDownloadingId === rx.id ? 'progress_activity' : 'download'}
                              </span>
                            </button>
                            {canDispenseOptical && (
                              <button
                                onClick={() => navigate(`/optical/sales/new?prescription_id=${rx.id}`)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors ml-1"
                                title="Dispense against this prescription"
                              >
                                <span className="material-symbols-outlined text-sm">point_of_sale</span>
                                Dispense
                              </button>
                            )}
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
      )}

      {/* Medicine Prescription Table */}
      {activeTab === 'medicine' && (
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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">PRN</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Patient</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Doctor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Diagnosis</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Items</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prescriptions.map(rx => (
                  <tr key={rx.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/prescriptions/${rx.id}`)}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {rx.patient_reference_number || rx.prescription_number}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{rx.patient_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{rx.doctor_name || '—'}</td>
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
                    <td className="px-4 py-3 text-sm text-slate-700 text-center">{rx.item_count}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[rx.status] || 'bg-slate-100 text-slate-600'}`}>
                        {rx.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(rx.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => navigate(`/prescriptions/${rx.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors"
                          title="View"
                        >
                          <span className="material-symbols-outlined text-sm">visibility</span>
                        </button>
                        <button
                          onClick={() => handleDownload(rx.id, rx.prescription_number)}
                          disabled={downloadingId === rx.id}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors disabled:opacity-50"
                          title="Download PDF"
                        >
                          <span className={`material-symbols-outlined text-sm ${downloadingId === rx.id ? 'animate-spin' : ''}`}>
                            {downloadingId === rx.id ? 'progress_activity' : 'download'}
                          </span>
                        </button>
                        {!rx.is_finalized && (
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
      )}
    </div>
  );
};

export default PrescriptionList;
