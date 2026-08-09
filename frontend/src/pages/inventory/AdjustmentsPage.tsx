import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import pharmacyService from '../../services/pharmacyService';
import opticalService from '../../services/opticalService';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';
import type { StockAdjustment, StockAdjustmentCreate } from '../../types/inventory';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
};

const TYPE_LABELS: Record<string, string> = {
  increase: 'Increase',
  decrease: 'Decrease',
  write_off: 'Write Off',
};

interface CatalogItem {
  id: string;
  name: string;
  strength?: string | null;
  generic_name?: string | null;
  brand?: string | null;
  total_stock?: number | null;
}

const AdjustmentsPage: React.FC = () => {
  const toast = useToast();
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState<StockAdjustmentCreate>({
    item_type: 'medicine',
    item_id: '',
    adjustment_type: 'increase',
    quantity: 0,
    reason: '',
  });
  const [itemLabel, setItemLabel] = useState('');
  const [currentStock, setCurrentStock] = useState<number | null>(null);
  const [medicines, setMedicines] = useState<CatalogItem[]>([]);
  const [opticalProducts, setOpticalProducts] = useState<CatalogItem[]>([]);
  const [batches, setBatches] = useState<{ id: string; batch_number: string; quantity: number }[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  useEffect(() => {
    // Previously a silent .catch(() => {}) — if either catalog fails to load
    // (module not enabled for this hospital's subscription, a permission
    // gap, network error, etc.) the picker below just looked empty/broken
    // with no explanation, which is exactly what "can't select a medicine"
    // and "can't create an adjustment" look like from the outside. Surface
    // it so the real cause is visible instead of a mysteriously blank list.
    pharmacyService.getMedicines(1, 500).then(r => setMedicines(r.data)).catch((err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to load medicine catalog');
    });
    opticalService.getProducts(1, 500).then(r => setOpticalProducts(r.data)).catch((err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to load optical product catalog');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adjustments must reference a real catalog item — unlike POs/GRNs there's no
  // sensible "auto-create" for stock you're correcting, so the picker only offers
  // existing medicines/optical products (no free-text/manual-entry option).
  const itemSuggestions: SuggestionOption[] = (formData.item_type === 'medicine' ? medicines : opticalProducts).map(item => ({
    id: item.id,
    label: item.strength !== undefined ? `${item.name}${item.strength ? ` (${item.strength})` : ''}` : item.name,
    sublabel: item.generic_name || item.brand || undefined,
    metadata: { id: item.id, name: item.name, stock: item.total_stock ?? 0 },
  }));

  const fetchAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getAdjustments(page, 10, statusFilter || undefined);
      setAdjustments(res.data);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to load adjustments');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  useEffect(() => { fetchAdjustments(); }, [fetchAdjustments]);

  const resetForm = () => {
    setFormData({ item_type: 'medicine', item_id: '', adjustment_type: 'increase', quantity: 0, reason: '' });
    setItemLabel('');
    setCurrentStock(null);
    setBatches([]);
    setShowModal(false);
  };

  const [loadingStock, setLoadingStock] = useState(false);

  const handleItemSelect = async (value: string, metadata?: Record<string, unknown>) => {
    setItemLabel(value);
    if (!metadata || !metadata.id) {
      // Typed text that doesn't match a suggestion — no real item_id exists for it.
      setFormData(prev => ({ ...prev, item_id: '', batch_id: undefined }));
      setCurrentStock(null);
      setBatches([]);
      return;
    }

    const itemId = metadata.id as string;
    const itemType = formData.item_type as 'medicine' | 'optical_product';
    setFormData(prev => ({ ...prev, item_id: itemId, batch_id: undefined }));
    // Show the list snapshot immediately, then replace it with a live DB read —
    // this number directly informs how much to increase/decrease/write off, so
    // it must reflect stock right now, not whatever it was when the page loaded.
    setCurrentStock(typeof metadata.stock === 'number' ? metadata.stock : null);

    setBatches([]);
    setLoadingBatches(true);
    try {
      const rows = itemType === 'medicine'
        ? await pharmacyService.getBatches(itemId)
        : await opticalService.getBatches(itemId);
      setBatches(rows.map(b => ({ id: b.id, batch_number: b.batch_number, quantity: b.quantity })));
    } catch {
      // Batch selection is optional — a failed lookup shouldn't block the form.
    } finally {
      setLoadingBatches(false);
    }

    setLoadingStock(true);
    try {
      const liveStock = await inventoryService.getStockLevel(itemType, itemId);
      setCurrentStock(liveStock);
    } catch {
      // Keep the snapshot value if the live lookup fails.
    } finally {
      setLoadingStock(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.item_id) {
      toast.error('Please select an item from the list'); return;
    }
    if (formData.quantity <= 0 || !formData.reason) {
      toast.error('Please fill in all required fields'); return;
    }
    try {
      await inventoryService.createAdjustment(formData);
      toast.success('Adjustment created');
      resetForm();
      fetchAdjustments();
    } catch (err: any) {
      // Surface the backend's actual reason (e.g. a 403 permission message,
      // or "Module 'inventory' is not enabled for your subscription plan")
      // instead of a generic message that hides why it actually failed.
      toast.error(err?.response?.data?.detail || 'Failed to create adjustment');
    }
  };

  const handleApprove = async (id: string, approve: boolean) => {
    try {
      await inventoryService.approveAdjustment(id, approve ? 'approved' : 'rejected');
      toast.success(`Adjustment ${approve ? 'approved' : 'rejected'}`);
      fetchAdjustments();
    } catch {
      toast.error('Failed to update adjustment');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Adjustments</h1>
          <p className="text-sm text-slate-500 mt-1">Manage inventory adjustments and write-offs ({total} total)</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-lg">add</span>
          New Adjustment
        </button>
      </header>

      {/* Workflow hint */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 flex items-center gap-2 flex-wrap text-xs text-slate-500">
        <span className="font-semibold text-slate-600">How it works:</span>
        <span>Raise an adjustment for a stock correction →</span>
        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Pending</span>
        <span>→ an admin/manager Approves (updates real stock) or Rejects it.</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Filters */}
        <div className="p-4 border-b border-slate-200">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : adjustments.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">tune</span>
            <p className="text-slate-500 mt-3 text-sm">No adjustments found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Adj. Number</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Item</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Batch</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Reason</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adjustments.map(adj => (
                  <tr key={adj.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4 text-sm font-semibold text-slate-900">{adj.adjustment_number}</td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-slate-900">{adj.item_name || adj.item_id}</p>
                      <p className="text-xs text-slate-400 capitalize">{adj.item_type}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">{adj.batch_number || '—'}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${adj.adjustment_type === 'increase' ? 'bg-emerald-50 text-emerald-700' : adj.adjustment_type === 'decrease' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
                        {TYPE_LABELS[adj.adjustment_type] || adj.adjustment_type}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">{adj.quantity}</td>
                    <td className="px-4 py-4 text-sm text-slate-600 max-w-[200px] truncate">{adj.reason}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[adj.status] || 'bg-slate-100 text-slate-600'}`}>
                        {adj.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {adj.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => handleApprove(adj.id, true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                            title="Approve — applies this change to real stock">
                            <span className="material-symbols-outlined text-[15px]">check_circle</span> Approve
                          </button>
                          <button onClick={() => handleApprove(adj.id, false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            title="Reject — stock will not be changed">
                            <span className="material-symbols-outlined text-[15px]">cancel</span> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No action needed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
            <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors">Previous</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={resetForm} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-slate-900">New Stock Adjustment</h2>
              <button onClick={resetForm} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Item Type *</label>
                  <select
                    value={formData.item_type}
                    onChange={e => {
                      const item_type = e.target.value as 'medicine' | 'optical_product';
                      setFormData(prev => ({ ...prev, item_type, item_id: '', batch_id: undefined }));
                      setItemLabel('');
                      setCurrentStock(null);
                      setBatches([]);
                    }}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                    <option value="medicine">Medicine</option>
                    <option value="optical_product">Optical Product</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Adjustment Type *</label>
                  <select value={formData.adjustment_type} onChange={e => setFormData({ ...formData, adjustment_type: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                    <option value="increase">Increase</option>
                    <option value="decrease">Decrease</option>
                    <option value="write_off">Write Off</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Item *</label>
                <SearchableSelect
                  value={itemLabel}
                  onChange={handleItemSelect}
                  suggestions={itemSuggestions}
                  placeholder={formData.item_type === 'medicine' ? 'Search medicine...' : 'Search optical product...'}
                  allowManualEntry={false}
                />
                {currentStock !== null && (
                  <p className="text-xs text-slate-400 mt-1">
                    Current stock: <span className="font-semibold text-slate-600">{currentStock}</span>
                    {loadingStock && <span className="text-primary ml-1">(checking stock…)</span>}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Batch (optional)</label>
                <select
                  value={formData.batch_id || ''}
                  onChange={e => setFormData(prev => ({ ...prev, batch_id: e.target.value || undefined }))}
                  disabled={!formData.item_id || loadingBatches}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none disabled:opacity-50">
                  <option value="">
                    {!formData.item_id
                      ? 'Select an item first'
                      : loadingBatches
                      ? 'Loading batches…'
                      : batches.length === 0
                      ? 'No batches for this item'
                      : 'Any / not batch-specific'}
                  </option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>{b.batch_number} (Qty: {b.quantity})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Quantity *</label>
                <input type="number" min="1" value={formData.quantity || ''} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Reason *</label>
                <textarea value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} rows={3}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" placeholder="Reason for adjustment..." />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={resetForm} className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleCreate} className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">Create Adjustment</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdjustmentsPage;
