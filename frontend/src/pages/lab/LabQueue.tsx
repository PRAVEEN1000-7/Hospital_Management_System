import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import labService from '../../services/labService';
import type { LabQueueEntry } from '../../types/lab';
import { useToast } from '../../contexts/ToastContext';
import { formatDateTime } from '../../utils/calendarDate';

const queueBadge: Record<string, string> = {
  waiting: 'bg-amber-50 text-amber-700',
  being_served: 'bg-blue-50 text-blue-700',
  collected: 'bg-emerald-50 text-emerald-700',
};

const payBadge: Record<string, string> = {
  pending: 'bg-red-50 text-red-600',
  partial: 'bg-amber-50 text-amber-700',
  paid: 'bg-emerald-50 text-emerald-700',
};

const LabQueue: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [entries, setEntries] = useState<LabQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await labService.getQueue());
    } catch {
      showToast('error', 'Failed to load lab queue');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lab Queue</h1>
          <p className="text-sm text-slate-500 mt-1">Today's finalized orders, by token</p>
        </div>
        <button onClick={load}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
          <span className="material-symbols-outlined text-base">refresh</span> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined animate-spin text-3xl text-slate-300">progress_activity</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <span className="material-symbols-outlined text-4xl text-slate-300 block mb-2">queue</span>
            No lab orders in today's queue.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase">
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Order #</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Queue</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/lab/orders/${e.id}`)}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary font-bold text-sm">
                        {e.queue_token ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-600">{e.order_number}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{e.patient_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${queueBadge[e.queue_status] || 'bg-slate-100 text-slate-600'}`}>
                        {e.queue_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900 text-right">₹{Number(e.total_amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${payBadge[e.payment_status] || 'bg-slate-100 text-slate-600'}`}>
                        {e.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDateTime(e.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="material-symbols-outlined text-slate-400 text-lg">chevron_right</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LabQueue;
