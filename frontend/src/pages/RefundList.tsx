import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import refundService from '../services/refundService';
import type { RefundListItem, RefundStatus } from '../types/billing';

const STATUS_COLORS: Record<RefundStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  processed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
};

const REASON_LABELS: Record<string, string> = {
  service_not_provided: 'Service Not Provided',
  billing_error: 'Billing Error',
  patient_request: 'Patient Request',
  duplicate: 'Duplicate',
  other: 'Other',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const RefundList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [refunds, setRefunds] = useState<RefundListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  // Process modal
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processTargetId, setProcessTargetId] = useState('');
  const [processRef, setProcessRef] = useState('');

  const role = user?.roles?.[0];
  const isAdmin = ['super_admin', 'admin'].includes(role || '');
  const isBillingStaff = ['super_admin', 'admin', 'cashier', 'pharmacist'].includes(role || '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await refundService.list(page, 15, {
        status: statusFilter || undefined,
        invoice_id: searchParams.get('invoice_id') || undefined,
      });
      setRefunds(res.items);
      setTotal(res.total);
      setTotalPages(res.pages);
    } catch {
      showToast('error', 'Failed to load refunds');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchParams, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      await refundService.approve(id);
      showToast('success', 'Refund approved');
      load();
    } catch (err: unknown) {
      showToast('error', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed');
    } finally { setProcessing(null); }
  };

  const handleReject = async () => {
    setProcessing(rejectTargetId);
    try {
      await refundService.reject(rejectTargetId, rejectReason || undefined);
      showToast('success', 'Refund rejected');
      setShowRejectModal(false);
      setRejectReason('');
      load();
    } catch (err: unknown) {
      showToast('error', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed');
    } finally { setProcessing(null); }
  };

  const handleProcess = async () => {
    setProcessing(processTargetId);
    try {
      await refundService.process(processTargetId, processRef ? { refund_reference: processRef } : undefined);
      showToast('success', 'Refund processed');
      setShowProcessModal(false);
      setProcessRef('');
      load();
    } catch (err: unknown) {
      showToast('error', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed');
    } finally { setProcessing(null); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Refunds</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} record{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="processed">Processed</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span>
          </div>
        ) : refunds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <span className="material-symbols-outlined text-[48px] mb-3">currency_exchange</span>
            <p className="font-medium">No refunds found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Refund #</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Invoice #</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Patient</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Reason</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Requested On</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Amount</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                  {isBillingStaff && <th className="text-center px-4 py-3 font-semibold text-slate-600">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {refunds.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{r.refund_number}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      <button className="hover:underline text-slate-600"
                        onClick={() => navigate(`/billing/invoices/${r.invoice_id}`)}>
                        {r.invoice_number}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.patient_name}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {REASON_LABELS[r.reason_code] || r.reason_code}
                      {r.reason_detail && (
                        <p className="text-slate-400 truncate max-w-[180px]">{r.reason_detail}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600">₹{fmt(r.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[r.status]}`}>
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </td>
                    {isBillingStaff && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {r.status === 'pending' && isAdmin && (
                            <>
                              <button
                                onClick={() => handleApprove(r.id)}
                                disabled={processing === r.id}
                                className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded text-xs font-medium hover:bg-blue-100 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => { setRejectTargetId(r.id); setRejectReason(''); setShowRejectModal(true); }}
                                disabled={processing === r.id}
                                className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded text-xs font-medium hover:bg-red-100 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {r.status === 'pending' && !isAdmin && (
                            <span className="text-slate-400 text-xs italic">Awaiting approval</span>
                          )}
                          {r.status === 'approved' && (
                            <button
                              onClick={() => { setProcessTargetId(r.id); setProcessRef(''); setShowProcessModal(true); }}
                              disabled={processing === r.id}
                              className="px-2 py-1 bg-green-50 text-green-600 border border-green-200 rounded text-xs font-medium hover:bg-green-100 disabled:opacity-50"
                            >
                              Process
                            </button>
                          )}
                          {['processed', 'rejected'].includes(r.status) && (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-40 hover:bg-slate-50">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-40 hover:bg-slate-50">Next</button>
          </div>
        </div>
      )}

      {/* ── Reject Refund Modal ── */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Reject Refund</h3>
              <button onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">Provide a reason for rejecting this refund request.</p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={processing === rejectTargetId}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-semibold text-sm hover:bg-red-700 disabled:opacity-60"
              >
                {processing === rejectTargetId ? 'Rejecting…' : 'Confirm Reject'}
              </button>
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Process Refund Modal ── */}
      {showProcessModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Process Refund</h3>
              <button onClick={() => setShowProcessModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">Confirm that the refund amount has been returned to the patient.</p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">Reference / Transaction ID <span className="text-slate-400">(optional)</span></label>
              <input
                type="text"
                value={processRef}
                onChange={e => setProcessRef(e.target.value)}
                placeholder="UPI ref, receipt #, etc."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleProcess}
                disabled={processing === processTargetId}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 disabled:opacity-60"
              >
                {processing === processTargetId ? 'Processing…' : 'Mark as Processed'}
              </button>
              <button
                onClick={() => setShowProcessModal(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
};

export default RefundList;
