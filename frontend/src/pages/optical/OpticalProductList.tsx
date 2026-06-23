import React, { useState, useEffect, useCallback, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import opticalService from '../../services/opticalService';
import type { OpticalProduct, OpticalProductCreateData, OpticalBatchCreateData } from '../../types/optical';
import { useToast } from '../../contexts/ToastContext';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'frame', label: 'Frame' },
  { value: 'lens', label: 'Lens' },
  { value: 'contact_lens', label: 'Contact Lens' },
  { value: 'solution', label: 'Solution' },
  { value: 'accessory', label: 'Accessory' },
];

const VALID_CATEGORIES = CATEGORY_OPTIONS.filter((opt) => opt.value).map((opt) => opt.value);
// Only contact lenses meaningfully expire — frames/solutions/accessories don't.
const EXPIRING_CATEGORIES = ['contact_lens'];

const formatCategory = (value?: string | null) => {
  if (!value) return '—';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const OpticalProductList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [products, setProducts] = useState<OpticalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const deferredSearch = useDeferredValue(search);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await opticalService.getProducts(page, 20, deferredSearch, category);
      setProducts(result.data);
      setTotalPages(result.total_pages);
      setTotal(result.total);
    } catch {
      setProducts([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, deferredSearch, category]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

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

  const handleDownloadProductTemplate = () => {
    const headers = [
      'name', 'category', 'brand', 'model_number', 'color', 'material', 'size', 'gender',
      'sku', 'barcode', 'selling_price', 'purchase_price', 'reorder_level',
      'lens_type', 'lens_index', 'lens_coating',
      'batch_number', 'mfg_date', 'expiry_date', 'quantity', 'purchase_price', 'selling_price', 'mrp',
    ];
    const guideRows = [
      { field: 'category', allowed_values: VALID_CATEGORIES.join(', ') },
      { field: 'gender', allowed_values: 'unisex, male, female, kids' },
      { field: 'quantity', allowed_values: 'Opening stock for this product. Leave blank or 0 to create the product with no stock batch.' },
      { field: 'expiry_date', allowed_values: "Format YYYY-MM-DD. Required only for category='contact_lens' when quantity is greater than 0; optional for frames/solutions/accessories which don't expire." },
      { field: 'batch_number / mfg_date', allowed_values: 'Optional. batch_number is auto-generated when left blank.' },
      { field: 'purchase_price / selling_price / mrp', allowed_values: 'Optional opening-batch pricing. Defaults to 0 when left blank.' },
      { field: 'required_field', allowed_values: 'name and category are mandatory; all others optional' },
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    const guideSheet = XLSX.utils.json_to_sheet(guideRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    XLSX.utils.book_append_sheet(workbook, guideSheet, 'Field Guide');
    XLSX.writeFile(workbook, 'optical_product_bulk_template.xlsx');
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

  const handleBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (rows.length === 0) {
        toast.error('Uploaded file is empty');
        return;
      }

      const rowErrors: string[] = [];

      type BulkRow = {
        product: OpticalProductCreateData;
        batch: Omit<OpticalBatchCreateData, 'product_id'> | null;
      };

      const parsedRows = rows
        .map((row, index): BulkRow | null => {
          const rowNumber = index + 2; // +2 because row 1 is header
          const name = String(row.name ?? '').trim();
          if (!name) {
            rowErrors.push(`Row ${rowNumber}: 'name' is required.`);
            return null;
          }

          const categoryValue = String(row.category ?? '').trim().toLowerCase();
          if (!categoryValue || !VALID_CATEGORIES.includes(categoryValue)) {
            rowErrors.push(`Row ${rowNumber}: 'category' must be one of ${VALID_CATEGORIES.join(', ')}.`);
            return null;
          }

          const reorderLevel = Number(row.reorder_level ?? 5);

          const product: OpticalProductCreateData = {
            name,
            category: categoryValue,
            brand: asOptionalText(row.brand),
            model_number: asOptionalText(row.model_number),
            color: asOptionalText(row.color),
            material: asOptionalText(row.material),
            size: asOptionalText(row.size),
            gender: asOptionalText(row.gender),
            sku: asOptionalText(row.sku),
            barcode: asOptionalText(row.barcode),
            selling_price: asOptionalNumber(row.selling_price) ?? 0,
            purchase_price: asOptionalNumber(row.purchase_price),
            reorder_level: Number.isFinite(reorderLevel) && reorderLevel >= 0 ? reorderLevel : 5,
            lens_type: asOptionalText(row.lens_type),
            lens_index: asOptionalText(row.lens_index),
            lens_coating: asOptionalText(row.lens_coating),
          };

          // Opening stock is optional and only attempted when a quantity is supplied —
          // without this, every bulk-uploaded product would land with zero stock.
          const quantity = Math.floor(asOptionalNumber(row.quantity) ?? 0);
          let batch: Omit<OpticalBatchCreateData, 'product_id'> | null = null;
          if (quantity > 0) {
            const expiryDate = asDateString(row.expiry_date);
            if (!expiryDate && EXPIRING_CATEGORIES.includes(categoryValue)) {
              rowErrors.push(`Row ${rowNumber}: 'expiry_date' is required for category '${categoryValue}' when 'quantity' is provided.`);
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

          return { product, batch };
        })
        .filter((item): item is BulkRow => Boolean(item));

      if (rowErrors.length > 0) {
        const preview = rowErrors.slice(0, 5).join(' ');
        const suffix = rowErrors.length > 5 ? ` (+${rowErrors.length - 5} more)` : '';
        toast.error(`Template validation failed. ${preview}${suffix}`);
        return;
      }

      if (parsedRows.length === 0) {
        toast.error('No valid rows found. Use the optical product template format.');
        return;
      }

      const productResults = await Promise.allSettled(
        parsedRows.map((row) => opticalService.createProduct(row.product))
      );
      const failedCount = productResults.filter((r) => r.status === 'rejected').length;

      // Opening-stock batches must be created after the product exists (they need its
      // generated id), so this runs as a second pass over the products that succeeded.
      let createdCount = 0;
      let stockedCount = 0;
      let stockFailedCount = 0;
      const batchJobs: Promise<void>[] = [];
      productResults.forEach((result, i) => {
        if (result.status !== 'fulfilled') return;
        createdCount += 1;
        const batchInfo = parsedRows[i].batch;
        if (!batchInfo) return;
        batchJobs.push(
          opticalService
            .createBatch({ ...batchInfo, product_id: result.value.id })
            .then(() => { stockedCount += 1; })
            .catch(() => { stockFailedCount += 1; })
        );
      });
      await Promise.allSettled(batchJobs);

      if (createdCount > 0) {
        const stockNote = stockedCount > 0 ? `, ${stockedCount} with opening stock` : '';
        const stockFailNote = stockFailedCount > 0 ? `, ${stockFailedCount} opening-stock batch(es) failed` : '';
        toast.success(`Created ${createdCount} product(s)${stockNote}${stockFailNote}${failedCount ? `, failed ${failedCount}` : ''}`);
        fetchProducts();
      } else {
        toast.error('Bulk upload failed for all rows. Please verify the template and required fields.');
      }
    } catch (err) {
      console.error('Optical product bulk upload parse error:', err);
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
          <h1 className="text-2xl font-bold text-slate-900">Optical Products</h1>
          <p className="mt-1 text-sm text-slate-500">Frames, lenses, contact lenses, solutions, and accessories.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={handleDownloadProductTemplate}
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
              onChange={handleBulkUpload}
              disabled={bulkUploading}
            />
          </label>
          <button
            onClick={() => navigate('/optical/products/new')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Product
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
                placeholder="Search by product name, brand, SKU, or barcode"
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
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Color/Size</th>
                <th className="px-4 py-3 text-right">Price</th>
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
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">No optical products found</td>
                </tr>
              ) : products.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/optical/products/${product.id}`)}>
                  <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                  <td className="px-4 py-3 text-slate-600">{product.brand || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {formatCategory(product.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{[product.color, product.size].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">₹{Number(product.selling_price ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${(product.total_stock ?? 0) <= (product.reorder_level ?? 5) ? 'text-red-500' : 'text-emerald-600'}`}>
                      {product.total_stock ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => navigate(`/optical/products/${product.id}/edit`)}
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
            <span>{total} products total</span>
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

export default OpticalProductList;
