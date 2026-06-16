import React, { useState, useEffect, useCallback } from 'react';
import { superAdminApi } from '../services/superAdminApi';

interface AuditLog {
  id: string;
  tenant_id: string | null;
  action: string;
  entity_type: string | null;
  entity_name: string | null;
  created_at: string;
}

const ACTION_COLOR: Record<string, string> = {
  tenant_created_pending: 'bg-blue-100 text-blue-700',
  plan_activated_manually: 'bg-emerald-100 text-emerald-700',
  plan_assigned: 'bg-emerald-100 text-emerald-700',
  plan_changed: 'bg-emerald-100 text-emerald-700',
  plan_created: 'bg-emerald-100 text-emerald-700',
  plan_updated: 'bg-amber-100 text-amber-700',
  plan_deleted: 'bg-red-100 text-red-700',
  tenant_suspended: 'bg-red-100 text-red-700',
  tenant_activated: 'bg-green-100 text-green-700',
  tenant_updated: 'bg-amber-100 text-amber-700',
  module_enabled: 'bg-purple-100 text-purple-700',
  module_disabled: 'bg-slate-100 text-slate-600',
  subscription_cancelled: 'bg-red-100 text-red-700',
  subscription_reactivated: 'bg-green-100 text-green-700',
  upgrade_requested: 'bg-blue-100 text-blue-700',
  admin_password_reset: 'bg-orange-100 text-orange-700',
};

const actionColor = (action: string) =>
  ACTION_COLOR[action] ?? 'bg-slate-100 text-slate-600';

const fmt = (d: string) =>
  new Date(d).toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const SuperAdminAudit: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [limit, setLimit] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await superAdminApi.getAuditLogs({
        action: actionFilter || undefined,
        limit,
      });
      setLogs(res.data.logs ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      setLogs([]);
    }
    setLoading(false);
  }, [actionFilter, limit]);

  useEffect(() => { load(); }, [load]);

  const actionOptions = [
    '', 'tenant_created_pending', 'plan_assigned', 'plan_activated_manually',
    'plan_changed', 'plan_created', 'plan_updated', 'plan_deleted',
    'tenant_suspended', 'tenant_activated', 'tenant_updated',
    'module_enabled', 'module_disabled',
    'subscription_cancelled', 'subscription_reactivated',
    'upgrade_requested', 'admin_password_reset',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
          <p className="text-slate-500 text-sm mt-1">Platform-wide activity history</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</label>
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          >
            {actionOptions.map(a => (
              <option key={a} value={a}>{a || 'All actions'}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Show</label>
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          >
            {[25, 50, 100, 200].map(n => (
              <option key={n} value={n}>{n} entries</option>
            ))}
          </select>
        </div>
        {total > 0 && (
          <span className="ml-auto text-xs text-slate-400">{total} result{total !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <span className="material-symbols-outlined text-5xl mb-3 block">history</span>
            <p className="text-sm font-medium">No audit logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Entity</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Hospital ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap font-mono text-xs">
                      {fmt(log.created_at)}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${actionColor(log.action)}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                      {log.entity_type || '—'}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900 max-w-[200px] truncate">
                      {log.entity_name || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-xs whitespace-nowrap">
                      {log.tenant_id ? log.tenant_id.slice(0, 8) + '…' : '—'}
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

export default SuperAdminAudit;
