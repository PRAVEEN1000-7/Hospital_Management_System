import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import settlementService from '../services/settlementService';
import type { SettlementListItem, SettlementStatus } from '../types/billing';

const STATUS_COLORS: Record<SettlementStatus, string> = {
  open: 'bg-amber-100 text-amber-700',
  closed: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const SettlementList: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [settlements, setSettlements] = useState<SettlementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [settleDate, setSettleDate] = useState(new Date().toISOString().slice(0, 10));
  const [settleNotes, setSettleNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const role = user?.roles?.[0];
  const isAdmin = ['super_admin', 'admin'].includes(role || '');
  const isCashier = role === 'cashier';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settlementService.list(page, 15, { status: statusFilter || undefined });
      setSettlements(res.items);
      setTotal(res.total);
      setTotalPages(res.pages);
    } catch {
      showToast('error', 'Failed to load settlements');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await settlementService.create({ settlement_date: settleDate, notes: settleNotes || undefined });
      showToast('success', 'Settlement created');
      setShowCreateModal(false);
      setSettleNotes('');
      load();
    } catch (err: unknown) {
      showToast('error', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to create settlement');
    } finally { setCreating(false); }
  };

  const handleClose = async (id: string) => {
    setProcessing(id);
    try {
      await settlementService.close(id);
      showToast('success', 'Settlement closed');
      load();
    } catch (err: unknown) {
      showToast('error', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed');
    } finally { setProcessing(null); }
  };

  const handleVerify = async (id: string) => {
    setProcessing(id);
    try {
      await settlementService.verify(id);
      showToast('success', 'Settlement verified');
      load();
    } catch (err: unknown) {
      showToast('error', (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed');
    } finally { setProcessing(null); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Daily Settlements</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} record{total !== 1 ? 's' : ''}</p>
        </div>
        {(isAdmin || isCashier) && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Open Settlement
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="verified">Verified</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span>
          </div>
        ) : settlements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <span className="material-symbols-outlined text-[48px] mb-3">account_balance_wallet</span>
            <p className="font-medium">No settlements found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Cashier</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Collected</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Refunds</th>
                  <th className="text-right px-4 py-3 font-semibold text-green-700">Net</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                  {(isAdmin || isCashier) && <th className="text-center px-4 py-3 font-semibold text-slate-600">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {new Date(s.settlement_date + 'T00:00:00').toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.cashier_name}</td>
                    <td className="px-4 py-3 text-right text-slate-700">₹{fmt(s.total_collected)}</td>
                    <td className="px-4 py-3 text-right text-red-500">−₹{fmt(s.total_refunds)}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-700">₹{fmt(s.net_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[s.status]}`}>
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </span>
                    </td>
                    {(isAdmin || isCashier) && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {s.status === 'open' && (
                            <button
                              onClick={() => handleClose(s.id)}
                              disabled={processing === s.id}
                              className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded text-xs font-medium hover:bg-blue-100 disabled:opacity-50"
                            >
                              Close
                            </button>
                          )}
                          {s.status === 'closed' && isAdmin && (
                            <button
                              onClick={() => handleVerify(s.id)}
                              disabled={processing === s.id}
                              className="px-2 py-1 bg-green-50 text-green-600 border border-green-200 rounded text-xs font-medium hover:bg-green-100 disabled:opacity-50"
                            >
                              Verify
                            </button>
                          )}
                          {s.status === 'verified' && <span className="text-slate-300 text-xs">—</span>}
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

      {/* Create Settlement Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">Open New Settlement</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Settlement Date *</label>
                <input
                  type="date"
                  value={settleDate}
                  onChange={e => setSettleDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea rows={2} value={settleNotes} onChange={e => setSettleNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  placeholder="Opening notes, shift details…" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleCreate} disabled={creating}
                className="flex-1 py-2.5 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary/90 disabled:opacity-60">
                {creating ? 'Creating…' : 'Open Settlement'}
              </button>
              <button onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium text-sm hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettlementList;
