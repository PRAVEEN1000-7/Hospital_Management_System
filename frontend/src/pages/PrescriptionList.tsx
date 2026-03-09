import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import prescriptionService from '../services/prescriptionService';
import type { PrescriptionListItem, PaginatedResponse } from '../types/prescription';

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

const PrescriptionList: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [prescriptions, setPrescriptions] = useState<PrescriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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
  }, [page, search, statusFilter, role]);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this prescription?')) return;
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
          <p className="text-sm text-slate-500 mt-1">{total} prescription{total !== 1 ? 's' : ''} found</p>
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
              placeholder="Search by patient name, Rx number, diagnosis..."
              className="input-field pl-10"
            />
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
      </div>

      {/* Table */}
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
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate">
                      {rx.diagnosis || '—'}
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
    </div>
  );
};

export default PrescriptionList;
