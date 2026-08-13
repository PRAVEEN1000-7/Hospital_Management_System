import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../contexts/ToastContext';
import rolePermissionService from '../services/rolePermissionService';
import type { AccessLevel, EffectiveMatrixResponse, PermissionOverrideChange } from '../types/rolePermissions';

// The self-lockout guard mirrored client-side (backend/app/core/module_roles.py
// _PROTECTED_KEY/_PROTECTED_ROLE) so the UI never even offers a change the
// server would silently reject — the admin sees exactly what will happen.
const PROTECTED_KEY = 'system.user_management';
const PROTECTED_ROLE = 'admin';

const LEVEL_ORDER: AccessLevel[] = ['none', 'view', 'edit'];
const LEVEL_LABEL: Record<AccessLevel, string> = { none: 'None', view: 'View', edit: 'Edit' };

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  appt: 'Appointments',
  rx: 'Prescriptions',
  system: 'System',
  modules: 'Modules',
};
const CATEGORY_ORDER = ['general', 'appt', 'rx', 'modules', 'system'];

function categoryOf(key: string): string {
  const dot = key.indexOf('.');
  return dot === -1 ? 'modules' : key.slice(0, dot);
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', doctor: 'Doctor', visiting_doctor: 'Visiting Doctor', nurse: 'Nurse',
  receptionist: 'Receptionist', pharmacist: 'Pharmacist', optical_staff: 'Optical Staff',
  cashier: 'Cashier', inventory_manager: 'Inventory Manager', report_viewer: 'Report Viewer',
  staff: 'Staff', hr_manager: 'HR Manager', lab_technician: 'Lab Technician',
};
const roleLabel = (r: string) => ROLE_LABELS[r] || r.replace(/_/g, ' ');

/** Cell key used for pendingChanges / lookups: "permission.key::role_name". */
const cellId = (key: string, role: string) => `${key}::${role}`;

const RolesPermissions: React.FC = () => {
  const toast = useToast();
  const [matrix, setMatrix] = useState<EffectiveMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showOnlyCustom, setShowOnlyCustom] = useState(false);
  // Every category starts collapsed — an admin sees only the section
  // headers at first and expands one by clicking it, rather than the full
  // permission matrix rendering open by default.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(CATEGORY_ORDER));
  // pending edits, keyed by cellId — cleared on load/save/discard
  const [pending, setPending] = useState<Record<string, AccessLevel>>({});
  const [resettingAll, setResettingAll] = useState(false);
  const [resettingCategory, setResettingCategory] = useState<string | null>(null);
  // Centered confirmation modal (same pattern as the app's Sign Out dialog,
  // components/common/Layout.tsx) instead of the browser's native
  // window.confirm().
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const askConfirm = (message: string, onConfirm: () => void, title = 'Are you sure?') =>
    setConfirmState({ title, message, onConfirm });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await rolePermissionService.getMatrix();
      setMatrix(data);
      setPending({});
    } catch {
      toast.error('Failed to load the permission matrix');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const effectiveLevel = useCallback(
    (key: string, role: string, serverLevel: AccessLevel): AccessLevel => {
      const id = cellId(key, role);
      return id in pending ? pending[id] : serverLevel;
    },
    [pending],
  );

  const isDirty = useCallback(
    (key: string, role: string, serverLevel: AccessLevel): boolean => {
      const id = cellId(key, role);
      return id in pending && pending[id] !== serverLevel;
    },
    [pending],
  );

  const pendingCount = Object.keys(pending).length;

  const handleSetLevel = (key: string, role: string, serverLevel: AccessLevel, level: AccessLevel) => {
    if (key === PROTECTED_KEY && role === PROTECTED_ROLE && level !== 'edit') return; // locked
    const id = cellId(key, role);
    setPending(prev => {
      const next = { ...prev };
      if (level === serverLevel) {
        delete next[id]; // back to server value — nothing to save for this cell
      } else {
        next[id] = level;
      }
      return next;
    });
  };

  const handleDiscard = () => setPending({});

  const handleSave = async () => {
    if (!matrix || pendingCount === 0) return;
    const changes: PermissionOverrideChange[] = Object.entries(pending).map(([id, level]) => {
      const idx = id.indexOf('::');
      return { key: id.slice(0, idx), role: id.slice(idx + 2), access_level: level };
    });
    setSaving(true);
    try {
      const result = await rolePermissionService.updateMatrix(changes);
      if (result.skipped.length) {
        toast.error(`${result.applied} change(s) saved; ${result.skipped.length} skipped (locked)`);
      } else {
        toast.success(`Saved ${result.applied} change${result.applied === 1 ? '' : 's'}`);
      }
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleResetCell = (key: string, role: string, rowLabel: string) => {
    askConfirm(
      `Reset "${rowLabel}" for ${roleLabel(role)}?`,
      async () => {
        try {
          await rolePermissionService.resetCell(key, role);
          toast.success('Reverted to default');
          await load();
        } catch {
          toast.error('Failed to reset');
        }
      },
    );
  };

  const handleResetAll = () => {
    askConfirm(
      'This removes all customizations for this hospital.',
      async () => {
        setResettingAll(true);
        try {
          const { removed } = await rolePermissionService.resetAll();
          toast.success(removed > 0 ? `Reset ${removed} customization${removed === 1 ? '' : 's'} to default` : 'Already at default — nothing to reset');
          await load();
        } catch {
          toast.error('Failed to reset the permission matrix');
        } finally {
          setResettingAll(false);
        }
      },
      'Reset all to default?',
    );
  };

  const handleResetCategory = (cat: string) => {
    const label = CATEGORY_LABELS[cat] || cat;
    askConfirm(
      `This removes all "${label}" customizations.`,
      async () => {
        setResettingCategory(cat);
        try {
          const { removed } = await rolePermissionService.resetCategory(cat);
          toast.success(removed > 0 ? `Reset ${removed} customization${removed === 1 ? '' : 's'} in "${label}" to default` : `"${label}" already at default — nothing to reset`);
          await load();
        } catch {
          toast.error(`Failed to reset "${label}"`);
        } finally {
          setResettingCategory(null);
        }
      },
      `Reset "${label}" to default?`,
    );
  };

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const grouped = useMemo(() => {
    if (!matrix) return [];
    const q = search.trim().toLowerCase();
    const byCat = new Map<string, typeof matrix.rows>();
    for (const row of matrix.rows) {
      if (q && !row.label.toLowerCase().includes(q) && !row.key.toLowerCase().includes(q)) continue;
      if (showOnlyCustom && !Object.values(row.cells).some(c => c.is_override)) continue;
      const cat = categoryOf(row.key);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(row);
    }
    return CATEGORY_ORDER.filter(c => byCat.has(c)).map(cat => ({ cat, rows: byCat.get(cat)! }));
  }, [matrix, search, showOnlyCustom]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6 flex items-center justify-center py-24">
        <span className="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span>
      </div>
    );
  }

  if (!matrix) return null;

  return (
    <div className="max-w-6xl mx-auto p-6 pb-28">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roles & Permissions</h1>
          <p className="text-sm text-slate-500 mt-1">
            Control which roles can view or edit each area of the system, for your hospital only.
            Unchanged cells keep using the system default.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetAll}
          disabled={resettingAll}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex-shrink-0"
          title="Reset the entire matrix to the system default"
        >
          {resettingAll ? (
            <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
          )}
          Reset All to Default
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search areas…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 select-none cursor-pointer">
          <input type="checkbox" checked={showOnlyCustom} onChange={e => setShowOnlyCustom(e.target.checked)} />
          Customized only
        </label>
        <button
          type="button"
          onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(CATEGORY_ORDER))}
          className="ml-auto text-xs font-semibold text-primary hover:underline"
        >
          {collapsed.size ? 'Expand all' : 'Collapse all'}
        </button>
      </div>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">
          <span className="material-symbols-outlined text-5xl mb-3">search_off</span>
          <p>No matching permission areas.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ cat, rows }) => {
            const isCollapsed = collapsed.has(cat);
            return (
              <div key={cat} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/60 border-b border-slate-100 hover:bg-slate-100/60 transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="flex-1 flex items-center justify-between text-left"
                  >
                    <span className="font-bold text-sm text-slate-800">{CATEGORY_LABELS[cat] || cat}</span>
                    <span className="material-symbols-outlined text-slate-400 text-lg">
                      {isCollapsed ? 'expand_more' : 'expand_less'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleResetCategory(cat); }}
                    disabled={resettingCategory === cat}
                    title={`Reset all "${CATEGORY_LABELS[cat] || cat}" permissions to default`}
                    className="ml-3 flex-shrink-0 flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-full hover:bg-red-100 hover:border-red-200 transition-colors disabled:opacity-50"
                  >
                    {resettingCategory === cat ? (
                      <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                    )}
                    Reset
                  </button>
                </div>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-white border-b border-slate-100">
                          <th className="sticky left-0 bg-white text-left px-4 py-2.5 font-semibold text-slate-600 min-w-[200px] z-20">
                            Area
                          </th>
                          {matrix.roles.map(role => (
                            <th key={role} className="px-3 py-2.5 text-center font-semibold text-slate-600 whitespace-nowrap">
                              {roleLabel(role)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {rows.map(row => (
                          <tr key={row.key} className="hover:bg-slate-50/40">
                            <td className="sticky left-0 bg-white px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                              {row.label}
                            </td>
                            {matrix.roles.map(role => {
                              const cell = row.cells[role];
                              const level = effectiveLevel(row.key, role, cell.access_level);
                              const dirty = isDirty(row.key, role, cell.access_level);
                              const locked = row.key === PROTECTED_KEY && role === PROTECTED_ROLE;
                              return (
                                <td key={role} className="px-3 py-2 text-center">
                                  <div className="inline-flex items-center gap-1.5">
                                    <div className={`inline-flex rounded-full border p-0.5 ${dirty ? 'border-amber-300 bg-amber-50' : cell.is_override ? 'border-primary/30' : 'border-slate-200'}`}>
                                      {LEVEL_ORDER.map(l => {
                                        const active = level === l;
                                        const disabled = locked && l !== 'edit';
                                        return (
                                          <button
                                            key={l}
                                            type="button"
                                            disabled={disabled}
                                            title={disabled ? 'Admin must always keep Edit here' : LEVEL_LABEL[l]}
                                            onClick={() => handleSetLevel(row.key, role, cell.access_level, l)}
                                            className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                              active
                                                ? l === 'edit'
                                                  ? 'bg-emerald-500 text-white'
                                                  : l === 'view'
                                                  ? 'bg-blue-500 text-white'
                                                  : 'bg-slate-300 text-slate-700'
                                                : disabled
                                                ? 'text-slate-300 cursor-not-allowed'
                                                : 'text-slate-500 hover:bg-slate-100'
                                            }`}
                                          >
                                            {LEVEL_LABEL[l][0]}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    {cell.is_override && !dirty && !locked && (
                                      <button
                                        type="button"
                                        onClick={() => handleResetCell(row.key, role, row.label)}
                                        title="Reset to default"
                                        className="text-slate-300 hover:text-red-600 transition-colors"
                                      >
                                        <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pendingCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-amber-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-700 font-medium">
              {pendingCount} unsaved change{pendingCount > 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDiscard}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 font-semibold"
              >
                {saving ? (
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">save</span>
                )}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal — same pattern as the app's Sign Out confirmation
          (components/common/Layout.tsx): centered card over a blurred
          backdrop, icon circle, bold title, gray message, Cancel/Confirm
          buttons. Used in place of window.confirm(). */}
      {confirmState && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmState(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-red-500 text-3xl">warning</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">{confirmState.title}</h3>
              <p className="text-sm text-slate-500 mb-6">{confirmState.message}</p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setConfirmState(null)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { const run = confirmState.onConfirm; setConfirmState(null); run(); }}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 transition-colors active:scale-[0.98]"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesPermissions;
