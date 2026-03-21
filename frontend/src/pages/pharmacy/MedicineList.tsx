import React, { useState, useEffect, useCallback, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import pharmacyService from '../../services/pharmacyService';
import type { Medicine, MedicineCreateData } from '../../types/pharmacy';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'syrup', label: 'Syrup' },
  { value: 'injection', label: 'Injection' },
  { value: 'cream', label: 'Cream' },
  { value: 'ointment', label: 'Ointment' },
  { value: 'drops', label: 'Drops' },
  { value: 'inhaler', label: 'Inhaler' },
  { value: 'powder', label: 'Powder' },
  { value: 'other', label: 'Other' },
];

const TEMPLATE_UNITS = ['Nos', 'Strip', 'Bottle', 'Box', 'Tube', 'Vial', 'Ampoule', 'Sachet', 'Pack'];
const TEMPLATE_SCHEDULES = ['OTC', 'H', 'H1', 'X'];
const VALID_CATEGORIES = CATEGORY_OPTIONS.filter((opt) => opt.value).map((opt) => opt.value);

const formatCategory = (value?: string | null) => {
  if (!value) return '—';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const MedicineList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const deferredSearch = useDeferredValue(search);
  const isPharmacist = user?.roles?.includes('pharmacist') ?? false;

  const fetchMedicines = useCallback(async () => {
    setLoading(true);
    try {
      const result = await pharmacyService.getMedicines(page, 20, deferredSearch, category);
      setMedicines(result.data);
      setTotalPages(result.total_pages);
      setTotal(result.total);
    } catch {
      setMedicines([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, deferredSearch, category]);

  useEffect(() => {
    fetchMedicines();
  }, [fetchMedicines]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      setSearch((current) => (current === nextSearch ? current : nextSearch));
      setPage(1);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategory('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(search || category);

  const handleDownloadMedicineTemplate = () => {
    const medicineHeaders = [
      'name',
      'generic_name',
      'brand',
      'category',
      'dosage_form',
      'strength',
      'manufacturer',
      'hsn_code',
      'sku',
      'barcode',
      'unit',
      'description',
      'reorder_level',
      'max_stock_level',
      'requires_prescription',
      'schedule_type',
      'rack_location',
      'storage_conditions',
      'drug_interaction_notes',
      'side_effects',
    ];
    const guideRows = [
      {
        field: 'category',
        allowed_values: CATEGORY_OPTIONS.filter((o) => o.value).map((o) => o.value).join(', '),
      },
      {
        field: 'unit',
        allowed_values: TEMPLATE_UNITS.join(', '),
      },
      {
        field: 'schedule_type',
        allowed_values: TEMPLATE_SCHEDULES.join(', '),
      },
      {
        field: 'requires_prescription',
        allowed_values: 'true/false, yes/no, 1/0',
      },
      {
        field: 'required_field',
        allowed_values: 'name is mandatory; all others optional',
      },
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([medicineHeaders]);
    const guideSheet = XLSX.utils.json_to_sheet(guideRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Medicines');
    XLSX.utils.book_append_sheet(workbook, guideSheet, 'Field Guide');
    XLSX.writeFile(workbook, 'medicine_bulk_template.xlsx');
  };

  const toBoolean = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value;
    const text = String(value ?? '').trim().toLowerCase();
    return ['true', 'yes', '1', 'y'].includes(text);
  };

  const asOptionalText = (value: unknown): string | undefined => {
    const text = String(value ?? '').trim();
    return text || undefined;
  };

  const asOptionalNumber = (value: unknown): number | undefined => {
    const text = String(value ?? '').trim();
    if (!text) return undefined;
    const num = Number(text);
    if (!Number.isFinite(num) || num < 0) return undefined;
    return num;
  };

  const isLikelyStrengthValue = (value: string): boolean => {
    const text = value.trim().toLowerCase();
    if (!text) return false;
    // More permissive regex to catch various strength formats
    return /^\d+(\.\d+)?\s*(mg|g|mcg|ml|l|iu|units?|%|x)?$/i.test(text);
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

      const rowErrors: string[] = [];

      const payloads = rows
        .map((row, index): MedicineCreateData | null => {
          const rowNumber = index + 2; // +2 because row 1 is header
          const name = String(row.name ?? '').trim();
          if (!name) {
            rowErrors.push(`Row ${rowNumber}: 'name' is required.`);
            return null;
          }

          let categoryValue = String(row.category ?? '').trim();
          let strengthValue = asOptionalText(row.strength);
          const reorderLevel = Number(row.reorder_level ?? 10);
          const scheduleType = String(row.schedule_type ?? '').trim().toUpperCase();
          const unitValue = String(row.unit ?? '').trim();

          // Auto-correct common data-entry issue where strength is entered in category column.
          // Check if category looks like a strength value (e.g., "500mg", "10mg", "500 mg")
          const categoryLower = categoryValue.toLowerCase();
          if (categoryValue && !VALID_CATEGORIES.includes(categoryLower) && isLikelyStrengthValue(categoryValue)) {
            // Move strength to correct field
            if (!strengthValue) {
              strengthValue = categoryValue;
            }
            categoryValue = '';
          }

          // Validate category after auto-correction
          if (categoryValue && !VALID_CATEGORIES.includes(categoryValue.toLowerCase())) {
            rowErrors.push(`Row ${rowNumber}: invalid category '${categoryValue}'. Valid categories: ${VALID_CATEGORIES.join(', ')}.`);
            return null;
          }

          if (unitValue && !TEMPLATE_UNITS.includes(unitValue)) {
            rowErrors.push(`Row ${rowNumber}: invalid unit '${unitValue}'.`);
            return null;
          }

          if (scheduleType && !TEMPLATE_SCHEDULES.includes(scheduleType)) {
            rowErrors.push(`Row ${rowNumber}: invalid schedule_type '${scheduleType}'.`);
            return null;
          }

          return {
            name,
            generic_name: asOptionalText(row.generic_name),
            brand: asOptionalText(row.brand),
            category: categoryValue.toLowerCase() || undefined,  // Normalize to lowercase
            dosage_form: asOptionalText(row.dosage_form),
            strength: strengthValue,
            manufacturer: asOptionalText(row.manufacturer),
            hsn_code: asOptionalText(row.hsn_code),
            sku: asOptionalText(row.sku),
            barcode: asOptionalText(row.barcode),
            unit: unitValue || 'Nos',
            description: asOptionalText(row.description),
            reorder_level: Number.isFinite(reorderLevel) && reorderLevel >= 0 ? reorderLevel : 10,
            max_stock_level: asOptionalNumber(row.max_stock_level),
            requires_prescription: toBoolean(row.requires_prescription),
            schedule_type: TEMPLATE_SCHEDULES.includes(scheduleType) ? scheduleType : undefined,
            rack_location: asOptionalText(row.rack_location),
            storage_conditions: asOptionalText(row.storage_conditions),
            drug_interaction_notes: asOptionalText(row.drug_interaction_notes),
            side_effects: asOptionalText(row.side_effects),
          };
        })
        .filter((item): item is MedicineCreateData => Boolean(item));

      if (rowErrors.length > 0) {
        const preview = rowErrors.slice(0, 5).join(' ');
        const suffix = rowErrors.length > 5 ? ` (+${rowErrors.length - 5} more)` : '';
        const hint = ' Valid categories: tablet, capsule, syrup, injection, cream, ointment, drops, inhaler, powder, other.';
        toast.error(`Template validation failed. ${preview}${suffix}.${hint}`);
        return;
      }

      if (payloads.length === 0) {
        toast.error('No valid rows found. Use the medicine template format.');
        return;
      }

      const results = await Promise.allSettled(payloads.map((payload) => pharmacyService.createMedicine(payload)));
      const createdCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.length - createdCount;

      if (createdCount > 0) {
        toast.success(`Created ${createdCount} medicine(s)${failedCount ? `, failed ${failedCount}` : ''}`);
        fetchMedicines();
      } else {
        toast.error('Bulk upload failed for all rows. Please verify the template and required fields.');
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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Medicine Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">Browse, search, and narrow your inventory with live filters.</p>
        </div>
        {!isPharmacist && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={handleDownloadMedicineTemplate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <span className="material-symbols-outlined text-base">download</span>
              Download Template
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
              onClick={() => navigate('/pharmacy/medicines/new')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Add Medicine
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearch} className="flex-1 min-w-[220px]">
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                <span className="material-symbols-outlined text-lg">search</span>
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by medicine name, generic, SKU, or barcode"
                className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </form>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="min-w-[220px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Active:</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1">Search: {search || 'All'}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1">
            Category: {CATEGORY_OPTIONS.find((option) => option.value === category)?.label || 'All Categories'}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Generic</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Strength</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                  </td>
                </tr>
              ) : medicines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">No medicines found</td>
                </tr>
              ) : medicines.map((med) => (
                <tr key={med.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/pharmacy/medicines/${med.id}`)}>
                  <td className="px-4 py-3 font-medium text-slate-900">{med.name}</td>
                  <td className="px-4 py-3 text-slate-600">{med.generic_name || '—'}</td>
                  <td className="px-4 py-3">
                    {med.category ? (
                      <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {formatCategory(med.category)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{med.strength || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{med.unit || med.unit_of_measure || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${(med.total_stock ?? 0) < 10 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {med.total_stock ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => navigate(`/pharmacy/medicines/${med.id}/edit`)}
                      className="text-slate-400 hover:text-primary transition-colors">
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
            <span>{total} medicines total</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40">Prev</button>
              <span className="px-3 py-1">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MedicineList;
