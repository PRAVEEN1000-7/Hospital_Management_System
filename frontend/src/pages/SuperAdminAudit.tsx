import React, { useState, useEffect, useCallback } from 'react';
import { superAdminApi } from '../services/superAdminApi';

interface AuditLog {
  id: string;
  tenant_id: string | null;
  hospital_name: string | null;
  user_id: string | null;
  user_name: string | null;
  user_type: string | null;
  action: string;
  entity_type: string | null;
  entity_name: string | null;
  method: string | null;
  status: number | null;
  request_path: string | null;
  ip_address: string | null;
  created_at: string;
}

// Color a verb suffix consistently regardless of the entity prefix.
const verbColor = (action: string): string => {
  const a = action.toLowerCase();
  if (a.includes('delete') || a.includes('suspend') || a.includes('cancel')) return 'bg-red-100 text-red-700';
  if (a.includes('create') || a.includes('activ') || a.includes('assign') || a.includes('reactivat')) return 'bg-emerald-100 text-emerald-700';
  if (a.includes('updat') || a.includes('chang') || a.includes('finaliz') || a.includes('reset')) return 'bg-amber-100 text-amber-700';
  if (a.includes('enabl')) return 'bg-purple-100 text-purple-700';
  if (a.includes('disabl')) return 'bg-slate-100 text-slate-600';
  return 'bg-blue-100 text-blue-700';
};

const methodColor = (m: string | null): string => {
  switch (m) {
    case 'POST': return 'text-emerald-600';
    case 'PUT':
    case 'PATCH': return 'text-amber-600';
    case 'DELETE': return 'text-red-600';
    default: return 'text-slate-400';
  }
};

const statusColor = (s: number | null): string => {
  if (s == null) return 'text-slate-400';
  if (s >= 500) return 'text-red-600';
  if (s >= 400) return 'text-amber-600';
  return 'text-emerald-600';
};

const fmt = (d: string) =>
  new Date(d).toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const SuperAdminAudit: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [limit, setLimit] = useState(100);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await superAdminApi.getAuditLogs({
        search: search || undefined,
        limit,
      });
      setLogs(res.data.logs ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      setLogs([]);
    }
    setLoading(false);
  }, [search, limit]);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
          <p className="text-slate-500 text-sm mt-1">Every action performed across the platform</p>
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
        <div className="relative flex-1 min-w-[240px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search action, entity, name or path…"
            className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Show</label>
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          >
            {[50, 100, 200, 500].map(n => (
              <option key={n} value={n}>{n} entries</option>
            ))}
          </select>
        </div>
        {total > 0 && (
          <span className="text-xs text-slate-400">{total} result{total !== 1 ? 's' : ''}</span>
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
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Hospital</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Entity</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Request</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors align-top">
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap font-mono text-xs">
                      {fmt(log.created_at)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 whitespace-nowrap">
                      {log.hospital_name || '—'}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="text-slate-700">{log.user_name || '—'}</div>
                      {log.user_type && (
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">{log.user_type}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${verbColor(log.action)}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                      <div className="capitalize">{log.entity_type || '—'}</div>
                      {log.entity_name && (
                        <div className="text-[11px] text-slate-400 max-w-[180px] truncate">{log.entity_name}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap font-mono text-xs">
                      {log.method && (
                        <span className={`font-bold ${methodColor(log.method)}`}>{log.method}</span>
                      )}
                      {log.status != null && (
                        <span className={`ml-1.5 ${statusColor(log.status)}`}>{log.status}</span>
                      )}
                      {log.request_path && (
                        <div className="text-slate-400 max-w-[260px] truncate">{log.request_path}</div>
                      )}
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
