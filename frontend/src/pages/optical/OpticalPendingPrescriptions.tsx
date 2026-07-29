import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import opticalService from '../../services/opticalService';
import type { PendingOpticalPrescription } from '../../services/opticalService';
import { formatDateTime } from '../../utils/calendarDate';
import { hasAccess as hasModuleAccess } from '../../config/modulePermissions';

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  finalized: { label: 'Pending', color: 'bg-blue-100 text-blue-700' },
  dispensed: { label: 'Dispensed', color: 'bg-green-100 text-green-700' },
};

const OpticalPendingPrescriptions: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [prescriptions, setPrescriptions] = useState<PendingOpticalPrescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  const [statusFilter, setStatusFilter] = useState<'pending' | 'dispensed' | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // The route itself is already gated to view-level optical access
  // (allowedRoles('optical') in App.tsx), so this mirrors that with
  // hasModuleAccess() instead of a hardcoded role list, keeping it correct if
  // a hospital admin grants optical access to a role beyond
  // optical_staff/admin.
  const hasAccess = hasModuleAccess('optical', user?.roles);

  const fetchPrescriptions = useCallback(async () => {
    if (!hasAccess) return;
    setLoading(true);
    try {
      const result = await opticalService.getPendingPrescriptions(
        page, 20, statusFilter || '', search || ''
      );
      setPrescriptions(result.data);
      setTotalPages(result.total_pages);
      setTotal(result.total);
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to load prescription queue');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search, hasAccess, showToast]);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const getWaitTime = (finalized_at: string) => {
    const mins = Math.floor((Date.now() - new Date(finalized_at).getTime()) / 60000);
    return {
      display: mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`,
      color: mins > 120 ? 'text-red-600' : mins > 60 ? 'text-orange-600' : 'text-slate-500',
    };
  };

  if (!hasAccess) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800">Access Denied</h2>
          <p className="text-red-600 mt-2">You don't have access to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Optical Prescription Queue</h1>
            {total > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                {total} pending
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Patients with finalized eye prescriptions ready to purchase glasses or lenses
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchPrescriptions()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>refresh</span>
            Refresh
          </button>
          <button
            onClick={() => navigate('/optical/sales/new')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-base">point_of_sale</span>
            New Sale
          </button>
        </div>
      </div>

      {/* Filters */}
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
              placeholder="Search by Rx number or patient name..."
              className="input-field pl-10 pr-9"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
            className="input-field w-full sm:w-48"
          >
            <option value="">All Status</option>
            <option value="pending">Pending (Not Dispensed)</option>
            <option value="dispensed">Dispensed</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300 animate-spin">progress_activity</span>
          <p className="text-slate-500 mt-4 font-medium">Loading prescriptions...</p>
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-4">
            <span className="material-symbols-outlined text-3xl text-green-500">check_circle</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900">All Caught Up!</h3>
          <p className="text-slate-500 mt-2">No pending optical prescriptions in the queue</p>
          <button onClick={() => navigate('/optical')} className="mt-4 text-primary hover:text-primary/90 text-sm font-medium">
            ← Back to Optical Dashboard
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Prescription</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Doctor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-28">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-24">Wait Time</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-48">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {prescriptions.map(rx => {
                  const wait = getWaitTime(rx.finalized_at);
                  const badge = STATUS_BADGES[rx.status] || STATUS_BADGES.finalized;
                  return (
                    <tr key={rx.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-slate-900">{rx.prescription_number}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatDateTime(rx.created_at, 'dd MMM yyyy')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-slate-900">{rx.patient_name}</div>
                        {(rx.patient_age || rx.patient_gender) && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {rx.patient_age && `${rx.patient_age}y`}
                            {rx.patient_age && rx.patient_gender && ' • '}
                            {rx.patient_gender}
                          </div>
                        )}
                        {rx.patient_phone && (
                          <div className="text-xs text-slate-400 mt-0.5">{rx.patient_phone}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900">{rx.doctor_name}</div>
                        {rx.doctor_specialization && (
                          <div className="text-xs text-slate-500 mt-0.5">{rx.doctor_specialization}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-medium ${wait.color}`}>{wait.display}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate(`/optical/prescriptions/${rx.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm">visibility</span>
                            View
                          </button>
                          {rx.status !== 'dispensed' && (
                            <button
                              onClick={() => navigate(`/optical/sales/new?prescription_id=${rx.id}`)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary hover:bg-primary/90 text-white transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">point_of_sale</span>
                              Sell Glasses
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
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {prescriptions.map(rx => {
              const wait = getWaitTime(rx.finalized_at);
              const badge = STATUS_BADGES[rx.status] || STATUS_BADGES.finalized;
              return (
                <div key={rx.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{rx.prescription_number}</div>
                      <div className="text-xs text-slate-500">{formatDateTime(rx.created_at, 'dd MMM yyyy')}</div>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Patient:</span>
                      <span className="text-slate-900 font-medium text-right">{rx.patient_name}</span>
                    </div>
                    {(rx.patient_age || rx.patient_gender) && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Age/Sex:</span>
                        <span className="text-slate-700 text-right">
                          {rx.patient_age && `${rx.patient_age}y`}
                          {rx.patient_age && rx.patient_gender && ' / '}
                          {rx.patient_gender || ''}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">Doctor:</span>
                      <span className="text-slate-900 text-right">{rx.doctor_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Wait Time:</span>
                      <span className={`font-medium text-right ${wait.color}`}>{wait.display}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => navigate(`/optical/prescriptions/${rx.id}`)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      View
                    </button>
                    {rx.status !== 'dispensed' && (
                      <button
                        onClick={() => navigate(`/optical/sales/new?prescription_id=${rx.id}`)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary/90 text-white transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">point_of_sale</span>
                        Dispense
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-slate-500">
                Page {page} of {totalPages} ({total} total)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OpticalPendingPrescriptions;
