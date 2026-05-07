import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { CycleCount, CycleCountCreate } from '../../types/inventory';

const STATUS_COLORS: Record<string, string> = {
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-amber-50 text-amber-700',
  verified: 'bg-emerald-50 text-emerald-700',
};

interface ItemRow {
  item_type: 'medicine' | 'optical_product';
  item_id: string;
  item_name: string;
  system_quantity: number;
  counted_quantity: number;
}

const CycleCountsPage: React.FC = () => {
  const toast = useToast();
  const [counts, setCounts] = useState<CycleCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailCC, setDetailCC] = useState<CycleCount | null>(null);

  // Create form state
  const [countDate, setCountDate] = useState(new Date().toISOString().split('T')[0]);
  const [countNotes, setCountNotes] = useState('');
  const [countItems, setCountItems] = useState<ItemRow[]>([
    { item_type: 'medicine', item_id: '', item_name: '', system_quantity: 0, counted_quantity: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getCycleCounts(page, 10, statusFilter || undefined);
      setCounts(res.data);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load cycle counts');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const addItem = () => setCountItems([...countItems, { item_type: 'medicine', item_id: '', item_name: '', system_quantity: 0, counted_quantity: 0 }]);
  const removeItem = (idx: number) => { if (countItems.length > 1) setCountItems(countItems.filter((_, i) => i !== idx)); };
  const updateItem = (idx: number, field: keyof ItemRow, value: string | number) => {
    const updated = [...countItems];
    (updated[idx] as unknown as Record<string, string | number>)[field] = value;
    setCountItems(updated);
  };

  const resetCreateForm = () => {
    setShowCreate(false);
    setCountDate(new Date().toISOString().split('T')[0]);
    setCountNotes('');
    setCountItems([{ item_type: 'medicine', item_id: '', item_name: '', system_quantity: 0, counted_quantity: 0 }]);
  };

  const handleCreate = async () => {
    if (countItems.some(it => !it.item_name)) {
      toast.error('Please fill in all item names'); return;
    }
    setSaving(true);
    try {
      const payload: CycleCountCreate = {
        count_date: countDate,
        notes: countNotes || undefined,
        items: countItems.map(it => ({
          item_type: it.item_type,
          item_id: it.item_id || crypto.randomUUID(),
          item_name: it.item_name,
          system_quantity: it.system_quantity,
          counted_quantity: it.counted_quantity,
        })),
      };
      await inventoryService.createCycleCount(payload);
      toast.success('Cycle count created');
      resetCreateForm();
      fetchCounts();
    } catch {
      toast.error('Failed to create cycle count');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (cc: CycleCount, newStatus: string) => {
    try {
      await inventoryService.updateCycleCount(cc.id, { status: newStatus });
      toast.success(`Cycle count → ${newStatus.replace('_', ' ')}`);
      fetchCounts();
      if (detailCC?.id === cc.id) setDetailCC(null);
    } catch {
      toast.error('Failed to update cycle count');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cycle Counts</h1>
          <p className="text-sm text-slate-500 mt-1">Physical inventory verification ({total} counts)</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-lg">add</span>
          New Cycle Count
        </button>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
            <option value="">All Statuses</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="verified">Verified</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : counts.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">inventory_2</span>
            <p className="text-slate-500 mt-3 text-sm">No cycle counts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Count Number</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden lg:table-cell">Count Date</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Items</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider hidden md:table-cell">Variances</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {counts.map(cc => {
                  const variances = cc.items.filter(it => it.variance !== 0).length;
                  return (
                    <tr key={cc.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-4">
                        <button onClick={() => setDetailCC(cc)} className="text-sm font-semibold text-primary hover:underline">{cc.count_number}</button>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell text-sm text-slate-600">{new Date(cc.count_date).toLocaleDateString()}</td>
                      <td className="px-4 py-4 text-center text-sm text-slate-700">{cc.items.length}</td>
                      <td className="px-4 py-4 text-center hidden md:table-cell">
                        {variances > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">{variances} variance(s)</span>
                        ) : (
                          <span className="text-xs text-emerald-600 font-medium">All matched</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[cc.status] || 'bg-slate-100 text-slate-600'}`}>
                          {cc.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {cc.status === 'in_progress' && (
                            <button onClick={() => handleStatusChange(cc, 'completed')} className="p-1.5 hover:bg-amber-50 rounded-lg transition-colors" title="Mark Complete">
                              <span className="material-symbols-outlined text-lg text-amber-500">task_alt</span>
                            </button>
                          )}
                          {cc.status === 'completed' && (
                            <button onClick={() => handleStatusChange(cc, 'verified')} className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors" title="Verify">
                              <span className="material-symbols-outlined text-lg text-emerald-500">verified</span>
                            </button>
                          )}
                          <button onClick={() => setDetailCC(cc)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="View">
                            <span className="material-symbols-outlined text-lg text-slate-500">visibility</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      {/* Create Cycle Count Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={resetCreateForm} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-slate-900">New Cycle Count</h2>
              <button onClick={resetCreateForm} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Count Date *</label>
                  <input type="date" value={countDate} onChange={e => setCountDate(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notes</label>
                  <input type="text" value={countNotes} onChange={e => setCountNotes(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" placeholder="Count notes..." />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-700">Count Items</h3>
                  <button onClick={addItem} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
                    <span className="material-symbols-outlined text-base">add</span>Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  {countItems.map((item, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-400">Item #{idx + 1}</span>
                        <button onClick={() => removeItem(idx)} disabled={countItems.length === 1} className="p-1 hover:bg-red-50 rounded-lg disabled:opacity-30">
                          <span className="material-symbols-outlined text-lg text-red-400">delete</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs text-slate-400">Type</label>
                          <select value={item.item_type} onChange={e => updateItem(idx, 'item_type', e.target.value)}
                            className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white mt-1">
                            <option value="medicine">Medicine</option>
                            <option value="optical_product">Optical Product</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-400">Item Name *</label>
                          <input type="text" value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)}
                            className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1" placeholder="Name" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400">System Qty</label>
                          <input type="number" min="0" value={item.system_quantity} onChange={e => updateItem(idx, 'system_quantity', parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400">Counted Qty *</label>
                          <input type="number" min="0" value={item.counted_quantity} onChange={e => updateItem(idx, 'counted_quantity', parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm mt-1" />
                        </div>
                      </div>
                      {item.system_quantity !== item.counted_quantity && (
                        <p className="mt-2 text-xs font-semibold text-red-500">
                          Variance: {item.counted_quantity - item.system_quantity} ({item.counted_quantity > item.system_quantity ? 'surplus' : 'shortage'})
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={resetCreateForm} className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleCreate} disabled={saving} className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Cycle Count'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailCC && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetailCC(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{detailCC.count_number}</h2>
                <p className="text-sm text-slate-500">{new Date(detailCC.count_date).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setDetailCC(null)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[detailCC.status]}`}>
                  {detailCC.status.replace('_', ' ')}
                </span>
                {detailCC.notes && <span className="text-sm text-slate-500">{detailCC.notes}</span>}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600">Item</th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600">Type</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600">System Qty</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600">Counted Qty</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailCC.items.map(item => (
                      <tr key={item.id}>
                        <td className="px-3 py-3 text-sm text-slate-900">{item.item_name || item.item_id}</td>
                        <td className="px-3 py-3 text-sm text-slate-500 capitalize">{item.item_type}</td>
                        <td className="px-3 py-3 text-sm text-right text-slate-700">{item.system_quantity}</td>
                        <td className="px-3 py-3 text-sm text-right text-slate-700">{item.counted_quantity}</td>
                        <td className="px-3 py-3 text-sm text-right">
                          <span className={`font-semibold ${item.variance === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {item.variance > 0 ? '+' : ''}{item.variance}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Status Actions */}
              {(detailCC.status === 'in_progress' || detailCC.status === 'completed') && (
                <div className="flex justify-end gap-3 pt-2">
                  {detailCC.status === 'in_progress' && (
                    <button onClick={() => handleStatusChange(detailCC, 'completed')} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors">
                      Mark Completed
                    </button>
                  )}
                  {detailCC.status === 'completed' && (
                    <button onClick={() => handleStatusChange(detailCC, 'verified')} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors">
                      Verify Count
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CycleCountsPage;
