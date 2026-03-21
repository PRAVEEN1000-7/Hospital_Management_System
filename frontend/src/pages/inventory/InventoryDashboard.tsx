import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { InventoryDashboardData, LowStockItem, ExpiringItem } from '../../types/inventory';

const InventoryDashboard: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<InventoryDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getDashboard();
      setData(res);
    } catch {
      toast.error('Failed to load inventory dashboard');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const statCards = data ? [
    { label: 'Active Suppliers', value: data.total_suppliers, icon: 'local_shipping', color: 'bg-blue-500', link: '/inventory/suppliers' },
    { label: 'Active POs', value: data.active_purchase_orders, icon: 'receipt_long', color: 'bg-emerald-500', link: '/inventory/purchase-orders' },
    { label: 'Pending GRNs', value: data.pending_grns, icon: 'inventory_2', color: 'bg-amber-500', link: '/inventory/grns' },
    { label: 'Pending Adjustments', value: data.pending_adjustments, icon: 'tune', color: 'bg-purple-500', link: '/inventory/adjustments' },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory Management</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor stock levels, manage suppliers, and track orders</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/inventory/purchase-orders/new')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
            <span className="material-symbols-outlined text-lg">add</span>
            New Purchase Order
          </button>
          <button onClick={() => navigate('/inventory/grns/new')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-lg">add</span>
            New GRN
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
        </div>
      ) : data && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <button
                key={card.label}
                onClick={() => navigate(card.link)}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-start gap-4 hover:shadow-md transition-all text-left w-full"
              >
                <div className={`${card.color} w-12 h-12 rounded-xl flex items-center justify-center shrink-0`}>
                  <span className="material-symbols-outlined text-white text-2xl">{card.icon}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                  <p className="text-sm text-slate-500">{card.label}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Low Stock & Expiring */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Low Stock */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-500">warning</span>
                  <h2 className="text-base font-bold text-slate-900">Low Stock Alerts</h2>
                  {data.low_stock_count > 0 && (
                    <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{data.low_stock_count}</span>
                  )}
                </div>
                <button onClick={() => navigate('/inventory/stock-movements')} className="text-xs font-semibold text-primary hover:underline">View All</button>
              </div>
              <div className="p-5">
                {data.low_stock_items.length === 0 ? (
                  <div className="text-center py-8">
                    <span className="material-symbols-outlined text-4xl text-emerald-400">check_circle</span>
                    <p className="text-sm text-slate-500 mt-2">All items are above reorder level</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.low_stock_items.map((item: LowStockItem, idx: number) => (
                      <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{item.item_name}</p>
                          <p className="text-xs text-slate-400">Reorder at: {item.reorder_level}</p>
                        </div>
                        <span className={`text-sm font-bold ${item.current_stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                          {item.current_stock} in stock
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Expiring Items */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500">schedule</span>
                  <h2 className="text-base font-bold text-slate-900">Expiring Soon</h2>
                  {data.expiring_count > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{data.expiring_count}</span>
                  )}
                </div>
              </div>
              <div className="p-5">
                {data.expiring_items.length === 0 ? (
                  <div className="text-center py-8">
                    <span className="material-symbols-outlined text-4xl text-emerald-400">check_circle</span>
                    <p className="text-sm text-slate-500 mt-2">No items expiring within 90 days</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.expiring_items.map((item: ExpiringItem, idx: number) => (
                      <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{item.item_name || 'Unknown item'}</p>
                          <p className="text-xs text-slate-400">Batch: {item.batch_number || '—'} · Qty: {item.quantity}</p>
                        </div>
                        <span className="text-sm font-medium text-amber-600">
                          {new Date(item.expiry_date).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-base font-bold text-slate-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              {[
                { label: 'Low Stock', icon: 'warning', path: '/inventory/low-stock', badge: data.low_stock_count },
                { label: 'Suppliers', icon: 'local_shipping', path: '/inventory/suppliers' },
                { label: 'Purchase Orders', icon: 'receipt_long', path: '/inventory/purchase-orders' },
                { label: 'Goods Receipt', icon: 'inventory_2', path: '/inventory/grns' },
                { label: 'Stock Report', icon: 'swap_vert', path: '/inventory/stock-movements' },
                { label: 'Adjustments', icon: 'tune', path: '/inventory/adjustments' },
                { label: 'Cycle Counts', icon: 'fact_check', path: '/inventory/cycle-counts' },
              ].map((action) => (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all relative"
                >
                  <span className="material-symbols-outlined text-2xl text-primary">{action.icon}</span>
                  <span className="text-xs font-semibold text-slate-700">{action.label}</span>
                  {action.badge && action.badge > 0 && (
                    <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{action.badge}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default InventoryDashboard;
