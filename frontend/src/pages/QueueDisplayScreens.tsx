import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import queueScreenService from '../services/queueScreenService';
import scheduleService from '../services/scheduleService';
import api from '../services/api';
import type { QueueDisplayScreen, QueueDisplayScreenCreateData } from '../types/queueScreen';
import type { DoctorOption } from '../types/appointment';
import SearchableSelect, { type SuggestionOption } from '../components/common/SearchableSelect';

interface DepartmentOption {
  id: string;
  name: string;
}

const emptyForm: QueueDisplayScreenCreateData = {
  slug: '',
  display_name: '',
  department_id: '',
  doctor_id: '',
  show_doctor2: false,
  doctor2_id: '',
  show_pharmacy: false,
  show_opthal: false,
  token_format: '#{n}',
  refresh_seconds: 10,
};

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** BRD-005 — admin UI for multi-screen Queue Display configuration. Purely
 * additive alongside HospitalSettings.tsx's existing single-config Queue
 * Display section (linked from there via "Manage Screens"). */
const QueueDisplayScreens: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [screens, setScreens] = useState<QueueDisplayScreen[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<QueueDisplayScreenCreateData>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await queueScreenService.list();
      setScreens(data);
    } catch {
      toast.error('Failed to load queue display screens');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    scheduleService.getDoctors().then(setDoctors).catch(() => {});
    api.get('/departments').then(res => setDepartments(res.data?.data || [])).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setShowForm(true);
  };

  const openEdit = (s: QueueDisplayScreen) => {
    setEditingId(s.id);
    setForm({
      slug: s.slug,
      display_name: s.display_name,
      department_id: s.department_id || '',
      doctor_id: s.doctor_id || '',
      show_doctor2: s.show_doctor2,
      doctor2_id: s.doctor2_id || '',
      show_pharmacy: s.show_pharmacy,
      show_opthal: s.show_opthal,
      token_format: s.token_format,
      refresh_seconds: s.refresh_seconds,
    });
    setSlugTouched(true);
    setShowForm(true);
  };

  const handleNameChange = (name: string) => {
    setForm(f => ({ ...f, display_name: name, slug: slugTouched ? f.slug : slugify(name) }));
  };

  const handleSave = async () => {
    if (!form.display_name.trim() || !form.slug.trim() || !form.department_id || !form.doctor_id) {
      toast.error('Display Name, Screen (slug), Department, and Doctor are all required');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, department_id: form.department_id || undefined, doctor_id: form.doctor_id || undefined, doctor2_id: form.doctor2_id || undefined };
      if (editingId) {
        await queueScreenService.update(editingId, payload);
        toast.success('Screen updated');
      } else {
        await queueScreenService.create(payload);
        toast.success('Screen created');
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save screen');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (s: QueueDisplayScreen) => {
    const ok = await confirm({
      title: 'Deactivate Screen',
      message: `Deactivate "${s.display_name}"? Its public URL will stop working.`,
      confirmLabel: 'Deactivate',
    });
    if (!ok) return;
    try {
      await queueScreenService.deactivate(s.id);
      toast.success('Screen deactivated');
      load();
    } catch {
      toast.error('Failed to deactivate screen');
    }
  };

  const publicBaseUrl = `${window.location.origin}/public/queue/${user?.hospital_code || '{hospitalCode}'}`;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Queue Display Screens</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure multiple named public queue displays (BRD-005) — each with its own department, doctor, and token format.
          </p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-lg">add</span> New Screen
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span>
        </div>
      ) : screens.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">
          <span className="material-symbols-outlined text-5xl mb-3">tv_off</span>
          <p>No queue display screens configured yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {screens.map(s => (
            <div key={s.id} className={`bg-white rounded-xl border p-4 flex items-center justify-between gap-4 ${s.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900 truncate">{s.display_name}</p>
                  {s.is_configured ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Configured</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">Incomplete</span>
                  )}
                  {!s.is_active && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">Inactive</span>}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {s.department_name || '—'} · {s.doctor_name || 'No doctor set'} · Token format: <code className="text-slate-600">{s.token_format}</code>
                </p>
                <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{publicBaseUrl}/{s.slug}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => openEdit(s)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Edit">
                  <span className="material-symbols-outlined text-slate-600 text-[18px]">edit</span>
                </button>
                {s.is_active && (
                  <button onClick={() => handleDeactivate(s)} className="p-2 hover:bg-red-50 rounded-lg transition-colors" title="Deactivate">
                    <span className="material-symbols-outlined text-red-500 text-[18px]">block</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-slate-900">{editingId ? 'Edit Screen' : 'New Screen'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Display Name *</label>
                <input type="text" value={form.display_name} onChange={e => handleNameChange(e.target.value)}
                  placeholder="e.g. Ground Floor Waiting Area"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Screen (URL slug) *</label>
                <input type="text" value={form.slug} onChange={e => { setSlugTouched(true); setForm(f => ({ ...f, slug: slugify(e.target.value) })); }}
                  placeholder="ground-floor"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono" />
                <p className="text-[11px] text-slate-400 mt-1">{publicBaseUrl}/{form.slug || '…'}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Department *</label>
                <SearchableSelect
                  value={departments.find(d => d.id === form.department_id)?.name || ''}
                  onChange={(_, metadata) => setForm(f => ({ ...f, department_id: (metadata?.id as string) || '' }))}
                  suggestions={departments.map((d): SuggestionOption => ({ id: d.id, label: d.name, metadata: { id: d.id } }))}
                  placeholder="Search department…"
                  allowManualEntry={false}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Doctor *</label>
                <SearchableSelect
                  value={doctors.find(d => d.doctor_id === form.doctor_id)?.name || ''}
                  onChange={(_, metadata) => setForm(f => ({ ...f, doctor_id: (metadata?.id as string) || '' }))}
                  suggestions={doctors.map((d): SuggestionOption => ({ id: d.doctor_id, label: d.name, sublabel: d.specialization || undefined, metadata: { id: d.doctor_id } }))}
                  placeholder="Search doctor…"
                  allowManualEntry={false}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Token Format *</label>
                <input type="text" value={form.token_format} onChange={e => setForm(f => ({ ...f, token_format: e.target.value }))}
                  placeholder="#{n}"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono" />
                <p className="text-[11px] text-slate-400 mt-1">{'{n}'} is replaced with the token number, e.g. "#{'{n}'}" → #12</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.show_doctor2} onChange={e => setForm(f => ({ ...f, show_doctor2: e.target.checked }))} />
                  Show 2nd doctor column
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.show_pharmacy} onChange={e => setForm(f => ({ ...f, show_pharmacy: e.target.checked }))} />
                  Show Pharmacy column
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.show_opthal} onChange={e => setForm(f => ({ ...f, show_opthal: e.target.checked }))} />
                  Show Opthal column
                </label>
              </div>
              {form.show_doctor2 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">2nd Doctor</label>
                  <SearchableSelect
                    value={doctors.find(d => d.doctor_id === form.doctor2_id)?.name || ''}
                    onChange={(_, metadata) => setForm(f => ({ ...f, doctor2_id: (metadata?.id as string) || '' }))}
                    suggestions={doctors.map((d): SuggestionOption => ({ id: d.doctor_id, label: d.name, sublabel: d.specialization || undefined, metadata: { id: d.doctor_id } }))}
                    placeholder="Search doctor…"
                    allowManualEntry={false}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Refresh Interval (sec)</label>
                <input type="number" min={3} max={120} value={form.refresh_seconds}
                  onChange={e => setForm(f => ({ ...f, refresh_seconds: Math.max(3, Math.min(120, Number(e.target.value))) }))}
                  className="w-32 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <button onClick={() => setShowForm(false)} disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Screen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueueDisplayScreens;
