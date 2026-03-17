import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import pharmacyService from '../../services/pharmacyService';
import type { PendingPrescription } from '../../services/pharmacyService';

const STATUS_BADGES: Record<string, { label: string; color: string; icon: string }> = {
  finalized: { label: 'Pending', color: 'bg-blue-100 text-blue-700', icon: '⏳' },
  partially_dispensed: { label: 'Partial', color: 'bg-orange-100 text-orange-700', icon: '⚠️' },
  dispensed: { label: 'Dispensed', color: 'bg-green-100 text-green-700', icon: '✅' },
};

const PendingPrescriptions: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [prescriptions, setPrescriptions] = useState<PendingPrescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  
  const [statusFilter, setStatusFilter] = useState<'pending' | 'partial' | 'dispensed' | ''>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const role = user?.roles?.[0];

  // Check if user has pharmacy access
  const hasPharmacyAccess = ['pharmacist', 'admin', 'super_admin'].includes(role || '');

  const fetchPrescriptions = useCallback(async () => {
    if (!hasPharmacyAccess) {
      showToast('error', 'Access denied. Pharmacists only.');
      return;
    }

    setLoading(true);
    try {
      const result = await pharmacyService.getPendingPrescriptions(
        page,
        20,
        statusFilter || undefined,
        undefined,
        search || undefined
      );
      
      setPrescriptions(result.data);
      setTotalPages(result.total_pages);
      setTotal(result.total);
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to load pending prescriptions');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search, hasPharmacyAccess, showToast]);

  useEffect(() => {
    fetchPrescriptions();
  }, [fetchPrescriptions]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleRefresh = () => {
    fetchPrescriptions();
  };

  const handleStartDispensing = (prescriptionId: string) => {
    navigate(`/pharmacy/dispense/${prescriptionId}`);
  };

  const handleViewPrescription = (prescriptionId: string) => {
    navigate(`/pharmacy/dispense/${prescriptionId}?mode=view`);
  };

  const getStatusBadge = (status: string) => {
    const badge = STATUS_BADGES[status] || STATUS_BADGES.finalized;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        <span>{badge.icon}</span>
        <span>{badge.label}</span>
      </span>
    );
  };

  if (!hasPharmacyAccess) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800">Access Denied</h2>
          <p className="text-red-600 mt-2">Only pharmacists can access this page.</p>
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
            <h1 className="text-2xl font-bold text-slate-900">Prescription Queue</h1>
            {total > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                {total} pending
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Dispense medicines from finalized prescriptions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Refresh queue"
          >
            <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="material-symbols-outlined text-slate-400 text-sm">search</span>
            </span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
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

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
            className="input-field w-full sm:w-48"
          >
            <option value="">All Status</option>
            <option value="pending">Pending (Not Started)</option>
            <option value="partial">Partially Dispensed</option>
            <option value="dispensed">Fully Dispensed</option>
          </select>
        </div>
      </div>

      {/* Queue List */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300 animate-spin">progress_activity</span>
          <p className="text-slate-500 mt-4 font-medium">Loading prescriptions...</p>
          <p className="text-sm text-slate-400 mt-1">Please wait</p>
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-4">
            <span className="material-symbols-outlined text-3xl text-green-500">check_circle</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900">All Caught Up!</h3>
          <p className="text-slate-500 mt-2">No pending prescriptions in the queue</p>
          <button
            onClick={() => navigate('/pharmacy')}
            className="mt-4 text-primary hover:text-primary/90 text-sm font-medium"
          >
            ← Back to Pharmacy Dashboard
          </button>
        </div>
      ) : (
        <>
          {/* Table View (Desktop) */}
          <div className="hidden lg:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-16">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Prescription
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Doctor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-32">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-28">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-24">
                    Wait Time
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-40">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {prescriptions.map((rx) => {
                  const waitTimeMinutes = rx.finalized_at
                    ? Math.floor((Date.now() - new Date(rx.finalized_at).getTime()) / 60000)
                    : 0;

                  const waitTimeDisplay =
                    waitTimeMinutes < 60
                      ? `${waitTimeMinutes}m`
                      : `${Math.floor(waitTimeMinutes / 60)}h ${waitTimeMinutes % 60}m`;

                  return (
                    <tr
                      key={rx.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        rx.status === 'partially_dispensed' ? 'bg-orange-50' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        {/* Priority badge - can be enhanced with priority field */}
                        <span className={`text-lg ${
                          rx.status === 'partially_dispensed' ? 'text-orange-500' : 'text-green-500'
                        }`}>
                          {rx.status === 'partially_dispensed' ? '🟠' : '🟢'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {rx.prescription_number}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {new Date(rx.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {rx.patient_name}
                          </div>
                          {rx.patient_age || rx.patient_gender ? (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {rx.patient_age && `${rx.patient_age}y`}
                              {rx.patient_age && rx.patient_gender && ' • '}
                              {rx.patient_gender && rx.patient_gender}
                            </div>
                          ) : null}
                          {rx.patient_phone && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              📞 {rx.patient_phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm text-slate-900">{rx.doctor_name}</div>
                          {rx.doctor_specialization && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {rx.doctor_specialization}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900">
                          {rx.dispensed_items} / {rx.total_items}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {rx.pending_items} pending
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(rx.status)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-medium ${
                          waitTimeMinutes > 120 ? 'text-red-600' :
                          waitTimeMinutes > 60 ? 'text-orange-600' :
                          'text-slate-500'
                        }`}>
                          {waitTimeDisplay}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {rx.status === 'dispensed' ? (
                          <button
                            onClick={() => handleViewPrescription(rx.id)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            <span className="material-symbols-outlined text-sm">visibility</span>
                            View
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartDispensing(rx.id)}
                            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              rx.status === 'partially_dispensed'
                                ? 'bg-orange-500 hover:bg-orange-600 text-white'
                                : 'bg-primary hover:bg-primary/90 text-white'
                            }`}
                          >
                            <span className="material-symbols-outlined text-sm">
                              {rx.status === 'partially_dispensed' ? 'inventory' : 'local_pharmacy'}
                            </span>
                            {rx.status === 'partially_dispensed' ? 'Continue' : 'Dispense'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Card View (Mobile) */}
          <div className="lg:hidden space-y-3">
            {prescriptions.map((rx) => {
              const waitTimeMinutes = rx.finalized_at
                ? Math.floor((Date.now() - new Date(rx.finalized_at).getTime()) / 60000)
                : 0;
              const waitTimeDisplay =
                waitTimeMinutes < 60
                  ? `${waitTimeMinutes}m`
                  : `${Math.floor(waitTimeMinutes / 60)}h ${waitTimeMinutes % 60}m`;

              return (
                <div
                  key={rx.id}
                  className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm ${
                    rx.status === 'partially_dispensed' ? 'border-orange-300 bg-orange-50/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm ${
                          rx.status === 'partially_dispensed' ? 'text-orange-500' : 'text-green-500'
                        }`}>
                          {rx.status === 'partially_dispensed' ? '🟠' : '🟢'}
                        </span>
                        <div className="text-sm font-semibold text-slate-900">
                          {rx.prescription_number}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(rx.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    {getStatusBadge(rx.status)}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Patient:</span>
                      <span className="text-slate-900 font-medium text-right">{rx.patient_name}</span>
                    </div>
                    {rx.patient_age || rx.patient_gender ? (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Age/Sex:</span>
                        <span className="text-slate-700 text-right">
                          {rx.patient_age && `${rx.patient_age}y`}
                          {rx.patient_age && rx.patient_gender && ' / '}
                          {rx.patient_gender || ''}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Doctor:</span>
                      <span className="text-slate-900 text-right">{rx.doctor_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Items:</span>
                      <span className="text-slate-900 font-medium text-right">
                        {rx.dispensed_items}/{rx.total_items} dispensed
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Wait Time:</span>
                      <span className={`font-medium text-right ${
                        waitTimeMinutes > 120 ? 'text-red-600' :
                        waitTimeMinutes > 60 ? 'text-orange-600' :
                        'text-slate-500'
                      }`}>
                        {waitTimeDisplay}
                      </span>
                    </div>
                  </div>

                  {rx.status === 'dispensed' ? (
                    <button
                      onClick={() => handleViewPrescription(rx.id)}
                      className="w-full mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      View Prescription
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStartDispensing(rx.id)}
                      className={`w-full mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        rx.status === 'partially_dispensed'
                          ? 'bg-orange-500 hover:bg-orange-600 text-white'
                          : 'bg-primary hover:bg-primary/90 text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {rx.status === 'partially_dispensed' ? 'inventory' : 'local_pharmacy'}
                      </span>
                      {rx.status === 'partially_dispensed' ? 'Continue Dispensing' : 'Start Dispensing'}
                    </button>
                  )}
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

export default PendingPrescriptions;
