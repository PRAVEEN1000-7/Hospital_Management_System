import React from 'react';
import { format } from 'date-fns';

export type DispensingQueueStatus = 'waiting' | 'being_served' | 'ready' | 'collected';

export interface DispensingQueueEntry {
  id: string;
  invoice_number: string;
  patient_name: string | null;
  queue_token: number | null;
  queue_status: DispensingQueueStatus;
  total_amount: number;
  payment_status: string;
  created_at: string;
  queue_called_at: string | null;
}

const STATUS_LABELS: Record<DispensingQueueStatus, string> = {
  waiting: 'Waiting',
  being_served: 'Being Served',
  ready: 'Ready for Collection',
  collected: 'Collected',
};

const STATUS_COLORS: Record<DispensingQueueStatus, string> = {
  waiting: 'bg-slate-100 text-slate-700',
  being_served: 'bg-blue-100 text-blue-700',
  ready: 'bg-amber-100 text-amber-700',
  collected: 'bg-emerald-100 text-emerald-700',
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-red-50 text-red-600',
  partially_paid: 'bg-amber-50 text-amber-600',
  paid: 'bg-emerald-50 text-emerald-600',
};

const NEXT_STATUS: Record<DispensingQueueStatus, DispensingQueueStatus | null> = {
  waiting: 'being_served',
  being_served: 'ready',
  ready: 'collected',
  collected: null,
};

interface Props {
  title: string;
  entries: DispensingQueueEntry[];
  loading: boolean;
  advancing: string | null;
  onAdvance: (id: string, nextStatus: DispensingQueueStatus) => void;
  onItemClick?: (id: string) => void;
}

/**
 * Shared Waiting -> Being Served -> Ready -> Collected dispensing queue board,
 * used identically by Pharmacy and Optical so both modules present and
 * operate their queue the same way instead of two divergent UIs.
 */
const DispensingQueueBoard: React.FC<Props> = ({ title, entries, loading, advancing, onAdvance, onItemClick }) => {
  const counts: Record<DispensingQueueStatus, number> = {
    waiting: 0, being_served: 0, ready: 0, collected: 0,
  };
  entries.forEach(e => { if (e.queue_status in counts) counts[e.queue_status]++; });

  const summaryItems = [
    { status: 'waiting' as DispensingQueueStatus, label: 'Waiting', color: 'text-slate-700 bg-slate-100' },
    { status: 'being_served' as DispensingQueueStatus, label: 'Being Served', color: 'text-blue-700 bg-blue-100' },
    { status: 'ready' as DispensingQueueStatus, label: 'Ready', color: 'text-amber-700 bg-amber-100' },
    { status: 'collected' as DispensingQueueStatus, label: 'Collected', color: 'text-emerald-700 bg-emerald-100' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {!loading && entries.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {summaryItems.map(({ status, label, color }) => (
              <span key={status} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${color}`}>
                <span className="text-base font-bold">{counts[status]}</span>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2 block">queue</span>
            <p className="font-medium">No orders in today's queue</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600 text-center">Token</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Invoice #</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Patient</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Time In</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-right">Amount</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Payment</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map(entry => {
                const next = NEXT_STATUS[entry.queue_status];
                return (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary font-bold">
                        {entry.queue_token ?? '—'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-medium text-slate-900 ${onItemClick ? 'cursor-pointer hover:underline' : ''}`}
                      onClick={() => onItemClick?.(entry.id)}>
                      {entry.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{entry.patient_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{format(new Date(entry.created_at), 'hh:mm a')}</td>
                    <td className="px-4 py-3 text-right text-slate-900 font-medium">₹{Number(entry.total_amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${PAYMENT_STATUS_COLORS[entry.payment_status] || 'bg-slate-100 text-slate-600'}`}>
                        {entry.payment_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[entry.queue_status]}`}>
                        {STATUS_LABELS[entry.queue_status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {next ? (
                        <button
                          onClick={() => onAdvance(entry.id, next)}
                          disabled={advancing === entry.id}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                        >
                          {advancing === entry.id ? '...' : `Mark ${STATUS_LABELS[next]}`}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Done</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DispensingQueueBoard;
