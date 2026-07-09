import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import pharmacyService from '../../services/pharmacyService';
import DateRangeFilter from '../../components/common/DateRangeFilter';
import type { StockMovement } from '../../types/inventory';
import { formatDateTime, formatTimeOnly } from '../../utils/calendarDate';

interface GroupedMovement {
  date: string;
  movements: StockMovement[];
}

interface MovementStats {
  totalIn: number;
  totalOut: number;
  netBalance: number;
}

const MOVEMENT_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  stock_in: { label: 'Stock In', icon: 'arrow_downward', color: 'text-emerald-600 bg-emerald-50' },
  sale: { label: 'Sale', icon: 'shopping_bag', color: 'text-blue-600 bg-blue-50' },
  dispensing: { label: 'Dispensing', icon: 'local_pharmacy', color: 'text-purple-600 bg-purple-50' },
  return: { label: 'Return', icon: 'rotate_left', color: 'text-amber-600 bg-amber-50' },
  adjustment: { label: 'Adjustment', icon: 'tune', color: 'text-slate-600 bg-slate-50' },
  transfer: { label: 'Transfer', icon: 'send', color: 'text-indigo-600 bg-indigo-50' },
  expired: { label: 'Expired', icon: 'calendar_today', color: 'text-red-600 bg-red-50' },
  damaged: { label: 'Damaged', icon: 'error', color: 'text-orange-600 bg-orange-50' },
};

const StockMovementsReport: React.FC = () => {
  const toast = useToast();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [itemType, setItemType] = useState('');
  const [itemId, setItemId] = useState('');
  const [movementType, setMovementType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [medicines, setMedicines] = useState<any[]>([]);

  // Stats — fetched from a dedicated summary endpoint that aggregates ALL rows
  // matching the current filters, not just the current page (see fetchSummary).
  const [stats, setStats] = useState<MovementStats>({
    totalIn: 0,
    totalOut: 0,
    netBalance: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Fetch medicines for filter
  useEffect(() => {
    const loadMedicines = async () => {
      try {
        const res = await pharmacyService.getMedicines(1, 100);
        setMedicines(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    loadMedicines();
  }, []);

  const buildFilters = useCallback(() => {
    const filters: { item_type?: string; item_id?: string; movement_type?: string; date_from?: string; date_to?: string } = {};
    if (itemType) filters.item_type = itemType;
    if (itemId) filters.item_id = itemId;
    if (movementType) filters.movement_type = movementType;
    if (dateFrom) filters.date_from = dateFrom;
    if (dateTo) filters.date_to = dateTo;
    return filters;
  }, [itemType, itemId, movementType, dateFrom, dateTo]);

  // Fetch the current page of movements (for the list itself)
  const fetchMovements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getStockMovements(page, 50, buildFilters());
      setMovements(res.data);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load stock movements');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, buildFilters]);

  // Fetch true totals across ALL matching rows (not just the current page) —
  // a plain page-local sum would silently understate these the moment there's
  // more than one page of results for the active filters.
  const fetchSummary = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await inventoryService.getStockMovementSummary(buildFilters());
      setStats({ totalIn: res.total_in, totalOut: res.total_out, netBalance: res.net_balance });
    } catch (err) {
      console.error(err);
    } finally {
      setStatsLoading(false);
    }
  }, [buildFilters]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Group movements by date
  const groupedByDate = movements.reduce((acc: GroupedMovement[], m) => {
    const date = formatDateTime(m.created_at, 'dd MMM yyyy');
    const existing = acc.find(g => g.date === date);
    if (existing) {
      existing.movements.push(m);
    } else {
      acc.push({ date, movements: [m] });
    }
    return acc;
  }, []);

  // Reset filters
  const handleResetFilters = () => {
    setItemType('');
    setItemId('');
    setMovementType('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  // Export to CSV
  const handleExport = () => {
    const csv = [
      ['Date', 'Time', 'Item', 'Type', 'Movement', 'Quantity', 'Balance', 'Reference', 'Notes'].join(','),
      ...movements.map(m => [
        formatDateTime(m.created_at, 'dd MMM yyyy'),
        formatTimeOnly(m.created_at, 'HH:mm:ss'),
        m.item_name || 'Unknown',
        MOVEMENT_TYPE_LABELS[m.movement_type]?.label || m.movement_type,
        m.quantity > 0 ? 'IN' : 'OUT',
        Math.abs(m.quantity),
        m.balance_after,
        m.reference_type || '—',
        m.notes || '—',
      ].map(v => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-movements-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Movement Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Track all stock in/out movements with audit trail</p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200 transition-colors"
        >
          <span className="material-symbols-outlined text-lg">download</span>
          Export CSV
        </button>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-medium">Total Stock In</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{statsLoading ? '—' : stats.totalIn}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-600">arrow_downward</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-medium">Total Stock Out</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{statsLoading ? '—' : stats.totalOut}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center">
              <span className="material-symbols-outlined text-red-600">arrow_upward</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-medium">Net Balance</p>
              <p className={`text-2xl font-bold mt-1 ${stats.netBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {statsLoading ? '—' : stats.netBalance}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${stats.netBalance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <span className={`material-symbols-outlined ${stats.netBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {stats.netBalance >= 0 ? 'trending_up' : 'trending_down'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Filters</h2>
          {(itemType || itemId || movementType || dateFrom || dateTo) && (
            <button
              onClick={handleResetFilters}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Reset All
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <select
            value={itemType}
            onChange={(e) => { setItemType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Item Types</option>
            <option value="medicine">Medicine</option>
            <option value="optical_product">Optical Product</option>
          </select>

          <select
            value={itemId}
            onChange={(e) => { setItemId(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Items</option>
            {medicines.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          <select
            value={movementType}
            onChange={(e) => { setMovementType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Movement Types</option>
            {Object.entries(MOVEMENT_TYPE_LABELS).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          <button
            onClick={() => { setPage(1); fetchMovements(); }}
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
          >
            Apply Filters
          </button>
        </div>

        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
        />
      </div>

      {/* Movements List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
        </div>
      ) : movements.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-slate-300">inventory_2</span>
          <h2 className="text-lg font-bold text-slate-900 mt-4">No Movements Found</h2>
          <p className="text-sm text-slate-500 mt-2">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Time</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Item</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reference</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">By</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Balance</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedByDate.map((group) => (
                    <React.Fragment key={group.date}>
                      <tr>
                        <td colSpan={8} className="px-3 py-2 bg-slate-50/80 text-xs font-bold text-slate-600 border-y border-slate-100 sticky top-0">
                          {group.date}
                          <span className="ml-2 font-normal text-slate-400">({group.movements.length})</span>
                        </td>
                      </tr>
                      {group.movements.map((m, idx) => {
                        const type = MOVEMENT_TYPE_LABELS[m.movement_type] || {
                          label: m.movement_type.toUpperCase(),
                          icon: 'data_usage',
                          color: 'text-slate-600 bg-slate-50',
                        };
                        const ref = [m.reference_type, m.notes].filter(Boolean).join(' — ');

                        return (
                          <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors align-top">
                            <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                              {formatTimeOnly(m.created_at, 'hh:mm a')}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-slate-900 max-w-[220px] truncate" title={m.item_name || 'Unknown Item'}>
                              {m.item_name || 'Unknown Item'}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${type.color}`}>
                                <span className="material-symbols-outlined text-[13px]">{type.icon}</span>
                                {type.label}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[200px] truncate" title={ref || undefined}>
                              {ref || '—'}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{m.performed_by_name || '—'}</td>
                            <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${m.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {m.quantity > 0 ? '+' : ''}{m.quantity}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-600 whitespace-nowrap">{m.balance_after}</td>
                            <td className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap">
                              {m.unit_cost ? `₹${m.unit_cost.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Showing {movements.length} of {total} movements</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-3 py-2 text-sm text-slate-700">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockMovementsReport;
