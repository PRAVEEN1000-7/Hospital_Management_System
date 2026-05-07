import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { StockMovement } from '../../types/inventory';

const TYPE_COLORS: Record<string, string> = {
  stock_in: 'bg-emerald-50 text-emerald-700',
  sale: 'bg-blue-50 text-blue-700',
  dispensing: 'bg-indigo-50 text-indigo-700',
  return: 'bg-slate-100 text-slate-600',
  adjustment: 'bg-amber-50 text-amber-700',
  transfer: 'bg-purple-50 text-purple-700',
  expired: 'bg-red-50 text-red-600',
  damaged: 'bg-orange-50 text-orange-700',
};

const StockMovementsPage: React.FC = () => {
  const toast = useToast();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('');

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getStockMovements(page, 15, {
        movement_type: typeFilter || undefined,
        item_type: itemTypeFilter || undefined,
      });
      setMovements(res.data);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load stock movements');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, typeFilter, itemTypeFilter]);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Stock Movements</h1>
        <p className="text-sm text-slate-500 mt-1">Track all inventory stock movements ({total} records)</p>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Filters */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
            <option value="">All Movement Types</option>
            <option value="stock_in">Stock In</option>
            <option value="sale">Sale</option>
            <option value="dispensing">Dispensing</option>
            <option value="return">Return</option>
            <option value="adjustment">Adjustment</option>
            <option value="transfer">Transfer</option>
            <option value="expired">Expired</option>
            <option value="damaged">Damaged</option>
          </select>
          <select value={itemTypeFilter} onChange={e => { setItemTypeFilter(e.target.value); setPage(1); }}
            className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
            <option value="">All Item Types</option>
            <option value="medicine">Medicine</option>
            <option value="optical_product">Optical Product</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : movements.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">swap_vert</span>
            <p className="text-slate-500 mt-3 text-sm">No stock movements found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Item</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider hidden md:table-cell">Balance</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden lg:table-cell">Batch</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden lg:table-cell">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap">{new Date(m.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-medium text-slate-900">{m.item_name || m.item_id}</p>
                      <p className="text-xs text-slate-400 capitalize">{m.item_type}</p>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${TYPE_COLORS[m.movement_type] || 'bg-slate-100 text-slate-600'}`}>
                        {m.movement_type}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={`text-sm font-semibold ${m.quantity >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {m.quantity >= 0 ? '+' : ''}{m.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-sm font-medium text-slate-700 hidden md:table-cell">{m.balance_after ?? '—'}</td>
                    <td className="px-4 py-4 text-sm text-slate-600 hidden lg:table-cell">{m.batch_id || '—'}</td>
                    <td className="px-4 py-4 text-sm text-slate-600 hidden lg:table-cell">{m.reference_type ? `${m.reference_type}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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
    </div>
  );
};

export default StockMovementsPage;
