import React, { useState, useEffect, useCallback } from 'react';
import opticalService from '../../services/opticalService';
import type { OpticalStockAdjustment } from '../../types/optical';
import { useToast } from '../../contexts/ToastContext';
import { format } from 'date-fns';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';

const ADJ_TYPE_COLORS: Record<string, string> = {
  damage: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
  correction: 'bg-blue-100 text-blue-700',
  return: 'bg-green-100 text-green-700',
  increase: 'bg-emerald-100 text-emerald-700',
  decrease: 'bg-orange-100 text-orange-700',
  write_off: 'bg-slate-100 text-slate-700',
};

const OpticalStockAdjustments: React.FC = () => {
  const toast = useToast();
  const [adjustments, setAdjustments] = useState<OpticalStockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [products, setProducts] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [productId, setProductId] = useState('');
  const [productLabel, setProductLabel] = useState('');
  const [batchId, setBatchId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'damage' | 'expired' | 'correction' | 'return'>('damage');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await opticalService.getStockAdjustments();
      setAdjustments(data);
    } catch {
      toast.error('Failed to load stock adjustments');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchAdjustments(); }, [fetchAdjustments]);

  useEffect(() => {
    if (showForm) {
      opticalService.getProducts(1, 500).then(r => setProducts(r.data)).catch(() => {});
    }
  }, [showForm]);

  useEffect(() => {
    if (productId) {
      opticalService.getBatches(productId).then(setBatches).catch(() => setBatches([]));
    } else {
      setBatches([]);
    }
    setBatchId('');
  }, [productId]);

  const productSuggestions: SuggestionOption[] = products.map(p => ({
    id: p.id,
    label: `${p.name}${p.brand ? ` (${p.brand})` : ''}`,
    metadata: { id: p.id },
  }));
  const handleProductSelect = (value: string, metadata?: Record<string, unknown>) => {
    setProductLabel(value);
    setProductId(metadata?.id ? (metadata.id as string) : '');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) { toast.error('Select a product'); return; }
    if (quantity <= 0) { toast.error('Quantity must be positive'); return; }
    if (!reason.trim()) { toast.error('Reason is required'); return; }

    setSaving(true);
    try {
      await opticalService.createStockAdjustment({
        product_id: productId,
        batch_id: batchId || undefined,
        adjustment_type: adjustmentType,
        quantity,
        reason: reason.trim(),
      });
      toast.success('Stock adjustment created');
      setShowForm(false);
      setProductId(''); setProductLabel(''); setBatchId(''); setQuantity(1); setReason('');
      fetchAdjustments();
    } catch {
      toast.error('Failed to create stock adjustment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Optical Stock Adjustments</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90">
          <span className="material-symbols-outlined text-lg">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancel' : 'New Adjustment'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Product *</label>
              <SearchableSelect
                value={productLabel}
                onChange={handleProductSelect}
                suggestions={productSuggestions}
                placeholder="Search product..."
                allowManualEntry={false}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Batch</label>
              <select value={batchId} onChange={e => setBatchId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
                <option value="">All batches</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>{b.batch_number} (Qty: {b.quantity})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Type *</label>
              <select value={adjustmentType} onChange={e => setAdjustmentType(e.target.value as typeof adjustmentType)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
                <option value="damage">Damage</option>
                <option value="expired">Expired</option>
                <option value="correction">Correction</option>
                <option value="return">Return</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Quantity *</label>
              <input type="number" min={1} value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Reason *</label>
            <input value={reason} onChange={e => setReason(e.target.value)} required
              placeholder="e.g. Damaged in transit, expired stock, physical count correction..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving...' : 'Create Adjustment'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : adjustments.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2 block">tune</span>
            <p className="font-medium">No stock adjustments</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Product</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Type</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Quantity</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adjustments.map(a => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{format(new Date(a.created_at), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="material-icons text-slate-400 text-sm">visibility</span>
                      {a.product_name || (
                        <span className="text-slate-400 text-xs font-mono">
                          {a.item_id?.substring(0, 8)}...
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${ADJ_TYPE_COLORS[a.adjustment_type] || ''}`}>
                      {a.adjustment_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className={a.quantity < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                      {a.quantity < 0 ? '-' : '+'}{Math.abs(a.quantity)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{a.reason || '—'}</td>
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

export default OpticalStockAdjustments;
