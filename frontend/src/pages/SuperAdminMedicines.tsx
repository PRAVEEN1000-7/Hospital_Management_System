import React, { useEffect, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Pill, Plus, Search, Edit, Trash2, X, Save } from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

interface Medicine {
  id: string;
  name: string;
  generic_name: string;
  category: string | null;
  manufacturer: string | null;
  strength: string | null;
  unit_of_measure: string;
  units_per_pack: number;
  requires_prescription: boolean;
  is_controlled: boolean;
  is_active: boolean;
}

const CATEGORIES = ['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'ointment', 'inhaler', 'powder', 'suspension'];
const UNITS = ['strip', 'bottle', 'tube', 'vial', 'box', 'sachet', 'piece'];

const emptyForm = () => ({
  name: '',
  generic_name: '',
  category: 'tablet',
  manufacturer: '',
  strength: '',
  unit_of_measure: 'strip',
  units_per_pack: 1,
  requires_prescription: true,
  is_controlled: false,
});

const SuperAdminMedicines: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [form, setForm] = useState<ReturnType<typeof emptyForm>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await superAdminApi.getCommonMedicines({ limit: 200, search: search || undefined });
      setMedicines(res.data.data ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      setMedicines([]);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (m: Medicine) => {
    setEditing(m);
    setForm({
      name: m.name,
      generic_name: m.generic_name,
      category: m.category || 'tablet',
      manufacturer: m.manufacturer || '',
      strength: m.strength || '',
      unit_of_measure: m.unit_of_measure || 'strip',
      units_per_pack: m.units_per_pack || 1,
      requires_prescription: m.requires_prescription,
      is_controlled: m.is_controlled,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.generic_name.trim()) {
      toast.error('Name and generic name are required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await superAdminApi.updateCommonMedicine(editing.id, form);
        toast.success('Common medicine updated');
      } else {
        await superAdminApi.createCommonMedicine(form);
        toast.success('Common medicine added');
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save medicine');
    }
    setSaving(false);
  };

  const handleDelete = async (m: Medicine) => {
    const ok = await confirm({
      title: 'Deactivate Medicine',
      message: `Deactivate "${m.name}"? Hospitals will no longer see it in the common formulary.`,
      confirmLabel: 'Deactivate',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await superAdminApi.deleteCommonMedicine(m.id);
      toast.success('Medicine deactivated');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to deactivate');
    }
  };

  const handleDownloadMedicineTemplate = () => {
    const medicineHeaders = [
      'name',
      'generic_name',
      'category',
      'manufacturer',
      'strength',
      'unit_of_measure',
      'units_per_pack',
      'selling_price',
      'purchase_price',
      'tax_config_id',
      'reorder_level',
    ];
    const guideRows = [
      {
        field: 'category',
        allowed_values: CATEGORIES.join(', '),
      },
      {
        field: 'unit_of_measure',
        allowed_values: UNITS.join(', '),
      },
      {
        field: 'required_field',
        allowed_values: 'name and generic_name are mandatory; others optional',
      },
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([medicineHeaders]);
    const guideSheet = XLSX.utils.json_to_sheet(guideRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Medicines');
    XLSX.utils.book_append_sheet(workbook, guideSheet, 'Field Guide');
    XLSX.writeFile(workbook, 'common_medicine_template.xlsx');
  };

  const handleBulkMedicineUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (rows.length === 0) {
        toast.error('Uploaded file is empty');
        return;
      }

      const payloads = rows.map((row) => {
        const categoryValue = String(row.category ?? '').trim().toLowerCase();
        const unitValue = String(row.unit_of_measure ?? '').trim().toLowerCase();
        const unitsPerPack = Number(row.units_per_pack ?? 1);
        const sellingPrice = Number(row.selling_price ?? 0);
        const purchasePrice = row.purchase_price ? Number(row.purchase_price) : undefined;
        const reorderLevel = Number(row.reorder_level ?? 10);

        return {
          name: String(row.name ?? '').trim(),
          generic_name: String(row.generic_name ?? '').trim(),
          category: String(row.category ?? '').trim() || undefined,
          manufacturer: String(row.manufacturer ?? '').trim() || undefined,
          strength: String(row.strength ?? '').trim() || undefined,
          unit_of_measure: UNITS.includes(unitValue) ? unitValue : 'strip',
          units_per_pack: Number.isFinite(unitsPerPack) && unitsPerPack > 0 ? unitsPerPack : 1,
          selling_price: Number.isFinite(sellingPrice) && sellingPrice >= 0 ? sellingPrice : 0,
          purchase_price: purchasePrice !== undefined && Number.isFinite(purchasePrice) && purchasePrice >= 0 ? purchasePrice : undefined,
          tax_config_id: String(row.tax_config_id ?? '').trim() || undefined,
          reorder_level: Number.isFinite(reorderLevel) && reorderLevel >= 0 ? reorderLevel : 10,
          requires_prescription: true,
          is_controlled: false,
        };
      }).filter(item => item.name && item.generic_name);

      if (payloads.length === 0) {
        toast.error('No valid rows found. Please ensure name and generic_name are provided.');
        return;
      }

      const results = await Promise.allSettled(payloads.map((payload) => superAdminApi.createCommonMedicine(payload as any)));
      const createdCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.length - createdCount;

      if (createdCount > 0) {
        toast.success(`Created ${createdCount} medicine(s)${failedCount ? `, failed ${failedCount}` : ''}`);
        load();
      } else {
        toast.error('Bulk upload failed for all rows.');
      }
    } catch (err) {
      console.error('Medicine bulk upload parse error:', err);
      toast.error('Failed to parse file. Please upload a valid CSV or Excel file.');
    } finally {
      setBulkUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Common Medicines</h1>
          <p className="text-slate-500 text-sm mt-1">
            Shared formulary available to every hospital — used by hospitals without the inventory module
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadMedicineTemplate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <span className="material-symbols-outlined text-base">download</span>
            Template
          </button>
          <label className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-base">upload_file</span>
            {bulkUploading ? 'Uploading...' : 'Bulk Upload'}
            <input
              type="file"
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
              className="hidden"
              onChange={handleBulkMedicineUpload}
              disabled={bulkUploading}
            />
          </label>
          <button
            onClick={openAdd}
            className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Medicine
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name, generic name or manufacturer…"
            className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          />
        </div>
        {total > 0 && <span className="text-xs text-slate-400">{total} medicine{total !== 1 ? 's' : ''}</span>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
          </div>
        ) : medicines.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Pill className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No common medicines yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Medicine</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Strength</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Unit</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {medicines.map(m => (
                  <tr key={m.id} className={`hover:bg-slate-50/50 transition-colors ${!m.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900">{m.name}</div>
                      <div className="text-xs text-slate-400">{m.generic_name}{m.manufacturer ? ` · ${m.manufacturer}` : ''}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 capitalize">{m.category || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600">{m.strength || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600">{m.unit_of_measure}</td>
                    <td className="px-5 py-3.5">
                      {m.is_active
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Active</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">Inactive</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(m)} title="Edit"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        {m.is_active && (
                          <button onClick={() => handleDelete(m)} title="Deactivate"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">{editing ? 'Edit Common Medicine' : 'Add Common Medicine'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Brand Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  placeholder="e.g. Crocin 500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Generic Name *</label>
                <input value={form.generic_name} onChange={e => setForm({ ...form, generic_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  placeholder="e.g. Paracetamol" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none capitalize">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Strength</label>
                <input value={form.strength} onChange={e => setForm({ ...form, strength: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  placeholder="e.g. 500mg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Unit of Measure</label>
                <select value={form.unit_of_measure} onChange={e => setForm({ ...form, unit_of_measure: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Manufacturer</label>
                <input value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  placeholder="Optional" />
              </div>
              <div className="sm:col-span-2 flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={form.requires_prescription}
                    onChange={e => setForm({ ...form, requires_prescription: e.target.checked })} />
                  Requires prescription
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={form.is_controlled}
                    onChange={e => setForm({ ...form, is_controlled: e.target.checked })} />
                  Controlled substance
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : editing ? 'Update' : 'Add Medicine'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminMedicines;
