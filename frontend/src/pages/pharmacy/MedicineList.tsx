import React, { useState, useEffect, useCallback, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import pharmacyService from '../../services/pharmacyService';
import type { Medicine, MedicineCreateData, BatchCreateData } from '../../types/pharmacy';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateOnly } from '../../utils/calendarDate';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'syrup', label: 'Syrup' },
  { value: 'injection', label: 'Injection' },
  { value: 'cream', label: 'Cream' },
  { value: 'ointment', label: 'Ointment' },
  { value: 'drops', label: 'Drops' },
  // Eye hospital — distinct from generic "Drops"/"Ointment" so dispensing
  // quantity calc recognizes them specifically (see MedicineForm.tsx).
  { value: 'eye drops', label: 'Eye Drops' },
  { value: 'eye ointment', label: 'Eye Ointment' },
  { value: 'inhaler', label: 'Inhaler' },
  { value: 'powder', label: 'Powder' },
  { value: 'other', label: 'Other' },
];

const TEMPLATE_UNITS = ['Nos', 'Strip', 'Bottle', 'Box', 'Tube', 'Vial', 'Ampoule', 'Sachet', 'Pack'];
const TEMPLATE_SCHEDULES = ['OTC', 'H', 'H1', 'X'];
const VALID_CATEGORIES = CATEGORY_OPTIONS.filter((opt) => opt.value).map((opt) => opt.value);

const MedicineList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { isEyeHospitalFeatureEnabled } = useAuth();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('');
  const [stockFilter, setStockFilter] = useState<'' | 'ok' | 'low' | 'out'>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const deferredSearch = useDeferredValue(search);

  // Stock-status filter applies to the loaded page (stock is computed server-
  // side per page, so a cross-page stock filter would need a backend param —
  // fine for the typical single-hospital catalog size).
  const filteredMedicines = stockFilter
    ? medicines.filter((med) => {
        const qty = med.total_stock ?? 0;
        const safety = med.reorder_level ?? 10;
        const status = qty === 0 ? 'out' : qty <= safety ? 'low' : 'ok';
        return status === stockFilter;
      })
    : medicines;

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
    setStockFilter('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(search || category || stockFilter);

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
      'batch_number',
      'mfg_date',
      'expiry_date',
      'quantity',
      'purchase_price',
      'selling_price',
      'mrp',
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
        field: 'quantity',
        allowed_values: 'Opening stock for this medicine. Leave blank or 0 to create the medicine with no stock batch.',
      },
      {
        field: 'expiry_date',
        allowed_values: 'Format YYYY-MM-DD. Required only when quantity is greater than 0.',
      },
      {
        field: 'batch_number / mfg_date',
        allowed_values: 'Optional. batch_number is auto-generated when left blank.',
      },
      {
        field: 'purchase_price / selling_price / mrp',
        allowed_values: 'Optional opening-batch pricing. Defaults to 0 when left blank.',
      },
      {
        field: 'required_field',
        allowed_values: 'name is mandatory; all others optional',
      },
    ];

    // Eye hospitals get two filled-in example rows showing the "Eye Drops" /
    // "Eye Ointment" categories in use, so the new categories aren't just
    // names in the Field Guide — general hospitals get a blank template.
    const eyeExampleRows = isEyeHospitalFeatureEnabled
      ? [
          {
            name: 'Tropicamide Eye Drops', generic_name: 'Tropicamide', category: 'eye drops',
            strength: '0.8%', unit: 'Bottle', requires_prescription: 'true',
          },
          {
            name: 'Moxifloxacin Eye Ointment', generic_name: 'Moxifloxacin', category: 'eye ointment',
            strength: '0.5%', unit: 'Tube', requires_prescription: 'true',
          },
        ]
      : [];
    const exampleRows = eyeExampleRows.map((row) =>
      medicineHeaders.map((h) => (row as Record<string, string>)[h] ?? '')
    );

    const worksheet = XLSX.utils.aoa_to_sheet([medicineHeaders, ...exampleRows]);
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

  // Excel date-formatted cells arrive as Date objects (cellDates:true below); plain
  // text cells arrive as strings. Normalize both to YYYY-MM-DD for the batch API.
  const asDateString = (value: unknown): string | undefined => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const text = String(value ?? '').trim();
    if (!text) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
  };

  const handleBulkMedicineUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      // cellDates:true so Excel date-formatted cells parse as JS Date objects
      // instead of raw serial numbers (needed for expiry_date/mfg_date below).
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (rows.length === 0) {
        toast.error('Uploaded file is empty');
        return;
      }

      const rowErrors: string[] = [];

      type BulkRow = {
        medicine: MedicineCreateData;
        batch: Omit<BatchCreateData, 'medicine_id'> | null;
      };

      const parsedRows = rows
        .map((row, index): BulkRow | null => {
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

          // Be lenient: category, unit and schedule are coerced to safe values rather
          // than aborting the whole upload. Unknown categories (e.g. therapeutic classes
          // like "Analgesic") are kept as-is; unknown units fall back to a default and
          // unknown schedules are dropped — so one odd cell never blocks the import.
          const matchedUnit = TEMPLATE_UNITS.find((u) => u.toLowerCase() === unitValue.toLowerCase());

          const medicine: MedicineCreateData = {
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
            unit: matchedUnit || 'Nos',
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

          // Opening stock is optional and only attempted when a quantity is supplied —
          // without this, every bulk-uploaded medicine would land with zero stock and
          // zero price, indistinguishable from a catalog-only placeholder.
          const quantity = Math.floor(asOptionalNumber(row.quantity) ?? 0);
          let batch: Omit<BatchCreateData, 'medicine_id'> | null = null;
          if (quantity > 0) {
            const expiryDate = asDateString(row.expiry_date);
            if (!expiryDate) {
              rowErrors.push(`Row ${rowNumber}: 'expiry_date' is required when 'quantity' is provided.`);
              return null;
            }
            batch = {
              batch_number: asOptionalText(row.batch_number) || `BULK-${rowNumber}-${Date.now().toString(36)}`,
              mfg_date: asDateString(row.mfg_date),
              expiry_date: expiryDate,
              quantity,
              purchase_price: asOptionalNumber(row.purchase_price) ?? 0,
              selling_price: asOptionalNumber(row.selling_price) ?? 0,
              mrp: asOptionalNumber(row.mrp),
            };
          }

          return { medicine, batch };
        })
        .filter((item): item is BulkRow => Boolean(item));

      if (rowErrors.length > 0) {
        const preview = rowErrors.slice(0, 5).join(' ');
        const suffix = rowErrors.length > 5 ? ` (+${rowErrors.length - 5} more)` : '';
        const hint = ' Valid categories: tablet, capsule, syrup, injection, cream, ointment, drops, inhaler, powder, other.';
        toast.error(`Template validation failed. ${preview}${suffix}.${hint}`);
        return;
      }

      if (parsedRows.length === 0) {
        toast.error('No valid rows found. Use the medicine template format.');
        return;
      }

      const medicineResults = await Promise.allSettled(
        parsedRows.map((row) => pharmacyService.createMedicine(row.medicine))
      );
      const failedCount = medicineResults.filter((r) => r.status === 'rejected').length;

      // Opening-stock batches must be created after the medicine exists (they need its
      // generated id), so this runs as a second pass over the medicines that succeeded.
      let createdCount = 0;
      let stockedCount = 0;
      let stockFailedCount = 0;
      const batchJobs: Promise<void>[] = [];
      medicineResults.forEach((result, i) => {
        if (result.status !== 'fulfilled') return;
        createdCount += 1;
        const batchInfo = parsedRows[i].batch;
        if (!batchInfo) return;
        batchJobs.push(
          pharmacyService
            .createBatch({ ...batchInfo, medicine_id: result.value.id })
            .then(() => { stockedCount += 1; })
            .catch(() => { stockFailedCount += 1; })
        );
      });
      await Promise.allSettled(batchJobs);

      if (createdCount > 0) {
        const stockNote = stockedCount > 0 ? `, ${stockedCount} with opening stock` : '';
        const stockFailNote = stockFailedCount > 0 ? `, ${stockFailedCount} opening-stock batch(es) failed` : '';
        toast.success(`Created ${createdCount} medicine(s)${stockNote}${stockFailNote}${failedCount ? `, failed ${failedCount}` : ''}`);
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
        {/* Pharmacists manage the medicine catalog day-to-day — they get the
            same Add/Bulk Upload/Template tools as admins (BUG-22). */}
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

            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as '' | 'ok' | 'low' | 'out')}
              className="min-w-[160px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="">All Stock Status</option>
              <option value="ok">In Stock</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
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

      {/* Mecandria ERP reference layout (BUG-33): Code | Product Name | Batch No |
          MFG Date | EXP Date | HSN | Current Qty | MRP Value | Safety Stock |
          Min Stock | Status. Generic/category/strength moved to the View
          detail screen — they cluttered the operational list (BUG-32). Safety
          Stock and Min Stock both read from reorder_level — the schema has
          one reorder threshold today, not two independent floors. */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-3 py-3 text-center">Code</th>
                <th className="px-3 py-3 text-center">Product Name</th>
                <th className="px-3 py-3 text-center">Batch No</th>
                <th className="px-3 py-3 text-center">MFG Date</th>
                <th className="px-3 py-3 text-center">EXP Date</th>
                <th className="px-3 py-3 text-center">HSN</th>
                <th className="px-3 py-3 text-center">Current Qty</th>
                <th className="px-3 py-3 text-center bg-amber-50">MRP Value</th>
                <th className="px-3 py-3 text-center">Safety Stock</th>
                <th className="px-3 py-3 text-center">Min Stock</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                  </td>
                </tr>
              ) : filteredMedicines.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-slate-400">No medicines found</td>
                </tr>
              ) : filteredMedicines.map((med) => {
                const qty = med.total_stock ?? 0;
                const safety = med.reorder_level ?? 10;
                const status = qty === 0 ? 'out' : qty <= safety ? 'low' : 'ok';
                return (
                <tr key={med.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/pharmacy/medicines/${med.id}`)}>
                  <td className="px-3 py-3 font-mono text-xs text-slate-500">{med.sku || '—'}</td>
                  <td className="px-3 py-3 font-medium text-slate-900">{med.name}</td>
                  <td className="px-3 py-3 text-slate-600">{med.earliest_batch_number || '—'}</td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{med.earliest_mfg_date ? formatDateOnly(med.earliest_mfg_date) : '—'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {med.earliest_expiry_date ? (
                      <span className={new Date(med.earliest_expiry_date) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) ? 'text-amber-700 font-semibold' : 'text-slate-600'}>
                        {formatDateOnly(med.earliest_expiry_date)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{med.hsn_code || '—'}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`font-semibold ${status === 'out' ? 'text-red-500' : status === 'low' ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {qty}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-amber-800 bg-amber-50/60">
                    {med.earliest_mrp != null ? `₹${Number(med.earliest_mrp).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-slate-600">{safety}</td>
                  <td className="px-3 py-3 text-center text-slate-600">{safety}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      status === 'out' ? 'bg-red-100 text-red-700' : status === 'low' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {status === 'out' ? 'Out of Stock' : status === 'low' ? 'Low Stock' : 'In Stock'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => navigate(`/pharmacy/medicines/${med.id}/edit`)}
                      className="text-slate-400 hover:text-primary transition-colors">
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                  </td>
                </tr>
                );
              })}
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
