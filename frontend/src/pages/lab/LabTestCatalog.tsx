import React, { useState, useEffect, useCallback, useMemo } from 'react';
import labService from '../../services/labService';
import type { LabTest, LabTestCreateData, LabTestParameterTemplate, LabTestPanel, LabTestPanelCreateData } from '../../types/lab';
import { useToast } from '../../contexts/ToastContext';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';

// Renders a 0 amount field as an empty box with a "0" placeholder hint
// instead of a literal "0" value — so clicking in starts from blank rather
// than requiring the user to delete a leading zero first.
const zeroAsEmpty = (n: number): number | string => (n === 0 ? '' : n);

const emptyForm: LabTestCreateData = {
  name: '', code: '', category: '', sample_type: '', price: 0,
  unit: '', reference_range: '', turnaround_hours: undefined, is_active: true,
  report_template: [],
};

const emptyPanelForm: LabTestPanelCreateData = { name: '', code: '', test_ids: [], is_active: true };

const LabTestCatalog: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'tests' | 'packages'>('tests');
  const [tests, setTests] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LabTest | null>(null);
  const [form, setForm] = useState<LabTestCreateData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // ═══ Packages (named bundles, e.g. "MHC — Master Health Checkup") ═══
  const [panels, setPanels] = useState<LabTestPanel[]>([]);
  const [panelsLoading, setPanelsLoading] = useState(true);
  const [panelModalOpen, setPanelModalOpen] = useState(false);
  const [editingPanel, setEditingPanel] = useState<LabTestPanel | null>(null);
  const [panelForm, setPanelForm] = useState<LabTestPanelCreateData>(emptyPanelForm);
  const [panelSaving, setPanelSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await labService.getTests(1, 200, search, '', false);
      setTests(res.data);
    } catch {
      showToast('error', 'Failed to load lab tests');
    } finally {
      setLoading(false);
    }
  }, [search, showToast]);

  useEffect(() => { load(); }, [load]);

  const loadPanels = useCallback(async () => {
    setPanelsLoading(true);
    try {
      setPanels(await labService.getPanels(false));
    } catch {
      showToast('error', 'Failed to load packages');
    } finally {
      setPanelsLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadPanels(); }, [loadPanels]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (t: LabTest) => {
    setEditing(t);
    setForm({
      name: t.name, code: t.code, category: t.category || '', sample_type: t.sample_type || '',
      price: Number(t.price), unit: t.unit || '', reference_range: t.reference_range || '',
      turnaround_hours: t.turnaround_hours ?? undefined, is_active: t.is_active,
      report_template: t.report_template ? t.report_template.map((p) => ({ ...p })) : [],
    });
    setModalOpen(true);
  };

  // Suggest categories / sample types already in use across the catalog, so
  // admins match existing taxonomy (e.g. "Hematology") instead of creating
  // near-duplicate variants by free-typing — while still allowing a brand-new
  // value to be entered when one genuinely doesn't exist yet.
  const categorySuggestions: SuggestionOption[] = useMemo(() => {
    const cats = Array.from(new Set(tests.map((t) => t.category).filter((c): c is string => !!c)));
    return cats.sort().map((c) => ({ id: c, label: c }));
  }, [tests]);
  const sampleTypeSuggestions: SuggestionOption[] = useMemo(() => {
    const types = Array.from(new Set(tests.map((t) => t.sample_type).filter((s): s is string => !!s)));
    return types.sort().map((s) => ({ id: s, label: s }));
  }, [tests]);

  const templateRows = form.report_template || [];
  const setTemplateRow = (idx: number, patch: Partial<LabTestParameterTemplate>) =>
    setForm((prev) => ({
      ...prev,
      report_template: (prev.report_template || []).map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    }));
  const addTemplateRow = () =>
    setForm((prev) => ({ ...prev, report_template: [...(prev.report_template || []), { name: '', unit: '', reference_range: '', section: '' }] }));
  const removeTemplateRow = (idx: number) =>
    setForm((prev) => ({ ...prev, report_template: (prev.report_template || []).filter((_, i) => i !== idx) }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      showToast('error', 'Name and code are required');
      return;
    }
    setSaving(true);
    const payload: LabTestCreateData = {
      ...form,
      report_template: (form.report_template || [])
        .filter((row) => row.name.trim())
        .map((row, idx) => ({ ...row, name: row.name.trim(), sequence: idx, section: row.section?.trim() || undefined })),
    };
    try {
      if (editing) {
        await labService.updateTest(editing.id, payload);
        showToast('success', 'Test updated');
      } else {
        await labService.createTest(payload);
        showToast('success', 'Test added');
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to save test');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (t: LabTest) => {
    if (!window.confirm(`Deactivate "${t.name}"? It will no longer be orderable.`)) return;
    try {
      await labService.deleteTest(t.id);
      showToast('success', 'Test deactivated');
      load();
    } catch {
      showToast('error', 'Failed to deactivate test');
    }
  };

  const handleDelete = async (t: LabTest) => {
    if (!window.confirm(
      `Permanently delete "${t.name}"? This completely removes it from the catalog and cannot be undone. ` +
      `If it's ever been ordered, this will be blocked — deactivate it instead in that case.`
    )) return;
    try {
      await labService.permanentlyDeleteTest(t.id);
      showToast('success', 'Test deleted');
      load();
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to delete test');
    }
  };

  const openCreatePanel = () => { setEditingPanel(null); setPanelForm(emptyPanelForm); setPanelModalOpen(true); };
  const openEditPanel = (p: LabTestPanel) => {
    setEditingPanel(p);
    setPanelForm({ name: p.name, code: p.code, test_ids: [...p.test_ids], is_active: p.is_active });
    setPanelModalOpen(true);
  };

  // Same "group the catalog by category, with a per-group select-all"
  // pattern used in the Prescription Builder's own test picker, so both
  // places behave identically.
  const panelTestGroups = useMemo(() => {
    const groups = new Map<string, LabTest[]>();
    tests.filter((t) => t.is_active).forEach((t) => {
      const key = t.category || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    });
    return Array.from(groups.entries()).map(([category, groupTests]) => ({ category, tests: groupTests }));
  }, [tests]);

  const togglePanelTest = (testId: string) =>
    setPanelForm((prev) => ({
      ...prev,
      test_ids: prev.test_ids.includes(testId)
        ? prev.test_ids.filter((id) => id !== testId)
        : [...prev.test_ids, testId],
    }));

  const handleSavePanel = async () => {
    if (!panelForm.name.trim() || !panelForm.code.trim()) {
      showToast('error', 'Name and code are required');
      return;
    }
    if (panelForm.test_ids.length === 0) {
      showToast('error', 'Select at least one test for this package');
      return;
    }
    setPanelSaving(true);
    try {
      if (editingPanel) {
        await labService.updatePanel(editingPanel.id, panelForm);
        showToast('success', 'Package updated');
      } else {
        await labService.createPanel(panelForm);
        showToast('success', 'Package added');
      }
      setPanelModalOpen(false);
      loadPanels();
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to save package');
    } finally {
      setPanelSaving(false);
    }
  };

  const handleDeactivatePanel = async (p: LabTestPanel) => {
    if (!window.confirm(`Deactivate "${p.name}"? It will no longer be selectable from Prescription.`)) return;
    try {
      await labService.deletePanel(p.id);
      showToast('success', 'Package deactivated');
      loadPanels();
    } catch {
      showToast('error', 'Failed to deactivate package');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lab Test Catalog</h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeTab === 'tests'
              ? 'Tests doctors can order from a prescription'
              : 'Named bundles of tests (e.g. "MHC — Master Health Checkup") a doctor can add in one click from a prescription'}
          </p>
        </div>
        <button onClick={activeTab === 'tests' ? openCreate : openCreatePanel}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-base">add</span> {activeTab === 'tests' ? 'Add Test' : 'Add Package'}
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button onClick={() => setActiveTab('tests')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            activeTab === 'tests' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          Tests
        </button>
        <button onClick={() => setActiveTab('packages')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            activeTab === 'packages' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          Packages
        </button>
      </div>

      {activeTab === 'tests' && (
      <div className="relative max-w-sm">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or code..."
          className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      )}

      {activeTab === 'tests' && (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined animate-spin text-3xl text-slate-300">progress_activity</span>
          </div>
        ) : tests.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <span className="material-symbols-outlined text-4xl text-slate-300 block mb-2">biotech</span>
            No lab tests yet. Add one to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase">
                  <th className="px-4 py-3">Test</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Sample</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3">Reference Range</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tests.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{t.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{t.code}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{t.category || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{t.sample_type || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 text-right">₹{Number(t.price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {t.reference_range || '—'}{t.unit ? ` ${t.unit}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(t)} className="text-slate-400 hover:text-primary p-1" title="Edit">
                        <span className="material-symbols-outlined text-lg">edit</span>
                      </button>
                      {t.is_active && (
                        <button onClick={() => handleDeactivate(t)} className="text-slate-400 hover:text-red-600 p-1" title="Deactivate">
                          <span className="material-symbols-outlined text-lg">block</span>
                        </button>
                      )}
                      <button onClick={() => handleDelete(t)} className="text-slate-400 hover:text-red-600 p-1" title="Delete permanently">
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {activeTab === 'packages' && (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {panelsLoading ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined animate-spin text-3xl text-slate-300">progress_activity</span>
          </div>
        ) : panels.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <span className="material-symbols-outlined text-4xl text-slate-300 block mb-2">list_alt</span>
            No packages yet. Add one to bundle tests doctors order together most often.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase">
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Tests Included</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {panels.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{p.code}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {p.tests.map((t) => (
                          <span key={t.id} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">{t.name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEditPanel(p)} className="text-slate-400 hover:text-primary p-1" title="Edit">
                        <span className="material-symbols-outlined text-lg">edit</span>
                      </button>
                      {p.is_active && (
                        <button onClick={() => handleDeactivatePanel(p)} className="text-slate-400 hover:text-red-600 p-1" title="Deactivate">
                          <span className="material-symbols-outlined text-lg">block</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{editing ? 'Edit Test' : 'Add Test'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Test Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Code *</label>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <SearchableSelect
                  value={form.category || ''}
                  onChange={(val) => setForm({ ...form, category: val })}
                  suggestions={categorySuggestions}
                  placeholder="e.g. Hematology"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sample Type</label>
                <SearchableSelect
                  value={form.sample_type || ''}
                  onChange={(val) => setForm({ ...form, sample_type: val })}
                  suggestions={sampleTypeSuggestions}
                  placeholder="e.g. Blood"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Price (₹) *</label>
                <input type="number" min={0} step="0.01" value={zeroAsEmpty(form.price)} placeholder="0.00"
                  onChange={(e) => setForm({ ...form, price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="e.g. mg/dL"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Turnaround (hrs)</label>
                <input type="number" min={0} value={form.turnaround_hours ?? ''}
                  onChange={(e) => setForm({ ...form, turnaround_hours: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Reference Range</label>
                <input value={form.reference_range} onChange={(e) => setForm({ ...form, reference_range: e.target.value })}
                  placeholder="e.g. 4.0 - 11.0"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              <div className="col-span-2 pt-2 border-t border-slate-100">
                <label className="block text-sm font-medium text-slate-700 mb-1">Report Template</label>
                <p className="text-xs text-slate-500 mb-2">
                  Optional. For tests with multiple parameters (e.g. CBC), list each one here — lab staff will get a
                  pre-filled results table for this test instead of a single value.
                </p>
                <div className="space-y-2">
                  {templateRows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input value={row.name} onChange={(e) => setTemplateRow(idx, { name: e.target.value })}
                        placeholder="Parameter name"
                        className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      <input value={row.unit || ''} onChange={(e) => setTemplateRow(idx, { unit: e.target.value })}
                        placeholder="Unit"
                        className="w-24 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      <input value={row.reference_range || ''} onChange={(e) => setTemplateRow(idx, { reference_range: e.target.value })}
                        placeholder="Reference range"
                        className="w-32 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      <input value={row.section || ''} onChange={(e) => setTemplateRow(idx, { section: e.target.value })}
                        placeholder="Section (optional)"
                        className="w-32 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      <button type="button" onClick={() => removeTemplateRow(idx)} className="text-slate-400 hover:text-red-600 p-1" title="Remove">
                        <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addTemplateRow}
                  className="mt-2 text-xs font-medium text-primary hover:underline flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">add</span> Add Parameter
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {panelModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{editingPanel ? 'Edit Package' : 'Add Package'}</h2>
              <button onClick={() => setPanelModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Package Name *</label>
                <input value={panelForm.name} onChange={(e) => setPanelForm({ ...panelForm, name: e.target.value })}
                  placeholder="e.g. MHC (Master Health Checkup)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Code *</label>
                <input value={panelForm.code} onChange={(e) => setPanelForm({ ...panelForm, code: e.target.value })}
                  placeholder="e.g. MHC"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              <div className="col-span-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">Tests Included *</label>
                  {panelForm.test_ids.length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-bold rounded-lg bg-primary/10 text-primary">
                      {panelForm.test_ids.length} selected
                    </span>
                  )}
                </div>
                {panelTestGroups.length === 0 ? (
                  <p className="text-sm text-slate-400">No active tests in the catalog yet — add some under the Tests tab first.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-3">
                    {panelTestGroups.map(({ category, tests: groupTests }) => {
                      const groupIds = groupTests.map((t) => t.id);
                      const allChecked = groupIds.length > 0 && groupIds.every((id) => panelForm.test_ids.includes(id));
                      return (
                        <div key={category}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">{category}</div>
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-primary cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={allChecked}
                                onChange={() => setPanelForm((prev) => ({
                                  ...prev,
                                  test_ids: allChecked
                                    ? prev.test_ids.filter((id) => !groupIds.includes(id))
                                    : [...new Set([...prev.test_ids, ...groupIds])],
                                }))}
                                className="accent-primary"
                              />
                              Select all
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {groupTests.map((t) => (
                              <label key={t.id}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                                  panelForm.test_ids.includes(t.id) ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40'
                                }`}>
                                <input type="checkbox" checked={panelForm.test_ids.includes(t.id)}
                                  onChange={() => togglePanelTest(t.id)} className="accent-primary" />
                                <span className="truncate">{t.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setPanelModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleSavePanel} disabled={panelSaving}
                className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {panelSaving ? 'Saving...' : editingPanel ? 'Save Changes' : 'Add Package'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabTestCatalog;
